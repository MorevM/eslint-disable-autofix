/* eslint-disable @typescript-eslint/no-deprecated --
   All `eslint/use-at-your-own-risk` properties marked as deprecated,
   but there is no other way to get the original rules.
*/
import { deepClone, deepCloneStrict, stripIndent } from '@morev/utils';
import { ESLint } from 'eslint';
import riskyEslint from 'eslint/use-at-your-own-risk';
import { createDisableAutofix, disableAutofix } from '../src';
import type { Linter } from 'eslint';

// Copy of the original rule for future recovery.
const initialNoVar = riskyEslint.builtinRules.get('no-var');

const TEST_CODE = stripIndent(`
  if (1) {
    if (2) {
    }
  }

  var q = 1;
`);

const TEST_CODE_ONLY_EXTERNAL_FIXED = stripIndent(`
  if (1 && 2) {
    }

  var q = 1;
`);

const TEST_CODE_ONLY_INTERNAL_FIXED = stripIndent(`
  if (1) {
    if (2) {
    }
  }

  let q = 1;
`);

const getfixedResult = async (
	configurations: Linter.Config[],
	disabler: typeof disableAutofix,
) => {
	// As the module patches an original package, we always need a clean copy.
	// `vi.resetModules()` doesn't work here.
	const eslintPluginUnicorn = await import('eslint-plugin-unicorn')
		.then((m) => deepCloneStrict(m.default));

	// It's even more hacky, but what can you do -
	// the module patches a thing that we don't even have direct access to..
	// `vi.resetModules()` doesn't work as well.
	if ('_set' in riskyEslint.builtinRules) {
		// @ts-expect-error --  Restore the original rule
		riskyEslint.builtinRules._set('no-var', () => initialNoVar);
	}

	const eslint = new ESLint({
		fix: true,
		overrideConfigFile: true,
		overrideConfig: disabler([
			{
				plugins: {
					unicorn: deepClone(eslintPluginUnicorn),
				},
			},
			...configurations,
		]),
	});

	const lintResults = await eslint.lintText(TEST_CODE);
	await ESLint.outputFixes(lintResults);

	return lintResults[0].output;
};

describe('disable-autofix', () => {
	it('Can disable autofix for a core ESLint rule', async () => {
		const result = await getfixedResult([
			{
				rules: {
					'unicorn/no-lonely-if': 'warn',
					'no-autofix/no-var': 'warn',
				},
			},
		], disableAutofix);

		expect(result).toBe(TEST_CODE_ONLY_EXTERNAL_FIXED);
	});

	it('Can disable autofix for a third-party rule', async () => {
		const result = await getfixedResult([
			{
				rules: {
					'no-autofix/unicorn/no-lonely-if': 'warn',
					'no-var': 'warn',
				},
			},
		], disableAutofix);

		expect(result).toBe(TEST_CODE_ONLY_INTERNAL_FIXED);
	});
});


describe('create-disable-autofix', () => {
	it('Can create `disableAutofix` with changed prefix and disable autofix for a core ESLint rule', async () => {
		const result = await getfixedResult([
			{
				rules: {
					'unicorn/no-lonely-if': 'warn',
					'disable-autofix/no-var': 'warn',
				},
			},
		], createDisableAutofix({ prefix: 'disable-autofix' }));

		expect(result).toBe(TEST_CODE_ONLY_EXTERNAL_FIXED);
	});

	it('Can create `disableAutofix` with changed prefix and disable autofix for a third-party rule', async () => {
		const result = await getfixedResult([
			{
				rules: {
					'disable-autofix/unicorn/no-lonely-if': 'warn',
					'no-var': 'warn',
				},
			},
		], createDisableAutofix({ prefix: 'disable-autofix' }));

		expect(result).toBe(TEST_CODE_ONLY_INTERNAL_FIXED);
	});
});
