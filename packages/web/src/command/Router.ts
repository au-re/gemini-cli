import { XtermHost } from '../terminal/XtermHost.js';
import { gitService } from '../platform/git.js';
import { opfsAdapter } from '../platform/opfs-fs.js';
import { geminiService } from '../platform/gemini.js';
import { ignoreService } from '../platform/ignore.js';

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
  private gitCommands = new Set(['status', 'add', 'commit', 'push', 'pull', 'clone', 'branch', 'checkout', 'log', 'diff', 'init']);

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
    this.commands.set('config', this.handleConfig.bind(this));
    this.commands.set('status', this.handleStatus.bind(this));
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
        const filePaths: string[] = [];
        
        for (const file of filteredFiles.slice(0, 50)) { // Limit to 50 files
          try {
            const filePath = `${fullPath}/${file}`;
            const fileStat = await opfsAdapter.stat(filePath);
            if (fileStat.isFile() && fileStat.size < 100000) { // Limit file size to 100KB
              const fileContent = await opfsAdapter.readFile(filePath, { encoding: 'utf8' }) as string;
              content += `--- ${file} ---\n${fileContent}\n\n`;
              filePaths.push(file);
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
        
        // Send to Gemini if configured
        if (geminiService.isConfigured()) {
          context.setStatus('Sending to Gemini...');
          try {
            const response = await geminiService.sendPrompt(
              `Please analyze the following directory contents and provide insights:\n\n${content}`,
              {
                workingDirectory: context.workingDirectory,
                terminal: context.terminal,
              }
            );
            
            return { type: 'message', content: response.text };
          } catch (error) {
            return { type: 'error', content: `Gemini API error: ${error}` };
          }
        } else {
          return { type: 'prompt', content };
        }
      } else {
        // Read single file
        const content = await opfsAdapter.readFile(fullPath, { encoding: 'utf8' }) as string;
        const promptText = `Contents of ${path}:\n\n${content}`;
        
        // Send to Gemini if configured
        if (geminiService.isConfigured()) {
          context.setStatus('Sending to Gemini...');
          try {
            const response = await geminiService.sendPrompt(
              `Please analyze the following file and provide insights:\n\n${promptText}`,
              {
                workingDirectory: context.workingDirectory,
                terminal: context.terminal,
              }
            );
            
            return { type: 'message', content: response.text };
          } catch (error) {
            return { type: 'error', content: `Gemini API error: ${error}` };
          }
        } else {
          return { type: 'prompt', content: promptText };
        }
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
          const depth = gitArgs.includes('--oneline') ? 10 : 5;
          const commits = await gitService.log(context.workingDirectory, { depth });
          const logText = commits.map(c => {
            const date = new Date(c.author.timestamp * 1000).toLocaleDateString();
            return gitArgs.includes('--oneline') 
              ? `${c.oid.slice(0, 7)} ${c.message}`
              : `commit ${c.oid}\nAuthor: ${c.author.name} <${c.author.email}>\nDate: ${date}\n\n    ${c.message}\n`;
          }).join(gitArgs.includes('--oneline') ? '\n' : '\n');
          return { type: 'message', content: `Git log:\n${logText}` };

        case 'branch':
          if (gitArgs.length > 0) {
            // Create/checkout new branch
            const branchName = gitArgs[0];
            const checkout = gitArgs.includes('-b') || gitArgs.includes('--checkout');
            await gitService.branch(context.workingDirectory, branchName, checkout);
            return { type: 'message', content: `${checkout ? 'Created and checked out' : 'Created'} branch '${branchName}'` };
          } else {
            // List branches
            const branches = await gitService.listBranches(context.workingDirectory);
            return { type: 'message', content: `Branches:\n${branches.map(b => `  ${b}`).join('\n')}` };
          }

        case 'checkout':
          if (gitArgs.length === 0) {
            return { type: 'error', content: 'Usage: !git checkout <branch>' };
          }
          await gitService.checkout(context.workingDirectory, gitArgs[0]);
          return { type: 'message', content: `Switched to branch '${gitArgs[0]}'` };

        case 'add':
          if (gitArgs.length === 0) {
            return { type: 'error', content: 'Usage: !git add <file>' };
          }
          const filepath = gitArgs[0];
          if (filepath === '.') {
            // Add all files
            const statusFiles = await gitService.status(context.workingDirectory);
            const untracked = statusFiles.filter(s => s.status === 'untracked' || s.status === 'modified');
            for (const file of untracked) {
              await gitService.add(context.workingDirectory, file.file);
            }
            return { type: 'message', content: `Added ${untracked.length} files to staging area` };
          } else {
            await gitService.add(context.workingDirectory, filepath);
            return { type: 'message', content: `Added '${filepath}' to staging area` };
          }

        case 'commit':
          const message = gitArgs.join(' ').replace(/^-m\s*/, ''); // Remove -m flag if present
          if (!message) {
            return { type: 'error', content: 'Usage: !git commit "message" or !git commit -m "message"' };
          }
          const commitId = await gitService.commit(context.workingDirectory, message);
          return { type: 'message', content: `Created commit ${commitId.slice(0, 7)}: ${message}` };

        case 'clone':
          if (gitArgs.length === 0) {
            return { type: 'error', content: 'Usage: !git clone <url> [directory]' };
          }
          const url = gitArgs[0];
          const targetDir = gitArgs[1] || url.split('/').pop()?.replace('.git', '') || 'cloned-repo';
          const fullTargetPath = `${context.workingDirectory}/${targetDir}`;
          
          context.setStatus(`Cloning ${url}...`);
          await gitService.clone(fullTargetPath, url, { depth: 1 });
          return { type: 'message', content: `Successfully cloned '${url}' to '${targetDir}'` };

        case 'pull':
          await gitService.pull(context.workingDirectory);
          return { type: 'message', content: 'Successfully pulled changes from remote' };

        case 'push':
          await gitService.push(context.workingDirectory);
          return { type: 'message', content: 'Successfully pushed changes to remote' };

        case 'init':
          if (gitArgs.length > 0) {
            const targetDir = gitArgs[0];
            const fullPath = this.resolvePath(targetDir, context.workingDirectory);
            await gitService.init(fullPath);
            return { type: 'message', content: `Initialized empty Git repository in ${targetDir}` };
          } else {
            await gitService.init(context.workingDirectory);
            return { type: 'message', content: 'Initialized empty Git repository' };
          }

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
  private async handlePrompt(prompt: string, context: CommandContext): Promise<CommandResult> {
    try {
      if (!geminiService.isConfigured()) {
        return {
          type: 'error',
          content: 'Gemini API key not configured. Use /config api-key <your-key> to set it up.',
        };
      }

      context.setStatus('Sending to Gemini...');
      
      const response = await geminiService.sendPrompt(prompt, {
        workingDirectory: context.workingDirectory,
        terminal: context.terminal,
      });

      return {
        type: 'message',
        content: response.text || 'No response received.',
      };
    } catch (error) {
      return {
        type: 'error',
        content: `Gemini API error: ${error}`,
      };
    }
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
  /init        - Create GEMINI.md file for project
  /config      - Configure API key and settings
  /status      - Show system status
  /theme       - Change terminal theme
  /help        - Show this help message
  /clear       - Clear terminal
  /pwd         - Show current directory
  /ls          - List files in current directory

At commands:
  @file        - Include file contents in prompt
  @dir         - Include directory contents in prompt

Git commands:
  !git init [dir]         - Initialize git repository
  !git clone <url> [dir]  - Clone repository
  !git status            - Show git status
  !git add <file>        - Add file to staging (use . for all)
  !git commit "message"  - Commit changes
  !git push              - Push to remote
  !git pull              - Pull from remote
  !git log [--oneline]   - Show commit log
  !git branch [name]     - List or create branches
  !git checkout <branch> - Switch branches
  !git diff [file]       - Show differences

Configuration:
  /config api-key <key>    - Set your Gemini API key
  /config git-token <pat>  - Set GitHub Personal Access Token

To get started:
1. /config api-key <your-gemini-api-key>
2. /config git-token <your-github-pat> (optional, for private repos)
3. Ask any question or use @ commands to include context
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

  private async handleConfig(args: string, _context: CommandContext): Promise<CommandResult> {
    const [subcommand, ...rest] = args.split(' ');
    
    switch (subcommand) {
      case 'api-key':
        if (rest.length === 0) {
          return {
            type: 'error',
            content: 'Usage: /config api-key <your-api-key>',
          };
        }
        
        try {
          const apiKey = rest.join(' ');
          await geminiService.configureApiKey(apiKey);
          return {
            type: 'message',
            content: 'Gemini API key configured successfully! You can now send prompts.',
          };
        } catch (error) {
          return {
            type: 'error',
            content: `Failed to configure API key: ${error}`,
          };
        }

      case 'git-token':
        if (rest.length === 0) {
          return {
            type: 'error',
            content: 'Usage: /config git-token <your-github-pat>',
          };
        }
        
        try {
          const token = rest.join(' ');
          gitService.setAuthToken(token);
          
          // Save token to settings
          await opfsAdapter.mkdir('/workspace/.gemini', { recursive: true });
          const settingsPath = '/workspace/.gemini/settings.json';
          let settings = {};
          try {
            const settingsData = await opfsAdapter.readFile(settingsPath, { encoding: 'utf8' }) as string;
            settings = JSON.parse(settingsData);
          } catch {
            // Settings don't exist, start fresh
          }
          
          (settings as any).gitToken = token;
          await opfsAdapter.writeFile(settingsPath, JSON.stringify(settings, null, 2));
          
          return {
            type: 'message',
            content: 'GitHub token configured successfully! You can now push/pull/clone private repositories.',
          };
        } catch (error) {
          return {
            type: 'error',
            content: `Failed to configure GitHub token: ${error}`,
          };
        }

      case 'show':
        const status = geminiService.getStatus();
        return {
          type: 'message',
          content: `Configuration:
Model: ${status.model}
API Key: ${status.configured ? 'Configured ✓' : 'Not configured ✗'}
Git Token: ${gitService.getAuthToken() ? 'Configured ✓' : 'Not configured ✗'}`,
        };

      default:
        return {
          type: 'message',
          content: `Available config commands:
/config api-key <key>       - Set Gemini API key
/config git-token <token>   - Set GitHub personal access token
/config show                - Show current configuration`,
        };
    }
  }

  private async handleStatus(_args: string, _context: CommandContext): Promise<CommandResult> {
    const status = geminiService.getStatus();
    return {
      type: 'message',
      content: `Gemini CLI Web Status:
Model: ${status.model}
API Key: ${status.configured ? 'Configured ✓' : 'Not configured ✗'}
Ready: ${status.configured ? 'Yes ✓' : 'No - configure API key first'}`,
    };
  }

  /**
   * Utility methods
   */

  private resolvePath(path: string, workingDirectory: string): string {
    if (path.startsWith('/')) return path;
    return `${workingDirectory}/${path}`.replace(/\/+/g, '/');
  }

  private async filterGitIgnored(dirPath: string, files: string[]): Promise<string[]> {
    try {
      return await ignoreService.filter(dirPath, files);
    } catch (error) {
      console.warn('Failed to apply ignore filtering:', error);
      // Fallback to basic filtering
      const excluded = new Set(['.git', 'node_modules', '.DS_Store', 'dist', 'build']);
      return files.filter(file => !excluded.has(file));
    }
  }
}

export const commandRouter = new CommandRouter();