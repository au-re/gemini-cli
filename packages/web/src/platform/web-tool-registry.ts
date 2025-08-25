/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  ToolInvocation,
  ToolLocation,
  ToolRegistry,
  ToolResult,
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

  override getDescription(): string {
    return `Read file: ${this.params.path}`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.params.path }];
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    try {
      const resolvedPath = this.workspaceContext.resolvePath(this.params.path);
      const content = (await this.fileSystemService.readFile(
        resolvedPath,
        'utf8',
      )) as string;

      return {
        llmContent: `File: ${this.params.path}\n\n${content}`,
        returnDisplay: `Successfully read file: ${this.params.path}`,
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

  override getDescription(): string {
    return `Write file: ${this.params.path} (${
      this.params.content?.length || 0
    } chars)`;
  }

  override toolLocations(): ToolLocation[] {
    // Include readOnly for runtime consumers, but cast to ToolLocation for typing compatibility
    return [
      { path: this.params.path, readOnly: false } as unknown as ToolLocation,
    ];
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
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

  override getDescription(): string {
    return `List directory: ${this.params.path || 'current directory'}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
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
    super('read_file', 'ReadFile', 'Read the contents of a file', Kind.Read, {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to read' },
      },
      required: ['path'],
    });
  }

  // Helper kept for tests and external callers in web package
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

  protected override validateToolParamValues(
    params: FileOperationParams,
  ): string | null {
    if (!params.path || params.path.trim() === '') {
      return 'path parameter is required';
    }
    // Ensure access stays within workspace
    const resolved = this.workspaceContext.resolvePath(params.path);
    if (!this.workspaceContext.isInWorkspace(resolved)) {
      return 'Path must be within the current workspace.';
    }
    return null;
  }

  // Expose createInvocation publicly for tests while still satisfying base contract
  createInvocation(
    params: FileOperationParams,
  ): ToolInvocation<FileOperationParams, ToolResult> {
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
    super('write_file', 'WriteFile', 'Write content to a file', Kind.Edit, {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    });
  }

  // Helper kept for tests and external callers in web package
  validateParams(params: unknown): FileOperationParams {
    if (!params || typeof params !== 'object') {
      throw new Error('path and content parameters are required');
    }
    const { path, content } = params as { path?: unknown; content?: unknown };
    if (typeof path !== 'string' || typeof content !== 'string') {
      throw new Error('path and content parameters are required');
    }
    return { path, content };
  }

  protected override validateToolParamValues(
    params: FileOperationParams,
  ): string | null {
    if (!params.path || params.path.trim() === '') {
      return 'path and content parameters are required';
    }
    if (typeof params.content !== 'string' || params.content.length === 0) {
      return 'path and content parameters are required';
    }
    const resolved = this.workspaceContext.resolvePath(params.path);
    if (!this.workspaceContext.isInWorkspace(resolved)) {
      return 'Path must be within the current workspace.';
    }
    return null;
  }

  // Expose createInvocation publicly for tests while still satisfying base contract
  createInvocation(
    params: FileOperationParams,
  ): ToolInvocation<FileOperationParams, ToolResult> {
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
    super(
      'list_directory',
      'ListDirectory',
      'List files and directories in a given path',
      Kind.Read,
      {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Path to the directory to list (defaults to current directory)',
          },
        },
        required: [],
      },
    );
  }

  // Helper kept for tests and external callers in web package
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

  protected override validateToolParamValues(
    params: ListDirParams,
  ): string | null {
    if (params.path && params.path.trim() === '') {
      return 'path must be a non-empty string when provided';
    }
    const targetPath = params.path || '.';
    const resolved = this.workspaceContext.resolvePath(targetPath);
    if (!this.workspaceContext.isInWorkspace(resolved)) {
      return 'Path must be within the current workspace.';
    }
    return null;
  }

  // Expose createInvocation publicly for tests while still satisfying base contract
  createInvocation(
    params: ListDirParams,
  ): ToolInvocation<ListDirParams, ToolResult> {
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
type GeminiToolsWrapper = {
  function_declarations: Array<import('@google/genai').FunctionDeclaration>;
};

export function createWebToolRegistry(
  config: WebConfig,
  fileSystemService: WebFileSystemService,
  workspaceContext: WebWorkspaceContext,
): ToolRegistry & { getGeminiTools: () => GeminiToolsWrapper[] } {
  // Create a mock minimal config for ToolRegistry since it expects core Config
  const mockConfig = {
    getDebugMode: () => config.getDebugMode(),
    getMcpServers: () => config.getMcpServers(),
    getMcpServerCommand: () => config.getMcpServerCommand(),
    getPromptRegistry: () => config.getPromptRegistry(),
    getWorkspaceContext: () => config.getWorkspaceContext(),
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

  // Provide a compatibility method expected by some web tests
  const extended = toolRegistry as ToolRegistry & {
    getGeminiTools: () => GeminiToolsWrapper[];
  };
  extended.getGeminiTools = () => [
    { function_declarations: toolRegistry.getFunctionDeclarations() },
  ];

  return extended;
}

// Export tool classes for testing
export {
  WebListDirInvocation,
  WebListDirTool,
  WebReadFileInvocation,
  WebReadFileTool,
  WebWriteFileInvocation,
  WebWriteFileTool,
};
