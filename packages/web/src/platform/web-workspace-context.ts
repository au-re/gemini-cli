/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Define a minimal workspace context interface for web use
export interface WebWorkspaceContextInterface {
  resolvePath(relativePath: string): string;
  relativizePathToWorkspace(absolutePath: string): string;
  isInWorkspace(filePath: string): boolean;
  getCurrentWorkspace(): string;
  initializeWorkspace(rootPath?: string): Promise<void>;
}

/**
 * Web-compatible WorkspaceContext implementation
 * This provides the minimal interface needed for web tools
 */
export class WebWorkspaceContext implements WebWorkspaceContextInterface {
  private _workingDirectory = '/workspace';

  constructor(initialWorkingDirectory = '/workspace') {
    this._workingDirectory = initialWorkingDirectory;
  }

  resolvePath(relativePath: string): string {
    if (relativePath.startsWith('/')) {
      return relativePath;
    }
    return `${this._workingDirectory}/${relativePath}`.replace(/\/+/g, '/');
  }

  relativizePathToWorkspace(absolutePath: string): string {
    if (absolutePath.startsWith(this._workingDirectory)) {
      const relative = absolutePath.substring(this._workingDirectory.length);
      return relative.startsWith('/') ? relative.substring(1) : relative;
    }
    return absolutePath;
  }

  isInWorkspace(filePath: string): boolean {
    const resolved = this.resolvePath(filePath);
    return resolved.startsWith(this._workingDirectory);
  }

  getCurrentWorkspace(): string {
    return this._workingDirectory;
  }

  async initializeWorkspace(rootPath = '/workspace'): Promise<void> {
    this._workingDirectory = rootPath;
    // Could initialize OPFS workspace here if needed
  }
}
