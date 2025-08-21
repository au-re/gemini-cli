/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Node.js-compatible filesystem interface for use with isomorphic-git and core utilities
 */
export interface NodeLikeFS {
  readFile(path: string, opts?: { encoding?: 'utf8' | 'utf-8' | string }): Promise<string | Uint8Array>;
  writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: 'utf8' | 'utf-8' | string }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtimeMs?: number;
  }>;
  unlink(path: string): Promise<void>;
  rmdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  lstat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtimeMs?: number;
  }>;
}

/**
 * OPFS-backed filesystem adapter implementing Node.js fs interface
 */
export class OPFSAdapter implements NodeLikeFS {
  private rootPromise: Promise<FileSystemDirectoryHandle>;
  private handleCache = new Map<string, FileSystemHandle>();

  constructor() {
    this.rootPromise = navigator.storage.getDirectory();
  }

  /**
   * Get a handle for the given path, creating intermediate directories as needed
   */
  private async getHandle(
    path: string, 
    create = false, 
    file = false
  ): Promise<FileSystemHandle> {
    const normalizedPath = this.normalizePath(path);
    
    // Check cache first
    if (this.handleCache.has(normalizedPath)) {
      const cached = this.handleCache.get(normalizedPath);
      if (cached) return cached;
    }

    const root = await this.rootPromise;
    const parts = normalizedPath.split('/').filter(Boolean);
    
    if (parts.length === 0) {
      return root;
    }

    let current: FileSystemDirectoryHandle = root;
    
    // Navigate to parent directory
    for (let i = 0; i < parts.length - (file ? 1 : 0); i++) {
      const name = parts[i];
      try {
        current = await current.getDirectoryHandle(name, { create });
      } catch (_error) {
        if (!create) throw new Error(`Directory not found: ${parts.slice(0, i + 1).join('/')}`);
        current = await current.getDirectoryHandle(name, { create: true });
      }
    }

    let handle: FileSystemHandle;
    if (file) {
      const fileName = parts[parts.length - 1];
      handle = await current.getFileHandle(fileName, { create });
    } else {
      handle = current;
    }

    // Cache the handle
    this.handleCache.set(normalizedPath, handle);
    return handle;
  }

  /**
   * Normalize path by removing leading/trailing slashes and resolving relative paths
   */
  private normalizePath(path: string): string {
    return path.replace(/^\/+/, '').replace(/\/+$/, '') || '';
  }

  async readFile(path: string, opts?: { encoding?: string }): Promise<string | Uint8Array> {
    try {
      const handle = await this.getHandle(path, false, true) as FileSystemFileHandle;
      const file = await handle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      
      if (opts?.encoding === 'utf8' || opts?.encoding === 'utf-8') {
        return new TextDecoder().decode(buffer);
      }
      return buffer;
    } catch (error) {
      throw new Error(`Failed to read file ${path}: ${error}`);
    }
  }

  async writeFile(path: string, data: string | Uint8Array, _opts?: { encoding?: string }): Promise<void> {
    try {
      const handle = await this.getHandle(path, true, true) as FileSystemFileHandle;
      const writer = await handle.createWritable();
      
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await writer.write(bytes);
      await writer.close();
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error}`);
    }
  }

  async readdir(path: string): Promise<string[]> {
    try {
      const handle = await this.getHandle(path, false, false) as FileSystemDirectoryHandle;
      const entries: string[] = [];
      
      for await (const [name] of (handle as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
        entries.push(name);
      }
      
      return entries.sort();
    } catch (error) {
      throw new Error(`Failed to read directory ${path}: ${error}`);
    }
  }

  async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    try {
      await this.getHandle(path, true, false);
    } catch (error) {
      if (!opts?.recursive) {
        throw new Error(`Failed to create directory ${path}: ${error}`);
      }
      // For recursive mkdir, getHandle with create=true should work
      await this.getHandle(path, true, false);
    }
  }

  async stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtimeMs?: number;
  }> {
    try {
      const handle = await this.getHandle(path, false, false);
      
      if (handle.kind === 'file') {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: file.size,
          mtimeMs: file.lastModified,
        };
      } else {
        return {
          isFile: () => false,
          isDirectory: () => true,
          size: 0,
        };
      }
    } catch (_error) {
      // Try as file if directory lookup fails
      try {
        const fileHandle = await this.getHandle(path, false, true) as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: file.size,
          mtimeMs: file.lastModified,
        };
      } catch {
        throw new Error(`Path not found: ${path}`);
      }
    }
  }

  async unlink(path: string): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(path);
      const parts = normalizedPath.split('/').filter(Boolean);
      
      if (parts.length === 0) {
        throw new Error('Cannot delete root directory');
      }

      const parentPath = parts.slice(0, -1).join('/');
      const fileName = parts[parts.length - 1];
      
      const parentHandle = await this.getHandle(parentPath, false, false) as FileSystemDirectoryHandle;
      await parentHandle.removeEntry(fileName);
      
      // Remove from cache
      this.handleCache.delete(normalizedPath);
    } catch (error) {
      throw new Error(`Failed to delete file ${path}: ${error}`);
    }
  }

  async rmdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    try {
      const normalizedPath = this.normalizePath(path);
      const parts = normalizedPath.split('/').filter(Boolean);
      
      if (parts.length === 0) {
        throw new Error('Cannot delete root directory');
      }

      const parentPath = parts.slice(0, -1).join('/');
      const dirName = parts[parts.length - 1];
      
      const parentHandle = await this.getHandle(parentPath, false, false) as FileSystemDirectoryHandle;
      await parentHandle.removeEntry(dirName, { recursive: opts?.recursive });
      
      // Remove from cache
      this.handleCache.delete(normalizedPath);
    } catch (error) {
      throw new Error(`Failed to delete directory ${path}: ${error}`);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      // OPFS doesn't have native rename, so we copy and delete
      const data = await this.readFile(oldPath);
      await this.writeFile(newPath, data);
      await this.unlink(oldPath);
    } catch (error) {
      throw new Error(`Failed to rename ${oldPath} to ${newPath}: ${error}`);
    }
  }

  async lstat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtimeMs?: number;
  }> {
    // lstat should behave the same as stat for OPFS (no symlinks)
    return this.stat(path);
  }
}

// Export singleton instance
export const opfsAdapter = new OPFSAdapter();