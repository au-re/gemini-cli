/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '@google/gemini-cli-core';
import { XtermHost } from '../terminal/XtermHost';
import { WebStorage } from './web-storage';

export class WebLogger extends Logger {
  constructor(private terminal: XtermHost) {
    // We need to call super with a session ID and a storage implementation.
    // For the web, we can provide a mock storage object as file-based
    // logging and checkpointing are not used.
    super('web-session', new WebStorage());
  }

  // Override all file-system based methods with web-safe no-op implementations
  override async initialize(): Promise<void> {
    // No file-based initialization needed in the web environment.
    return Promise.resolve();
  }

  override async logMessage(): Promise<void> {
    // Do not log to a file in the web environment.
    return Promise.resolve();
  }

  override async getPreviousUserMessages(): Promise<string[]> {
    // No file-based history in the web environment.
    return Promise.resolve([]);
  }

  override async saveCheckpoint(): Promise<void> {
    // Checkpoints are not saved to the file system in the web environment.
    return Promise.resolve();
  }

  override async loadCheckpoint(): Promise<[]> {
    // Checkpoints are not loaded from the file system in the web environment.
    return Promise.resolve([]);
  }

  override async deleteCheckpoint(): Promise<boolean> {
    // Checkpoints are not deleted from the file system in the web environment.
    return Promise.resolve(false);
  }

  override async checkpointExists(): Promise<boolean> {
    // Checkpoints do not exist in the file system in the web environment.
    return Promise.resolve(false);
  }

  override close(): void {
    // No file handles to close.
  }

  // Implement the simple logging methods that will be used by GeminiChat
  log(message: string): void {
    this.terminal.printMessage({
      type: 'log',
      text: message,
      timestamp: Date.now(),
    });
  }

  error(message: string): void {
    this.terminal.printMessage({
      type: 'error',
      text: message,
      timestamp: Date.now(),
    });
  }

  warn(message: string): void {
    this.terminal.printMessage({
      type: 'warn',
      text: message,
      timestamp: Date.now(),
    });
  }

  info(message: string): void {
    this.terminal.printMessage({
      type: 'info',
      text: message,
      timestamp: Date.now(),
    });
  }

  debug(...args: unknown[]): void {
    // Optional: Implement debug logging if needed
    console.debug(...args);
  }
}
