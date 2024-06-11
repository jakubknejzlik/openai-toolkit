/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'

export default defineConfig(() => {
	return {
		test: {
			testTimeout: 30000,
		}
	}
})
