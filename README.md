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
> This is a temporary solution until [this issue](https://github.com/eslint/eslint/issues/18696) is resolved -
> after that the feature for disabling autofix for rules will be in the ESLint core.
>
> I tried to get [the RFC implemented](https://github.com/eslint/rfcs/pull/134), but was unsuccessful.
> Now there is another RFC: <https://github.com/eslint/rfcs/pull/143>
>
> I'll probably be able to implement this package as a polyfill for the final solution,
> once RFC discussion reaches a consensus on a public API.

---

> [!IMPORTANT]
>
> * Only works with ESLint v9 with flat config format or ESLint v10;
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

```sh
pnpm add -D @morev/eslint-disable-autofix
```

```sh
yarn add @morev/eslint-disable-autofix -D
```

```sh
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

> [!CAUTION]
> Direct patching is quite risky and hacky, it relies on non-public ESLint API. \
> While it's currently the only way to access certain rule internals,
> it may break in future ESLint versions.
