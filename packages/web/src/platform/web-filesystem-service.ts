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
  async readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    return opfsAdapter.readFile(filePath, { encoding: encoding || 'utf8' });
  }

  async writeFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): Promise<void> {
    return opfsAdapter.writeFile(filePath, data, encoding);
  }

  async readdir(dirPath: string): Promise<string[]> {
    return opfsAdapter.readdir(dirPath);
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    return opfsAdapter.mkdir(dirPath, options);
  }

  async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    return opfsAdapter.rmdir(dirPath, options);
  }

  async unlink(filePath: string): Promise<void> {
    return opfsAdapter.unlink(filePath);
  }

  async stat(filePath: string): Promise<{
    isFile: () => boolean;
    isDirectory: () => boolean;
    size: number;
    mtime: Date;
  }> {
    const stats = await opfsAdapter.stat(filePath);
    return {
      isFile: () => !stats.isDirectory(),
      isDirectory: () => stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
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