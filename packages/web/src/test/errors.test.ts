/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseGeminiError,
  formatErrorForUser,
  validateApiKey,
  createWebGeminiError,
} from '../platform/errors.js';

describe('Web Error Handling', () => {
  describe('parseGeminiError', () => {
    it('should parse 401 unauthorized errors', () => {
      const error = new Error('401 Unauthorized');

      const result = parseGeminiError(error);

      expect(result.message).toBe(
        'Invalid API key. Please check your Gemini API key and try again.',
      );
      expect(result.retryable).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should parse 429 rate limit errors', () => {
      const error = new Error('429 quota exceeded');

      const result = parseGeminiError(error);

      expect(result.message).toBe(
        'Rate limit exceeded. Please wait a moment and try again.',
      );
      expect(result.retryable).toBe(true);
      expect(result.status).toBe(429);
    });

    it('should parse 500 server errors', () => {
      const error = new Error('500 Internal Server Error');

      const result = parseGeminiError(error);

      expect(result.message).toBe(
        'Gemini API server error. Please try again in a moment.',
      );
      expect(result.retryable).toBe(true);
      expect(result.status).toBe(500);
    });

    it('should parse network errors', () => {
      const error = new Error('fetch failed');

      const result = parseGeminiError(error);

      expect(result.message).toBe(
        'Network error. Please check your internet connection and try again.',
      );
      expect(result.retryable).toBe(true);
    });

    it('should parse JSON error responses', () => {
      const error = new Error(
        'API error: {"error":{"code":400,"message":"Invalid request"}}',
      );

      const result = parseGeminiError(error);

      expect(result.message).toBe('API Error (400): Invalid request');
      expect(result.retryable).toBe(false);
      expect(result.status).toBe(400);
    });

    it('should handle unknown errors gracefully', () => {
      const error = new Error('Unknown error');

      const result = parseGeminiError(error);

      expect(result.message).toBe('Unknown error');
      expect(result.retryable).toBe(false);
    });

    it('should handle non-Error objects', () => {
      const error = 'string error';

      const result = parseGeminiError(error);

      expect(result.message).toBe('An unknown error occurred');
      expect(result.retryable).toBe(false);
    });
  });

  describe('formatErrorForUser', () => {
    it('should format retryable errors with suggestions', () => {
      const error = new Error('500 server error');

      const result = formatErrorForUser(error);

      expect(result).toContain('❌');
      expect(result).toContain('This error might be temporary');
    });

    it('should format auth errors with configuration suggestion', () => {
      const error = new Error('401 unauthorized');

      const result = formatErrorForUser(error);

      expect(result).toContain('❌');
      expect(result).toContain('Check your API key configuration');
    });

    it('should format non-retryable errors without retry suggestion', () => {
      const error = new Error('400 bad request');

      const result = formatErrorForUser(error);

      expect(result).toContain('❌');
      expect(result).not.toContain('try again');
    });
  });

  describe('validateApiKey', () => {
    it('should accept valid API keys', () => {
      const result = validateApiKey('AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567');

      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it('should reject empty API keys', () => {
      const result = validateApiKey('');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key cannot be empty');
    });

    it('should reject whitespace-only API keys', () => {
      const result = validateApiKey('   ');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key cannot be empty');
    });

    it('should reject too short API keys', () => {
      const result = validateApiKey('short');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key appears to be too short');
    });

    it('should reject API keys with invalid characters', () => {
      const result = validateApiKey('invalid@key!with#special$chars');

      expect(result.valid).toBe(false);
      expect(result.message).toBe('API key contains invalid characters');
    });

    it('should accept API keys with valid characters', () => {
      const result = validateApiKey('Valid_API-Key123');

      expect(result.valid).toBe(true);
    });
  });

  describe('createWebGeminiError', () => {
    it('should create error with all properties', () => {
      const error = createWebGeminiError('Test message', 429, true);

      expect(error.message).toBe('Test message');
      expect(error.name).toBe('WebGeminiError');
      expect(error.status).toBe(429);
      expect(error.retryable).toBe(true);
    });

    it('should create error with minimal properties', () => {
      const error = createWebGeminiError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.name).toBe('WebGeminiError');
      expect(error.status).toBeUndefined();
      expect(error.retryable).toBeUndefined();
    });
  });
});
