import OpenAI from 'openai'
import { z } from 'zod'
import type { ChatCompletionFunction } from '../function'

import zodToJsonSchema from 'zod-to-json-schema'
import { zodFunction } from 'openai/helpers/zod'

type CompletionOpts = Partial<
	Omit<OpenAI.ChatCompletionCreateParams, 'functions' | 'tools'>
> & {
	client: OpenAI
	// options?: Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>
	instructions: string
	prompt?: string
	messages?: OpenAI.ChatCompletionMessageParam[]
}

export type CompletionOptsWithFunctionOpts = CompletionOpts & {
	functions?: ChatCompletionFunction[]
	parallelFunctionExecution?: false
}

export const functionToOpenAIChatCompletionTool = <T extends z.ZodRawShape>(
	fn: ChatCompletionFunction<T>
): OpenAI.ChatCompletionTool => {
	return zodFunction({
		name: fn.name,
		description: fn.description,
		parameters: fn.parameters
	})
}

export const completionWithFunctions = async (
	opts: CompletionOptsWithFunctionOpts
): Promise<OpenAI.ChatCompletionMessage> => {
	const {
		client,
		instructions,
		prompt,
		functions,
		parallelFunctionExecution: parallelToolCalls,
		messages,
		model,
		...rest
	} = opts

	// initialize messages
	const _messages: OpenAI.ChatCompletionMessageParam[] = messages ?? [
		{ role: 'system', content: instructions }
	]
	if (prompt) {
		_messages.push({ role: 'user', content: prompt })
	}

	const response = await client.beta.chat.completions.parse({
		model: model ?? 'gpt-4o-mini',
		messages: _messages,
		tools: functions?.map(functionToOpenAIChatCompletionTool),
		parallel_tool_calls: parallelToolCalls,
		...rest,
		stream: false
	})

	let message = response?.choices?.[0]?.message

	const handleToolCall = async (
		toolCall: OpenAI.ChatCompletionMessageToolCall
	) => {
		try {
			const fn = functions?.find((f) => f.name === toolCall.function.name)
			if (!fn) {
				throw new Error(
					`Function ${toolCall.function.name} not found in functions: [${functions?.map((f) => f.name).join(', ')}]`
				)
			}
			const output = await fn.handler(JSON.parse(toolCall.function.arguments))
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

	if (message?.tool_calls && message?.tool_calls.length > 0) {
		let toolCallResults: {
			tool_call_id: string
			output: string
		}[] = []
		if (parallelToolCalls === false) {
			for (const toolCall of message?.tool_calls) {
				const res = await handleToolCall(toolCall)
				toolCallResults.push(res)
			}
		} else {
			toolCallResults = await Promise.all(
				message?.tool_calls.map(handleToolCall)
			)
		}
		_messages.push(message)
		for (const res of toolCallResults) {
			_messages.push({
				tool_call_id: res.tool_call_id,
				role: 'tool',
				content: res.output
			})
		}
		return completionWithFunctions({
			...opts,
			messages: _messages,
			prompt: undefined
		})
	}

	if (message) {
		return message
	} else {
		throw new Error('Invalid response (empty message)')
	}
}
