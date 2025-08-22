/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PromptRegistry } from '@google/gemini-cli-core';
import { WebConfig } from './web-config.js';
import { WebStorage } from './web-storage.js';
import { WebFileSystemService } from './web-filesystem-service.js';
import { WebWorkspaceContext } from './web-workspace-context.js';
import { WebGeminiClient } from './web-gemini-client.js';
import { createWebToolRegistry } from './web-tool-registry.js';
import { getPlatformInfo, isBrowser } from './web-environment.js';

/**
 * Central platform adapter that initializes and manages all web-compatible
 * core package integrations
 */
export class WebPlatformAdapter {
  private webConfig: WebConfig | null = null;
  private fileSystemService: WebFileSystemService | null = null;
  private workspaceContext: WebWorkspaceContext | null = null;
  private storage: WebStorage | null = null;
  private geminiClient: WebGeminiClient | null = null;
  private initialized = false;

  /**
   * Initialize the platform adapter with all required services
   */
  async initialize(options?: {
    workspaceRoot?: string;
    storageBasePath?: string;
  }): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Validate browser environment
    if (!isBrowser()) {
      throw new Error(
        'WebPlatformAdapter can only be used in browser environment',
      );
    }

    const platformInfo = getPlatformInfo();
    if (!platformInfo.hasOPFS) {
      console.warn('OPFS not supported, some functionality may be limited');
    }

    // Initialize core services
    this.workspaceContext = new WebWorkspaceContext(
      options?.workspaceRoot || '/workspace',
    );

    this.fileSystemService = new WebFileSystemService();

    this.storage = new WebStorage(
      options?.storageBasePath || '/workspace/.gemini-cli',
    );

    // Initialize configuration
    this.webConfig = new WebConfig(
      this.storage,
      this.fileSystemService,
      this.workspaceContext,
    );

    await this.webConfig.initialize();

    // Initialize tool registry
    const toolRegistry = createWebToolRegistry(
      this.webConfig,
      this.fileSystemService,
      this.workspaceContext,
    );

    // Initialize prompt registry (empty for now)
    const promptRegistry = new PromptRegistry();

    // Set registries on config (if the methods exist)
    if (typeof this.webConfig.setToolRegistry === 'function') {
      this.webConfig.setToolRegistry(toolRegistry);
    }
    if (typeof this.webConfig.setPromptRegistry === 'function') {
      this.webConfig.setPromptRegistry(promptRegistry);
    }

    // Initialize Gemini client
    this.geminiClient = new WebGeminiClient(this.webConfig, toolRegistry);

    this.initialized = true;
  }

  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'WebPlatformAdapter not initialized. Call initialize() first.',
      );
    }
  }

  /**
   * Get the web configuration
   */
  getConfig(): WebConfig {
    this.ensureInitialized();
    return this.webConfig!;
  }

  /**
   * Get the file system service
   */
  getFileSystemService(): WebFileSystemService {
    this.ensureInitialized();
    return this.fileSystemService!;
  }

  /**
   * Get the workspace context
   */
  getWorkspaceContext(): WebWorkspaceContext {
    this.ensureInitialized();
    return this.workspaceContext!;
  }

  /**
   * Get the storage service
   */
  getStorage(): WebStorage {
    this.ensureInitialized();
    return this.storage!;
  }

  /**
   * Get the Gemini client
   */
  getGeminiClient(): WebGeminiClient {
    this.ensureInitialized();
    return this.geminiClient!;
  }

  /**
   * Configure the API key for Gemini access
   */
  async configureApiKey(apiKey: string): Promise<void> {
    this.ensureInitialized();

    await this.webConfig!.setWebApiKey(apiKey);
    await this.geminiClient!.initialize();
  }

  /**
   * Test the current configuration
   */
  async testConfiguration(): Promise<{
    success: boolean;
    error?: string;
    details?: {
      platform: unknown;
      config: unknown;
      gemini: unknown;
    };
  }> {
    this.ensureInitialized();

    try {
      const platformInfo = getPlatformInfo();
      const configStatus = this.webConfig!.getWebConfigStatus();

      let geminiTest = { success: false, error: 'Not configured' };
      if (configStatus.configured) {
        geminiTest = await this.geminiClient!.testConfiguration();
      }

      const success =
        platformInfo.platform === 'browser' &&
        configStatus.configured &&
        geminiTest.success;

      return {
        success,
        error: success
          ? undefined
          : geminiTest.error || 'Configuration incomplete',
        details: {
          platform: platformInfo,
          config: configStatus,
          gemini: geminiTest,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get comprehensive status of all services
   */
  getStatus(): {
    initialized: boolean;
    platform: unknown;
    config: unknown;
    workspace: unknown;
    gemini: unknown;
  } {
    if (!this.initialized) {
      return {
        initialized: false,
        platform: getPlatformInfo(),
        config: null,
        workspace: null,
        gemini: null,
      };
    }

    return {
      initialized: true,
      platform: getPlatformInfo(),
      config: this.webConfig!.getWebConfigStatus(),
      workspace: {
        root: this.workspaceContext!.getWorkingDirectory(),
      },
      gemini: this.geminiClient!.getStatus(),
    };
  }

  /**
   * Reset all configuration and storage
   */
  async reset(): Promise<void> {
    this.ensureInitialized();

    await this.webConfig!.clearWebConfiguration();
    await this.storage!.clear();

    // Reinitialize
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Cleanup and dispose resources
   */
  dispose(): void {
    this.webConfig = null;
    this.fileSystemService = null;
    this.workspaceContext = null;
    this.storage = null;
    this.geminiClient = null;
    this.initialized = false;
  }
}

/**
 * Global singleton instance for easier usage
 */
export const webPlatformAdapter = new WebPlatformAdapter();

/**
 * Convenience initialization function
 */
export async function initializeWebPlatform(options?: {
  workspaceRoot?: string;
  storageBasePath?: string;
  apiKey?: string;
}): Promise<WebPlatformAdapter> {
  await webPlatformAdapter.initialize({
    workspaceRoot: options?.workspaceRoot,
    storageBasePath: options?.storageBasePath,
  });

  if (options?.apiKey) {
    await webPlatformAdapter.configureApiKey(options.apiKey);
  }

  return webPlatformAdapter;
}

// Export all platform services for direct access
export {
  WebConfig,
  WebStorage,
  WebFileSystemService,
  WebWorkspaceContext,
  WebGeminiClient,
  createWebToolRegistry,
} from './index.js';
