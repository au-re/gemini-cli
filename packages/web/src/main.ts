import { XtermHost } from './terminal/XtermHost.js';
import { commandRouter } from './command/Router.js';
import { geminiService } from './platform/gemini.js';
import { gitService } from './platform/git.js';
import { opfsAdapter } from './platform/opfs-fs.js';

/**
 * Main application class
 */
export class GeminiWebApp {
  private terminal: XtermHost;
  private workingDirectory = '/workspace';
  private statusElement: HTMLElement;

  constructor() {
    const terminalContainer = document.getElementById('terminal');
    const statusLeft = document.getElementById('status-left');
    
    if (!terminalContainer || !statusLeft) {
      throw new Error('Required DOM elements not found');
    }

    this.statusElement = statusLeft;
    this.terminal = new XtermHost(terminalContainer);
    
    this.start();
  }

  /**
   * Start the application main loop
   */
  private async start(): Promise<void> {
    this.setStatus('Initializing...');
    
    // Try to load existing configuration
    try {
      await geminiService.loadFromStorage();
      
      // Also load Git token if available
      try {
        const settingsData = await opfsAdapter.readFile('/workspace/.gemini/settings.json', { encoding: 'utf8' }) as string;
        const settings = JSON.parse(settingsData);
        if (settings.gitToken) {
          gitService.setAuthToken(settings.gitToken);
        }
      } catch {
        // Settings don't exist or don't have git token, that's OK
      }
      
      const geminiConfigured = geminiService.isConfigured();
      const gitConfigured = !!gitService.getAuthToken();
      
      if (geminiConfigured && gitConfigured) {
        this.setStatus('Ready (Gemini + Git configured)');
      } else if (geminiConfigured) {
        this.setStatus('Ready (Gemini configured, configure Git token for private repos)');
      } else if (gitConfigured) {
        this.setStatus('Ready (Git configured, configure Gemini API key for AI features)');
      } else {
        this.setStatus('Ready (Configure API keys to get started)');
      }
    } catch (error) {
      console.warn('Failed to load configuration:', error);
      this.setStatus('Ready (Configure API keys to get started)');
    }
    
    this.terminal.focus();

    // Main input loop
    while (true) {
      try {
        const input = await this.terminal.readLine({ prompt: '> ' });
        await this.processInput(input);
      } catch (error) {
        this.terminal.printMessage({
          type: 'error',
          text: `Application error: ${error}`,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Process user input
   */
  private async processInput(input: string): Promise<void> {
    if (!input.trim()) return;

    try {
      const result = await commandRouter.route(input, {
        terminal: this.terminal,
        workingDirectory: this.workingDirectory,
        setStatus: (message: string) => this.setStatus(message),
      });

      switch (result.type) {
        case 'message':
          if (result.content) {
            this.terminal.println(result.content);
          }
          break;
        
        case 'prompt':
          // For backward compatibility - content is already shown
          if (result.content) {
            this.terminal.println(result.content);
          }
          break;
        
        case 'error':
          this.terminal.printMessage({
            type: 'error',
            text: result.content,
            timestamp: Date.now(),
          });
          break;
      }
    } catch (error) {
      this.terminal.printMessage({
        type: 'error',
        text: `Command failed: ${error}`,
        timestamp: Date.now(),
      });
    }

    this.setStatus('Ready');
  }

  /**
   * Update status bar
   */
  private setStatus(message: string): void {
    this.statusElement.textContent = message;
  }

  /**
   * Cleanup application resources
   */
  dispose(): void {
    this.terminal.dispose();
  }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new GeminiWebApp();
});