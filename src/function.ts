// import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import type OpenAI from 'openai'
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

// extendZodWithOpenApi(z)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatCompletionFunction<T extends z.ZodRawShape = any> = {
	name: string
	description?: string
	parameters?: z.ZodObject<T>
	handler: (params: T) => Promise<string>
}

interface createChatCompletionFunctionOpts<P extends z.ZodRawShape> {
	name: string
	description?: string
	parameters?: z.ZodObject<P>
	handler: (params: z.infer<z.ZodObject<P>>) => Promise<string>
}

export const createChatCompletionFunction = <T extends z.ZodRawShape>({
	name,
	description,
	parameters,
	handler
}: createChatCompletionFunctionOpts<T>): ChatCompletionFunction<T> => {
	return {
		name,
		description,
		parameters,
		handler: async (params): Promise<string> => {
			try {
				const parsedParams = parameters?.parse(params)
				return handler(parsedParams as z.infer<z.ZodObject<T>>)
			} catch (e) {
				return `Failed execute function with error: ${e}`
			}
		}
	}
}

export const functionToOpenAIAssistantTool = <T extends z.ZodRawShape>(
	fn: ChatCompletionFunction<T>
): OpenAI.Beta.Assistants.AssistantTool => {
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

export const functionToPromptInfo = (fn: ChatCompletionFunction): string => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return `- ${fn.name}: ${fn.description} (params object: ${fn.parameters ? JSON.stringify((zodToJsonSchema(fn.parameters) as any)['properties']) : 'none'})`
}
