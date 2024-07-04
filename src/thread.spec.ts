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
		it('should list messages', async () => {
			const thread = new Thread()

			await thread.appendMessage({
				role: 'assistant',
				content: '1'
			})
			await thread.appendMessage({
				role: 'user',
				content: '2'
			})

			const messages = await thread.listMessages()
			expect(messages.length).toBe(2)

			expect(messages[0]?.content[0]).toEqual({
				type: 'text',
				text: { value: '1', annotations: [] }
			})
		})
		it('should clone thread', async () => {
			const thread = new Thread()

			await thread.appendMessage({
				role: 'assistant',
				content: 'Hello, world!'
			})
			await thread.appendMessage({
				role: 'user',
				content: '1+1?'
			})
			await thread.appendMessage({
				role: 'assistant',
				content: '2'
			})

			expect(thread).toBeDefined()
			expect(await thread.getId()).toBeDefined()

			const messages = await thread.listMessages()
			expect(messages.length).toBe(3)

			const thread2 = await thread.clone()
			const messages2 = await thread2.listMessages()
			expect(messages2.length).toBe(messages.length)

			expect(messages2[0]?.content).toEqual(messages[0]?.content)
			expect(messages2[0]?.content[0]).toEqual({
				type: 'text',
				text: { value: 'Hello, world!', annotations: [] }
			})
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
