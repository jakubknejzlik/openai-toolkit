import type OpenAI from 'openai'
import type { AssistantStream } from 'openai/lib/AssistantStream'
import type { FileObject } from 'openai/resources'
import pRetry from 'p-retry'
import type { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'

import {
	type ChatCompletionFunction,
	functionToOpenAIAssistantTool
} from './function'
import { AssistantStreamEvent } from 'openai/resources/beta/assistants'
import { getDefaultOpenAIClient } from './openai-client'

interface ThreadOptions {
	threadId?: string
	client?: OpenAI
}

type ThreadPromptOpts = {
	run: OpenAI.Beta.Threads.Runs.RunCreateAndStreamParams
	message?: OpenAI.Beta.Threads.Messages.MessageCreateParams
}
export type ThreadPromptWithFunctionOpts = ThreadPromptOpts & {
	functions?: ChatCompletionFunction[]
}
export type ThreadPromptWithJsonResponse<T extends z.ZodRawShape> =
	ThreadPromptWithFunctionOpts & {
		responseObject: z.ZodObject<T>
	}

export class Thread {
	private id?: string
	private thread?: OpenAI.Beta.Threads.Thread
	private client: OpenAI

	constructor(opts: ThreadOptions = {}) {
		this.id = opts.threadId
		this.client = opts.client || getDefaultOpenAIClient()
	}

	async getId(): Promise<string> {
		let id = this.id
		if (!id) {
			this.thread = await this.client.beta.threads.create({})
			id = this.id = this.thread.id
		}
		return id
	}

	async getThread(): Promise<OpenAI.Beta.Threads.Thread> {
		let thread = this.thread
		if (!thread) {
			await this.getId()
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			thread = this.thread!
		}
		return thread
	}

	async clone(): Promise<Thread> {
		const thread = new Thread({ client: this.client })
		if (!this.id) {
			return thread
		}
		const messages = await this.listMessages()
		thread.thread = await this.client.beta.threads.create({
			// messages: messages.map((m) => ({
			// 	role: m.role,
			// 	content:
			// 		m.content[0]?.type === 'text'
			// 			? m.content[0].text.value
			// 			: `message with ${m.content[0]?.type}`
			// }))
		})
		for (const message of messages) {
			await thread.appendMessage({
				role: message.role,
				content:
					message.content[0]?.type === 'text'
						? message.content[0].text.value
						: `message with ${message.content[0]?.type}`
			})
		}
		// console.log('new thread', await thread.getId())
		return thread
	}

	async listMessages(
		options?: OpenAI.Beta.Threads.Messages.MessageListParams
	): Promise<OpenAI.Beta.Threads.Messages.Message[]> {
		const threadId = await this.getId()
		const messages = await this.client.beta.threads.messages.list(
			threadId,
			options
		)
		return messages.data
	}

	async getLatestMessage(): Promise<OpenAI.Beta.Threads.Messages.Message> {
		const messages = await this.listMessages({ limit: 1 })
		const message = messages[0]
		if (!message) {
			throw new Error('No messages found')
		}
		return message
	}

	async appendMessage(
		message: OpenAI.Beta.Threads.Messages.MessageCreateParams,
		{ retryCount }: { retryCount?: number } = {}
	): Promise<OpenAI.Beta.Threads.Messages.Message> {
		const threadId = await this.getId()
		return pRetry(
			async () => {
				// console.log(
				// 	new Date().toISOString(),
				// 	'appending message',
				// 	message,
				// 	'runs',
				// 	JSON.stringify(
				// 		(await this.client.beta.threads.runs.list(threadId)).data,
				// 		null,
				// 		2
				// 	)
				// )
				return this.client.beta.threads.messages.create(threadId, message)
			},
			{ retries: retryCount ?? 2 }
		)
	}

	async prompt(
		opts: ThreadPromptWithFunctionOpts
	): Promise<OpenAI.Beta.Threads.Messages.Message> {
		const stream = this.streamPrompt(opts)

		// console.log('??', stream);
		const result = await this.waitForStreamMessage(stream)

		if (!result) {
			throw new Error('No message received')
		}

		return result
	}

	async *streamPrompt({
		run: { tools, ...run },
		message,
		functions
	}: ThreadPromptWithFunctionOpts): AsyncIterableIterator<AssistantStreamEvent> {
		if (message) {
			await this.appendMessage(message)
		}
		const threadId = await this.getId()

		// console.log('run:', JSON.stringify(run, null, 2))

		const stream = this.client.beta.threads.runs.stream(threadId, {
			...run,
			// TODO: how to add/remove file_search/code_interpreter tool?
			tools: [
				...(tools ?? []),
				...(functions ?? []).map(functionToOpenAIAssistantTool)
			]
		})

		yield* this.handleStreamWithFunctions(stream, functions)
	}

	async promptWithFunctions({
		run,
		functions,
		message
	}: ThreadPromptWithFunctionOpts): Promise<OpenAI.Beta.Threads.Messages.Message> {
		return this.prompt({
			run,
			message,
			functions
		})
	}

	async *streamPromptWithFunctions({
		run,
		functions,
		message
	}: ThreadPromptWithFunctionOpts): AsyncIterableIterator<AssistantStreamEvent> {
		yield* this.streamPrompt({
			run,
			message,
			functions
		})
	}

	async promptJsonResponse<T extends z.ZodRawShape>({
		run: { additional_instructions, ...run },
		functions,
		message,
		responseObject
	}: ThreadPromptWithJsonResponse<T>): Promise<z.infer<z.ZodObject<T>>> {
		const responseObjectSchema = JSON.stringify(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			zodToJsonSchema(responseObject)
		)
		const _additional_instructions = `${additional_instructions ? additional_instructions + '\n\n' : ''}Output JSON must conform to the following JsonSchema7:\n${responseObjectSchema}\n\n`

		const response = await this.prompt({
			run: {
				...run,
				response_format: { type: 'json_object' },
				additional_instructions: _additional_instructions
			},
			message,
			functions
		})
		// console.log('???', JSON.stringify(response, null, 2))
		if (response.content && response.content[0]?.type === 'text') {
			const parsed = responseObject.parse(
				JSON.parse(response.content[0].text.value)
			)
			return parsed
		} else {
			throw new Error('Invalid response')
		}
	}

	private async waitForStreamMessage(
		stream: AsyncIterableIterator<AssistantStreamEvent>
	): Promise<OpenAI.Beta.Threads.Messages.Message | null> {
		let message: OpenAI.Beta.Threads.Messages.Message | null = null
		for await (const event of stream) {
			if (event.event === 'thread.message.completed') {
				message = event.data
			}
		}
		return message
	}
	private async *handleStreamWithFunctions(
		stream: AssistantStream,
		functions?: ChatCompletionFunction[]
	): AsyncIterableIterator<AssistantStreamEvent> {
		try {
			// let message: OpenAI.Beta.Threads.Messages.Message | null = null;
			const toolOutputPromises: Promise<OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput>[] =
				[]
			let runId: string
			let threadId: string
			for await (const event of stream) {
				// console.log('received event ', JSON.stringify(event));
				yield event
				if (event.event === 'thread.run.requires_action') {
					runId = event.data.id
					threadId = event.data.thread_id

					toolOutputPromises.push(
						...(event.data.required_action?.submit_tool_outputs.tool_calls.map(
							async (toolCall) => {
								try {
									const fn = functions?.find(
										(f) => f.name === toolCall.function.name
									)
									if (!fn) {
										throw new Error(
											`Function ${toolCall.function.name} not found in functions: [${functions?.map((f) => f.name).join(', ')}]`
										)
									}
									const output = await fn.handler(
										JSON.parse(toolCall.function.arguments)
									)
									return {
										tool_call_id: toolCall.id,
										output
									}
								} catch (e) {
									return {
										tool_call_id: toolCall.id,
										output: `Failed with error: ${e}`
									}
								}
							}
						) ?? [])
					)
					// Submit all the tool outputs at the same time
					//   } else if (
					//     event.event === 'thread.message.completed' ||
					//     event.event === 'thread.message.delta'
					//   ) {
					//     // message = event.data;
					//     // return message
					//     yield event;
				}
				if (toolOutputPromises.length > 0) {
					const toolOutputs = await Promise.all(toolOutputPromises)
					yield* this.submitToolOutputs(
						toolOutputs,
						runId!,
						threadId!,
						functions
					)
				}
			}
		} catch (err) {
			console.log('error in handleStreamWithFunctions', err)
		}
		// return message;
	}

	async *submitToolOutputs(
		toolOutputs: OpenAI.Beta.Threads.Runs.RunSubmitToolOutputsParams.ToolOutput[],
		runId: string,
		threadId: string,
		functions?: ChatCompletionFunction[]
	): AsyncIterableIterator<AssistantStreamEvent> {
		try {
			yield* await pRetry(
				async () => {
					// console.log('submitting tool outputs', toolOutputs)
					const stream = this.client.beta.threads.runs.submitToolOutputsStream(
						threadId,
						runId,
						{ tool_outputs: toolOutputs }
					)
					return this.handleStreamWithFunctions(stream, functions)
				},
				{ retries: 2 }
			)
		} catch (error) {
			throw new Error(`Error submitting tool outputs: ${error}`)
		}
	}

	async attachFiles(files: FileObject[]): Promise<void> {
		const thread = await this.getThread()
		const vector_store_ids =
			thread.tool_resources?.file_search?.vector_store_ids ?? []

		if (vector_store_ids.length === 0) {
			const vs = await this.client.beta.vectorStores.create({
				file_ids: files.map((file) => file.id)
			})

			await this.client.beta.threads.update(thread.id, {
				tool_resources: {
					file_search: {
						vector_store_ids: [vs.id]
					}
				}
			})
			return
		}

		const vector_store_id = vector_store_ids[0]
		if (!vector_store_id) {
			throw new Error('No vector store id')
		}

		await Promise.all(
			(files ?? []).map(async (file) => {
				await this.client.beta.vectorStores.files.create(vector_store_id, {
					file_id: file.id
				})
			})
		)
	}
}
