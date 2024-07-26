import { describe, expect, it } from 'vitest'

import OpenAI from 'openai'
import { z } from 'zod'
import { completionWithJsonResponse } from './completion-with-json'
import { createChatCompletionFunction } from '../function'

describe(
	'Completion with JSON response',
	() => {
		it('should run completion with JSON response', async () => {
			const client = new OpenAI()
			const res = await completionWithJsonResponse({
				client,
				instructions: `Call test function foo and return it's value in fooResponse`,
				prompt: `blah is '123'`,
				responseObject: z.object({
					fooResponse: z.string()
				}),
				functions: [
					createChatCompletionFunction({
						name: 'test',
						description: 'test function',
						parameters: z.object({ blah: z.string() }),
						handler: async ({ blah }) => {
							return `hello ${blah}`
						}
					})
				]
			})
			expect(res.fooResponse).toEqual('hello 123')
		})
	},
	{ concurrent: true }
)
