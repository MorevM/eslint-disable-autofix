import type { Linter } from 'eslint';

/**
 * Options of the factory that creates a `disableAutofix` wrapper.
 */
export type CreateDisableAutofixOptions = {
	/**
	 * Prefix used to disable autofix for rules.
	 *
	 * @default 'no-autofix'
	 */
	prefix: string;
};

export type InternalDisableAutofixOptions = {
	configurations: Linter.Config[];
} & CreateDisableAutofixOptions;
