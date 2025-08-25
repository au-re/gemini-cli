/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeminiChat, ToolRegistry } from '@google/gemini-cli-core';
import { WebConfig } from './platform/web-config.js';
import { WebLogger } from './platform/web-logger.js';
import { createWebToolRegistry } from './platform/web-tool-registry.js';
import { XtermHost } from './terminal/XtermHost.js';

/**
 * Main application class
 */
export class GeminiWebApp {
  private terminal: XtermHost;
  private statusElement: HTMLElement;
  private config: WebConfig;
  private commandHistory: string[] = [];
  private chat: GeminiChat;
  private logger: WebLogger;
  private toolRegistry: ToolRegistry;

  constructor() {
    const terminalContainer = document.getElementById('terminal');
    const statusLeft = document.getElementById('status-left');

    if (!terminalContainer || !statusLeft) {
      throw new Error('Required DOM elements not found');
    }

    this.statusElement = statusLeft;
    this.terminal = new XtermHost(terminalContainer);
    this.config = new WebConfig();
    this.logger = new WebLogger(this.terminal);
    this.toolRegistry = createWebToolRegistry(
      this.config,
      this.config.getFileSystemService(),
      this.config.getWorkspaceContext(),
    );
    this.config.setToolRegistry(this.toolRegistry);
    this.chat = new GeminiChat(
      this.config,
      this.config.getFileSystemService(),
      this.logger,
    );

    this.start();
  }

  /**
   * Start the application main loop
   */
  private async start(): Promise<void> {
    this.setStatus('Initializing...');
    await this.config.initialize();

    if (!this.config.isWebConfigured()) {
      this.terminal.println(
        'Welcome to Gemini CLI! Please provide your API key to get started.',
      );
      const apiKey = await this.terminal.readLine({ prompt: 'API Key: ' });
      await this.config.setWebApiKey(apiKey);
      this.terminal.println('API key saved.');
    }

    this.terminal.focus();
    this.setStatus('Ready');

    // Main input loop
    while (true) {
      try {
        const input = await this.terminal.readLine({
          prompt: '> ',
          history: this.commandHistory,
        });
        if (input.trim()) {
          this.commandHistory.push(input);
        }
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
    this.setStatus('Thinking...');
    try {
      const result = await this.chat.chat(input);
      let responseText = '';
      for await (const chunk of result.chunks) {
        const chunkText = chunk.text;
        responseText += chunkText;
        this.terminal.print(chunkText);
      }
    } catch (e) {
      this.logger.error((e as Error).message);
    } finally {
      this.setStatus('Ready');
    }
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
