/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import ignore from 'ignore';
import { opfsAdapter } from './opfs-fs.js';

/**
 * Service for handling .gitignore and .geminiignore filtering
 */
export class IgnoreService {
  private cache = new Map<string, ReturnType<typeof ignore>>();

  /**
   * Get ignore instance for a directory
   */
  private async getIgnoreInstance(dir: string): Promise<ReturnType<typeof ignore>> {
    const cacheKey = dir;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const ig = ignore();
    
    // Default ignore patterns
    ig.add([
      'node_modules/',
      '.git/',
      '.DS_Store',
      '*.log',
      'dist/',
      'build/',
      '.env',
      '.env.local',
      'coverage/',
      '.nyc_output/',
      '*.pid',
      '*.seed',
      '*.tgz',
    ]);

    // Load .gitignore if it exists
    try {
      const gitignorePath = `${dir}/.gitignore`;
      const gitignoreContent = await opfsAdapter.readFile(gitignorePath, { encoding: 'utf8' }) as string;
      ig.add(gitignoreContent);
    } catch {
      // .gitignore doesn't exist, that's OK
    }

    // Load .geminiignore if it exists
    try {
      const geminiignorePath = `${dir}/.geminiignore`;
      const geminiignoreContent = await opfsAdapter.readFile(geminiignorePath, { encoding: 'utf8' }) as string;
      ig.add(geminiignoreContent);
    } catch {
      // .geminiignore doesn't exist, that's OK
    }

    this.cache.set(cacheKey, ig);
    return ig;
  }

  /**
   * Filter files based on ignore patterns
   */
  async filter(dir: string, files: string[]): Promise<string[]> {
    const ig = await this.getIgnoreInstance(dir);
    
    return files.filter(file => {
      // Always include dotfiles that are not in ignore patterns
      if (file.startsWith('.') && !file.includes('/')) {
        return !ig.ignores(file);
      }
      
      return !ig.ignores(file);
    });
  }

  /**
   * Check if a specific file should be ignored
   */
  async isIgnored(dir: string, filepath: string): Promise<boolean> {
    const ig = await this.getIgnoreInstance(dir);
    return ig.ignores(filepath);
  }

  /**
   * Clear cache for a directory
   */
  clearCache(dir?: string): void {
    if (dir) {
      this.cache.delete(dir);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Add custom ignore patterns
   */
  async addIgnorePatterns(dir: string, patterns: string[]): Promise<void> {
    const ig = await this.getIgnoreInstance(dir);
    ig.add(patterns);
  }
}

// Export singleton instance
export const ignoreService = new IgnoreService();