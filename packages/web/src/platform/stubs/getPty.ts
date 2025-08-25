/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This is a browser-safe stub for the Node.js-specific getPty module.
// It returns null to indicate that PTY is not available in the web environment.
export function getPty() {
  return Promise.resolve(null);
}
