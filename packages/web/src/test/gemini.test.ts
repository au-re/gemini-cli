/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGeminiService } from '../platform/gemini.js';
import { opfsAdapter } from '../platform/opfs-fs.js';

// Mock @google/genai
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    }),
  })),
}));

// Mock OPFS adapter
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

describe('WebGeminiService', () => {
  let service: WebGeminiService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new WebGeminiService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should not be configured initially', () => {
      expect(service.isConfigured()).toBe(false);
    });

    it('should initialize with API key', async () => {
      await service.initialize('test-api-key');
      
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should configure API key and persist settings', async () => {
      const testKey = 'test-api-key';
      
      await service.configureApiKey(testKey);
      
      expect(service.isConfigured()).toBe(true);
      expect(opfsAdapter.mkdir).toHaveBeenCalledWith('/workspace/.gemini', { recursive: true });
      expect(opfsAdapter.writeFile).toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should return correct status', () => {
      const status = service.getStatus();
      
      expect(status).toEqual({
        configured: false,
        model: 'gemini-2.5-flash',
      });
    });

    it('should return configured status after initialization', async () => {
      await service.initialize('test-key');
      
      const status = service.getStatus();
      
      expect(status.configured).toBe(true);
      expect(status.model).toBe('gemini-2.5-flash');
    });
  });

  describe('loadFromStorage', () => {
    it('should load settings from storage', async () => {
      const mockSettings = {
        apiKey: 'saved-key',
        model: 'gemini-2.5-pro',
      };

      vi.mocked(opfsAdapter.readFile).mockResolvedValueOnce(JSON.stringify(mockSettings));
      
      await service.loadFromStorage();
      
      expect(service.isConfigured()).toBe(true);
      expect(opfsAdapter.readFile).toHaveBeenCalledWith('/workspace/.gemini/settings.json', { encoding: 'utf8' });
    });

    it('should handle missing settings file gracefully', async () => {
      vi.mocked(opfsAdapter.readFile).mockRejectedValueOnce(new Error('File not found'));
      
      await service.loadFromStorage();
      
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('sendPrompt', () => {
    it('should throw error when not initialized', async () => {
      await expect(service.sendPrompt('test prompt')).rejects.toThrow('Gemini client not initialized');
    });
  });
});