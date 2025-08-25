/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TerminalMessage {
  type: 'log' | 'error' | 'warn' | 'info';
  text: string;
  timestamp: number;
}
