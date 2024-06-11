import type OpenAI from 'openai'

import { getDefaultOpenAIClient } from './openai-client'

export interface AssistantOpts {
	id?: string
	params?: Partial<OpenAI.Beta.Assistants.AssistantCreateParams>
	client?: OpenAI
}

export class Assistant {
	public id?: string
	public description?: string
	private params?: Partial<OpenAI.Beta.Assistants.AssistantCreateParams>
	private assistant?: OpenAI.Beta.Assistant
	private client: OpenAI

	constructor(
		public name: string,
		opts: AssistantOpts = {}
	) {
		this.id = opts.id
		this.client = opts.client || getDefaultOpenAIClient()
		this.params = opts.params
		this.description = opts.params?.description ?? undefined
	}

	async getId(): Promise<string> {
		let id = this.id
		if (!id) {
			const assistants = await this.client.beta.assistants.list()
			let assistant = assistants.data.find(
				(assistant) => assistant.name === this.name
			)
			if (assistant) {
				this.assistant = assistant
				id = this.id = assistant.id
			} else {
				assistant = await this.client.beta.assistants.create({
					name: this.name,
					model: 'gpt-3.5-turbo',
					...this.params
				})
				this.assistant = assistant
				id = this.id = assistant.id
			}
		}

		return id
	}

	async getAssistant(): Promise<OpenAI.Beta.Assistant> {
		let assistant = this.assistant
		if (!assistant) {
			await this.getId()
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			assistant = this.assistant!
		}
		return assistant
	}
}
