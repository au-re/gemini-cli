/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { opfsAdapter } from './opfs-fs.js';
import { BashRunner } from './bash-runner.js';
import {
  cmd_grep,
  cmd_head,
  cmd_tail,
  cmd_sed,
  defaultCommandRegistry,
  CmdHandler,
  ExecResult,
} from './commands.js';

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

export interface ToolExecutionContext {
  workingDirectory: string;
  terminal?: { print: (text: string) => void };
}

export interface WebTool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;
  getDefinition(): ToolDefinition;
}

abstract class BaseWebTool implements WebTool {
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

// Create a simple filesystem adapter for the commands
interface CmdFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, append?: boolean): Promise<void>;
  listDir(path: string): Promise<{ name: string; kind: 'file' | 'directory' }[]>;
  toAbs(workingDir: string, relativePath: string): string;
}

class OpfsCmdAdapter implements CmdFileSystem {
  async readFile(path: string): Promise<string> {
    const result = await opfsAdapter.readFile(path, { encoding: 'utf8' });
    return typeof result === 'string' ? result : new TextDecoder().decode(result);
  }

  async writeFile(path: string, content: string, append?: boolean): Promise<void> {
    if (append) {
      try {
        const existing = await this.readFile(path);
        await opfsAdapter.writeFile(path, existing + content);
      } catch {
        // File doesn't exist, just write
        await opfsAdapter.writeFile(path, content);
      }
    } else {
      await opfsAdapter.writeFile(path, content);
    }
  }

  async listDir(path: string): Promise<{ name: string; kind: 'file' | 'directory' }[]> {
    const files = await opfsAdapter.readdir(path);
    const items = [];
    for (const file of files) {
      try {
        const stats = await opfsAdapter.stat(`${path}/${file}`);
        items.push({
          name: file,
          kind: stats.isDirectory() ? 'directory' : 'file' as 'file' | 'directory'
        });
      } catch {
        // If we can't stat, assume it's a file
        items.push({ name: file, kind: 'file' as const });
      }
    }
    return items;
  }

  toAbs(workingDir: string, relativePath: string): string {
    if (relativePath.startsWith('/')) return relativePath;
    return `${workingDir}/${relativePath}`.replace(/\/+/g, '/');
  }
}

const cmdFs = new OpfsCmdAdapter();
const commandRegistry = defaultCommandRegistry();

const asToolResp = (res: ExecResult): ToolResult =>
  res.code === 0
    ? { success: true, content: res.stdout }
    : { success: false, content: res.stdout, error: res.stderr || `exit ${res.code}` };

const invokeCmd = async (
  handler: CmdHandler,
  argv: string[],
  context: ToolExecutionContext,
): Promise<ToolResult> => {
  try {
    const res = await handler(argv, {
      fs: cmdFs as any, // Cast to match expected interface
      cwd: context.workingDirectory || '/workspace',
      setCwd: () => {},
    });
    return asToolResp(res);
  } catch (e: any) {
    return { success: false, content: '', error: String(e?.message ?? e) };
  }
};

class BashTool extends BaseWebTool {
  name = 'bash';
  description =
    'Execute a tiny bash-like command against OPFS (/workspace). Supports ls, cd, pwd, mkdir, echo, cat, rm, cp, mv, grep, head, tail, sed.';
  parameters: ToolParameter[] = [
    {
      name: 'command',
      type: 'string',
      description: 'Command line to execute',
      required: true,
    },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const runner = new BashRunner(cmdFs as any, commandRegistry, context.workingDirectory || '/workspace');
      const res = await runner.exec(String(parameters.command ?? ''));
      context.workingDirectory = runner.getCwd();
      return asToolResp(res);
    } catch (e: any) {
      return { success: false, content: '', error: String(e?.message ?? e) };
    }
  }
}

class ReadFileTool extends BaseWebTool {
  name = 'read_file';
  description = 'Read a UTF-8 text file from OPFS and return its contents.';
  parameters: ToolParameter[] = [
    { name: 'path', type: 'string', description: 'Absolute or relative path', required: true },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const abs = cmdFs.toAbs(
        context.workingDirectory || '/workspace',
        String(parameters.path),
      );
      const content = await cmdFs.readFile(abs);
      return { success: true, content };
    } catch (e: any) {
      return { success: false, content: '', error: 'read_file: ' + String(e?.message ?? e) };
    }
  }
}

