/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebConfig } from '../platform/web-config.js';
import { WebFileSystemService } from '../platform/web-filesystem-service.js';
import { WebStorage } from '../platform/web-storage.js';
import { WebWorkspaceContext } from '../platform/web-workspace-context.js';

// Mock OPFS adapter
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    rmdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock core package partially to keep real exports (like Storage),
// but override specific constants for predictable tests.
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    ApprovalMode: { DEFAULT: 'default' },
    DEFAULT_GEMINI_FLASH_MODEL: 'gemini-2.0-flash-exp',
    DEFAULT_GEMINI_EMBEDDING_MODEL: 'text-embedding-004',
    sessionId: 'test-session-id',
    // Keep AuthType from actual to avoid enum/value shape issues
    createContentGeneratorConfig: vi.fn((config) => config),
  };
});

describe('Web Config Integration', () => {
  let webConfig: WebConfig;
  let mockStorage: WebStorage;
  let mockFileSystem: WebFileSystemService;
  let mockWorkspace: WebWorkspaceContext;

  beforeEach(() => {
    mockStorage = new WebStorage('/test-storage');
    mockFileSystem = new WebFileSystemService();
    mockWorkspace = new WebWorkspaceContext('/test-workspace');

    webConfig = new WebConfig(mockStorage, mockFileSystem, mockWorkspace);
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await webConfig.initialize();

      expect(webConfig.isWebConfigured()).toBe(false);
      expect(webConfig.getModel()).toBe('gemini-2.0-flash-exp');
    });

    it('should load stored API key during initialization', async () => {
      const testApiKey = 'AIza-test-key';

      // Mock storage to return saved config
      vi.spyOn(mockStorage, 'get').mockResolvedValue({
        apiKey: testApiKey,
        model: 'gemini-1.5-pro',
      });

      await webConfig.initialize();

      expect(webConfig.getWebApiKey()).toBe(testApiKey);
      expect(webConfig.getModel()).toBe('gemini-1.5-pro');
      expect(webConfig.isWebConfigured()).toBe(true);
    });
  });

  describe('API key management', () => {
    beforeEach(async () => {
      await webConfig.initialize();
    });

    it('should set and save API key', async () => {
      const testApiKey = 'AIza-test-key';
      const setSpy = vi.spyOn(mockStorage, 'set').mockResolvedValue();

      await webConfig.setWebApiKey(testApiKey);

      expect(webConfig.getWebApiKey()).toBe(testApiKey);
      expect(webConfig.isWebConfigured()).toBe(true);
      expect(setSpy).toHaveBeenCalledWith(
        'config',
        expect.objectContaining({
          apiKey: testApiKey,
        }),
      );
    });

    it('should clear API key configuration', async () => {
      await webConfig.setWebApiKey('test-key');
      expect(webConfig.isWebConfigured()).toBe(true);

      const deleteSpy = vi.spyOn(mockStorage, 'delete').mockResolvedValue();

      await webConfig.clearWebConfiguration();

      expect(webConfig.getWebApiKey()).toBeNull();
      expect(webConfig.isWebConfigured()).toBe(false);
      expect(deleteSpy).toHaveBeenCalledWith('config');
    });
  });

  describe('model management', () => {
    beforeEach(async () => {
      await webConfig.initialize();
    });

    it('should set model and save to storage', async () => {
      const testModel = 'gemini-1.5-pro';
      const setSpy = vi.spyOn(mockStorage, 'set').mockResolvedValue();

      webConfig.setModel(testModel);

      expect(webConfig.getModel()).toBe(testModel);
      // Note: saveWebSettings is called asynchronously
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setSpy).toHaveBeenCalled();
    });
  });

  describe('configuration status', () => {
    beforeEach(async () => {
      await webConfig.initialize();
    });

    it('should provide comprehensive status', () => {
      const status = webConfig.getWebConfigStatus();

      expect(status).toHaveProperty('configured');
      expect(status).toHaveProperty('hasApiKey');
      expect(status).toHaveProperty('model');
      expect(status).toHaveProperty('workspaceRoot');
      expect(status.workspaceRoot).toBe('/test-workspace');
    });

    it('should provide Gemini client config when configured', async () => {
      const testApiKey = 'AIza-test-key';
      await webConfig.setWebApiKey(testApiKey);

      const geminiConfig = webConfig.getWebGeminiClientConfig();

      expect(geminiConfig.apiKey).toBe(testApiKey);
      expect(geminiConfig.model).toBe(webConfig.getModel());
    });

    it('should throw error for Gemini client config when not configured', () => {
      expect(() => webConfig.getWebGeminiClientConfig()).toThrow(
        'API key not configured',
      );
    });
  });

  describe('service integration', () => {
    beforeEach(async () => {
      await webConfig.initialize();
    });

    it('should provide access to workspace context', () => {
      const workspace = webConfig.getWorkspaceContext();
      expect(workspace).toBe(mockWorkspace);
    });

    it('should provide access to file system service', () => {
      const fileSystem = webConfig.getFileSystemService();
      expect(fileSystem).toBe(mockFileSystem);
    });
  });

  describe('default settings', () => {
    beforeEach(async () => {
      await webConfig.initialize();
    });

    it('should have web-appropriate default settings', () => {
      expect(webConfig.getTelemetryEnabled()).toBe(false);
      expect(webConfig.getTelemetryLogPromptsEnabled()).toBe(false);
      expect(webConfig.getApprovalMode()).toBe('default');
      expect(webConfig.getMcpServers()).toBeUndefined();
    });

    it('should provide accessibility settings', () => {
      const accessibility = webConfig.getAccessibility();
      expect(accessibility).toHaveProperty('disableLoadingPhrases');
    });

    it('should provide session ID', () => {
      const sessionId = webConfig.getSessionId();
      expect(sessionId).toBe('test-session-id');
    });
  });
});
