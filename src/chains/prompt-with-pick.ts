import { z } from 'zod'

import { Thread } from '../thread'
import type {
	InferedType,
	PromptWithRetryOpts,
	ShapeType
} from './prompt-with-retry'
import { promptWithRetry } from './prompt-with-retry'

type PromptWithPickOpts<T extends z.ZodRawShape> = {
	choices: number
	pickOpts?: Partial<PromptWithRetryOpts<T>['run']>
} & PromptWithRetryOpts<T>
type Result<T extends z.ZodRawShape> = InferedType<T>

function generateAlphabetArray(): string[] {
	return Array.from({ length: 26 }, (_, i) =>
		String.fromCharCode('A'.charCodeAt(0) + i)
	)
}

const sortPromptResults = async <T extends ShapeType>(
	results: InferedType<T>[],
	{
		run,
		pickOpts,
		thread,
		...rest
	}: Omit<PromptWithPickOpts<T>, 'responseObject' | 'validator' | 'choices'>
): Promise<Array<InferedType<T>>> => {
	thread = thread ?? new Thread()
	const optionNames = generateAlphabetArray().slice(0, results.length)
	const pickOrder = await promptWithRetry({
		thread,
		run: {
			...run,
			...pickOpts,
			instructions: `Your task is to help to identify best options for given instructions: ${run.instructions ?? ''}${run.additional_instructions ?? ''} ${pickOpts?.instructions ?? ''}${pickOpts?.additional_instructions ?? ''} # Generated options:\n${results.map((r, i) => `\n##Option '${optionNames[`${i}`]}':\n===\n${JSON.stringify(r)}\n===`).join('\n')}.`,
			additional_instructions: `Please sort the options in order from best answer to worst.
			Include all options ['${optionNames.join("','")}']. Example {"pickedItems":["X", "Y", "Z"]}`
		},
		...rest,
		responseObject: z.object({ pickedItems: z.array(z.string().length(1)) }),
		validator: async ({ pickedItems }) => {
			if (pickedItems.length !== results.length) {
				throw new Error(
					`Invalid number of options ${pickedItems.length}. Please sort all options ['${optionNames.join("','")}']`
				)
			}
			if (new Set(pickedItems).size !== results.length) {
				throw new Error('Duplicate options')
			}
			return true
		}
	})

	// eslint-disable-next-line security/detect-object-injection
	const indexes = pickOrder.pickedItems.map((o) => optionNames.indexOf(o))
	return indexes.map((i) => results[`${i}`]) as Awaited<Result<T>>[]
}

export const promptWithPickAll = async <T extends z.ZodRawShape>({
	thread,
	choices,
	pickOpts,
	...rest
}: PromptWithPickOpts<T>): Promise<Array<InferedType<T>>> => {
	thread = thread ?? new Thread()
	const attempts = Array.from({ length: choices }, (_, i) => i + 1)
	const promises = attempts.map(async () => {
		return promptWithRetry<T>({ thread: await thread.clone(), ...rest })
	})
	const results: InferedType<T>[] = await Promise.all(promises)

	// console.log('pick results', results)

	return sortPromptResults<T>(results, {
		thread: await thread.clone(),
		pickOpts,
		...rest
	})
}

export const promptWithPick = async <T extends ShapeType>(
	opts: PromptWithPickOpts<T>
): Promise<InferedType<T>> => {
	const results = await promptWithPickAll(opts)
	if (results[0]) {
		return results[0]
	}
	throw new Error('No results returned')
}
