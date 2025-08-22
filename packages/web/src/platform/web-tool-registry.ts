/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolRegistry,
  BaseDeclarativeTool,
  BaseToolInvocation,
  ToolResult,
  ToolLocation,
  WorkspaceContext,
} from '@google/gemini-cli-core';
import { WebConfig } from './web-config.js';
import { WebFileSystemService } from './web-filesystem-service.js';
import { WebWorkspaceContext } from './web-workspace-context.js';

/**
 * Parameters for web-compatible file operations
 */
interface FileOperationParams {
  path: string;
  content?: string;
}

interface ListDirParams {
  path?: string;
}

/**
 * Web-compatible tool invocation for file operations
 */
class WebReadFileInvocation extends BaseToolInvocation<
  FileOperationParams,
  ToolResult
> {
  constructor(
    params: FileOperationParams,
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Read file: ${this.params.path}`;
  }

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.path, readOnly: true }];
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const resolvedPath = this.workspaceContext.resolvePath(this.params.path);
      const content = (await this.fileSystemService.readFile(
        resolvedPath,
        'utf8',
      )) as string;

      return {
        llmContent: `File: ${this.params.path}\n\n${content}`,
        returnDisplay: `Successfully read file: ${this.params.path}`,
        content,
      };
    } catch (error) {
      return {
        llmContent: `Error reading file ${this.params.path}: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `Failed to read file: ${this.params.path}`,
      };
    }
  }
}

class WebWriteFileInvocation extends BaseToolInvocation<
  FileOperationParams,
  ToolResult
> {
  constructor(
    params: FileOperationParams,
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super(params);
  }

  getDescription(): string {
    return `Write file: ${this.params.path} (${this.params.content?.length || 0} chars)`;
  }

  toolLocations(): ToolLocation[] {
    return [{ path: this.params.path, readOnly: false }];
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const resolvedPath = this.workspaceContext.resolvePath(this.params.path);

      if (!this.params.content) {
        return {
          llmContent: 'Error: content parameter is required for write_file',
          returnDisplay: 'Failed to write file: content is required',
        };
      }

      // Ensure directory exists
      const dirPath = this.fileSystemService.dirname(resolvedPath);
      await this.fileSystemService.mkdir(dirPath, { recursive: true });

      await this.fileSystemService.writeFile(resolvedPath, this.params.content);

      return {
        llmContent: `Successfully wrote ${this.params.content.length} characters to ${this.params.path}`,
        returnDisplay: `File written: ${this.params.path}`,
      };
    } catch (error) {
      return {
        llmContent: `Error writing file ${this.params.path}: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `Failed to write file: ${this.params.path}`,
      };
    }
  }
}

class WebListDirInvocation extends BaseToolInvocation<
  ListDirParams,
  ToolResult
> {
  constructor(
    params: ListDirParams,
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super(params);
  }

  getDescription(): string {
    return `List directory: ${this.params.path || 'current directory'}`;
  }

  async execute(_signal: AbortSignal): Promise<ToolResult> {
    try {
      const targetPath = this.params.path || '.';
      const resolvedPath = this.workspaceContext.resolvePath(targetPath);
      const files = await this.fileSystemService.readdir(resolvedPath);

      const fileList = files.join('\n');

      return {
        llmContent: `Directory listing for ${targetPath}:\n\n${fileList}`,
        returnDisplay: `Listed ${files.length} items in ${targetPath}`,
      };
    } catch (error) {
      return {
        llmContent: `Error listing directory ${this.params.path || '.'}: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `Failed to list directory: ${this.params.path || '.'}`,
      };
    }
  }
}

/**
 * Web-compatible declarative tool for reading files
 */
class WebReadFileTool extends BaseDeclarativeTool<
  FileOperationParams,
  ToolResult
