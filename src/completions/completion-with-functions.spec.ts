import { describe, expect, it } from 'vitest'

import OpenAI from 'openai'
import { z } from 'zod'
import { createChatCompletionFunction } from '../function'
import { completionWithFunctions } from './completion-with-functions'

describe(
	'Completion with Functions',
	() => {
		it('should run completion with functions', async () => {
			const client = new OpenAI()
			const res = await completionWithFunctions({
				client,
				instructions: `Call test function foo and return it's value in fooResponse`,
				prompt: `blah is '123'`,
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

			expect(res.content).toEqual('hello 123')
		})
	},
	{ concurrent: true }
)
