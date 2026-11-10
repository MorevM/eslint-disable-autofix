import { isUndefined } from '@morev/utils';
import { Linter } from 'eslint';
import { disableAutofix } from '../src';
import type { Rule } from 'eslint';

const createRule = (name: string): Rule.RuleModule => ({
	meta: {
		type: 'suggestion',
		fixable: 'code',
		schema: [],
		messages: { unexpected: 'Unexpected {{ name }}.' },
	},
	create(context) {
		return {
			Identifier(node) {
				if (node.name !== name) return;

				context.report({
					node,
					messageId: 'unexpected',
					data: { name },
					fix: (fixer) => fixer.replaceText(node, `${name}Fixed`),
				});
			},
		};
	},
});

// Mirrors lazy exports such as ban-tslint-comment in typescript-eslint@8.72.1.
// The upstream accessor has no setter and defaults to configurable: false.
// Pass the fixture directly to the helper: deepClone would erase the accessor and hide the regression.
// https://github.com/typescript-eslint/typescript-eslint/blob/v8.72.1/packages/eslint-plugin/src/util/lazyRules.ts#L13
// https://github.com/typescript-eslint/typescript-eslint/blob/v8.72.1/packages/eslint-plugin/src/rules/index.ts#L10
const createPlugin = () => {
	const first = createRule('first');

	return {
		meta: { name: 'test-plugin' },
		rules: Object.defineProperty({ first, second: createRule('second') }, 'first', {
			configurable: false,
			enumerable: true,
			get: () => first,
		}),
	};
};

