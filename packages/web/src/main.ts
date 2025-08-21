/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { XtermHost } from './terminal/XtermHost.js';
import { commandRouter } from './command/Router.js';

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
    this.setStatus('Ready');
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
          // TODO: Send to Gemini API
          this.terminal.printMessage({
            type: 'info',
            text: 'Gemini integration coming soon...',
            timestamp: Date.now(),
          });
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