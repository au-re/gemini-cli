/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TerminalMessage {
  type: 'info' | 'error' | 'warning' | 'success';
  text: string;
  timestamp?: number;
}

export interface ReadLineOptions {
  prompt?: string;
  password?: boolean;
}

/**
 * xterm.js wrapper providing CLI-compatible interface
 */
export class XtermHost {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private inputBuffer = '';
  private inputResolver?: (value: string) => void;
  private isWaitingForInput = false;
  private currentPrompt = '';

  constructor(container: HTMLElement) {
    
    // Initialize terminal with dark theme
    this.terminal = new Terminal({
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: '#ffffff30',
        black: '#1a1a1a',
        red: '#ff6b6b',
        green: '#51cf66',
        yellow: '#feca57',
        blue: '#74c0fc',
        magenta: '#f06292',
        cyan: '#4dd0e1',
        white: '#ffffff',
        brightBlack: '#495057',
        brightRed: '#ff8a80',
        brightGreen: '#69db7c',
        brightYellow: '#ffd93d',
        brightBlue: '#91a7ff',
        brightMagenta: '#f48fb1',
        brightCyan: '#80deea',
        brightWhite: '#ffffff',
      },
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      tabStopWidth: 4,
    });

    // Setup addons
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    // Open terminal
    this.terminal.open(container);
    this.fitAddon.fit();

    // Setup input handling
    this.setupInputHandling();
    
    // Setup resize handling
    window.addEventListener('resize', () => {
      this.fitAddon.fit();
    });

    // Print welcome message
    this.printWelcome();
  }

  /**
   * Setup keyboard input handling
   */
  private setupInputHandling(): void {
    this.terminal.onData(data => {
      if (!this.isWaitingForInput) return;

      const char = data;
      
      // Handle special keys
      if (char === '\r') { // Enter
        this.terminal.write('\r\n');
        if (this.inputResolver) {
          this.inputResolver(this.inputBuffer);
          this.inputResolver = undefined;
          this.isWaitingForInput = false;
          this.inputBuffer = '';
        }
        return;
      }

      if (char === '\u007f') { // Backspace
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.terminal.write('\b \b');
        }
        return;
      }

      if (char === '\u0003') { // Ctrl+C
        this.terminal.write('^C\r\n');
        if (this.inputResolver) {
          this.inputResolver('');
          this.inputResolver = undefined;
          this.isWaitingForInput = false;
          this.inputBuffer = '';
        }
        return;
      }

      // Handle printable characters
      if (char >= ' ' || char === '\t') {
        this.inputBuffer += char;
        this.terminal.write(char);
      }
    });
  }

  /**
   * Print welcome message
   */
  private printWelcome(): void {
    this.print('🚀 Gemini CLI Web Edition\r\n');
    this.print('Type your prompt or use commands:\r\n');
    this.print('  /init    - Analyze project and create GEMINI.md\r\n');
    this.print('  /theme   - Change terminal theme\r\n');
    this.print('  @file    - Include file contents\r\n');
    this.print('  !git ... - Git commands\r\n');
    this.print('  /help    - Show all commands\r\n');
    this.print('\r\n');
  }

  /**
   * Print text to terminal
   */
  print(text: string): void {
    this.terminal.write(text);
  }

  /**
   * Print text with newline
   */
  println(text: string): void {
    this.terminal.write(text + '\r\n');
  }

  /**
   * Print colored message
   */
  printMessage(message: TerminalMessage): void {
    const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';
    const prefix = timestamp ? `[${timestamp}] ` : '';
    
    switch (message.type) {
      case 'info':
        this.print(`\x1b[36m${prefix}ℹ ${message.text}\x1b[0m\r\n`);
        break;
      case 'success':
        this.print(`\x1b[32m${prefix}✓ ${message.text}\x1b[0m\r\n`);
        break;
      case 'warning':
        this.print(`\x1b[33m${prefix}⚠ ${message.text}\x1b[0m\r\n`);
        break;
      case 'error':
        this.print(`\x1b[31m${prefix}✗ ${message.text}\x1b[0m\r\n`);
        break;
      default:
        // Fallback for unknown message types
        this.print(`${prefix}${message.text}\r\n`);
        break;
    }
  }

  /**
   * Read a line of input from user
   */
  async readLine(options: ReadLineOptions = {}): Promise<string> {
    return new Promise((resolve) => {
      this.currentPrompt = options.prompt || '> ';
      this.terminal.write(this.currentPrompt);
      this.inputBuffer = '';
      this.isWaitingForInput = true;
      this.inputResolver = resolve;
    });
  }

  /**
   * Clear the terminal
   */
  clear(): void {
    this.terminal.clear();
  }

  /**
   * Reset terminal to initial state
   */
  reset(): void {
    this.terminal.reset();
    this.printWelcome();
  }

  /**
   * Focus the terminal
   */
  focus(): void {
    this.terminal.focus();
  }

  /**
   * Get terminal dimensions
   */
  getDimensions(): { cols: number; rows: number } {
    return {
      cols: this.terminal.cols,
      rows: this.terminal.rows,
    };
  }

  /**
   * Resize terminal to fit container
   */
  fit(): void {
    this.fitAddon.fit();
  }

  /**
   * Write ANSI escape sequences for styling
   */
  writeStyled(text: string, style: {
    color?: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white';
    bold?: boolean;
    dim?: boolean;
  }): void {
    let ansi = '';
    
    if (style.bold) ansi += '\x1b[1m';
    if (style.dim) ansi += '\x1b[2m';
    
    switch (style.color) {
      case 'red': ansi += '\x1b[31m'; break;
      case 'green': ansi += '\x1b[32m'; break;
      case 'yellow': ansi += '\x1b[33m'; break;
      case 'blue': ansi += '\x1b[34m'; break;
      case 'magenta': ansi += '\x1b[35m'; break;
      case 'cyan': ansi += '\x1b[36m'; break;
      case 'white': ansi += '\x1b[37m'; break;
      default:
        // No color specified, use default
        break;
    }
    
    this.terminal.write(ansi + text + '\x1b[0m');
  }

  /**
   * Show loading indicator
   */
  showLoading(message: string): () => void {
    let frame = 0;
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    
    this.terminal.write(`\r${message} ${frames[0]}`);
    
    const interval = setInterval(() => {
      frame = (frame + 1) % frames.length;
      this.terminal.write(`\r${message} ${frames[frame]}`);
    }, 100);
    
    return () => {
      clearInterval(interval);
      this.terminal.write(`\r${message} ✓\r\n`);
    };
  }

  /**
   * Dispose of terminal resources
   */
  dispose(): void {
    this.terminal.dispose();
  }
}