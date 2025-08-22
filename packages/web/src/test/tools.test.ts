/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebToolRegistry } from '../platform/tools.js';

// Mock dependencies
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('../platform/git.js', () => ({
  gitService: {
    status: vi.fn(),
  },
}));

import { opfsAdapter } from '../platform/opfs-fs.js';
import { gitService } from '../platform/git.js';

describe('Web Tool Registry', () => {
  let registry: WebToolRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new WebToolRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tool definitions', () => {
    it('should have default tools registered', () => {
      const definitions = registry.getToolDefinitions();

      expect(definitions).toHaveLength(7);
      expect(definitions.map((d) => d.name)).toEqual([
        'read_file',
        'write_file',
        'list_directory',
        'create_directory',
        'delete_file',
        'delete_directory',
        'git_status',
      ]);
    });

    it('should provide proper tool definitions', () => {
      const definitions = registry.getToolDefinitions();
      const readFileTool = definitions.find((d) => d.name === 'read_file');

      expect(readFileTool).toBeDefined();
      expect(readFileTool!.description).toBe('Read the contents of a file');
      expect(readFileTool!.parameters).toHaveLength(1);
      expect(readFileTool!.parameters[0].name).toBe('path');
    });
  });

  describe('read_file tool', () => {
    it('should read file successfully', async () => {
      vi.mocked(opfsAdapter.readFile).mockResolvedValue('file content');

      const result = await registry.executeTool(
        { name: 'read_file', parameters: { path: 'test.txt' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('file content');
      expect(opfsAdapter.readFile).toHaveBeenCalledWith('/workspace/test.txt', {
        encoding: 'utf8',
      });
    });

    it('should handle file read errors', async () => {
      vi.mocked(opfsAdapter.readFile).mockRejectedValue(
        new Error('File not found'),
      );

      const result = await registry.executeTool(
        { name: 'read_file', parameters: { path: 'missing.txt' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file');
    });

    it('should require path parameter', async () => {
      const result = await registry.executeTool(
        { name: 'read_file', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path parameter is required');
    });
  });

  describe('write_file tool', () => {
    it('should write file successfully', async () => {
      vi.mocked(opfsAdapter.writeFile).mockResolvedValue();
      vi.mocked(opfsAdapter.mkdir).mockResolvedValue();

      const result = await registry.executeTool(
        {
          name: 'write_file',
          parameters: { path: 'test.txt', content: 'hello world' },
        },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('Successfully wrote 11 characters');
      expect(opfsAdapter.mkdir).toHaveBeenCalledWith('/workspace', {
        recursive: true,
      });
      expect(opfsAdapter.writeFile).toHaveBeenCalledWith(
        '/workspace/test.txt',
        'hello world',
      );
    });

    it('should handle write errors', async () => {
      vi.mocked(opfsAdapter.writeFile).mockRejectedValue(
        new Error('Write failed'),
      );

      const result = await registry.executeTool(
        {
          name: 'write_file',
          parameters: { path: 'test.txt', content: 'content' },
        },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to write file');
    });

    it('should require path and content parameters', async () => {
      let result = await registry.executeTool(
        { name: 'write_file', parameters: { content: 'content' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Path parameter is required');

      result = await registry.executeTool(
        { name: 'write_file', parameters: { path: 'test.txt' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content parameter is required');
    });
  });

  describe('list_directory tool', () => {
    it('should list directory successfully', async () => {
      vi.mocked(opfsAdapter.readdir).mockResolvedValue([
        'file1.txt',
        'file2.js',
        'dir1',
      ]);

      const result = await registry.executeTool(
        { name: 'list_directory', parameters: { path: 'src' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('file1.txt');
      expect(result.content).toContain('file2.js');
      expect(result.content).toContain('dir1');
      expect(opfsAdapter.readdir).toHaveBeenCalledWith('/workspace/src');
    });

    it('should use current directory by default', async () => {
      vi.mocked(opfsAdapter.readdir).mockResolvedValue(['file.txt']);

      const result = await registry.executeTool(
        { name: 'list_directory', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(opfsAdapter.readdir).toHaveBeenCalledWith('/workspace/.');
    });

    it('should handle directory read errors', async () => {
      vi.mocked(opfsAdapter.readdir).mockRejectedValue(
        new Error('Directory not found'),
      );

      const result = await registry.executeTool(
        { name: 'list_directory', parameters: { path: 'missing' } },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to list directory');
    });
  });

  describe('git_status tool', () => {
    it('should get git status successfully', async () => {
      vi.mocked(gitService.status).mockResolvedValue([
        { file: 'modified.txt', status: 'modified' },
        { file: 'new.txt', status: 'untracked' },
        { file: 'staged.txt', status: 'added' },
      ]);

      const result = await registry.executeTool(
        { name: 'git_status', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('Modified files:');
      expect(result.content).toContain('M modified.txt');
      expect(result.content).toContain('Untracked files:');
      expect(result.content).toContain('?? new.txt');
      expect(result.content).toContain('Staged files:');
      expect(result.content).toContain('A staged.txt');
    });

    it('should handle clean working tree', async () => {
      vi.mocked(gitService.status).mockResolvedValue([]);

      const result = await registry.executeTool(
        { name: 'git_status', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(true);
      expect(result.content).toContain('Working tree clean');
    });

    it('should handle git status errors', async () => {
      vi.mocked(gitService.status).mockRejectedValue(
        new Error('Not a git repository'),
      );

      const result = await registry.executeTool(
        { name: 'git_status', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get git status');
    });
  });

  describe('tool execution', () => {
    it('should handle unknown tools', async () => {
      const result = await registry.executeTool(
        { name: 'unknown_tool', parameters: {} },
        { workingDirectory: '/workspace' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: unknown_tool');
    });

    it('should check tool existence', () => {
      expect(registry.hasTool('read_file')).toBe(true);
      expect(registry.hasTool('unknown_tool')).toBe(false);
    });
  });
});
