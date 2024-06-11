import { describe, expect, it } from 'vitest'

import { Assistant } from './assistant'
import { Thread } from './thread'

const jira = new Assistant('Jira assistant', {
	params: {
		description: 'Can communicate with Jira',
		instructions:
			'You are a Jira assistant. You can ask me to create a ticket, list tickets, or get ticket details.'
	}
})

describe(
	'Thread',
	() => {
		it('should clone thread', async () => {
			const thread = new Thread()

			await thread.appendMessage({
				role: 'assistant',
				content: 'Hello, world!'
			})

			expect(thread).toBeDefined()
			expect(await thread.getId()).toBeDefined()

			const messages = await thread.listMessages()
			expect(messages.length).toBe(1)

			const thread2 = await thread.clone()
			const messages2 = await thread2.listMessages()
			expect(messages2.length).toBe(messages.length)

			expect(messages2[0]?.content).toEqual(messages[0]?.content)
		})

		it('should run prompt', async () => {
			const thread = new Thread()

			const res = await thread.prompt({
				run: {
					assistant_id: await jira.getId()
				}
			})

			expect(res.content.length).toBeGreaterThan(0)
		})
	},
	{ concurrent: true }
)