> {
  constructor(
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super();
  }

  get name() {
    return 'read_file';
  }
  get description() {
    return 'Read the contents of a file';
  }

  get schema() {
    return {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'Path to the file to read',
        },
      },
      required: ['path' as const],
    };
  }

  validateParams(params: unknown): FileOperationParams {
    if (!params || typeof params !== 'object' || !('path' in params)) {
      throw new Error('path parameter is required');
    }

    const { path } = params as { path: unknown };

    if (typeof path !== 'string') {
      throw new Error('path must be a string');
    }

    return { path };
  }

  createInvocation(params: FileOperationParams) {
    return new WebReadFileInvocation(
      params,
      this.fileSystemService,
      this.workspaceContext,
    );
  }
}

/**
 * Web-compatible declarative tool for writing files
 */
class WebWriteFileTool extends BaseDeclarativeTool<
  FileOperationParams,
  ToolResult
> {
  constructor(
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super();
  }

  get name() {
    return 'write_file';
  }
  get description() {
    return 'Write content to a file';
  }

  get schema() {
    return {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'Path to the file to write',
        },
        content: {
          type: 'string' as const,
          description: 'Content to write to the file',
        },
      },
      required: ['path' as const, 'content' as const],
    };
  }

  validateParams(params: unknown): FileOperationParams {
    if (
      !params ||
      typeof params !== 'object' ||
      !('path' in params) ||
      !('content' in params)
    ) {
      throw new Error('path and content parameters are required');
    }

    const { path, content } = params as { path: unknown; content: unknown };

    if (typeof path !== 'string' || typeof content !== 'string') {
      throw new Error('path and content must be strings');
    }

    return { path, content };
  }

  createInvocation(params: FileOperationParams) {
    return new WebWriteFileInvocation(
      params,
      this.fileSystemService,
      this.workspaceContext,
    );
  }
}

/**
 * Web-compatible declarative tool for listing directories
 */
class WebListDirTool extends BaseDeclarativeTool<ListDirParams, ToolResult> {
  constructor(
    private fileSystemService: WebFileSystemService,
    private workspaceContext: WebWorkspaceContext,
  ) {
    super();
  }

  get name() {
    return 'list_directory';
  }
  get description() {
    return 'List files and directories in a given path';
  }

  get schema() {
    return {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description:
            'Path to the directory to list (defaults to current directory)',
        },
      },
      required: [] as const,
    };
  }

  validateParams(params: unknown): ListDirParams {
    if (!params || typeof params !== 'object') {
      return {};
    }

    const { path } = params as { path?: unknown };

    if (path !== undefined && typeof path !== 'string') {
      throw new Error('path must be a string');
    }

    return { path: path as string | undefined };
  }

  createInvocation(params: ListDirParams) {
    return new WebListDirInvocation(
      params,
      this.fileSystemService,
      this.workspaceContext,
    );
  }
}

/**
 * Factory function to create web-compatible tool registry
 */
export function createWebToolRegistry(
  config: WebConfig,
  fileSystemService: WebFileSystemService,
  workspaceContext: WebWorkspaceContext,
): ToolRegistry {
  // Create a mock minimal config for ToolRegistry since it expects core Config
  const mockConfig = {
    getDebugMode: () => config.getDebugMode(),
    getMcpServers: () => config.getMcpServers(),
    getMcpServerCommand: () => config.getMcpServerCommand(),
    getPromptRegistry: () => config.getPromptRegistry(),
    getWorkspaceContext: () => workspaceContext as unknown as WorkspaceContext,
  } as unknown as Config;

  const toolRegistry = new ToolRegistry(mockConfig);

  // Register web-compatible core tools
  toolRegistry.registerTool(
    new WebReadFileTool(fileSystemService, workspaceContext),
  );
  toolRegistry.registerTool(
    new WebWriteFileTool(fileSystemService, workspaceContext),
  );
  toolRegistry.registerTool(
    new WebListDirTool(fileSystemService, workspaceContext),
  );

  return toolRegistry;
}

// Export tool classes for testing
export {
  WebReadFileTool,
  WebWriteFileTool,
  WebListDirTool,
  WebReadFileInvocation,
  WebWriteFileInvocation,
  WebListDirInvocation,
};
