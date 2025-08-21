/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Web-adapted retry logic for Gemini API calls
 * Based on packages/core/src/utils/retry.ts but adapted for web environment
 */

export interface WebRetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface WebHttpError extends Error {
  status?: number;
  code?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<WebRetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  shouldRetry: defaultShouldRetry,
  onRetry: () => {},
};

/**
 * Default retry predicate for web environment
 */
function defaultShouldRetry(error: Error): boolean {
  const webError = error as WebHttpError;

  // Retry on network errors
  if (error.message.includes('fetch') || error.message.includes('network')) {
    return true;
  }

  // Retry on 429 (rate limit) - check both status/code properties and message
  if (
    webError.status === 429 ||
    webError.code === 429 ||
    error.message.includes('429')
  ) {
    return true;
  }

  // Retry on 5xx server errors - check both status/code properties and message
  if (
    (webError.status && webError.status >= 500) ||
    (webError.code && webError.code >= 500) ||
    error.message.match(/5\d{2}/)
  ) {
    return true;
  }

  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  // Exponential backoff: delay = initialDelay * (2 ^ (attempt - 1))
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt - 1);

  // Add jitter (random factor between 0.5 and 1.5)
  const jitter = 0.5 + Math.random();
  const delayWithJitter = exponentialDelay * jitter;

  // Cap at maxDelayMs
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Retry function with exponential backoff for web environment
 */
export async function webRetryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<WebRetryOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if this is the last attempt
      if (attempt === opts.maxAttempts) {
        throw lastError;
      }

      // Check if we should retry this error
      if (!opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Notify about retry
      opts.onRetry(attempt, lastError);

      // Calculate delay and wait
      const delay = calculateDelay(
        attempt,
        opts.initialDelayMs,
        opts.maxDelayMs,
      );
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Create a retry function with specific options
 */
export function createWebRetrier(options: Partial<WebRetryOptions>) {
  return function retryFn<T>(fn: () => Promise<T>): Promise<T> {
    return webRetryWithBackoff(fn, options);
  };
}

/**
 * Specialized retry for Gemini API calls
 */
export function createGeminiRetrier(
  onRetry?: (attempt: number, error: Error) => void,
) {
  return createWebRetrier({
    maxAttempts: 5,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    shouldRetry: (error: Error) => {
      // Don't retry auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }

      // Don't retry bad request errors
      if (error.message.includes('400')) {
        return false;
      }

      // Retry rate limits and server errors
      return defaultShouldRetry(error);
    },
    onRetry: onRetry || (() => {}),
  });
}
