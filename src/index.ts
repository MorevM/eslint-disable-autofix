/* eslint-disable @typescript-eslint/no-deprecated --
   All `eslint/use-at-your-own-risk` properties marked as deprecated,
   but there is no other way to get the original rules.
*/
import { isEmpty, tsObject } from '@morev/utils';
import riskyEslint from 'eslint/use-at-your-own-risk';
import { createNonFixableRule, omitMutable } from './utils';
import type { PlainObject } from '@morev/utils';
import type { ESLint, Linter } from 'eslint';
import type { CreateDisableAutofixOptions, InternalDisableAutofixOptions } from './types';

const internalDisableAutofix = (options: InternalDisableAutofixOptions) => {
	const { prefix } = options;
	let { configurations } = options;

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
			const plugin = allPlugins[pluginName];

			// Third-party rules
			if (pluginName && plugin?.rules?.[ruleName]) {
				// Lazy rule exports can expose non-configurable getters without setters.
				// Spread creates writable rule entries while leaving the original table untouched.
				// Copy the plugin too, so replacing its rules table does not mutate the imported plugin.
				const patchedPlugin = {
					...plugin,
					rules: {
						...plugin.rules,
						[ruleName]: createNonFixableRule(plugin.rules[ruleName]),
					},
				};

				// ESLint requires the same plugin object for a given name across flat config entries.
				// Move every matching reference to this copy to avoid "Cannot redefine plugin" errors.
				configurations.forEach((configuration, configurationIndex) => {
					if (configuration.plugins?.[pluginName] !== plugin) return;

					// Plugin tables can be shared by independent builds; never patch them in place.
					const plugins = { ...configuration.plugins, [pluginName]: patchedPlugin };
					if (Reflect.set(configuration, 'plugins', plugins)) return;

					// A frozen configuration can still have mutable rules.
					// Replace its entry in a new result array when its plugins property cannot be assigned.
					configurations = configurations.map((entry, index) => index === configurationIndex
						? { ...configuration, plugins }
						: entry);
				});
				// The next rule must use this copy to preserve all wrappers already applied to the plugin.
				allPlugins[pluginName] = patchedPlugin;

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

	return (configurations: PlainObject[]): Linter.Config[] =>
		internalDisableAutofix({
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
 *    Configurations with prefixes removed and autofix disabled. Always use this result:
 *    rule tables are mutated, but configurations with non-writable `plugins` are copied.
 */
export const disableAutofix = createDisableAutofix();
