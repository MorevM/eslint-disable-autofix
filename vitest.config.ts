import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		watch: false,
		globals: true,
		reporters: ['verbose'],
		coverage: {
			enabled: false,
			provider: 'v8',
			all: false,
		},
	},
});
