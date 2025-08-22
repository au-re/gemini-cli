/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';

/**
 * Interface for file system operations that may be delegated to different implementations
 */
export interface FileSystemService {
  /**
   * Read text content from a file
   *
   * @param filePath - The path to the file to read
   * @returns The file content as a string
   */
  readTextFile(filePath: string): Promise<string>;

  /**
   * Write text content to a file
   *
   * @param filePath - The path to the file to write
   * @param content - The content to write
   */
  writeTextFile(filePath: string, content: string): Promise<void>;

  /**
   * Read directory contents
   *
   * @param dirPath - The path to the directory
   * @returns Array of file/directory names
   */
  readdir(dirPath: string): Promise<string[]>;

  /**
   * Get file/directory statistics
   *
   * @param path - The path to stat
   * @returns File statistics
   */
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
  }>;

  /**
   * Check if a file or directory exists
   *
   * @param path - The path to check
   * @returns True if exists, false otherwise
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create a directory
   *
   * @param dirPath - The path to create
   * @param options - Creation options
   */
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Check if a path exists synchronously (for validation)
   * This method should be avoided in async contexts but may be needed for validation
   *
   * @param path - The path to check
   * @returns True if exists, false otherwise
   */
  existsSync(path: string): boolean;

  /**
   * Get file/directory statistics synchronously (for validation)
   * This method should be avoided in async contexts but may be needed for validation
   *
   * @param path - The path to stat
   * @returns File statistics
   */
  statSync(path: string): {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  };
}

/**
 * Standard file system implementation
 */
export class StandardFileSystemService implements FileSystemService {
  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async readdir(dirPath: string): Promise<string[]> {
    return fs.readdir(dirPath);
  }

  async stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
  }> {
    const stats = await fs.stat(path);
    return {
      isFile: () => stats.isFile(),
      isDirectory: () => stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
    };
  }

  async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, options);
  }

  existsSync(path: string): boolean {
    try {
      // Import synchronous fs for sync operations
      const fsSync = eval('require')('fs');
      return fsSync.existsSync(path);
    } catch {
      return false;
    }
  }

  statSync(path: string): {
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
  } {
    // Import synchronous fs for sync operations
    const fsSync = eval('require')('fs');
    const stats = fsSync.statSync(path);
    return {
      isFile: () => stats.isFile(),
      isDirectory: () => stats.isDirectory(),
      size: stats.size,
    };
  }
}
