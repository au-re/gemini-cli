/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web-adapted tool execution system for Gemini integration
 * Provides file operations and basic tools that work in browser environment
 */

import { opfsAdapter } from './opfs-fs.js';
import { gitService } from './git.js';

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Base class for web tools
 */
abstract class WebTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: ToolParameter[];

  abstract execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;

  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }
}

export interface ToolExecutionContext {
  workingDirectory: string;
  terminal?: {
    print: (text: string) => void;
  };
}

/**
 * Read file tool
 */
class ReadFileTool extends WebTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to read',
      required: true,
    },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const path = parameters['path'] as string;
      if (!path) {
        return {
          success: false,
          content: '',
          error: 'Path parameter is required',
        };
      }

      const fullPath = context.workingDirectory
        ? `${context.workingDirectory}/${path}`.replace(/\/+/g, '/')
        : path;
      const content = (await opfsAdapter.readFile(fullPath, {
        encoding: 'utf8',
      })) as string;

      return {
        success: true,
        content: `File: ${path}\n\n${content}`,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Write file tool
 */
class WriteFileTool extends WebTool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description: 'Path to the file to write',
      required: true,
    },
    {
      name: 'content',
      type: 'string',
      description: 'Content to write to the file',
      required: true,
    },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const path = parameters['path'] as string;
      const content = parameters['content'] as string;

      if (!path) {
        return {
          success: false,
          content: '',
          error: 'Path parameter is required',
        };
      }

      if (content === undefined) {
        return {
          success: false,
          content: '',
          error: 'Content parameter is required',
        };
      }

      const fullPath = context.workingDirectory
        ? `${context.workingDirectory}/${path}`.replace(/\/+/g, '/')
        : path;

      // Ensure directory exists
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dirPath) {
        await opfsAdapter.mkdir(dirPath, { recursive: true });
      }

      await opfsAdapter.writeFile(fullPath, content);

      return {
        success: true,
        content: `Successfully wrote ${content.length} characters to ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * List directory tool
 */
class ListDirectoryTool extends WebTool {
  name = 'list_directory';
  description = 'List files and directories in a given path';
  parameters: ToolParameter[] = [
    {
      name: 'path',
      type: 'string',
      description:
        'Path to the directory to list (defaults to current directory)',
      required: false,
    },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const path = (parameters['path'] as string) || '.';
      const fullPath = context.workingDirectory
        ? `${context.workingDirectory}/${path}`.replace(/\/+/g, '/')
        : path;

      const files = await opfsAdapter.readdir(fullPath);
      const fileList = files.join('\n');

      return {
        success: true,
        content: `Directory listing for ${path}:\n\n${fileList}`,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Git status tool
 */
class GitStatusTool extends WebTool {
  name = 'git_status';
  description = 'Get the current git status of the repository';
  parameters: ToolParameter[] = [];

  async execute(
    _parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const status = await gitService.status(context.workingDirectory);

      let content = 'Git Status:\n\n';

      const modified = status.filter((s) => s.status === 'modified');
      const untracked = status.filter((s) => s.status === 'untracked');
      const staged = status.filter((s) => s.status === 'added');

      if (modified.length > 0) {
        content += 'Modified files:\n';
        modified.forEach((item) => (content += `  M ${item.file}\n`));
      }

      if (untracked.length > 0) {
        content += 'Untracked files:\n';
        untracked.forEach((item) => (content += `  ?? ${item.file}\n`));
      }

      if (staged.length > 0) {
        content += 'Staged files:\n';
        staged.forEach((item) => (content += `  A ${item.file}\n`));
      }

      if (
        modified.length === 0 &&
        untracked.length === 0 &&
        staged.length === 0
      ) {
        content += 'Working tree clean';
      }

      return {
        success: true,
        content,
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

/**
 * Web tool registry and executor
 */
export class WebToolRegistry {
  private tools = new Map<string, WebTool>();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.registerTool(new ReadFileTool());
    this.registerTool(new WriteFileTool());
    this.registerTool(new ListDirectoryTool());
    this.registerTool(new GitStatusTool());
  }

  registerTool(tool: WebTool): void {
    this.tools.set(tool.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => tool.getDefinition());
  }

  async executeTool(
    toolCall: ToolCall,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);

    if (!tool) {
      return {
        success: false,
        content: '',
        error: `Unknown tool: ${toolCall.name}`,
      };
    }

    try {
      return await tool.execute(toolCall.parameters, context);
    } catch (error) {
      return {
        success: false,
        content: '',
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}

// Export singleton instance
export const webToolRegistry = new WebToolRegistry();
