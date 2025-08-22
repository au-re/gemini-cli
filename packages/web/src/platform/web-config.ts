/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
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
import { sessionId } from '@google/gemini-cli-core';

/**
 * Web-compatible configuration for Gemini CLI
 * Uses composition instead of inheritance to avoid core Config constraints
 */
export class WebConfig {
  private storage: WebStorage;
  private fileSystemService: WebFileSystemService;
  private workspaceContext: WebWorkspaceContext;
  private toolRegistry?: ToolRegistry;
  private promptRegistry?: PromptRegistry;

  // Web-specific configuration
  private webApiKey: string | null = null;
  private webModel = DEFAULT_GEMINI_FLASH_MODEL;
  private webSessionId = sessionId;
  private webApprovalMode = ApprovalMode.DEFAULT;
  private webAccessibility: AccessibilitySettings = {
    disableLoadingPhrases: false,
  };
  private webTelemetry: TelemetrySettings = { enabled: false };

  constructor(
    storage?: WebStorage,
    fileSystemService?: WebFileSystemService,
    workspaceContext?: WebWorkspaceContext,
  ) {
    this.storage = storage || new WebStorage();
    this.fileSystemService = fileSystemService || new WebFileSystemService();
    this.workspaceContext = workspaceContext || new WebWorkspaceContext();
  }

  /**
   * Initialize the web config by loading stored settings
   */
  async initialize(): Promise<void> {
    await this.loadWebSettings();
  }

  /**
   * Load settings from web storage
   */
  private async loadWebSettings(): Promise<void> {
    try {
      const settings = await this.storage.get<{
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
        if (settings.approvalMode) {
          this.webApprovalMode = settings.approvalMode;
        }
        if (settings.accessibility) {
          this.webAccessibility = {
            ...this.webAccessibility,
            ...settings.accessibility,
          };
        }
        if (settings.telemetryEnabled !== undefined) {
          this.webTelemetry.enabled = settings.telemetryEnabled;
        }
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
        approvalMode: this.webApprovalMode,
        telemetryEnabled: this.webTelemetry.enabled,
        accessibility: this.webAccessibility,
        updatedAt: new Date().toISOString(),
      };

      await this.storage.set('config', settings);
    } catch (error) {
      console.warn('Failed to save web settings:', error);
    }
  }

  // Core configuration methods

  getContentGeneratorConfig(): ContentGeneratorConfig {
    if (!this.webApiKey) {
      throw new Error('API key not configured');
    }

    return createContentGeneratorConfig({
      type: AuthType.API_KEY,
      apiKey: this.webApiKey,
    });
  }

  getModel(): string {
    return this.webModel;
  }

  setModel(model: string): void {
    this.webModel = model;
    this.saveWebSettings().catch(console.warn);
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
    await this.storage.delete('config');
  }

  // Service accessors
  getWorkspaceContext(): WebWorkspaceContext {
    return this.workspaceContext;
  }

  getFileSystemService(): WebFileSystemService {
    return this.fileSystemService;
  }

  getToolRegistry(): ToolRegistry | undefined {
    return this.toolRegistry;
  }

  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  getPromptRegistry(): PromptRegistry | undefined {
    return this.promptRegistry;
  }

  setPromptRegistry(registry: PromptRegistry): void {
    this.promptRegistry = registry;
  }

  // Settings accessors
  getTelemetryEnabled(): boolean {
    return this.webTelemetry.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return false; // Disabled in web environment
  }

  getApprovalMode(): ApprovalMode {
    return this.webApprovalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.webApprovalMode = mode;
    this.saveWebSettings().catch(console.warn);
  }

  getAccessibility(): AccessibilitySettings {
    return this.webAccessibility;
  }

  // MCP settings (not supported in web initially)
  getMcpServers(): Record<string, any> | undefined {
    return undefined;
  }

  getMcpServerCommand(): string | undefined {
    return undefined;
  }

  getMcpOAuthConfig(): MCPOAuthConfig | undefined {
    return undefined;
  }

  // Session management
  getSessionId(): string {
    return this.webSessionId;
  }

  setSessionId(sessionId: string): void {
    this.webSessionId = sessionId;
  }

  // Memory and embedding settings
  getEmbeddingModel(): string {
    return DEFAULT_GEMINI_EMBEDDING_MODEL;
  }

  getUserMemory(): string {
    return '';
  }

  setUserMemory(memory: string): void {
    // Could implement web storage for user memory if needed
  }

  // Web-specific utility methods
  async testApiConnection(): Promise<boolean> {
    if (!this.webApiKey) {
      return false;
    }

    try {
      // This would be implemented by the web Gemini client
      return true;
    } catch {
      return false;
    }
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
      workspaceRoot: this.workspaceContext.getWorkingDirectory(),
    };
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

  // Core config compatibility methods
  getDebugMode(): boolean {
    return false; // Disabled by default in web
  }

  getWorkingDirectory(): string {
    return this.workspaceContext.getWorkingDirectory();
  }
}
