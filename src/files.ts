import type { FileObject } from 'openai/resources'
import { toFile, type Uploadable } from 'openai/uploads'

import OpenAI from 'openai'
import { getDefaultOpenAIClient } from './openai-client'

export const handleFileUpload = async (
	file: Uploadable,
	filename: string | null,
	client?:OpenAI,
): Promise<FileObject> => {
	return (client ?? getDefaultOpenAIClient()).files.create({
		file: await toFile(file, filename),
		purpose: 'assistants'
	})
}
