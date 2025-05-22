/* eslint-disable @typescript-eslint/no-deprecated --
   All `eslint/use-at-your-own-risk` properties marked as deprecated,
   but there is no other way to get the original rules.
*/
import { isEmpty, tsObject } from '@morev/utils';
import riskyEslint from 'eslint/use-at-your-own-risk';
import { createNonFixableRule, omitMutable } from './utils';
import type { PlainObject } from '@morev/utils';
import type { ESLint } from 'eslint';
import type { CreateDisableAutofixOptions, InternalDisableAutofixOptions } from './types';

const internalDisableAutofix = (options: InternalDisableAutofixOptions) => {
	const { configurations, prefix } = options;

	// Stores the clean names of all rules that need to be patched.
	// During the definition process, patches the configurations themselves
	// so that rules with prefixes are removed and new ones without them are added.
	const allNoAutofixRules = configurations
		.reduce<string[]>((acc, configuration) => {
			if (isEmpty(configuration.rules)) return acc;

			const rulesToDisableAutofix = tsObject.fromEntries(
				tsObject.entries(configuration.rules)
					.filter(([ruleName, ruleValue]) => ruleName.startsWith(prefix)),
			);

			if (isEmpty(rulesToDisableAutofix)) return acc;

			// Rules without the `no-autofix/` prefix for future addition.
			const cleanRules = tsObject.fromEntries(
				tsObject.entries(rulesToDisableAutofix)
					.map(([ruleName, ruleValue]) => [
						ruleName.replace(`${prefix}/`, ''),
						ruleValue,
					]),
			);

			// Omits rules with the `no-autofix/` prefix from the configuration.
			omitMutable(configuration.rules, tsObject.keys(rulesToDisableAutofix));

			// Adds these rules back but without the prefix so that they work as original rules.
			// The module will patch these rules and disable their autofix later.
			Object.assign(configuration.rules, cleanRules);

			acc.push(...tsObject.keys(cleanRules));
			return acc;
		}, []);

	// Early return if there is nothing to do.
	if (isEmpty(allNoAutofixRules)) return configurations;

	// The object containing all third-party plugins presented in the config.
	const allPlugins = configurations
		.reduce<Record<string, ESLint.Plugin>>((acc, configuration) => {
			tsObject.entries(configuration.plugins ?? {})
				.forEach(([pluginMappingName, pluginObject]) => {
					acc[pluginMappingName] ??= pluginObject;
				});

			return acc;
		}, {});

	// Hopefully I'll resolve https://github.com/eslint/eslint/issues/18696
	// before this non-public API changes.
	const eslintRules = riskyEslint.builtinRules;
	// @ts-expect-error -- There is no `set` in the Map and no capability to define it again, so :(
	// https://github.com/eslint/eslint/blob/00716a339ede24ed5a76aceed833f38a6c4e8d3a/lib/rules/utils/lazy-loading-rule-map.js#L56
	eslintRules._set = Map.prototype.set.bind(eslintRules);

	// Replaces rules with those that have autofix disabled using `eslint-rule-composer`.
	// There is no error handling here (like non-existing rules or plugins),
	// because ESLint itself will throw an exception in such a case.
	allNoAutofixRules
		.forEach((fullRuleName) => {
			const [_, pluginName, ruleName] = fullRuleName.match(/(?:(.*?)\/)?(.*)/)!;

			// Third-party rules
			if (pluginName && allPlugins[pluginName]?.rules?.[ruleName]) {
				allPlugins[pluginName].rules[ruleName] = createNonFixableRule(allPlugins[pluginName].rules[ruleName]);

				return;
			}

			// ESLint core rules
			if (eslintRules.has(fullRuleName)) {
				const originalRule = eslintRules.get(fullRuleName);
				// @ts-expect-error -- The same thing as above.
				eslintRules._set(fullRuleName, () => createNonFixableRule(originalRule));
			}
		});

	return configurations;
};

/**
 * Creates a wrapper function that will disable autofix
 * for config rules that have the specified prefix.
 *
 * @example
 * // eslint.config.js
 * const disableAutofix = createDisableAutofix({ prefix: 'disable-autofix' });
 *
 * export default disableAutofix([
 *   {
 *     plugins: {
 *       'some-plugin': someEslintPlugin,
 *     },
 *     rules: {
 *       'disable-autofix/no-var': 'error',
 *       'disable-autofix/some-plugin/some-rule': 'error',
 *     },
 *   },
 * ]);
 *
 * @param   options   Options of the factory.
 *
 * @returns           Wrapper function that will disable autofix for config rules.
 */
export const createDisableAutofix = (
	options?: Partial<CreateDisableAutofixOptions>,
) => {
	const { prefix = 'no-autofix' } = options ?? {};

	return (configurations: PlainObject[]) => internalDisableAutofix({
		configurations,
		prefix,
	});
};

/**
 * Wrapper function that will disable autofix
 * for config rules that have `no-autofix/` prefix.
 *
 * @example
 * // eslint.config.js
 * export default disableAutofix([
 *   {
 *     plugins: {
 *       'some-plugin': someEslintPlugin,
 *     },
 *     rules: {
 *       'no-autofix/no-var': 'error',
 *       'no-autofix/some-plugin/some-rule': 'error',
 *     },
 *   },
 * ]);
 *
 * @returns
 *    Configurations as passed, in which rules with the `no-autofix/` prefix
 *    are replaced with the same rules without the prefix,
 *    and the original rules are patched so that `autofix` is not performed.
 */
export const disableAutofix = createDisableAutofix();
