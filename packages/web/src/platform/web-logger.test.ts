/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { WebLogger } from '../platform/web-logger';
import { XtermHost } from '../terminal/XtermHost';

// Mock the XtermHost class
vi.mock('../terminal/XtermHost', () => {
  const XtermHostMock = vi.fn();
  XtermHostMock.prototype.printMessage = vi.fn();
  return { XtermHost: XtermHostMock };
});

describe('WebLogger', () => {
  let xtermHostMock: XtermHost;
  let webLogger: WebLogger;

  beforeEach(() => {
    // Create a new mock instance for each test
    xtermHostMock = new (XtermHost as any)();
    webLogger = new WebLogger(xtermHostMock);
    vi.spyOn(Date, 'now').mockImplementation(() => 1234567890);
  });

  it('should call terminal.printMessage with correct params for log', () => {
    webLogger.log('Test log message');
    expect(xtermHostMock.printMessage).toHaveBeenCalledWith({
      type: 'log',
      text: 'Test log message',
      timestamp: 1234567890,
    });
  });

  it('should call terminal.printMessage with correct params for error', () => {
    webLogger.error('Test error message');
    expect(xtermHostMock.printMessage).toHaveBeenCalledWith({
      type: 'error',
      text: 'Test error message',
      timestamp: 1234567890,
    });
  });

  it('should call terminal.printMessage with correct params for warn', () => {
    webLogger.warn('Test warn message');
    expect(xtermHostMock.printMessage).toHaveBeenCalledWith({
      type: 'warn',
      text: 'Test warn message',
      timestamp: 1234567890,
    });
  });

  it('should call terminal.printMessage with correct params for info', () => {
    webLogger.info('Test info message');
    expect(xtermHostMock.printMessage).toHaveBeenCalledWith({
      type: 'info',
      text: 'Test info message',
      timestamp: 1234567890,
    });
  });
});
