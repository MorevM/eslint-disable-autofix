/**
 * Slightly rewritten version of the file
 * https://github.com/not-an-aardvark/eslint-rule-composer/blob/master/lib/rule-composer.js
 */
import { isFunction, isObject, isString } from '@morev/utils';

const getRuleCreateFunction = (rule) => (isFunction(rule) ? rule : rule.create);

const getRuleMeta = (rule) => {
	return isObject(rule) && 'meta' in rule && isObject(rule.meta)
		? rule.meta
		: {};
};

const getMessageIds = (rule) => {
	const meta = getRuleMeta(rule);
	return 'messages' in meta && isObject(rule.meta.messages)
		? meta.messages
		: {};
};

/**
 * Translates a multi-argument context.report() call into a single object argument call.
 *
 * @param     {...any}   args   A list of arguments passed to `context.report`
 *
 * @returns   {object}          A normalized object containing report information
 */
const normalizeMultiArgReportCall = (...args) => {
	// If there is one argument, it is considered to be a new-style call already.
	if (args.length === 1) return args[0];

	// If the second argument is a string, the arguments are interpreted as [node, message, data, fix].
	if (isString(args[1])) {
		return {
			node: args[0],
			message: args[1],
			data: args[2],
			fix: args[3],
		};
	}

	// Otherwise, the arguments are interpreted as [node, loc, message, data, fix].
	return {
		node: args[0],
		loc: args[1],
		message: args[2],
		data: args[3],
		fix: args[4],
	};
};

/**
 * Normalizes a MessageDescriptor to always have a `loc` with `start` and `end` properties.
 *
 * @param     {object}   descriptor   A descriptor for the report from a rule.
 *
 * @returns   {object}                An updated location that infers the `start` and `end` properties
 *                                    from the `node` of the original descriptor, or infers
 *                                    the `start` from the `loc` of the original descriptor.
 */
const normalizeReportLoc = (descriptor) => {
	if (!descriptor.loc) return descriptor.node.loc;

	return descriptor.loc.start
		? descriptor.loc
		: { start: descriptor.loc, end: null };
};

/**
 * Interpolates data placeholders in report messages.
 *
 * @param     {object}   descriptor
 * @param     {object}   messageIds
 *
 * @returns   {object}
 */
const normalizeMessagePlaceholders = (descriptor, messageIds) => {
	const message = isString(descriptor.messageId)
		? messageIds[descriptor.messageId]
		: descriptor.message;

	if (!descriptor.data) {
		return {
			message,
			data: isString(descriptor.messageId) ? {} : null,
		};
	}

	const normalizedData = Object.create(null);
	const interpolatedMessage = message.replaceAll(
		/\{\{\s*([^{}]+?)\s*\}\}/g,
		(fullMatch, term) => {
			if (term in descriptor.data) {
				normalizedData[term] = descriptor.data[term];
				return descriptor.data[term];
			}

			return fullMatch;
		},
	);

	return {
		message: interpolatedMessage,
		data: Object.freeze(normalizedData),
	};
};

const getReportNormalizer = (rule) => {
	const messageIds = getMessageIds(rule);

	return function normalizeReport(...args) {
		const descriptor = normalizeMultiArgReportCall(...args);
		const interpolatedMessageAndData = normalizeMessagePlaceholders(descriptor, messageIds);

		return {
			node: descriptor.node,
			message: interpolatedMessageAndData.message,
			messageId: isString(descriptor.messageId) ? descriptor.messageId : null,
			data: isString(descriptor.messageId) ? interpolatedMessageAndData.data : null,
			loc: normalizeReportLoc(descriptor),
			fix: descriptor.fix,
		};
	};
};

const removeMessageIfMessageIdPresent = (reportDescriptor) => {
	const newDescriptor = { ...reportDescriptor };

	if (isString(reportDescriptor.messageId) && isString(reportDescriptor.message)) {
		delete newDescriptor.message;
	}

	return newDescriptor;
};


export default Object.freeze({
	filterReports(rule, predicate) {
		return Object.freeze({
			create(context) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();
				const { settings, options } = context;

				return getRuleCreateFunction(rule)(
					Object.freeze(
						Object.create(
							context,
							{
								report: {
									enumerable: true,
									value(...args) {
										const reportDescriptor = getReportNormalizer(rule)(...args);
										if (predicate(reportDescriptor, {
											sourceCode, settings, options, filename,
										})) {
											context.report(removeMessageIfMessageIdPresent(reportDescriptor));
										}
									},
								},
							},
						),
					),
				);
			},
			schema: rule.schema,
			meta: getRuleMeta(rule),
		});
	},

	mapReports(rule, iteratee) {
		return Object.freeze({
			create(context) {
				const filename = context.getFilename();
				const sourceCode = context.getSourceCode();
				const { settings, options } = context;

				return getRuleCreateFunction(rule)(
					Object.freeze(
						Object.create(
							context,
							{
								report: {
									enumerable: true,
									value(...args) {
										context.report(
											removeMessageIfMessageIdPresent(
												iteratee(
													getReportNormalizer(rule)(...args),
													{
														sourceCode, settings, options, filename,
													},
												),
											),
										);
									},
								},
							},
						),
					),
				);
			},
			schema: rule.schema,
			meta: getRuleMeta(rule),
		});
	},

	joinReports(rules) {
		return Object.freeze({
			create(context) {
				return rules
					.map((rule) => getRuleCreateFunction(rule)(context))
					.reduce(
						(allListeners, ruleListeners) =>
							Object.keys(ruleListeners).reduce(
								(combinedListeners, key) => {
									const currentListener = combinedListeners[key];
									const ruleListener = ruleListeners[key];
									if (currentListener) {
										return {
											...combinedListeners,
											[key](...args) {
												currentListener(...args);
												ruleListener(...args);
											},
										};
									}
									return { ...combinedListeners, [key]: ruleListener };
								},
								allListeners,
							),
						Object.create(null),
					);
			},
			meta: Object.freeze({
				// eslint-disable-next-line unicorn/prefer-reflect-apply
				messages: Object.assign.apply(
					null,
					[Object.create(null), ...rules.map((rule) => getMessageIds(rule))],
				),
				fixable: 'code',
			}),
		});
	},
});
