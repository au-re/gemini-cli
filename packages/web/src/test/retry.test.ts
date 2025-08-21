/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { webRetryWithBackoff, createGeminiRetrier } from '../platform/retry.js';

describe('Web Retry Logic', () => {
  describe('webRetryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await webRetryWithBackoff(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 rate limit'))
        .mockResolvedValue('success');

      const result = await webRetryWithBackoff(mockFn, {
        initialDelayMs: 10, // Very short delay for testing
        maxAttempts: 3,
      });

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('400 bad request'));

      await expect(webRetryWithBackoff(mockFn)).rejects.toThrow(
        '400 bad request',
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should respect maxAttempts', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('500 server error'));

      await expect(
        webRetryWithBackoff(mockFn, {
          maxAttempts: 2,
          initialDelayMs: 10, // Very short delay for testing
        }),
      ).rejects.toThrow('500 server error');

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should call onRetry callback', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('429 rate limit'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await webRetryWithBackoff(mockFn, {
        initialDelayMs: 10, // Very short delay for testing
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });
  });

  describe('createGeminiRetrier', () => {
    it('should create retrier with Gemini-specific settings', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const onRetry = vi.fn();

      const retrier = createGeminiRetrier(onRetry);
      const result = await retrier(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should not retry auth errors', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('401 unauthorized'));
      const retrier = createGeminiRetrier();

      await expect(retrier(mockFn)).rejects.toThrow('401 unauthorized');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry server errors', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('500 server error'))
        .mockResolvedValue('success');

      const retrier = createGeminiRetrier();

      const result = await retrier(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    }, 10000); // Increase timeout for retry test
  });
});
