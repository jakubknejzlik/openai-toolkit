import type { z } from 'zod'
import type { ChatCompletionFunction } from '../function'

import { ChatCompletionTool } from 'openai/resources'
import zodToJsonSchema from 'zod-to-json-schema'
import {
	CompletionOptsWithFunctionOpts,
	completionWithFunctions
} from './completion-with-functions'
import { InferedType } from '../chains/prompt-with-retry'

export type CompletionOptsWithJsonResponse<T extends z.ZodRawShape> =
	CompletionOptsWithFunctionOpts & {
		responseObject: z.ZodObject<T>
		validator?: (obj: z.infer<z.ZodObject<T>>) => Promise<boolean | void>
	}

export const functionToOpenAIChatCompletionTool = <T extends z.ZodRawShape>(
	fn: ChatCompletionFunction<T>
): ChatCompletionTool => {
	const params = fn.parameters ? zodToJsonSchema(fn.parameters) : undefined
	return {
		type: 'function',
		function: {
			name: fn.name,
			description: fn.description,
			parameters: params
		}
	}
}

export const completionWithJsonResponse = async <T extends z.ZodRawShape>({
	validator,
	...opts
}: CompletionOptsWithJsonResponse<T>): Promise<z.infer<z.ZodObject<T>>> => {
	const { responseObject, prompt, ...rest } = opts
	const responseObjectSchema = JSON.stringify(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		zodToJsonSchema(responseObject)
	)

	const _prompt = `Output JSON must be single object (only one JSON object) conforming to the following JsonSchema7:\n${responseObjectSchema}\n\n${prompt ? `${prompt}\n\n` : ''}\n`
	const res = await completionWithFunctions({
		...rest,
		response_format: { type: 'json_object' },
		prompt: _prompt
	})

	if (!res.content) {
		throw new Error('Invalid response (null)')
	}

	try {
		const content = res.content.replace(/^```json\n/, '').replace(/```$/, '')
		let parsedContent = JSON.parse(content)
		if (parsedContent.$schema && parsedContent.properties) {
			parsedContent = parsedContent.properties
		}
		const parsed = responseObject.parse(parsedContent)

		if (validator) {
			const isValid = await validator(parsed)
			if (isValid === false) {
				throw new Error('Validation of the response failed. Please try again.')
			}
		}

		return parsed
	} catch (err) {
		throw new Error(`Failed to parse response: ${err}, json: '${res.content}'`)
	}
}

export const completionWithJsonResponseWithRetry = async <
	T extends z.ZodRawShape
>(
	props: CompletionOptsWithJsonResponse<T>,
	retryCount = 2
): Promise<z.infer<z.ZodObject<T>>> => {
	let latestErr: Error | undefined
	try {
		return await completionWithJsonResponse(props)
	} catch (err) {
		latestErr = err as Error
		if (retryCount <= 0) {
			return await completionWithJsonResponseWithRetry(
				{
					...props,
					response_format: { type: 'json_object' },
					messages: [
						...(props.messages ?? []),
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: `Your latest reply contains following error:\n\`${err}\``
								}
							]
						}
					]
				},
				retryCount - 1
			)
		}
	}
	throw new Error(`Max retries reached. Last error: ${latestErr}`)
}
