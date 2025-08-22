/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GeminiClient,
  ToolRegistry,
  ToolResult,
} from '@google/gemini-cli-core';
import { Content, FunctionCall, Part } from '@google/genai';
import { WebConfig } from './web-config.js';
import { XtermHost } from '../terminal/XtermHost.js';

/**
 * Enhanced response type for web streaming
 */
export interface WebGeminiResponse {
  text: string;
  finishReason?: string;
  toolCalls?: Array<{
    name: string;
    parameters: Record<string, unknown>;
  }>;
}

/**
 * Streaming options for web client
 */
export interface WebStreamingOptions {
  onProgress?: (chunk: string) => void;
  onToolCall?: (toolCall: {
    name: string;
    parameters: Record<string, unknown>;
  }) => void;
  onToolResult?: (result: ToolResult) => void;
}

/**
 * Web-compatible Gemini client that wraps the core GeminiClient
 */
export class WebGeminiClient {
  private coreClient: GeminiClient | null = null;
  private webConfig: WebConfig;
  private toolRegistry: ToolRegistry;

  constructor(webConfig: WebConfig, toolRegistry: ToolRegistry) {
    this.webConfig = webConfig;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Initialize the client with the web configuration
   */
  async initialize(): Promise<void> {
    if (!this.webConfig.isWebConfigured()) {
      throw new Error('Web configuration not complete. Please set API key.');
    }

    // For web environment, we'll create our own simple client instead of using core GeminiClient
    // which has Node.js dependencies
    this.coreClient = null; // We'll implement direct API calls instead
  }

  /**
   * Send a prompt with basic response
   */
  async sendPrompt(
    prompt: string,
    context?: {
      workingDirectory?: string;
      enableTools?: boolean;
    },
  ): Promise<WebGeminiResponse> {
    if (!this.coreClient) {
      throw new Error('Client not initialized');
    }

    try {
      const contents = [{ role: 'user' as const, parts: [{ text: prompt }] }];

      const config: { tools?: unknown[] } = {};

      // Add tools if enabled
      if (context?.enableTools) {
        const tools = this.toolRegistry.getGeminiTools();
        if (tools.length > 0) {
          config.tools = tools;
        }
      }

      const result = await this.coreClient.generateContent(
        contents,
        config,
        new AbortController().signal,
      );

      // Extract tool calls
      const toolCalls = this.extractToolCalls(result.candidates?.[0]?.content);

      // Execute tools if present
      if (toolCalls.length > 0 && context?.enableTools) {
        const toolResults = await this.executeTools(toolCalls);

        // Continue conversation with tool results
        const followUpResult = await this.handleToolResults(
          contents,
          config,
          toolCalls,
          toolResults,
        );

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
    } catch (error) {
      throw new Error(
        `Failed to send prompt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Send a prompt with streaming response
   */
  async sendPromptStream(
    prompt: string,
    context: {
      workingDirectory?: string;
      terminal: XtermHost;
      enableTools?: boolean;
    },
    options?: WebStreamingOptions,
  ): Promise<WebGeminiResponse> {
    if (!this.coreClient) {
      throw new Error('Client not initialized');
    }

    try {
      // For streaming, we'll use a different approach since the core client
      // might not have direct streaming support in the same way

      // First attempt with regular response, then stream output
      const response = await this.sendPrompt(prompt, {
        workingDirectory: context.workingDirectory,
        enableTools: context.enableTools,
      });

      // Simulate streaming by writing response in chunks
      if (response.text) {
        const chunks = this.chunkText(response.text);
        for (const chunk of chunks) {
          context.terminal.print(chunk);
          options?.onProgress?.(chunk);
          // Small delay to simulate streaming
          await this.delay(50);
        }
      }

      // Notify about tool calls
      if (response.toolCalls) {
        response.toolCalls.forEach((toolCall) =>
          options?.onToolCall?.(toolCall),
        );
      }

      return response;
    } catch (error) {
      const errorMessage = `Failed to send streaming prompt: ${error instanceof Error ? error.message : String(error)}`;
      context.terminal.print(`\n${errorMessage}\n`);
      throw new Error(errorMessage);
    }
  }

  /**
   * Send prompt with file context
   */
  async sendPromptWithContext(
    prompt: string,
    filePaths: string[],
    context?: {
      workingDirectory?: string;
      terminal?: XtermHost;
      enableTools?: boolean;
    },
  ): Promise<WebGeminiResponse> {
    const fileSystemService = this.webConfig.getFileSystemService();
    const workspaceContext = this.webConfig.getWorkspaceContext();

    let contextualPrompt = prompt + '\n\nFile contents:\n\n';

    // Add file contents to prompt
    const maxFiles = 10;
    const filesToProcess = filePaths.slice(0, maxFiles);

    if (filePaths.length > maxFiles) {
      contextualPrompt += `Note: Only showing first ${maxFiles} of ${filePaths.length} files.\n\n`;
    }

    for (const filePath of filesToProcess) {
      try {
        const resolvedPath = workspaceContext.resolvePath(filePath);
        const content = (await fileSystemService.readFile(
          resolvedPath,
          'utf8',
        )) as string;

        // Limit content size
        const maxContentLength = 10000;
        const truncatedContent =
          content.length > maxContentLength
            ? content.substring(0, maxContentLength) +
              '\n\n[... content truncated ...]'
            : content;

        contextualPrompt += `--- ${filePath} ---\n${truncatedContent}\n\n`;
      } catch (error) {
        contextualPrompt += `--- ${filePath} ---\n[Error reading file: ${error instanceof Error ? error.message : String(error)}]\n\n`;
      }
    }

    // Use streaming version if terminal is provided
    if (context?.terminal) {
      return this.sendPromptStream(contextualPrompt, {
        workingDirectory: context.workingDirectory,
        terminal: context.terminal,
        enableTools: context.enableTools,
      });
    } else {
      return this.sendPrompt(contextualPrompt, context);
    }
  }

  /**
   * Check if client is configured and ready
   */
  isConfigured(): boolean {
    return !!this.coreClient && this.webConfig.isWebConfigured();
  }

  /**
   * Get client status
   */
  getStatus(): {
    configured: boolean;
    model: string;
    hasApiKey: boolean;
    toolsAvailable: number;
  } {
    return {
      configured: this.isConfigured(),
      model: this.webConfig.getModel(),
      hasApiKey: this.webConfig.isWebConfigured(),
      toolsAvailable: this.toolRegistry.getAllTools().length,
    };
  }

  /**
   * Test current configuration
   */
  async testConfiguration(): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Client not configured' };
    }

    try {
      const response = await this.sendPrompt('Hello');
      return { success: !!response.text };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract tool calls from response content
   */
  private extractToolCalls(content?: Content): Array<{
    name: string;
    parameters: Record<string, unknown>;
  }> {
    if (!content?.parts) return [];

    const toolCalls: Array<{
      name: string;
      parameters: Record<string, unknown>;
    }> = [];

    for (const part of content.parts) {
      if ('functionCall' in part && part.functionCall) {
        const functionCall = part.functionCall as FunctionCall;
        toolCalls.push({
          name: functionCall.name || '',
          parameters: functionCall.args || {},
        });
      }
    }

    return toolCalls;
  }

  /**
   * Execute tool calls using the tool registry
   */
  private async executeTools(
    toolCalls: Array<{ name: string; parameters: Record<string, unknown> }>,
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.toolRegistry.executeTool(
          toolCall.name,
          toolCall.parameters,
          new AbortController().signal,
        );
        results.push(result);
      } catch (error) {
        results.push({
          llmContent: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
          returnDisplay: `Failed to execute ${toolCall.name}`,
        });
      }
    }

    return results;
  }

  /**
   * Handle tool results and continue conversation
   */
  private async handleToolResults(
    originalContents: Array<{ role: string; parts: Array<{ text: string }> }>,
    originalConfig: { tools?: unknown[] },
    toolCalls: Array<{ name: string; parameters: Record<string, unknown> }>,
    toolResults: ToolResult[],
  ): Promise<{ text?: string; candidates?: Array<{ finishReason?: string }> }> {
    if (!this.coreClient) {
      throw new Error('Client not initialized');
    }

    // Create function response parts
    const functionResponseParts: Part[] = toolResults.map((result, index) => ({
      functionResponse: {
        name: toolCalls[index].name,
        response: {
          success: !result.returnDisplay?.includes('Failed'),
          content: result.llmContent,
          error: result.returnDisplay?.includes('Failed')
            ? result.llmContent
            : undefined,
        },
      },
    }));

    // Continue conversation with tool results
    const continueContents = [
      ...originalContents,
      {
        role: 'model' as const,
        parts: toolCalls.map((call) => ({
          functionCall: { name: call.name, args: call.parameters },
        })),
      },
      { role: 'user' as const, parts: functionResponseParts },
    ];

    const result = await this.coreClient.generateContent(
      continueContents,
      originalConfig,
      new AbortController().signal,
    );

    return {
      text: result.text,
      candidates: result.candidates,
    };
  }

  /**
   * Break text into chunks for streaming simulation
   */
  private chunkText(text: string, chunkSize = 50): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
