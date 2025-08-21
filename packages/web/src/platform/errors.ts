/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error handling utilities for web Gemini integration
 */

export interface GeminiApiError {
  error: {
    code: number;
    message: string;
    status: string;
  };
}

export interface WebGeminiError extends Error {
  status?: number;
  code?: number;
  retryable?: boolean;
}

/**
 * Parse and format API errors for user-friendly display
 */
export function parseGeminiError(error: unknown): {
  message: string;
  retryable: boolean;
  status?: number;
} {
  if (error instanceof Error) {
    const webError = error as WebGeminiError;
    
    // Handle known error patterns
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return {
        message: 'Invalid API key. Please check your Gemini API key and try again.',
        retryable: false,
        status: 401,
      };
    }
    
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return {
        message: 'Access denied. Your API key may not have sufficient permissions.',
        retryable: false,
        status: 403,
      };
    }
    
    if (error.message.includes('429') || error.message.includes('quota')) {
      return {
        message: 'Rate limit exceeded. Please wait a moment and try again.',
        retryable: true,
        status: 429,
      };
    }
    
    if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
      return {
        message: 'Gemini API server error. Please try again in a moment.',
        retryable: true,
        status: 500,
      };
    }
    
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return {
        message: 'Network error. Please check your internet connection and try again.',
        retryable: true,
      };
    }
    
    // Try to parse structured error response
    try {
      const jsonMatch = error.message.match(/\{.*\}/);
      if (jsonMatch) {
        const errorData = JSON.parse(jsonMatch[0]) as GeminiApiError;
        if (errorData.error) {
          return {
            message: `API Error (${errorData.error.code}): ${errorData.error.message}`,
            retryable: errorData.error.code >= 500 || errorData.error.code === 429,
            status: errorData.error.code,
          };
        }
      }
    } catch {
      // Failed to parse JSON, continue with original error
    }
    
    return {
      message: error.message,
      retryable: webError.retryable ?? false,
      status: webError.status ?? webError.code,
    };
  }
  
  return {
    message: 'An unknown error occurred',
    retryable: false,
  };
}

/**
 * Create a user-friendly error message with retry suggestions
 */
export function formatErrorForUser(error: unknown): string {
  const parsed = parseGeminiError(error);
  
  let message = `❌ ${parsed.message}`;
  
  if (parsed.retryable) {
    message += '\n\n💡 This error might be temporary. You can try again.';
  } else if (parsed.status === 401 || parsed.status === 403) {
    message += '\n\n💡 Check your API key configuration with `/config`.';
  }
  
  return message;
}

/**
 * Validate API key format
 */
export function validateApiKey(apiKey: string): { valid: boolean; message?: string } {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      valid: false,
      message: 'API key cannot be empty',
    };
  }
  
  if (apiKey.length < 10) {
    return {
      valid: false,
      message: 'API key appears to be too short',
    };
  }
  
  // Basic format check for Gemini API keys (they typically start with certain patterns)
  if (!apiKey.match(/^[A-Za-z0-9_-]+$/)) {
    return {
      valid: false,
      message: 'API key contains invalid characters',
    };
  }
  
  return { valid: true };
}

/**
 * Create a WebGeminiError with additional metadata
 */
export function createWebGeminiError(
  message: string,
  status?: number,
  retryable?: boolean
): WebGeminiError {
  const error = new Error(message) as WebGeminiError;
  error.name = 'WebGeminiError';
  error.status = status;
  error.retryable = retryable;
  return error;
}