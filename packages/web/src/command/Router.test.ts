/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { CommandRouter } from '../command/Router.js';

// Mock the platform modules
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    stat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    writeFile: vi.fn(),
  },
}));

vi.mock('../platform/git.js', () => ({
  gitService: {
    status: vi.fn(),
    log: vi.fn(),
    listBranches: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
  },
}));

describe('CommandRouter', () => {
  let router: CommandRouter;
  let mockContext: any;

  beforeEach(() => {
    router = new CommandRouter();
    mockContext = {
      terminal: {
        clear: vi.fn(),
        printMessage: vi.fn(),
        println: vi.fn(),
      },
      workingDirectory: '/workspace',
      setStatus: vi.fn(),
    };
  });

  it('should handle help command', async () => {
    const result = await router.route('/help', mockContext);
    expect(result.type).toBe('message');
    expect(result.content).toContain('Available commands');
  });

  it('should handle clear command', async () => {
    const result = await router.route('/clear', mockContext);
    expect(result.type).toBe('message');
    expect(mockContext.terminal.clear).toHaveBeenCalled();
  });

  it('should handle pwd command', async () => {
    const result = await router.route('/pwd', mockContext);
    expect(result.type).toBe('message');
    expect(result.content).toContain('/workspace');
  });

  it('should handle unknown slash command', async () => {
    const result = await router.route('/unknown', mockContext);
    expect(result.type).toBe('error');
    expect(result.content).toContain('Unknown command');
  });

  it('should handle empty input', async () => {
    const result = await router.route('', mockContext);
    expect(result.type).toBe('message');
    expect(result.content).toBe('');
  });

  it('should handle regular prompts', async () => {
    const result = await router.route('Hello world', mockContext);
    expect(result.type).toBe('message');
    expect(result.content).toContain('Echo: Hello world');
  });
});