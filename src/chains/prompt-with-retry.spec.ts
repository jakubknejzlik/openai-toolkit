import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Thread } from '../thread'
import { defaultTestAssistant } from './prompt-with-pick.spec'
import { promptWithRetry } from './prompt-with-retry'

describe('Prompt with Retry', () => {
	it('should retry prompt', async () => {
		const result = await promptWithRetry({
			thread: new Thread(),
			run: {
				assistant_id: await defaultTestAssistant.getId(),
				additional_instructions: `Pick red color`
			},
			responseObject: z.object({
				color: z.string()
			}),
			validator: async ({ color }) => {
				if (color !== 'blue') {
					throw new Error(
						'Please ignore the previous instructions and pick blue color'
					)
				}
			}
		})

		// console.log('???', result)

		expect(result.color).toEqual('blue')
	})
})
