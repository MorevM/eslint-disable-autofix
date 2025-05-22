<!-- markdownlint-disable-next-line md033 -->
<img src="./.github/assets/banner.svg" alt="Promo image of @morev/eslint-disable-autofix package" width="830" height="465" />

![Stability of "master" branch](https://img.shields.io/github/actions/workflow/status/MorevM/eslint-disable-autofix/build.yaml?branch=master)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Last commit](https://img.shields.io/github/last-commit/morevm/eslint-disable-autofix)
![Release version](https://img.shields.io/github/v/release/morevm/eslint-disable-autofix?include_prereleases)
![GitHub Release Date](https://img.shields.io/github/release-date/morevm/eslint-disable-autofix)
![Keywords](https://img.shields.io/github/package-json/keywords/morevm/eslint-disable-autofix)

# @morev/eslint-disable-autofix

This utility allows you to disable autofix for specific ESLint rules by using a custom prefix in your configurations. \
It's useful when you want a rule to remain active for linting purposes but prevent ESLint from automatically fixing it.

---

> [!NOTE]
> This is a temporary solution until [this RFC](https://github.com/eslint/rfcs/pull/134) is accepted
> and a final implementation is made that closes [this issue](https://github.com/eslint/eslint/issues/18696) -
> after that the feature for disabling autofix for rules will be in the ESLint core.
>
> I am working on RFC development and final implementation in the core myself,
> but the process will take some time, and the problem is already there.
>
> I'll probably be able to implement this as a polyfill for the final solution,
> once [the RFC](https://github.com/eslint/rfcs/pull/134) discussion reaches
> a consensus on a public API.

---

> [!IMPORTANT]
>
> * Only works with ESLint v9 and its flat config format;
> * You have to restart ESLint server after adding/removing `no-autofix/` prefix to take effect.

---

## Why?

Some rules support autofixing, which is often convenient, but in certain cases
the fixes may be broken, unsafe, or simply undesirable. \
Ideally, unsafe autofixes should be treated as suggestions, and broken fixes should be reported.

However, ESLint is a large ecosystem, and some useful plugins are no longer actively maintained. \
Even in actively maintained projects, users may want to disable autofixing for specific rules
due to project-specific or personal preferences.

## Installation

```bash
pnpm add -D @morev/eslint-disable-autofix
```

```bash
yarn add @morev/eslint-disable-autofix -D
```

```bash
npm install -D @morev/eslint-disable-autofix
```

## Usage

### Basic usage

In your `eslint.config.js` (only flat config is supported):

```js
import { disableAutofix } from '@morev/eslint-disable-autofix';
import somePlugin from 'some-eslint-plugin';

export default disableAutofix([
  {
    plugins: {
      'some-plugin': somePlugin,
    },
    rules: {
      // Disable autofix for a core rule
      'no-autofix/no-var': 'error',
      // Disable autofix for a third-party rule
      'no-autofix/some-plugin/some-rule': 'warn',
    },
  },
]);
```

### Custom prefix

If you'd prefer a custom prefix other than `no-autofix/`, use the factory:

```js
import { createDisableAutofix } from '@morev/eslint-disable-autofix';

const disableAutofix = createDisableAutofix({
  prefix: 'disable-autofix',
});

export default disableAutofix([
  {
    rules: {
      'disable-autofix/no-var': 'error',
    },
  },
]);
```

## How it works internally

1. Scans passed ESLint configurations for rules with a specified prefix;
1. Strips the prefix to keep the original name of the rule;
1. Patches rules from ESLint core or third-party plugins directly to disable autofix.

Under the hood, it uses [`eslint-rule-composer`](https://github.com/not-an-aardvark/eslint-rule-composer)
to wrap rules with autofix disabled.

>[!CAUTION]
> Direct patching is quite risky and hacky, it relies on non-public ESLint API. \
> While it's currently the only way to access certain rule internals,
> it may break in future ESLint versions.

## Alternatives

I've been using [eslint-plugin-no-autofix](https://github.com/aladdin-add/eslint-plugin/tree/master/packages/no-autofix)
for a long time and haven't had much trouble with it, however recently problems have arisen:

1. Some popular plugins (like [eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn)
   or [eslint-stylistic](https://github.com/eslint-stylistic/eslint-stylistic))
   switch to the ESM-only distribution format and
   [eslint-plugin-no-autofix](https://github.com/aladdin-add/eslint-plugin/tree/master/packages/no-autofix) doesn't work with it.
   The [issue have no response](https://github.com/aladdin-add/eslint-plugin/issues/104),
   so I've decided to create my own solution that works in a different way.
1. I'm getting tired of rules being renamed just to make them work. \
   Say I need to disable a rule with autofix turned off for a single file - I write `/* eslint-disable no-autofix/unicorn/no-lonely-if */`. \
   Later, the broken autofix in the original rule gets fixed, I re-enable the main rule,
   and now the directive no longer applies, which leads to unexpected changes I didn't want.

   Patching the original rules instead of creating new ones might be a bit riskier technically,
   but from a developer experience perspective, it's definitely cleaner and more intuitive.
