/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ApprovalMode,
  AccessibilitySettings,
  TelemetrySettings,
  AuthType,
  ContentGeneratorConfig,
  createContentGeneratorConfig,
  MCPOAuthConfig,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  ToolRegistry,
  PromptRegistry,
} from '@google/gemini-cli-core';
import { WebStorage } from './web-storage.js';
import { WebFileSystemService } from './web-filesystem-service.js';
import { WebWorkspaceContext } from './web-workspace-context.js';
import { createWebToolRegistry } from './web-tool-registry.js';

/**
 * Web-compatible configuration for Gemini CLI that extends the core Config
 */
export class WebConfig extends Config {
  private webStorage: WebStorage;
  private webFileSystemService: WebFileSystemService;
  private webWorkspaceContext: WebWorkspaceContext;
  private webApiKey: string | null = null;
  private webModel = DEFAULT_GEMINI_FLASH_MODEL;

  constructor() {
    // Initialize with web-specific implementations
    super();
    
    this.webStorage = new WebStorage();
    this.webFileSystemService = new WebFileSystemService();
    this.webWorkspaceContext = new WebWorkspaceContext();
    
    // Override the core Config's file system service with our web implementation
    this.setFileSystemService(this.webFileSystemService);
  }

  /**
   * Initialize the web config by loading stored settings and setting up tools
   */
  async initialize(): Promise<void> {
    await this.loadWebSettings();
    await this.setupWebTools();
  }

  /**
   * Setup web-compatible tools
   */
  private async setupWebTools(): Promise<void> {
    const toolRegistry = createWebToolRegistry(
      this as any, // Cast to avoid type issues with the mock
      this.webFileSystemService,
      this.webWorkspaceContext,
    );
    this.setToolRegistry(toolRegistry);
  }

  /**
   * Load settings from web storage
   */
  private async loadWebSettings(): Promise<void> {
    try {
      const settings = await this.webStorage.get<{
        apiKey?: string;
        model?: string;
        approvalMode?: ApprovalMode;
        telemetryEnabled?: boolean;
        accessibility?: AccessibilitySettings;
      }>('config');

      if (settings) {
        if (settings.apiKey) {
          this.webApiKey = settings.apiKey;
        }
        if (settings.model) {
          this.webModel = settings.model;
        }
        // Set other config values as needed
      }
    } catch (error) {
      console.warn('Failed to load web settings:', error);
    }
  }

  /**
   * Save current settings to web storage
   */
  private async saveWebSettings(): Promise<void> {
    try {
      const settings = {
        apiKey: this.webApiKey,
        model: this.webModel,
        updatedAt: new Date().toISOString(),
      };

      await this.webStorage.set('config', settings);
    } catch (error) {
      console.warn('Failed to save web settings:', error);
    }
  }

  // Override core Config methods for web compatibility
  override getContentGeneratorConfig(): ContentGeneratorConfig {
    if (!this.webApiKey) {
      throw new Error('API key not configured');
    }

    return createContentGeneratorConfig({
      type: AuthType.API_KEY,
      apiKey: this.webApiKey,
    });
  }

  override getModel(): string {
    return this.webModel;
  }

  override setModel(model: string): void {
    this.webModel = model;
    this.saveWebSettings().catch(console.warn);
  }

  override getTargetDir(): string {
    return this.webWorkspaceContext.getWorkingDirectory();
  }

  override getWorkingDir(): string {
    return this.webWorkspaceContext.getWorkingDirectory();
  }

  override getApprovalMode(): ApprovalMode {
    return ApprovalMode.DEFAULT; // For web, we can default to this
  }

  override getDebugMode(): boolean {
    return false; // Disabled by default in web
  }

  override getTelemetryEnabled(): boolean {
    return false; // Disabled by default in web
  }

  // Web-specific methods
  getWebApiKey(): string | null {
    return this.webApiKey;
  }

  async setWebApiKey(apiKey: string): Promise<void> {
    this.webApiKey = apiKey;
    await this.saveWebSettings();
  }

  isWebConfigured(): boolean {
    return !!this.webApiKey;
  }

  async clearWebConfiguration(): Promise<void> {
    this.webApiKey = null;
    await this.webStorage.delete('config');
  }

  getWebFileSystemService(): WebFileSystemService {
    return this.webFileSystemService;
  }

  getWebWorkspaceContext(): WebWorkspaceContext {
    return this.webWorkspaceContext;
  }

  getWebStorage(): WebStorage {
    return this.webStorage;
  }

  // Create web-compatible Gemini client config
  getWebGeminiClientConfig(): {
    apiKey: string;
    model: string;
  } {
    if (!this.webApiKey) {
      throw new Error('API key not configured');
    }

    return {
      apiKey: this.webApiKey,
      model: this.webModel,
    };
  }

  getWebConfigStatus(): {
    configured: boolean;
    hasApiKey: boolean;
    model: string;
    workspaceRoot: string;
  } {
    return {
      configured: this.isWebConfigured(),
      hasApiKey: !!this.webApiKey,
      model: this.webModel,
      workspaceRoot: this.webWorkspaceContext.getWorkingDirectory(),
    };
  }
}