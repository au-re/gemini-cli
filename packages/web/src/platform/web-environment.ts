/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Browser environment detection utilities for platform abstraction
 */

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/**
 * Check if we're running in a Node.js environment
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && 
         process.versions != null && 
         process.versions.node != null;
}

/**
 * Check if OPFS is supported
 */
export function isOPFSSupported(): boolean {
  return isBrowser() && 
         'navigator' in globalThis &&
         'storage' in navigator &&
         'getDirectory' in navigator.storage;
}

/**
 * Check if we're in a secure context (required for OPFS)
 */
export function isSecureContext(): boolean {
  return isBrowser() && 
         'isSecureContext' in globalThis && 
         globalThis.isSecureContext;
}

/**
 * Get platform-specific information
 */
export function getPlatformInfo(): {
  platform: 'browser' | 'node' | 'unknown';
  hasOPFS: boolean;
  isSecure: boolean;
  userAgent?: string;
} {
  return {
    platform: isBrowser() ? 'browser' : isNode() ? 'node' : 'unknown',
    hasOPFS: isOPFSSupported(),
    isSecure: isSecureContext(),
    userAgent: isBrowser() ? navigator.userAgent : undefined,
  };
}

/**
 * Platform-specific path utilities
 */
export const WebPath = {
  /**
   * Normalize path separators for web (always use forward slashes)
   */
  normalize(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
  },

  /**
   * Join path segments for web
   */
  join(...segments: string[]): string {
    return this.normalize(segments.filter(Boolean).join('/'));
  },

  /**
   * Check if path is absolute (starts with /)
   */
  isAbsolute(path: string): boolean {
    return path.startsWith('/');
  },

  /**
   * Make path relative to root
   */
  resolve(root: string, ...paths: string[]): string {
    const joined = this.join(root, ...paths);
    return this.normalize(joined);
  },
};

/**
 * Web-compatible environment variable access
 */
export const WebEnv = {
  /**
   * Get environment variable (falls back to empty string in browser)
   */
  get(key: string): string {
    if (isNode()) {
      return process.env[key] || '';
    }
    // In browser, could check window.ENV or other global if configured
    return '';
  },

  /**
   * Check if environment variable exists
   */
  has(key: string): boolean {
    return this.get(key) !== '';
  },
};

/**
 * Web-compatible process utilities
 */
export const WebProcess = {
  /**
   * Get current working directory (always /workspace in web)
   */
  cwd(): string {
    if (isNode()) {
      return process.cwd();
    }
    return '/workspace';
  },

  /**
   * Get platform string
   */
  platform(): string {
    if (isNode()) {
      return process.platform;
    }
    return 'web';
  },

  /**
   * Exit process (noop in browser)
   */
  exit(code = 0): void {
    if (isNode()) {
      process.exit(code);
    }
    console.warn(`Process exit requested with code ${code}, but ignored in browser`);
  },
};