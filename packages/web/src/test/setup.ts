/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

// Mock Navigator.storage for OPFS tests
Object.defineProperty(navigator, 'storage', {
  value: {
    getDirectory: vi.fn(),
  },
  writable: true,
});

// Global test utilities
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  const { TextEncoder } = await import('util');
  global.TextEncoder = TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  const { TextDecoder } = await import('util');
  global.TextDecoder = TextDecoder;
(async () => {
  if (typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined') {
    const util = await import('util');
    if (typeof TextEncoder === 'undefined') {
      global.TextEncoder = util.TextEncoder;
    }
    if (typeof TextDecoder === 'undefined') {
      global.TextDecoder = util.TextDecoder;
    }
  }
})();