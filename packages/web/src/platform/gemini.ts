/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, FunctionCall, Part, Content } from '@google/genai';
import { XtermHost } from '../terminal/XtermHost.js';
import { opfsAdapter } from './opfs-fs.js';
import { createGeminiRetrier, webRetryWithBackoff } from './retry.js';
import { parseGeminiError, formatErrorForUser, validateApiKey, createWebGeminiError } from './errors.js';
import { webToolRegistry, ToolCall, ToolResult, ToolExecutionContext } from './tools.js';

export interface GeminiResponse {
  text: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
}

export interface StreamingOptions {
  onProgress?: (chunk: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
}

/**
 * Enhanced web-compatible Gemini service with tool support and retry logic
 */
export class WebGeminiService {
  private client: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private model = 'gemini-2.5-flash';
  private retrier = createGeminiRetrier((attempt, error) => {
    console.warn(`Gemini API retry attempt ${attempt}:`, error.message);
  });

  /**
   * Initialize the Gemini client with API key and validation
   */
  async initialize(apiKey: string): Promise<void> {
    // Validate API key format
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      throw createWebGeminiError(`Invalid API key: ${validation.message}`, 400, false);
    }

    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
    
    // Test the connection with a simple request
    try {
      await this.testConnection();
    } catch (error) {
      this.client = null;
      this.apiKey = null;
      throw error;
    }
  }

