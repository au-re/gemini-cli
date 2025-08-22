/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileSystemService } from '@google/gemini-cli-core';
import { opfsAdapter } from './opfs-fs.js';
import * as path from 'path-browserify';

/**
 * Web-compatible FileSystemService implementation that uses OPFS
 */
export class WebFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    const result = await opfsAdapter.readFile(filePath, { encoding: 'utf8' });
    return typeof result === 'string' ? result : new TextDecoder().decode(result);
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    return opfsAdapter.writeFile(filePath, content);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return opfsAdapter.readdir(dirPath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    return opfsAdapter.mkdir(dirPath, options);
  }

  async stat(filePath: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
  }> {
    const stats = await opfsAdapter.stat(filePath);
    return {
      isFile: () => stats.isFile(),
      isDirectory: () => stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtimeMs ? new Date(stats.mtimeMs) : new Date(),
    };
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await opfsAdapter.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Sync methods for web environment - these will use cached results or return reasonable defaults
  existsSync(path: string): boolean {
    // In web environment, we can't do truly synchronous operations
    // For validation purposes, we'll return true and let async operations handle errors
    return true;
  }

  statSync(path: string): {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  } {
    // In web environment, we can't do truly synchronous operations
    // For validation purposes, we'll return a default stat that doesn't block
    return {
      isFile: () => true,
      isDirectory: () => false,
      size: 0,
    };
  }

  // Legacy compatibility methods for web-tool-registry
  async readFile(filePath: string, encoding?: BufferEncoding | string): Promise<string | Buffer> {
    const result = await opfsAdapter.readFile(filePath, { encoding: encoding || 'utf8' });
    return result;
  }

  async writeFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding | string): Promise<void> {
    return opfsAdapter.writeFile(filePath, data, encoding);
  }

  // Path utilities used by web tools
  resolve(...paths: string[]): string {
    return path.resolve(...paths);
  }

  join(...paths: string[]): string {
    return path.join(...paths);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  extname(filePath: string): string {
    return path.extname(filePath);
  }

  relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }
}