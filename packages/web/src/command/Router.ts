import { XtermHost } from '../terminal/XtermHost.js';
import { gitService } from '../platform/git.js';
import { opfsAdapter } from '../platform/opfs-fs.js';

export interface CommandResult {
  type: 'message' | 'prompt' | 'error';
  content: string;
}

export interface CommandContext {
  terminal: XtermHost;
  workingDirectory: string;
  setStatus: (message: string) => void;
}

/**
 * Routes and processes user commands
 */
export class CommandRouter {
  private commands = new Map<string, (args: string, context: CommandContext) => Promise<CommandResult>>();
  private gitCommands = new Set(['status', 'add', 'commit', 'push', 'pull', 'clone', 'branch', 'checkout', 'log', 'diff']);

  constructor() {
    this.registerCommands();
  }

  /**
   * Register built-in commands
   */
  private registerCommands(): void {
    this.commands.set('init', this.handleInit.bind(this));
    this.commands.set('theme', this.handleTheme.bind(this));
    this.commands.set('help', this.handleHelp.bind(this));
    this.commands.set('clear', this.handleClear.bind(this));
    this.commands.set('pwd', this.handlePwd.bind(this));
    this.commands.set('ls', this.handleLs.bind(this));
  }

  /**
   * Route command based on input type
   */
  async route(input: string, context: CommandContext): Promise<CommandResult> {
    const trimmed = input.trim();
    
    if (!trimmed) {
      return { type: 'message', content: '' };
    }

    // Slash commands
    if (trimmed.startsWith('/')) {
      return this.handleSlashCommand(trimmed.slice(1), context);
    }

    // At commands (file injection)
    if (trimmed.startsWith('@')) {
      return this.handleAtCommand(trimmed.slice(1), context);
    }

    // Bang commands (shell/git)
    if (trimmed.startsWith('!')) {
      return this.handleBangCommand(trimmed.slice(1), context);
    }

    // Regular prompts to Gemini
    return this.handlePrompt(trimmed, context);
  }

  /**
   * Handle slash commands
   */
  private async handleSlashCommand(command: string, context: CommandContext): Promise<CommandResult> {
    const [cmd, ...args] = command.split(' ');
    const argsString = args.join(' ');

    const handler = this.commands.get(cmd);
    if (!handler) {
      return {
        type: 'error',
        content: `Unknown command: /${cmd}. Type /help for available commands.`,
      };
    }

    return handler(argsString, context);
  }

