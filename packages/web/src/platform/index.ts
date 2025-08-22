/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Core platform abstractions
export { WebConfig } from './web-config.js';
export { WebStorage } from './web-storage.js';
export { WebFileSystemService } from './web-filesystem-service.js';
export { WebWorkspaceContext } from './web-workspace-context.js';
export { WebGeminiClient } from './web-gemini-client.js';
export { createWebToolRegistry } from './web-tool-registry.js';

// Platform adapter
export {
  WebPlatformAdapter,
  webPlatformAdapter,
  initializeWebPlatform,
} from './web-platform-adapter.js';

// Environment utilities
export {
  isBrowser,
  isNode,
  isOPFSSupported,
  isSecureContext,
  getPlatformInfo,
  WebPath,
  WebEnv,
  WebProcess,
} from './web-environment.js';

// Re-export existing platform components for compatibility
export { opfsAdapter } from './opfs-fs.js';
export { gitService } from './git.js';
export { createGeminiRetrier } from './retry.js';
export {
  parseGeminiError,
  formatErrorForUser,
  validateApiKey,
  createWebGeminiError,
} from './errors.js';