describe('Third-party plugin copies', () => {
	it('Can disable autofix for a non-configurable getter-only rule', () => {
		const plugin = createPlugin();
		const originalRules = plugin.rules;
		const originalRule = plugin.rules.first;
		const originalDescriptor = Object.getOwnPropertyDescriptor(plugin.rules, 'first');
		const configuration = {
			plugins: { test: plugin },
			rules: { 'no-autofix/test/first': 'error' },
		};
		const input = [configuration];

		const configurations = disableAutofix(input);
		const result = new Linter().verifyAndFix('const first = 1;', configurations);

		expect(result.fixed).toBe(false);
		expect(result.output).toBe('const first = 1;');
		expect(result.messages).toMatchObject([
			{ ruleId: 'test/first', message: 'Unexpected first.', severity: 2 },
		]);
		expect(result.messages[0].fix).toBeUndefined();
		expect(configuration.plugins.test).not.toBe(plugin);
		expect(configurations).toBe(input);
		expect(configurations[0]).toBe(configuration);
		expect(configuration.plugins.test.meta).toBe(plugin.meta);
		expect(configuration.plugins.test.rules).not.toBe(originalRules);
		expect(configuration.plugins.test.rules.second).toBe(originalRules.second);
		expect(plugin.rules).toBe(originalRules);
		expect(plugin.rules.first).toBe(originalRule);
		expect(Object.getOwnPropertyDescriptor(plugin.rules, 'first')).toStrictEqual(originalDescriptor);
	});

	it('Keeps diagnostics and accumulates wrappers for multiple rules', () => {
		const plugin = createPlugin();
		const originalRules = { ...plugin.rules };
		const configurations = disableAutofix([
			{
				plugins: { test: plugin },
				rules: { 'no-autofix/test/first': 'error' },
			},
			{ rules: { 'no-autofix/test/second': 'warn' } },
		]);
		const linter = new Linter();
		const result = linter.verifyAndFix('const first = second;', configurations);

		expect(result.fixed).toBe(false);
		expect(result.output).toBe('const first = second;');
		expect(result.messages).toMatchObject([
			{ ruleId: 'test/first', message: 'Unexpected first.', severity: 2 },
			{ ruleId: 'test/second', message: 'Unexpected second.', severity: 1 },
		]);
		expect(result.messages.every((message) => isUndefined(message.fix))).toBe(true);
		expect(plugin.rules.first).toBe(originalRules.first);
		expect(plugin.rules.second).toBe(originalRules.second);

		const originalResult = linter.verifyAndFix('const first = second;', [{
			plugins: { test: plugin },
			rules: { 'test/first': 'error', 'test/second': 'warn' },
		}]);

		expect(originalResult.fixed).toBe(true);
		expect(originalResult.output).toBe('const firstFixed = secondFixed;');
		expect(originalResult.messages).toStrictEqual([]);
	});

	// ESLint rejects different plugin references under the same name when merging flat configs.
	// Separate plugin tables and a shared table must end up referencing the same accumulated copy.
	// Re-selecting the first rule after wrapping the second must retain both wrappers in that copy.
	// https://github.com/eslint/eslint/blob/v9.39.2/lib/config/flat-config-schema.js#L394-L395
	it('Shares one plugin copy across configurations and repeated rule selections', () => {
		const plugin = createPlugin();
		const plugins = { test: plugin };
		const configurations = disableAutofix([
			{
				plugins,
				rules: { 'no-autofix/test/first': 'error' },
			},
			{
				plugins: { test: plugin },
				rules: { 'no-autofix/test/second': 'warn' },
			},
			{
				plugins,
				rules: { 'no-autofix/test/first': 'warn' },
			},
		]);

		const patchedPlugin = configurations[0].plugins?.test;

		expect(patchedPlugin).not.toBe(plugin);
		expect(configurations[1].plugins?.test).toBe(patchedPlugin);
		expect(configurations[2].plugins?.test).toBe(patchedPlugin);

		const result = new Linter().verifyAndFix('const first = second;', configurations);

		expect(result.fixed).toBe(false);
		expect(result.output).toBe('const first = second;');
		expect(result.messages).toMatchObject([
			{ ruleId: 'test/first', message: 'Unexpected first.', severity: 1 },
			{ ruleId: 'test/second', message: 'Unexpected second.', severity: 1 },
		]);
		expect(result.messages.every((message) => isUndefined(message.fix))).toBe(true);
	});

	it('Can reuse the original plugin in independent configurations', () => {
		const plugin = createPlugin();

		disableAutofix([{
			plugins: { test: plugin },
			rules: { 'no-autofix/test/first': 'error' },
		}]);

		const configurations = disableAutofix([{
			plugins: { test: plugin },
			rules: { 'test/first': 'error', 'no-autofix/test/second': 'warn' },
		}]);
		const result = new Linter().verifyAndFix('const first = second;', configurations);

		expect(result.fixed).toBe(true);
		expect(result.output).toBe('const firstFixed = second;');
		expect(result.messages).toMatchObject([
			{ ruleId: 'test/second', message: 'Unexpected second.', severity: 1 },
		]);
		expect(result.messages[0].fix).toBeUndefined();
	});

	it('Can build configurations repeatedly with a shared plugins table', () => {
		const plugin = createPlugin();
		const plugins = { test: plugin };
		const build = () => disableAutofix([
			{ plugins },
			{
				plugins: { test: plugin },
				rules: { 'no-autofix/test/first': 'error' },
			},
		]);
		const first = build();
		const second = build();

		for (const configurations of [first, second]) {
			const result = new Linter().verifyAndFix('const first = 1;', configurations);

			expect(result.fixed).toBe(false);
			expect(result.output).toBe('const first = 1;');
			expect(result.messages).toMatchObject([
				{ ruleId: 'test/first', message: 'Unexpected first.', severity: 2 },
			]);
			expect(result.messages[0].fix).toBeUndefined();
			expect(configurations[0].plugins?.test).toBe(configurations[1].plugins?.test);
		}

		expect(plugins.test).toBe(plugin);
		expect(first[0].plugins?.test).not.toBe(second[0].plugins?.test);
	});

	it('Can use a shallow-frozen configuration with mutable plugins and rules', () => {
		const plugin = createPlugin();
		const plugins = { test: plugin };
		const configuration = Object.freeze({
			plugins,
			rules: { 'no-autofix/test/first': 'error', 'no-autofix/test/second': 'warn' },
		});
		const input = [configuration];
		Object.freeze(input);
		const configurations = disableAutofix(input);
		const result = new Linter().verifyAndFix('const first = second;', configurations);

		expect(result.fixed).toBe(false);
		expect(result.output).toBe('const first = second;');
		expect(result.messages).toMatchObject([
			{ ruleId: 'test/first', message: 'Unexpected first.', severity: 2 },
			{ ruleId: 'test/second', message: 'Unexpected second.', severity: 1 },
		]);
		expect(result.messages.every((message) => isUndefined(message.fix))).toBe(true);
		expect(configurations).not.toBe(input);
		expect(configurations[0]).not.toBe(configuration);
		expect(configuration.plugins).toBe(plugins);
		expect(plugins.test).toBe(plugin);
		expect(configuration.rules).toStrictEqual({ 'test/first': 'error', 'test/second': 'warn' });
	});
});
