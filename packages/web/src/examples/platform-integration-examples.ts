/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Example usage of the Web Platform Adapter for core package integration
 *
 * This file demonstrates how to use the new platform abstractions to leverage
 * the core package's infrastructure in a web environment.
 */

import {
  initializeWebPlatform,
  webPlatformAdapter,
  WebPlatformAdapter,
} from '../platform/index.js';

/**
 * Example 1: Basic initialization and configuration
 */
async function basicUsage() {
  // Initialize the platform with default settings
  const adapter = await initializeWebPlatform({
    workspaceRoot: '/workspace',
    storageBasePath: '/workspace/.gemini-cli',
  });

  // Configure API key
  await adapter.configureApiKey('your-api-key-here');

  // Get configuration status
  const status = adapter.getStatus();
  console.log('Platform Status:', status);

  // Access integrated services
  const config = adapter.getConfig();
  const fileSystem = adapter.getFileSystemService();
  const workspace = adapter.getWorkspaceContext();
  const geminiClient = adapter.getGeminiClient();

  return { config, fileSystem, workspace, geminiClient };
}

/**
 * Example 2: Using the integrated tool registry
 */
async function toolRegistryExample() {
  const adapter = await initializeWebPlatform();
  await adapter.configureApiKey('your-api-key-here');

  const config = adapter.getConfig();
  const toolRegistry = config.getToolRegistry();

  if (toolRegistry) {
    // Get all available tools
    const tools = toolRegistry.getAllTools();
    console.log(
      'Available tools:',
      tools.map((t) => t.name),
    );

    // Execute a tool
    try {
      const result = await toolRegistry.executeTool(
        'read_file',
        { path: '/workspace/example.txt' },
        new AbortController().signal,
      );
      console.log('Tool result:', result);
    } catch (error) {
      console.error('Tool execution failed:', error);
    }
  }
}

/**
 * Example 3: Using the integrated Gemini client
 */
async function geminiClientExample() {
  const adapter = await initializeWebPlatform();
  await adapter.configureApiKey('your-api-key-here');

  const geminiClient = adapter.getGeminiClient();

  // Test basic prompt
  try {
    const response = await geminiClient.sendPrompt('Hello, how are you?');
    console.log('Response:', response.text);
  } catch (error) {
    console.error('Gemini request failed:', error);
  }

  // Test prompt with tool usage
  try {
    const response = await geminiClient.sendPrompt(
      'List the files in my workspace',
      { enableTools: true },
    );
    console.log('Response with tools:', response.text);
    console.log('Tool calls made:', response.toolCalls);
  } catch (error) {
    console.error('Gemini request with tools failed:', error);
  }
}

/**
 * Example 4: File system operations using the integrated service
 */
async function fileSystemExample() {
  const adapter = await initializeWebPlatform();
  const fileSystem = adapter.getFileSystemService();
  const workspace = adapter.getWorkspaceContext();

  try {
    // Write a file
    await fileSystem.writeFile('/workspace/test.txt', 'Hello, world!');

    // Read the file back
    const content = await fileSystem.readFile('/workspace/test.txt', 'utf8');
    console.log('File content:', content);

    // List directory contents
    const files = await fileSystem.readdir('/workspace');
    console.log('Workspace files:', files);

    // Use workspace context for path resolution
    const relativePath = workspace.relativizePathToWorkspace(
      '/workspace/test.txt',
    );
    console.log('Relative path:', relativePath);
  } catch (error) {
    console.error('File system operation failed:', error);
  }
}

/**
 * Example 5: Settings management
 */
async function settingsExample() {
  const adapter = await initializeWebPlatform();
  const config = adapter.getConfig();

  // Set configuration options
  config.setModel('gemini-1.5-pro');
  config.setApprovalMode('autoEdit' as any); // Cast needed for enum

  // Get configuration details
  const configStatus = config.getWebConfigStatus();
  console.log('Config status:', configStatus);

  // Save and load settings are handled automatically
  const storage = adapter.getStorage();

  // Store custom data
  await storage.set('user-preference', { theme: 'dark', language: 'en' });

  // Retrieve custom data
  const preferences = await storage.get('user-preference');
  console.log('User preferences:', preferences);
}

/**
 * Example 6: Testing and error handling
 */
async function errorHandlingExample() {
  const adapter = new WebPlatformAdapter();

  try {
    // Test configuration
    const testResult = await adapter.testConfiguration();

    if (testResult.success) {
      console.log('Configuration test passed');
    } else {
      console.error('Configuration test failed:', testResult.error);
      console.log('Details:', testResult.details);
    }
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Clean up resources
    adapter.dispose();
  }
}

/**
 * Example 7: Global singleton usage
 */
async function globalSingletonExample() {
  // Initialize the global singleton
  await webPlatformAdapter.initialize();

  // Configure it
  await webPlatformAdapter.configureApiKey('your-api-key-here');

  // Use it throughout your application
  const status = webPlatformAdapter.getStatus();
  console.log('Global adapter status:', status);

  // Access services globally
  const config = webPlatformAdapter.getConfig();
  const geminiClient = webPlatformAdapter.getGeminiClient();

  // The global instance is available anywhere in your app
  return { config, geminiClient };
}

// Export examples for testing
export {
  basicUsage,
  toolRegistryExample,
  geminiClientExample,
  fileSystemExample,
  settingsExample,
  errorHandlingExample,
  globalSingletonExample,
};
