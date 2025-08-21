/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import { XtermHost } from '../terminal/XtermHost.js';
import { opfsAdapter } from './opfs-fs.js';

export interface GeminiResponse {
  text: string;
  finishReason?: string;
}

/**
 * Simple web-compatible Gemini service
 */
export class WebGeminiService {
  private client: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private model = 'gemini-2.5-flash';

  /**
   * Initialize the Gemini client with API key
   */
  async initialize(apiKey: string): Promise<void> {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Send a prompt to Gemini and get response
   */
  async sendPrompt(
    prompt: string,
    context?: {
      workingDirectory?: string;
      terminal?: XtermHost;
    }
  ): Promise<GeminiResponse> {
    if (!this.client) {
      throw new Error('Gemini client not initialized');
    }

    try {
      // Add context if provided
      let enhancedPrompt = prompt;
      if (context?.workingDirectory) {
        enhancedPrompt = `Working directory: ${context.workingDirectory}\n\n${prompt}`;
      }

      // Stream the response if terminal is provided
      if (context?.terminal) {
        const result = await this.client.models.generateContentStream({
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
        });

        let fullText = '';
        let lastResponse: Awaited<ReturnType<typeof result.next>>['value'] | null = null;
        for await (const chunk of result) {
          const text = chunk.text;
          if (text) {
            fullText += text;
            context.terminal.print(text);
          }
          lastResponse = chunk;
        }

        return {
          text: fullText,
          finishReason: lastResponse?.candidates?.[0]?.finishReason,
        };
      } else {
        // Non-streaming response
        const result = await this.client.models.generateContent({
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
        });

        return {
          text: result.text || '',
          finishReason: result.candidates?.[0]?.finishReason,
        };
      }
    } catch (error) {
      throw new Error(`Gemini API error: ${error}`);
    }
  }

  /**
   * Send a prompt with file context
   */
  async sendPromptWithContext(
    prompt: string,
    filePaths: string[],
    context?: {
      workingDirectory?: string;
      terminal?: XtermHost;
    }
  ): Promise<GeminiResponse> {
    let contextualPrompt = prompt + '\n\nFile contents:\n\n';

    // Add file contents to prompt
    for (const filePath of filePaths.slice(0, 10)) { // Limit to 10 files
      try {
        const fullPath = context?.workingDirectory 
          ? `${context.workingDirectory}/${filePath}`.replace(/\/+/g, '/')
          : filePath;
        
        const content = await opfsAdapter.readFile(fullPath, { encoding: 'utf8' }) as string;
        contextualPrompt += `--- ${filePath} ---\n${content}\n\n`;
      } catch (error) {
        contextualPrompt += `--- ${filePath} ---\n[Error reading file: ${error}]\n\n`;
      }
    }

    return this.sendPrompt(contextualPrompt, context);
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  /**
   * Configure API key
   */
  async configureApiKey(apiKey: string): Promise<void> {
    await this.initialize(apiKey);
    
    // Save to persistent storage
    try {
      await opfsAdapter.mkdir('/workspace/.gemini', { recursive: true });
      const settings = { apiKey, model: this.model };
      await opfsAdapter.writeFile('/workspace/.gemini/settings.json', JSON.stringify(settings, null, 2));
    } catch (error) {
      console.warn('Failed to save API key:', error);
    }
  }

  /**
   * Load API key from storage
   */
  async loadFromStorage(): Promise<void> {
    try {
      const settingsData = await opfsAdapter.readFile('/workspace/.gemini/settings.json', { encoding: 'utf8' }) as string;
      const settings = JSON.parse(settingsData);
      
      if (settings.apiKey) {
        await this.initialize(settings.apiKey);
        if (settings.model) {
          this.model = settings.model;
        }
      }
    } catch {
      // Settings don't exist, that's OK
    }
  }

  /**
   * Get current configuration status
   */
  getStatus(): {
    configured: boolean;
    model: string;
  } {
    return {
      configured: this.isConfigured(),
      model: this.model,
    };
  }
}

// Export singleton instance
export const geminiService = new WebGeminiService();