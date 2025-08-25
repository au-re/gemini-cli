/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

// Provide minimal mocks for browser-only dependencies
vi.mock('../terminal/XtermHost.js', () => {
  return {
    XtermHost: class {
      println() {}
      print() {}
      printMessage() {}
      readLine() { return Promise.resolve(''); }
      focus() {}
      dispose() {}
    },
  };
});

describe('main entry', () => {
  it('initializes GeminiWebApp on DOMContentLoaded', async () => {
    document.body.innerHTML = `
      <div id="terminal"></div>
      <div id="status-left"></div>
    `;

    const mod = await import('../main.js');
    const { GeminiWebApp } = mod;
    const startSpy = vi
      .spyOn(GeminiWebApp.prototype as any, 'start')
      .mockResolvedValue();

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();

    expect(startSpy).toHaveBeenCalled();
    startSpy.mockRestore();
  });
});
