/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web-compatible WorkspaceContext implementation
 */
export class WebWorkspaceContext {
  private _workingDirectory = '/workspace';

  constructor(initialWorkingDirectory = '/workspace') {
    this._workingDirectory = initialWorkingDirectory;
  }

  getWorkingDirectory(): string {
    return this._workingDirectory;
  }

  setWorkingDirectory(directory: string): void {
    this._workingDirectory = directory;
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

  // Web-specific methods
  getCurrentWorkspace(): string {
    return this._workingDirectory;
  }

  async initializeWorkspace(rootPath = '/workspace'): Promise<void> {
    this._workingDirectory = rootPath;
    // Could initialize OPFS workspace here if needed
  }
}
