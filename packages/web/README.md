# Gemini CLI Web Edition

A browser-based implementation of the Gemini CLI that runs entirely client-side using modern web technologies.

## 🌟 Overview

Gemini CLI Web brings the power of Gemini AI directly to your browser with a full terminal interface, file system operations via Origin Private File System (OPFS), and Git integration through isomorphic-git. No server required - everything runs in your browser!

## ✨ Features

### Terminal Interface

- **Full xterm.js terminal** with proper keyboard handling and ANSI color support
- **Command history** and tab completion
- **Configurable themes** (dark/light modes)
- **Loading indicators** and status updates

### File System Operations

- **Origin Private File System (OPFS)** for persistent browser storage
- **File and directory operations** (`@file`, `@dir` commands)
- **Git-aware filtering** with `.gitignore` and `.geminiignore` support
- **Import/export** capabilities for local file access

### Git Integration

- **Full Git workflow** powered by isomorphic-git
- **Supported operations**: clone, status, add, commit, push, pull, branch, checkout, log
- **Authentication** via GitHub personal access tokens
- **Diff and status** visualization

### Command Compatibility

- **Slash commands** (`/init`, `/config`, `/status`, `/theme`, `/help`, `/clear`)
- **At-commands** (`@file`, `@dir`) for content injection with direct Gemini integration
- **Git commands** (`!git status`, `!git commit`, `!git push`, `!git pull`, `!git clone`, etc.)
- **Regular prompts** to Gemini AI (with API key configuration)

## 🚀 Quick Start

### Development

1. **Install dependencies** (from repository root):

   ```bash
   npm ci
   ```

2. **Start development server**:

   ```bash
   cd packages/web
   npm run dev
   ```

3. **Open browser** to `http://localhost:3000`

### Production Build

```bash
npm run build
```

The built files will be in `packages/web/dist/` and can be served from any static web server.

## 📖 Usage

### Basic Commands

```bash
# Project initialization
/init

# File content injection
@README.md
@src/

# Git operations
!git status
!git add .
!git commit "Update documentation"
!git push

# Terminal management
/clear
/help
```

### File System Operations

The web version uses OPFS (Origin Private File System) for storage:

- Files persist across browser sessions
- Each origin gets its own isolated file system
- Compatible with `isomorphic-git` for version control
- Import/export capabilities for local files

### Git Workflow

1. **Set up authentication** (GitHub PAT recommended):

   ```bash
   !git clone https://github.com/user/repo.git
   ```

2. **Normal Git workflow**:
   ```bash
   !git status
   !git add file.txt
   !git commit "Add feature"
   !git push
   ```

### Gemini AI Integration

Configure your API key, then use natural language with optional file context:

```bash
# Configure API key (one-time setup)
/config api-key your-gemini-api-key

# Regular prompts
Explain this code and suggest improvements

# With context injection
@src/components/ Refactor these React components for better performance

# Git workflow with AI assistance
!git status
What should I do about these uncommitted changes?
```

## 🏗️ Architecture

### Core Components

- **`XtermHost`** - Terminal interface wrapper
- **`CommandRouter`** - Command parsing and routing
- **`OPFSAdapter`** - File system abstraction
- **`GitService`** - Git operations via isomorphic-git
- **Core Integration** - Reused logic from `packages/core`

### Platform Abstractions

The web package provides browser-compatible implementations of:

- **File system** operations via OPFS
- **Git** operations via isomorphic-git
- **Terminal** interface via xterm.js
- **HTTP** requests via fetch API

### Security Model

- **No shell execution** - only whitelisted Git commands
- **Sandboxed storage** - OPFS isolates each origin
- **API key storage** - browser memory only (optional localStorage encryption)
- **HTTPS required** - for OPFS and security

## 🛠️ Development

### Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Run tests
npm run test
npm run test:ui
npm run test:e2e

# Linting and formatting
npm run lint
npm run format
npm run typecheck
```

### Project Structure

```
packages/web/
├── src/
│   ├── terminal/          # xterm.js integration
│   ├── command/           # Command routing
│   ├── platform/          # OPFS & Git adapters
│   ├── ui/               # UI components
│   └── main.ts           # Application entry
├── index.html            # HTML template
├── vite.config.ts        # Build configuration
└── package.json          # Dependencies
```

### Testing

- **Unit tests** with Vitest
- **E2E tests** with Playwright
- **Coverage reports** via c8
- **Component testing** with jsdom

## 🚧 Current Limitations

### Unsupported Features (vs Node CLI)

- **Arbitrary shell commands** - only Git commands supported
- **Container/sandbox execution** - not applicable in browser
- **Some MCP servers** - depends on Node.js APIs
- **Binary file operations** - limited by OPFS capabilities

### Browser Requirements

- **Modern browser** with OPFS support (Chrome 86+, Firefox 111+)
- **HTTPS** required for OPFS access
- **JavaScript enabled**
- **Local storage** for preferences

## 🗺️ Roadmap

### Phase 1 - MVP (COMPLETED ✅)

- [x] Terminal interface with xterm.js
- [x] OPFS file system adapter
- [x] Basic command routing
- [x] Git integration via isomorphic-git
- [x] **Gemini API integration** ✅
- [x] **Enhanced Git operations** (clone, push, pull, authentication) ✅
- [x] **File filtering with .gitignore/.geminiignore** ✅
- [x] **Comprehensive testing suite** (43+ tests) ✅

### Phase 2 - Enhanced UX

- [ ] Theme customization dialog
- [ ] Visual file browser
- [ ] Git diff visualization
- [ ] Settings persistence
- [ ] Workspace management

### Phase 3 - Advanced Features

- [ ] Multiple repository support
- [ ] Code editor integration
- [ ] Collaborative features
- [ ] PWA capabilities
- [ ] Performance optimizations

## 🤝 Contributing

This web package follows the same contribution guidelines as the main Gemini CLI project:

1. **Follow existing patterns** in the CLI and core packages
2. **Add comprehensive tests** for new functionality
3. **Update documentation** for any user-facing changes
4. **Ensure upstream compatibility** - don't break existing builds

See the main project's [CONTRIBUTING.md](../../CONTRIBUTING.md) for detailed guidelines.

## 📄 License

Same as parent project - Apache 2.0. See [LICENSE](../../LICENSE).
