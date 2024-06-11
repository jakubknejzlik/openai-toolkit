import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Assistant } from '../assistant'
import { Thread } from '../thread'
import { promptWithPickAll } from './prompt-with-pick'

export const defaultTestAssistant = new Assistant(
	'OpenAI Toolkit Default Assistant',
	{
		params: {
			description:
				'You are assistant designated to testing of LangChain framework. Obey all commands.'
		}
	}
)

describe(
	'Prompt with Pick',
	() => {
		it('should pick best prompt', async () => {
			const result = await promptWithPickAll({
				choices: 10,
				pickOpts: {
					instructions: 'the best answer is red'
				},
				thread: new Thread(),
				run: {
					assistant_id: await defaultTestAssistant.getId(),
					additional_instructions: `User like red and blue colors. Pick one of these colors: red, green, blue`
				},
				responseObject: z.object({
					color: z.string()
				})
			})

			expect(result).toBeDefined()
			expect(result[0]?.color).toEqual('red')
		})
	},
	{ retry: 2 }
)
