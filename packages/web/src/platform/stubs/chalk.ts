/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This is a browser-safe stub for the 'chalk' module.
// It returns the original string without any ANSI color codes.

const chalkStub = (str) => str;

const chalk = new Proxy(chalkStub, {
  get: () => chalkStub,
});

export default chalk;
