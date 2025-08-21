/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IgnoreService } from '../platform/ignore.js';
import { opfsAdapter } from '../platform/opfs-fs.js';

// Mock OPFS adapter
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
  },
}));

describe('IgnoreService', () => {
  let service: IgnoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new IgnoreService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.clearCache();
  });

  describe('filter', () => {
    it('should filter basic unwanted files', async () => {
      vi.mocked(opfsAdapter.readFile).mockRejectedValue(
        new Error('File not found'),
      );

      const files = [
        'src/index.js',
        'node_modules/package.json',
        '.git/config',
        'README.md',
      ];
      const filtered = await service.filter('/test', files);

      expect(filtered).toEqual(['src/index.js', 'README.md']);
    });

    it('should apply .gitignore rules', async () => {
      const gitignoreContent = '*.log\nbuild/\n.env';
      vi.mocked(opfsAdapter.readFile).mockImplementation(async (path) => {
        if (path === '/test/.gitignore') {
          return gitignoreContent;
        }
        throw new Error('File not found');
      });

      const files = [
        'src/index.js',
        'debug.log',
        'build/output.js',
        '.env',
        'README.md',
      ];
      const filtered = await service.filter('/test', files);

      expect(filtered).toEqual(['src/index.js', 'README.md']);
    });

    it('should apply .geminiignore rules', async () => {
      const geminiignoreContent = 'test/\n*.test.js';
      vi.mocked(opfsAdapter.readFile).mockImplementation(async (path) => {
        if (path === '/test/.geminiignore') {
          return geminiignoreContent;
        }
        throw new Error('File not found');
      });

      const files = [
        'src/index.js',
        'test/unit.js',
        'app.test.js',
        'README.md',
      ];
      const filtered = await service.filter('/test', files);

      expect(filtered).toEqual(['src/index.js', 'README.md']);
    });

    it('should combine .gitignore and .geminiignore rules', async () => {
      vi.mocked(opfsAdapter.readFile).mockImplementation(async (path) => {
        if (path === '/test/.gitignore') {
          return '*.log\nbuild/';
        } else if (path === '/test/.geminiignore') {
          return 'test/\n*.md';
        }
        throw new Error('File not found');
      });

      const files = [
        'src/index.js',
        'debug.log',
        'build/output.js',
        'test/unit.js',
        'README.md',
      ];
      const filtered = await service.filter('/test', files);

      expect(filtered).toEqual(['src/index.js']);
    });
  });

  describe('isIgnored', () => {
    it('should check if specific file is ignored', async () => {
      const gitignoreContent = '*.log\nbuild/';
      vi.mocked(opfsAdapter.readFile).mockImplementation(async (path) => {
        if (path === '/test/.gitignore') {
          return gitignoreContent;
        }
        throw new Error('File not found');
      });

      expect(await service.isIgnored('/test', 'debug.log')).toBe(true);
      expect(await service.isIgnored('/test', 'src/index.js')).toBe(false);
      expect(await service.isIgnored('/test', 'build/output.js')).toBe(true);
    });
  });

  describe('cache management', () => {
    it('should cache ignore instances', async () => {
      vi.mocked(opfsAdapter.readFile).mockRejectedValue(
        new Error('File not found'),
      );

      await service.filter('/test', ['file1.js']);
      await service.filter('/test', ['file2.js']);

      // Should only call readFile once per directory due to caching
      expect(opfsAdapter.readFile).toHaveBeenCalledTimes(2); // .gitignore and .geminiignore
    });

    it('should clear cache', async () => {
      vi.mocked(opfsAdapter.readFile).mockRejectedValue(
        new Error('File not found'),
      );

      await service.filter('/test', ['file1.js']);
      service.clearCache('/test');
      await service.filter('/test', ['file2.js']);

      expect(opfsAdapter.readFile).toHaveBeenCalledTimes(4); // 2 calls each time
    });
  });
});
