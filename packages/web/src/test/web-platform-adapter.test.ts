/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebPlatformAdapter, initializeWebPlatform, webPlatformAdapter } from '../platform/web-platform-adapter.js';

// Mock the browser environment
vi.stubGlobal('window', { document: {} });
vi.stubGlobal('navigator', { 
  storage: { getDirectory: vi.fn() },
  userAgent: 'test-browser'
});
vi.stubGlobal('globalThis', { isSecureContext: true });

describe('Web Platform Adapter Integration', () => {
  let adapter: WebPlatformAdapter;

  beforeEach(async () => {
    adapter = new WebPlatformAdapter();
  });

  afterEach(() => {
    if (adapter) {
      adapter.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await adapter.initialize();
      
      const status = adapter.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.platform.platform).toBe('browser');
      expect(status.config).toBeDefined();
      expect(status.workspace).toBeDefined();
      expect(status.gemini).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      await adapter.initialize();
      const firstStatus = adapter.getStatus();
      
      await adapter.initialize();
      const secondStatus = adapter.getStatus();
      
      expect(firstStatus).toEqual(secondStatus);
    });

    it('should throw error if not initialized when accessing services', () => {
      expect(() => adapter.getConfig()).toThrow('WebPlatformAdapter not initialized');
      expect(() => adapter.getFileSystemService()).toThrow('WebPlatformAdapter not initialized');
      expect(() => adapter.getWorkspaceContext()).toThrow('WebPlatformAdapter not initialized');
      expect(() => adapter.getStorage()).toThrow('WebPlatformAdapter not initialized');
      expect(() => adapter.getGeminiClient()).toThrow('WebPlatformAdapter not initialized');
    });
  });

  describe('service access', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should provide access to all core services', () => {
      expect(adapter.getConfig()).toBeDefined();
      expect(adapter.getFileSystemService()).toBeDefined();
      expect(adapter.getWorkspaceContext()).toBeDefined();
      expect(adapter.getStorage()).toBeDefined();
      expect(adapter.getGeminiClient()).toBeDefined();
    });

    it('should provide consistent service instances', () => {
      const config1 = adapter.getConfig();
      const config2 = adapter.getConfig();
      expect(config1).toBe(config2);

      const fs1 = adapter.getFileSystemService();
      const fs2 = adapter.getFileSystemService();
      expect(fs1).toBe(fs2);
    });
  });

  describe('API key configuration', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should configure API key successfully', async () => {
      const testApiKey = 'AIza-test-key';
      
      await adapter.configureApiKey(testApiKey);
      
      const config = adapter.getConfig();
      expect(config.getWebApiKey()).toBe(testApiKey);
      expect(config.isWebConfigured()).toBe(true);
    });

    it('should update Gemini client when API key is configured', async () => {
      const testApiKey = 'AIza-test-key';
      
      const geminiClient = adapter.getGeminiClient();
      const statusBefore = geminiClient.getStatus();
      expect(statusBefore.configured).toBe(false);
      
      await adapter.configureApiKey(testApiKey);
      
      const statusAfter = geminiClient.getStatus();
      expect(statusAfter.configured).toBe(true);
      expect(statusAfter.hasApiKey).toBe(true);
    });
  });

  describe('configuration testing', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should report configuration status', async () => {
      const testResult = await adapter.testConfiguration();
      
      expect(testResult).toHaveProperty('success');
      expect(testResult).toHaveProperty('details');
      expect(testResult.details).toHaveProperty('platform');
      expect(testResult.details).toHaveProperty('config');
      expect(testResult.details).toHaveProperty('gemini');
    });

    it('should fail test without API key', async () => {
      const testResult = await adapter.testConfiguration();
      
      expect(testResult.success).toBe(false);
      expect(testResult.error).toBeDefined();
    });
  });

  describe('reset functionality', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should reset configuration and reinitialize', async () => {
      const testApiKey = 'AIza-test-key';
      await adapter.configureApiKey(testApiKey);
      
      expect(adapter.getConfig().isWebConfigured()).toBe(true);
      
      await adapter.reset();
      
      expect(adapter.getConfig().isWebConfigured()).toBe(false);
      expect(adapter.getStatus().initialized).toBe(true);
    });
  });

  describe('disposal', () => {
    beforeEach(async () => {
      await adapter.initialize();
    });

    it('should dispose resources properly', () => {
      adapter.dispose();
      
      const status = adapter.getStatus();
      expect(status.initialized).toBe(false);
      expect(status.config).toBeNull();
      expect(status.workspace).toBeNull();
      expect(status.gemini).toBeNull();
    });
  });
});

describe('Global Web Platform Adapter', () => {
  afterEach(() => {
    webPlatformAdapter.dispose();
  });

  it('should initialize global adapter', async () => {
    await webPlatformAdapter.initialize();
    
    const status = webPlatformAdapter.getStatus();
    expect(status.initialized).toBe(true);
  });

  it('should use convenience initialization function', async () => {
    const adapter = await initializeWebPlatform({
      workspaceRoot: '/test-workspace',
      storageBasePath: '/test-storage',
    });
    
    expect(adapter).toBe(webPlatformAdapter);
    
    const workspace = adapter.getWorkspaceContext();
    expect(workspace.getWorkingDirectory()).toBe('/test-workspace');
  });
});