class WriteFileTool extends BaseWebTool {
  name = 'write_file';
  description = 'Write text to a file in OPFS. Creates parent dirs as needed.';
  parameters: ToolParameter[] = [
    { name: 'path', type: 'string', description: 'Path to write', required: true },
    { name: 'content', type: 'string', description: 'Text content', required: true },
    { name: 'append', type: 'boolean', description: 'Append instead of overwrite', required: false },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const abs = cmdFs.toAbs(
        context.workingDirectory || '/workspace',
        String(parameters.path),
      );
      
      // Ensure parent directory exists
      const parentPath = abs.substring(0, abs.lastIndexOf('/'));
      if (parentPath && parentPath !== '/workspace') {
        await opfsAdapter.mkdir(parentPath, { recursive: true });
      }
      
      await cmdFs.writeFile(abs, String(parameters.content ?? ''), Boolean(parameters.append));
      return { success: true, content: `wrote ${abs}` };
    } catch (e: any) {
      return { success: false, content: '', error: 'write_file: ' + String(e?.message ?? e) };
    }
  }
}

class ListDirectoryTool extends BaseWebTool {
  name = 'list_dir';
  description = 'List directory entries at a path.';
  parameters: ToolParameter[] = [
    { name: 'path', type: 'string', description: 'Directory path (default: .)', required: false },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    try {
      const abs = cmdFs.toAbs(
        context.workingDirectory || '/workspace',
        String(parameters.path ?? '.'),
      );
      const items = await cmdFs.listDir(abs);
      const content = items
        .map((i) => `${i.kind === 'directory' ? '[DIR]' : '[FILE]'} ${i.name}`)
        .join('\n');
      return { success: true, content };
    } catch (e: any) {
      return { success: false, content: '', error: 'list_dir: ' + String(e?.message ?? e) };
    }
  }
}

class GrepTool extends BaseWebTool {
  name = 'grep';
  description = 'Search files for a pattern. Supports -i, -n, -r, -l, -E, --max-count=k.';
  parameters: ToolParameter[] = [
    { name: 'args', type: 'string', description: 'Space-separated args: -n PATTERN FILE...', required: true },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const args = String(parameters.args ?? '').trim();
    const argv = args ? args.split(/\s+/) : [];
    return invokeCmd(cmd_grep, argv, context);
  }
}

class HeadTool extends BaseWebTool {
  name = 'head';
  description = 'Output the first N lines of a file (default 10). Supports -n N.';
  parameters: ToolParameter[] = [
    { name: 'args', type: 'string', description: 'e.g. -n 20 path/to/file', required: true },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const argv = String(parameters.args ?? '').split(/\s+/);
    return invokeCmd(cmd_head, argv, context);
  }
}

class TailTool extends BaseWebTool {
  name = 'tail';
  description = 'Output the last N lines of a file (default 10). Supports -n N.';
  parameters: ToolParameter[] = [
    { name: 'args', type: 'string', description: 'e.g. -n 50 logfile.txt', required: true },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const argv = String(parameters.args ?? '').split(/\s+/);
    return invokeCmd(cmd_tail, argv, context);
  }
}

class SedTool extends BaseWebTool {
  name = 'sed_replace';
  description = "sed-style substitution. Usage: -i 's/pat/repl/flags' file...";
  parameters: ToolParameter[] = [
    { name: 'args', type: 'string', description: "e.g. -i 's/foo/bar/g' file.txt", required: true },
  ];

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolResult> {
    const argv = String(parameters.args ?? '').split(/\s+/);
    return invokeCmd(cmd_sed, argv, context);
  }
}

export class WebToolRegistry {
  private tools = new Map<string, WebTool>();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.registerTool(new ReadFileTool());
    this.registerTool(new WriteFileTool());
    this.registerTool(new ListDirectoryTool());
    this.registerTool(new GrepTool());
    this.registerTool(new HeadTool());
    this.registerTool(new TailTool());
    this.registerTool(new SedTool());
    this.registerTool(new BashTool());
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

export const webToolRegistry = new WebToolRegistry();