  /**
   * Handle at commands (file injection)
   */
  private async handleAtCommand(path: string, context: CommandContext): Promise<CommandResult> {
    try {
      context.setStatus(`Reading ${path}...`);
      
      const fullPath = this.resolvePath(path, context.workingDirectory);
      const stat = await opfsAdapter.stat(fullPath);
      
      if (stat.isDirectory()) {
        // Read directory contents
        const files = await opfsAdapter.readdir(fullPath);
        const filteredFiles = await this.filterGitIgnored(fullPath, files);
        
        let content = `Contents of directory ${path}:\n\n`;
        for (const file of filteredFiles.slice(0, 50)) { // Limit to 50 files
          try {
            const filePath = `${fullPath}/${file}`;
            const fileStat = await opfsAdapter.stat(filePath);
            if (fileStat.isFile() && fileStat.size < 100000) { // Limit file size to 100KB
              const fileContent = await opfsAdapter.readFile(filePath, { encoding: 'utf8' }) as string;
              content += `--- ${file} ---\n${fileContent}\n\n`;
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
        
        return { type: 'prompt', content };
      } else {
        // Read single file
        const content = await opfsAdapter.readFile(fullPath, { encoding: 'utf8' }) as string;
        return { type: 'prompt', content: `Contents of ${path}:\n\n${content}` };
      }
    } catch (error) {
      return {
        type: 'error',
        content: `Failed to read ${path}: ${error}`,
      };
    }
  }

  /**
   * Handle bang commands (git and shell)
   */
  private async handleBangCommand(command: string, context: CommandContext): Promise<CommandResult> {
    const [cmd, ...args] = command.split(' ');

    if (cmd === 'git') {
      return this.handleGitCommand(args, context);
    }

    // Other shell commands are not supported in browser
    return {
      type: 'error',
      content: `Shell command '${cmd}' is not supported in web version. Only 'git' commands are available.`,
    };
  }

  /**
   * Handle git commands
   */
  private async handleGitCommand(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      return { type: 'error', content: 'Git command missing. Usage: !git <command>' };
    }

    const [gitCmd, ...gitArgs] = args;
    
    if (!this.gitCommands.has(gitCmd)) {
      return {
        type: 'error',
        content: `Git command '${gitCmd}' is not supported. Available: ${Array.from(this.gitCommands).join(', ')}`,
      };
    }

    try {
      context.setStatus(`Running git ${gitCmd}...`);
      
      switch (gitCmd) {
        case 'status':
          const status = await gitService.status(context.workingDirectory);
          const statusText = status.length > 0 
            ? status.map(s => `${s.status.padEnd(10)} ${s.file}`).join('\n')
            : 'Working directory clean';
          return { type: 'message', content: `Git status:\n${statusText}` };

        case 'log':
          const commits = await gitService.log(context.workingDirectory, { depth: 10 });
          const logText = commits.map(c => 
            `${c.oid.slice(0, 7)} ${c.message} (${c.author.name})`
          ).join('\n');
          return { type: 'message', content: `Git log:\n${logText}` };

        case 'branch':
          const branches = await gitService.listBranches(context.workingDirectory);
          return { type: 'message', content: `Branches:\n${branches.join('\n')}` };

        case 'add':
          if (gitArgs.length === 0) {
            return { type: 'error', content: 'Usage: !git add <file>' };
          }
          await gitService.add(context.workingDirectory, gitArgs[0]);
          return { type: 'message', content: `Added ${gitArgs[0]} to staging area` };

        case 'commit':
          const message = gitArgs.join(' ');
          if (!message) {
            return { type: 'error', content: 'Usage: !git commit <message>' };
          }
          const commitId = await gitService.commit(context.workingDirectory, message);
          return { type: 'message', content: `Created commit ${commitId.slice(0, 7)}` };

        default:
          return { type: 'error', content: `Git command '${gitCmd}' not yet implemented` };
      }
    } catch (error) {
      return { type: 'error', content: `Git error: ${error}` };
    }
  }

  /**
   * Handle regular prompts to Gemini
   */
  private async handlePrompt(prompt: string, _context: CommandContext): Promise<CommandResult> {
    // TODO: Integrate with Gemini API via core package
    return {
      type: 'message',
      content: `Echo: ${prompt}\n(Gemini integration not yet implemented)`,
    };
  }

  /**
   * Built-in command handlers
   */

  private async handleInit(_args: string, context: CommandContext): Promise<CommandResult> {
    try {
      context.setStatus('Analyzing project...');
      
      const geminiMdPath = `${context.workingDirectory}/GEMINI.md`;
      
      try {
        await opfsAdapter.stat(geminiMdPath);
        return {
          type: 'message',
          content: 'GEMINI.md already exists in this directory.',
        };
      } catch {
        // File doesn't exist, create it
      }

      // Create basic GEMINI.md
      const content = `# Project Documentation

This file was created by Gemini CLI Web to document your project.

## Project Overview

[Project description will be added here]

## Building and Running

[Build instructions will be added here]

## Development Guidelines

[Development guidelines will be added here]
`;
      
      await opfsAdapter.writeFile(geminiMdPath, content);
      
      return {
        type: 'message',
        content: 'Created GEMINI.md. You can now ask me to analyze your project and populate it with relevant information.',
      };
    } catch (error) {
      return { type: 'error', content: `Failed to create GEMINI.md: ${error}` };
    }
  }

  private async handleTheme(_args: string, _context: CommandContext): Promise<CommandResult> {
    // TODO: Implement theme dialog
    return {
      type: 'message',
      content: 'Theme selection dialog not yet implemented. Currently using dark theme.',
    };
  }

  private async handleHelp(_args: string, _context: CommandContext): Promise<CommandResult> {
    const helpText = `
Available commands:

Slash commands:
  /init     - Create GEMINI.md file for project
  /theme    - Change terminal theme
  /help     - Show this help message
  /clear    - Clear terminal
  /pwd      - Show current directory
  /ls       - List files in current directory

At commands:
  @file     - Include file contents in prompt
  @dir      - Include directory contents in prompt

Git commands:
  !git status    - Show git status
  !git log       - Show commit log
  !git add <file> - Add file to staging
  !git commit <msg> - Commit changes
  !git branch    - List branches

Regular prompts are sent to Gemini AI (when configured).
`;
    
    return { type: 'message', content: helpText };
  }

  private async handleClear(_args: string, context: CommandContext): Promise<CommandResult> {
    context.terminal.clear();
    return { type: 'message', content: '' };
  }

  private async handlePwd(_args: string, context: CommandContext): Promise<CommandResult> {
    return { type: 'message', content: `Current directory: ${context.workingDirectory}` };
  }

  private async handleLs(_args: string, context: CommandContext): Promise<CommandResult> {
    try {
      const files = await opfsAdapter.readdir(context.workingDirectory);
      return { type: 'message', content: `Files:\n${files.join('\n')}` };
    } catch (error) {
      return { type: 'error', content: `Failed to list files: ${error}` };
    }
  }

  /**
   * Utility methods
   */

  private resolvePath(path: string, workingDirectory: string): string {
    if (path.startsWith('/')) return path;
    return `${workingDirectory}/${path}`.replace(/\/+/g, '/');
  }

  private async filterGitIgnored(_dirPath: string, files: string[]): Promise<string[]> {
    // TODO: Implement .gitignore and .geminiignore filtering
    // For now, just filter common unwanted files
    const excluded = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build']);
    return files.filter(file => !excluded.has(file));
  }
}

export const commandRouter = new CommandRouter();