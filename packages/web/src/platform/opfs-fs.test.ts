/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OPFSAdapter } from '../platform/opfs-fs.js';

// Mock navigator.storage
const mockGetDirectory = vi.fn();
Object.defineProperty(navigator, 'storage', {
  value: {
    getDirectory: mockGetDirectory,
  },
  writable: true,
});

describe('OPFSAdapter', () => {
  let adapter: OPFSAdapter;
  let mockRootHandle: any;
  let mockFileHandle: any;
  let mockDirHandle: any;

  beforeEach(() => {
    vi.resetAllMocks();
    
    mockFileHandle = {
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
        size: 5,
        lastModified: Date.now(),
      }),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn(),
        close: vi.fn(),
      }),
    };

    mockDirHandle = {
      kind: 'directory',
      getFileHandle: vi.fn().mockResolvedValue(mockFileHandle),
      getDirectoryHandle: vi.fn().mockImplementation((name, options) => {
        if (name === 'test.txt') {
          throw new Error('Not a directory');
        }
        return Promise.resolve(mockDirHandle);
      }),
      removeEntry: vi.fn(),
      entries: vi.fn().mockReturnValue({
        async *[Symbol.asyncIterator]() {
          yield ['file1.txt', mockFileHandle];
          yield ['dir1', mockDirHandle];
        },
      }),
    };

    mockRootHandle = mockDirHandle;
    mockGetDirectory.mockResolvedValue(mockRootHandle);
    
    adapter = new OPFSAdapter();
  });

  it('should read file contents', async () => {
    const content = await adapter.readFile('test.txt', { encoding: 'utf8' });
    expect(content).toEqual('\x00\x00\x00\x00\x00'); // 5 null bytes as UTF-8
  });

  it('should write file contents', async () => {
    await adapter.writeFile('test.txt', 'hello');
    expect(mockFileHandle.createWritable).toHaveBeenCalled();
  });

  it('should list directory contents', async () => {
    const files = await adapter.readdir('/');
    expect(files).toEqual(['dir1', 'file1.txt']); // Sorted alphabetically
  });

  it('should create directories', async () => {
    await adapter.mkdir('newdir');
    expect(mockRootHandle.getDirectoryHandle).toHaveBeenCalledWith('newdir', { create: true });
  });

  it('should get file stats', async () => {
    const stats = await adapter.stat('test.txt');
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(5);
  });
});