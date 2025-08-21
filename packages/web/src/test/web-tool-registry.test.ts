/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebToolRegistry, WebReadFileTool, WebWriteFileTool, WebListDirTool } from '../platform/web-tool-registry.js';
import { WebConfig } from '../platform/web-config.js';
import { WebFileSystemService } from '../platform/web-filesystem-service.js';
import { WebWorkspaceContext } from '../platform/web-workspace-context.js';

// Mock the file system
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
}));

describe('Web Tool Registry Integration', () => {
  let webConfig: WebConfig;
  let fileSystemService: WebFileSystemService;
  let workspaceContext: WebWorkspaceContext;

  beforeEach(() => {
    workspaceContext = new WebWorkspaceContext('/test-workspace');
    fileSystemService = new WebFileSystemService();
    webConfig = new WebConfig(undefined, fileSystemService, workspaceContext);
  });

  describe('tool registry creation', () => {
    it('should create registry with core web tools', () => {
      const registry = createWebToolRegistry(webConfig, fileSystemService, workspaceContext);
      
      expect(registry).toBeDefined();
      
      const tools = registry.getAllTools();
      const toolNames = tools.map(tool => tool.name);
      
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('list_directory');
    });

    it('should have properly configured tools', () => {
      const registry = createWebToolRegistry(webConfig, fileSystemService, workspaceContext);
      
      const readFileTool = registry.getAllTools().find(t => t.name === 'read_file');
      expect(readFileTool).toBeDefined();
      expect(readFileTool!.description).toBe('Read the contents of a file');
      
      const writeFileTool = registry.getAllTools().find(t => t.name === 'write_file');
      expect(writeFileTool).toBeDefined();
      expect(writeFileTool!.description).toBe('Write content to a file');
    });

    it('should provide Gemini-compatible tool definitions', () => {
      const registry = createWebToolRegistry(webConfig, fileSystemService, workspaceContext);
      
      const geminiTools = registry.getGeminiTools();
      expect(geminiTools).toBeDefined();
      expect(geminiTools.length).toBeGreaterThan(0);
      
      const functionDeclarations = geminiTools.flatMap(tool => 
        'function_declarations' in tool ? tool.function_declarations : []
      );
      
      const toolNames = functionDeclarations.map(func => func.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('write_file');
      expect(toolNames).toContain('list_directory');
    });
  });

  describe('individual tools', () => {
    let readFileTool: WebReadFileTool;
    let writeFileTool: WebWriteFileTool;
    let listDirTool: WebListDirTool;

    beforeEach(() => {
      readFileTool = new WebReadFileTool(fileSystemService, workspaceContext);
      writeFileTool = new WebWriteFileTool(fileSystemService, workspaceContext);
      listDirTool = new WebListDirTool(fileSystemService, workspaceContext);
    });

    describe('ReadFileTool', () => {
      it('should validate parameters correctly', () => {
        expect(() => readFileTool.validateParams({ path: 'test.txt' }))
          .not.toThrow();
        
        expect(() => readFileTool.validateParams({}))
          .toThrow('path parameter is required');
        
        expect(() => readFileTool.validateParams({ path: 123 }))
          .toThrow('path must be a string');
      });

      it('should create invocation with proper description', () => {
        const params = readFileTool.validateParams({ path: 'test.txt' });
        const invocation = readFileTool.createInvocation(params);
        
        expect(invocation.getDescription()).toBe('Read file: test.txt');
        
        const locations = invocation.toolLocations();
        expect(locations).toHaveLength(1);
        expect(locations[0]).toEqual({ path: 'test.txt', readOnly: true });
      });

      it('should execute successfully with mocked file system', async () => {
        const mockReadFile = vi.mocked(fileSystemService.readFile);
        mockReadFile.mockResolvedValue('file content');
        
        const params = readFileTool.validateParams({ path: 'test.txt' });
        const invocation = readFileTool.createInvocation(params);
        
        const result = await invocation.execute(new AbortController().signal);
        
        expect(result.llmContent).toContain('File: test.txt');
        expect(result.llmContent).toContain('file content');
        expect(result.returnDisplay).toBe('Successfully read file: test.txt');
      });
    });

    describe('WriteFileTool', () => {
      it('should validate parameters correctly', () => {
        expect(() => writeFileTool.validateParams({ path: 'test.txt', content: 'hello' }))
          .not.toThrow();
        
        expect(() => writeFileTool.validateParams({ path: 'test.txt' }))
          .toThrow('path and content parameters are required');
        
        expect(() => writeFileTool.validateParams({ content: 'hello' }))
          .toThrow('path and content parameters are required');
      });

      it('should create invocation with proper description', () => {
        const params = writeFileTool.validateParams({ path: 'test.txt', content: 'hello world' });
        const invocation = writeFileTool.createInvocation(params);
        
        expect(invocation.getDescription()).toBe('Write file: test.txt (11 chars)');
        
        const locations = invocation.toolLocations();
        expect(locations).toHaveLength(1);
        expect(locations[0]).toEqual({ path: 'test.txt', readOnly: false });
      });

      it('should execute successfully with mocked file system', async () => {
        const mockWriteFile = vi.mocked(fileSystemService.writeFile);
        const mockMkdir = vi.mocked(fileSystemService.mkdir);
        
        mockWriteFile.mockResolvedValue();
        mockMkdir.mockResolvedValue();
        
        const params = writeFileTool.validateParams({ path: 'test.txt', content: 'hello world' });
        const invocation = writeFileTool.createInvocation(params);
        
        const result = await invocation.execute(new AbortController().signal);
        
        expect(result.llmContent).toContain('Successfully wrote 11 characters to test.txt');
        expect(result.returnDisplay).toBe('File written: test.txt');
      });
    });

    describe('ListDirTool', () => {
      it('should validate parameters correctly', () => {
        expect(() => listDirTool.validateParams({}))
          .not.toThrow();
        
        expect(() => listDirTool.validateParams({ path: 'test-dir' }))
          .not.toThrow();
        
        expect(() => listDirTool.validateParams({ path: 123 }))
          .toThrow('path must be a string');
      });

      it('should create invocation with proper description', () => {
        const params = listDirTool.validateParams({ path: 'test-dir' });
        const invocation = listDirTool.createInvocation(params);
        
        expect(invocation.getDescription()).toBe('List directory: test-dir');
      });

      it('should execute successfully with mocked file system', async () => {
        const mockReaddir = vi.mocked(fileSystemService.readdir);
        mockReaddir.mockResolvedValue(['file1.txt', 'file2.js', 'subdir']);
        
        const params = listDirTool.validateParams({ path: 'test-dir' });
        const invocation = listDirTool.createInvocation(params);
        
        const result = await invocation.execute(new AbortController().signal);
        
        expect(result.llmContent).toContain('Directory listing for test-dir:');
        expect(result.llmContent).toContain('file1.txt');
        expect(result.llmContent).toContain('file2.js');
        expect(result.llmContent).toContain('subdir');
        expect(result.returnDisplay).toBe('Listed 3 items in test-dir');
      });
    });
  });
});