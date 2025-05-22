// @ts-expect-error -- No types
import ruleComposer from 'eslint-rule-composer';
import type { PlainObject } from '@morev/utils';

/**
 * Creates a clone of the given rule with disabled autofix.
 *
 * @param   rule   Original rule.
 *
 * @returns        Clone of the rule with disabled autofix.
 */
export const createNonFixableRule = (rule: any) => {
	if (!rule) return null;

	return ruleComposer.mapReports(
		Object.create(rule),
		(problem: any) => {
			problem.fix = null;
			return problem;
		},
	);
};

/**
 * Deletes given keys from the object. Mutates the original object.
 *
 * @param   source   Source object.
 * @param   keys     Keys of the object to remove.
 */
export const omitMutable = (source: PlainObject, keys: string[]) => {
	keys.forEach((key) => delete source[key]);
};
