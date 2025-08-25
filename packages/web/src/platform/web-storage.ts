/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Storage } from '@google/gemini-cli-core';
import { opfsAdapter } from './opfs-fs.js';
import * as path from 'path-browserify';

/**
 * Web-compatible Storage implementation using OPFS
 */
export class WebStorage implements Storage {
  private readonly basePath: string;
  private readonly targetDir: string;

  constructor(basePath = '/workspace/.gemini-cli', targetDir = '/workspace') {
    this.basePath = basePath;
    this.targetDir = targetDir;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const filePath = this.getStoragePath(key);
      const data = (await opfsAdapter.readFile(filePath, {
        encoding: 'utf8',
      })) as string;
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const filePath = this.getStoragePath(key);

    // Ensure directory exists
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    await opfsAdapter.mkdir(dirPath, { recursive: true });

    await opfsAdapter.writeFile(filePath, JSON.stringify(value, null, 2));
  }

  async has(key: string): Promise<boolean> {
    try {
      const filePath = this.getStoragePath(key);
      await opfsAdapter.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getStoragePath(key);
      await opfsAdapter.unlink(filePath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  async clear(): Promise<void> {
    try {
      await opfsAdapter.rmdir(this.basePath, { recursive: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  async keys(): Promise<string[]> {
    try {
      const files = await opfsAdapter.readdir(this.basePath);
      return files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.substring(0, file.length - 5)); // Remove .json extension
    } catch {
      return [];
    }
  }

  private getStoragePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const sanitizedKey = key.replace(/[^a-zA-Z0-9-_.]/g, '_');
    return `${this.basePath}/${sanitizedKey}.json`;
  }

  // --- Core Storage interface compatibility ---
  getGeminiDir(): string {
    return this.basePath;
  }

  getProjectTempDir(): string {
    const hash = this.hashPath(this.getProjectRoot());
    return path.join(this.getGlobalTempDir(), hash);
  }

  ensureProjectTempDirExists(): void {
    // Fire-and-forget async mkdir; interface is sync so we initiate without await
    void opfsAdapter.mkdir(this.getProjectTempDir(), { recursive: true });
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getHistoryDir(): string {
    const historyRoot = path.join(this.getGeminiDir(), 'history');
    const hash = this.hashPath(this.getProjectRoot());
    return path.join(historyRoot, hash);
  }

  getWorkspaceSettingsPath(): string {
    return path.join(this.getGeminiDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return path.join(this.getGeminiDir(), 'commands');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getExtensionsDir(): string {
    return path.join(this.getGeminiDir(), 'extensions');
  }

  getExtensionsConfigPath(): string {
    return path.join(this.getExtensionsDir(), 'gemini-extension.json');
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }

  // Helpers mirroring core private logic
  private getGlobalTempDir(): string {
    return path.join(this.getGeminiDir(), 'tmp');
  }

  private hashPath(filePath: string): string {
    // Simple FNV-1a 32-bit hash to avoid Node crypto in the browser
    let hash = 0x811c9dc5;
    for (let i = 0; i < filePath.length; i++) {
      hash ^= filePath.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
      hash >>>= 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }
}
