/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebGeminiService } from '../platform/gemini.js';
import { opfsAdapter } from '../platform/opfs-fs.js';

// Mock @google/genai
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    },
  })),
}));

// Mock OPFS adapter
vi.mock('../platform/opfs-fs.js', () => ({
  opfsAdapter: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
}));

// Mock retry functionality
vi.mock('../platform/retry.js', () => ({
  createGeminiRetrier: () => (fn: () => Promise<any>) => fn(),
  webRetryWithBackoff: (fn: () => Promise<any>) => fn(),
}));

// Mock tools
vi.mock('../platform/tools.js', () => ({
  webToolRegistry: {
    getToolDefinitions: vi.fn(() => [
      {
        name: 'test_tool',
        description: 'Test tool',
        parameters: [{ name: 'param', type: 'string', required: true }],
      },
    ]),
    executeTool: vi.fn(() => Promise.resolve({
      success: true,
      content: 'Tool executed successfully',
    })),
  },
}));

describe('WebGeminiService (Enhanced)', () => {
  let service: WebGeminiService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new WebGeminiService();
    
    // Reset the mock functions
    mockGenerateContent.mockReset();
    mockGenerateContentStream.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization with validation', () => {
    it('should validate API key format', async () => {
      await expect(service.initialize('')).rejects.toThrow('Invalid API key');
      await expect(service.initialize('short')).rejects.toThrow('too short');
      await expect(service.initialize('invalid@key')).rejects.toThrow('invalid characters');
    });

    it('should handle connection test failures', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('401 Unauthorized'));
      
      await expect(service.initialize('invalid-api-key-12345')).rejects.toThrow();
      expect(service.isConfigured()).toBe(false);
    });
  });

  describe('model management', () => {
    it('should list available models', () => {
      const models = service.getAvailableModels();
      
      expect(models).toContain('gemini-2.5-flash');
      expect(models).toContain('gemini-2.5-pro');
      expect(models).toContain('gemini-1.5-flash');
      expect(models).toContain('gemini-1.5-pro');
    });

    it('should set valid models', () => {
      expect(() => service.setModel('gemini-2.5-pro')).not.toThrow();
      expect(service.getStatus().model).toBe('gemini-2.5-pro');
    });

    it('should reject invalid models', () => {
      expect(() => service.setModel('invalid-model')).toThrow('Unsupported model');
    });
  });
});