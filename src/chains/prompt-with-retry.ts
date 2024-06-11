import type { z } from 'zod'

import type { Thread, ThreadPromptWithJsonResponse } from '../thread'

export type ShapeType = z.ZodRawShape
export type InferedType<T extends ShapeType> = z.infer<z.ZodObject<T>>

export type PromptWithRetryOpts<T extends ShapeType> = {
	thread: Thread
	retryCount?: number
	maxRetries?: number
	validator?: (obj: InferedType<T>) => Promise<boolean | void>
} & ThreadPromptWithJsonResponse<T>
export const promptWithRetry = async <T extends ShapeType>({
	thread,
	validator,
	retryCount = 0,
	maxRetries = 2,
	...rest
}: PromptWithRetryOpts<T>): Promise<InferedType<T>> => {
	// console.log(`running ${retryCount}/${maxRetries}`)
	try {
		const obj = await thread.promptJsonResponse({ ...rest })

		// console.log('response with retry', JSON.stringify(obj, null, 2))

		if (validator) {
			const isValid = await validator(obj)
			if (isValid === false) {
				throw new Error('Validation of the response failed. Please try again.')
			}
		}
		return obj
	} catch (err) {
		// console.log('retrying pick with error', err, '...', await thread.getId())
		if (retryCount >= maxRetries) {
			throw new Error(
				`Max retries reached. Last error: ${err}, thread id: ${await thread.getId()}`
			)
		}
		await thread.appendMessage(
			{
				role: 'user',
				content: `Your reply contains following errors:\n\`${err}\``
			},
			{ retryCount: 2 }
		)
		return promptWithRetry({
			thread,
			validator,
			retryCount: retryCount + 1,
			maxRetries,
			...rest
		})
	}
}