  /**
   * Test API connection with a minimal request
   */
  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw createWebGeminiError('Client not initialized', 500, false);
    }

    try {
      await this.retrier(async () => {
        const result = await this.client!.models.generateContent({
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        });
        
        if (!result.text) {
          throw createWebGeminiError('Invalid response from API', 500, true);
        }
      });
    } catch (error) {
      const parsed = parseGeminiError(error);
      throw createWebGeminiError(parsed.message, parsed.status, parsed.retryable);
    }
  }

  /**
   * Send a prompt to Gemini with enhanced error handling and tool support
   */
  async sendPrompt(
    prompt: string,
    context?: {
      workingDirectory?: string;
      terminal?: XtermHost;
      enableTools?: boolean;
    }
  ): Promise<GeminiResponse> {
    if (!this.client) {
      throw createWebGeminiError('Gemini client not initialized. Please configure your API key first.', 400, false);
    }

    try {
      return await this.retrier(async () => {
        // Add context if provided
        let enhancedPrompt = prompt;
        if (context?.workingDirectory) {
          enhancedPrompt = `Working directory: ${context.workingDirectory}\n\n${prompt}`;
        }

        const requestParams: any = {
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
        };

        // Add tools if enabled
        if (context?.enableTools) {
          const toolDefinitions = webToolRegistry.getToolDefinitions();
          if (toolDefinitions.length > 0) {
            requestParams.tools = [{
              function_declarations: toolDefinitions.map(tool => ({
                name: tool.name,
                description: tool.description,
                parameters: {
                  type: 'object',
                  properties: tool.parameters.reduce((props, param) => {
                    props[param.name] = {
                      type: param.type,
                      description: param.description,
                    };
                    return props;
                  }, {} as any),
                  required: tool.parameters.filter(p => p.required).map(p => p.name),
                },
              })),
            }];
          }
        }

        const result = await this.client!.models.generateContent(requestParams);

        // Handle tool calls
        const toolCalls = this.extractToolCalls(result.candidates?.[0]?.content);
        if (toolCalls.length > 0 && context?.enableTools) {
          const toolResults = await this.executeTools(toolCalls, {
            workingDirectory: context.workingDirectory || '/workspace',
            terminal: context.terminal,
          });
          
          // Continue conversation with tool results
          const followUpResult = await this.handleToolResults(requestParams, toolCalls, toolResults);
          return {
            text: followUpResult.text || '',
            finishReason: followUpResult.candidates?.[0]?.finishReason,
            toolCalls,
          };
        }

        return {
          text: result.text || '',
          finishReason: result.candidates?.[0]?.finishReason,
          toolCalls,
        };
      });
    } catch (error) {
      const formatted = formatErrorForUser(error);
      if (context?.terminal) {
        context.terminal.print(`\n${formatted}\n`);
      }
      throw createWebGeminiError(formatted, undefined, parseGeminiError(error).retryable);
    }
  }

  /**
   * Send a prompt with streaming response and enhanced features
   */
  async sendPromptStream(
    prompt: string,
    context: {
      workingDirectory?: string;
      terminal: XtermHost;
      enableTools?: boolean;
    },
    options?: StreamingOptions
  ): Promise<GeminiResponse> {
    if (!this.client) {
      throw createWebGeminiError('Gemini client not initialized', 400, false);
    }

    try {
      return await this.retrier(async () => {
        let enhancedPrompt = prompt;
        if (context.workingDirectory) {
          enhancedPrompt = `Working directory: ${context.workingDirectory}\n\n${prompt}`;
        }

        const requestParams: any = {
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: enhancedPrompt }] }],
        };

        // Add tools if enabled
        if (context.enableTools) {
          const toolDefinitions = webToolRegistry.getToolDefinitions();
          if (toolDefinitions.length > 0) {
            requestParams.tools = [{
              function_declarations: toolDefinitions.map(tool => ({
                name: tool.name,
                description: tool.description,
                parameters: {
                  type: 'object',
                  properties: tool.parameters.reduce((props, param) => {
                    props[param.name] = {
                      type: param.type,
                      description: param.description,
                    };
                    return props;
                  }, {} as any),
                  required: tool.parameters.filter(p => p.required).map(p => p.name),
                },
              })),
            }];
          }
        }

        const result = await this.client!.models.generateContentStream(requestParams);

        let fullText = '';
        let lastResponse: any = null;
        let toolCalls: ToolCall[] = [];

        for await (const chunk of result) {
          const text = chunk.text;
          if (text) {
            fullText += text;
            context.terminal.print(text);
            options?.onProgress?.(text);
          }
          
          // Check for tool calls in this chunk
          const chunkToolCalls = this.extractToolCalls(chunk.candidates?.[0]?.content);
          if (chunkToolCalls.length > 0) {
            toolCalls.push(...chunkToolCalls);
            chunkToolCalls.forEach(toolCall => options?.onToolCall?.(toolCall));
          }
          
          lastResponse = chunk;
        }

        // Execute tools if any were called
        if (toolCalls.length > 0 && context.enableTools) {
          context.terminal.print('\n\n🛠️ Executing tools...\n');
          
          const toolResults = await this.executeTools(toolCalls, {
            workingDirectory: context.workingDirectory || '/workspace',
            terminal: context.terminal,
          });

          // Notify about tool results
          toolResults.forEach(result => options?.onToolResult?.(result));

          // Continue conversation with tool results
          const followUpResult = await this.handleToolResults(requestParams, toolCalls, toolResults);
          
          if (followUpResult.text) {
            context.terminal.print(followUpResult.text);
            fullText += followUpResult.text;
          }
        }

        return {
          text: fullText,
          finishReason: lastResponse?.candidates?.[0]?.finishReason,
          toolCalls,
        };
      });
    } catch (error) {
      const formatted = formatErrorForUser(error);
      context.terminal.print(`\n${formatted}\n`);
      throw createWebGeminiError(formatted, undefined, parseGeminiError(error).retryable);
    }
  }

  /**
   * Extract tool calls from response content
   */
  private extractToolCalls(content?: Content): ToolCall[] {
    if (!content?.parts) return [];

    const toolCalls: ToolCall[] = [];
    
    for (const part of content.parts) {
      if ('functionCall' in part && part.functionCall) {
        const functionCall = part.functionCall as FunctionCall;
        toolCalls.push({
          name: functionCall.name,
          parameters: functionCall.args || {},
        });
      }
    }

    return toolCalls;
  }

  /**
   * Execute tool calls
   */
  private async executeTools(toolCalls: ToolCall[], context: ToolExecutionContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      if (context.terminal) {
        context.terminal.print(`  • ${toolCall.name}(${JSON.stringify(toolCall.parameters)})\n`);
      }

      try {
        const result = await webToolRegistry.executeTool(toolCall, context);
        results.push(result);

        if (result.success && context.terminal) {
          context.terminal.print(`    ✅ ${result.content}\n`);
        } else if (!result.success && context.terminal) {
          context.terminal.print(`    ❌ ${result.error}\n`);
        }
      } catch (error) {
        const errorResult: ToolResult = {
          success: false,
          content: '',
          error: error instanceof Error ? error.message : String(error),
        };
        results.push(errorResult);
        
        if (context.terminal) {
          context.terminal.print(`    ❌ ${errorResult.error}\n`);
        }
      }
    }

    return results;
  }

  /**
   * Handle tool results and continue conversation
   */
  private async handleToolResults(
    originalRequest: any,
    toolCalls: ToolCall[],
    toolResults: ToolResult[]
  ): Promise<any> {
    // Create function response parts
    const functionResponseParts: Part[] = toolResults.map((result, index) => ({
      functionResponse: {
        name: toolCalls[index].name,
        response: {
          success: result.success,
          content: result.content,
          error: result.error,
        },
      },
    }));

    // Continue conversation with tool results
    const continueRequest = {
      ...originalRequest,
      contents: [
        ...originalRequest.contents,
        { role: 'model', parts: toolCalls.map(call => ({ functionCall: { name: call.name, args: call.parameters } })) },
        { role: 'user', parts: functionResponseParts },
      ],
    };

    return await this.client!.models.generateContent(continueRequest);
  }
  /**
   * Send a prompt with file context (enhanced version)
   */
  async sendPromptWithContext(
    prompt: string,
    filePaths: string[],
    context?: {
      workingDirectory?: string;
      terminal?: XtermHost;
      enableTools?: boolean;
    }
  ): Promise<GeminiResponse> {
    let contextualPrompt = prompt + '\n\nFile contents:\n\n';

    // Add file contents to prompt with better error handling
    const maxFiles = 10;
    const filesToProcess = filePaths.slice(0, maxFiles);
    
    if (filePaths.length > maxFiles) {
      contextualPrompt += `Note: Only showing first ${maxFiles} of ${filePaths.length} files.\n\n`;
    }

    for (const filePath of filesToProcess) {
      try {
        const fullPath = context?.workingDirectory 
          ? `${context.workingDirectory}/${filePath}`.replace(/\/+/g, '/')
          : filePath;
        
        const content = await opfsAdapter.readFile(fullPath, { encoding: 'utf8' }) as string;
        
        // Limit content size to prevent overwhelming the API
        const maxContentLength = 10000;
        const truncatedContent = content.length > maxContentLength 
          ? content.substring(0, maxContentLength) + '\n\n[... content truncated ...]'
          : content;
          
        contextualPrompt += `--- ${filePath} ---\n${truncatedContent}\n\n`;
      } catch (error) {
        contextualPrompt += `--- ${filePath} ---\n[Error reading file: ${error instanceof Error ? error.message : String(error)}]\n\n`;
      }
    }

    // Use streaming version if terminal is provided
    if (context?.terminal) {
      return this.sendPromptStream(contextualPrompt, context);
    } else {
      return this.sendPrompt(contextualPrompt, context);
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  /**
   * Configure API key with validation and testing
   */
  async configureApiKey(apiKey: string): Promise<void> {
    // Initialize with validation and connection test
    await this.initialize(apiKey);
    
    // Save to persistent storage
    try {
      await opfsAdapter.mkdir('/workspace/.gemini', { recursive: true });
      const settings = { 
        apiKey, 
        model: this.model,
        configured: true,
        configuredAt: new Date().toISOString(),
      };
      await opfsAdapter.writeFile('/workspace/.gemini/settings.json', JSON.stringify(settings, null, 2));
    } catch (error) {
      console.warn('Failed to save API key:', error);
      // Don't throw here - the API key is still configured in memory
    }
  }

  /**
   * Load API key from storage with better error handling
   */
  async loadFromStorage(): Promise<void> {
    try {
      const settingsData = await opfsAdapter.readFile('/workspace/.gemini/settings.json', { encoding: 'utf8' }) as string;
      const settings = JSON.parse(settingsData);
      
      if (settings.apiKey) {
        // Initialize without connection test during startup (to avoid blocking)
        this.apiKey = settings.apiKey;
        this.client = new GoogleGenAI({ apiKey: settings.apiKey });
        
        if (settings.model) {
          this.model = settings.model;
        }
      }
    } catch (error) {
      // Settings don't exist or are invalid, that's OK
      if (error instanceof Error && !error.message.includes('not found')) {
        console.warn('Error loading Gemini settings:', error.message);
      }
    }
  }

  /**
   * Test current configuration without throwing
   */
  async testCurrentConfiguration(): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'No API key configured' };
    }

    try {
      await this.testConnection();
      return { success: true };
    } catch (error) {
      const parsed = parseGeminiError(error);
      return { success: false, error: parsed.message };
    }
  }

  /**
   * Get current configuration status with more details
   */
  getStatus(): {
    configured: boolean;
    model: string;
    hasApiKey: boolean;
    toolsAvailable: number;
  } {
    return {
      configured: this.isConfigured(),
      model: this.model,
      hasApiKey: !!this.apiKey,
      toolsAvailable: webToolRegistry.getToolDefinitions().length,
    };
  }

  /**
   * Get available models (for future expansion)
   */
  getAvailableModels(): string[] {
    return [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];
  }

  /**
   * Set model
   */
  setModel(model: string): void {
    if (!this.getAvailableModels().includes(model)) {
      throw createWebGeminiError(`Unsupported model: ${model}`, 400, false);
    }
    this.model = model;
    
    // Update stored settings if they exist
    this.updateStoredSettings({ model });
  }

  /**
   * Update stored settings
   */
  private async updateStoredSettings(updates: Partial<{ model: string; apiKey: string }>): Promise<void> {
    try {
      const settingsData = await opfsAdapter.readFile('/workspace/.gemini/settings.json', { encoding: 'utf8' }) as string;
      const settings = JSON.parse(settingsData);
      
      const updatedSettings = {
        ...settings,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      
      await opfsAdapter.writeFile('/workspace/.gemini/settings.json', JSON.stringify(updatedSettings, null, 2));
    } catch {
      // Settings file doesn't exist, that's OK
    }
  }

  /**
   * Clear configuration
   */
  async clearConfiguration(): Promise<void> {
    this.client = null;
    this.apiKey = null;
    
    try {
      await opfsAdapter.unlink('/workspace/.gemini/settings.json');
    } catch {
      // File might not exist, that's OK
    }
  }
}

// Export singleton instance
export const geminiService = new WebGeminiService();