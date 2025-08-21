# Gemini CLI Web Edition - Technical Specification

## 🎯 Project Goals

Create a browser-native implementation of Gemini CLI that:
- Runs entirely client-side without server dependencies
- Maintains command compatibility with the Node.js CLI
- Uses modern web APIs (OPFS, isomorphic-git, xterm.js)
- Integrates with existing `packages/core` logic where possible

## 🏛️ Architecture Overview

### High-Level Design

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Browser UI    │    │  Command Router │    │  Core Logic     │
│   (xterm.js)    │◄──►│  (Web Adapted)  │◄──►│  (Shared)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Terminal I/O  │    │  Platform APIs  │    │   Gemini API    │
│   (xterm.js)    │    │  (OPFS + Git)   │    │   (HTTP)        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Component Responsibilities

#### Terminal Layer (`terminal/`)
- **XtermHost**: xterm.js wrapper providing CLI-compatible interface
- **Input handling**: Keyboard events, line discipline, command history  
- **Output rendering**: ANSI colors, progress indicators, formatted text

#### Command Layer (`command/`)
- **Router**: Parse and route `/`, `@`, `!` commands + regular prompts
- **Command handlers**: Implementation of slash commands (`/init`, `/theme`)
- **Context management**: Working directory, terminal state, configuration

#### Platform Layer (`platform/`)
- **OPFSAdapter**: Node.js `fs`-compatible API over Origin Private File System
- **GitService**: Git operations via isomorphic-git with web HTTP client
- **Settings**: Browser-based configuration storage and API key management

#### UI Layer (`ui/`)
- **Status components**: Loading indicators, progress bars
- **Dialog system**: Theme selection, settings, confirmations
- **File browser**: Optional visual file navigation interface

## 🔌 Integration Strategy

### Core Package Reuse

**Directly Reusable:**
- API client configuration and request building
- Tool schema definitions and orchestration patterns
- Content generation and prompt management
- Utilities (text processing, error handling, validation)

**Requires Adaptation:**
- File system operations → OPFS adapter
- Shell execution → Git command whitelist
- Terminal I/O → xterm.js interface
- Settings storage → browser localStorage/indexedDB

**Not Applicable:**
- Node.js-specific modules (child_process, os, path)
- Container/sandbox execution (Docker, Podman)
- Native terminal features (pty, raw mode)

### Platform Abstraction

Create thin abstraction layer for environment-specific operations:

```typescript
interface PlatformAdapter {
  // File system
  fs: NodeLikeFS;
  
  // Git operations  
  git: GitService;
  
  // Terminal interface
  terminal: TerminalInterface;
  
  // HTTP client
  http: typeof fetch;
  
  // Settings storage
  settings: SettingsStore;
}
```

## 📁 File System Architecture

### OPFS Integration

**Storage Hierarchy:**
```
/                          # OPFS root
├── workspace/             # Default working directory
│   ├── .git/             # Git repository data
│   ├── .gemini/          # CLI settings and cache
│   │   ├── settings.json # User preferences
│   │   ├── history.json  # Command history
│   │   └── cache/        # Temporary files
│   ├── src/              # User project files
│   └── GEMINI.md         # Project documentation
└── repos/                # Additional repositories
```

**API Mapping:**
- `fs.readFile()` → OPFS FileHandle.getFile()
- `fs.writeFile()` → OPFS FileHandle.createWritable()
- `fs.readdir()` → OPFS DirectoryHandle.entries()
- `fs.mkdir()` → OPFS DirectoryHandle.getDirectoryHandle()
- `fs.stat()` → OPFS File.size, File.lastModified

**Caching Strategy:**
- Handle cache with Map<path, FileSystemHandle>
- Invalidate cache on write operations
- LRU eviction for memory management

### File Import/Export

**Import Options:**
- File System Access API (when available)
- Drag & drop interface
- Text paste for small files
- Git clone for repositories

**Export Options:**
- Download API for individual files
- ZIP generation for directories
- Git push for repositories

## 🔀 Git Integration

### isomorphic-git Configuration

**Supported Operations:**
```typescript
const supportedCommands = [
  'init', 'clone', 'status', 'add', 'commit', 
  'push', 'pull', 'fetch', 'branch', 'checkout', 
  'log', 'diff', 'remote'
];
```

**Authentication:**
```typescript
const onAuth = () => ({
  username: githubToken,  // PAT as username
  password: '',           // Empty password
});
```

**HTTP Client:**
```typescript
import http from 'isomorphic-git/http/web';
// Automatically handles CORS, redirects, credentials
```

### Git Command Mapping

**Shell Command → isomorphic-git:**
- `!git status` → `git.statusMatrix()`
- `!git add file` → `git.add({ filepath })`
- `!git commit -m "msg"` → `git.commit({ message })`
- `!git push` → `git.push({ remote, ref })`
- `!git log --oneline` → `git.log({ depth, format })`

**Unsupported Git Features:**
- Interactive rebase (too complex for web)
- Git hooks (no shell execution)
- Submodules (limited browser support)
- Large file support (browser memory limits)

## 🎨 Terminal Implementation

### xterm.js Configuration

**Terminal Setup:**
```typescript
const terminal = new Terminal({
  theme: darkTheme,
  fontFamily: 'Consolas, Monaco, "Courier New"',
  fontSize: 14,
  cursorBlink: true,
  scrollback: 10000,
  allowTransparency: false,
});

// Addons
terminal.loadAddon(new FitAddon());
terminal.loadAddon(new WebLinksAddon());
```

**Input Handling:**
- Line discipline for command input
- Keyboard shortcuts (Ctrl+C, Ctrl+L)
- Tab completion for commands and paths
- Command history navigation (↑/↓)

**Output Rendering:**
- ANSI color codes for syntax highlighting
- Progress indicators for long operations
- Structured output for file listings
- Error formatting with context

### Theme System

**Built-in Themes:**
- **Dark** (default): Black background, white text
- **Light**: White background, black text  
- **Matrix**: Green on black
- **Ocean**: Blue tones
- **Custom**: User-defined colors

**Theme Structure:**
```typescript
interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  selection: string;
  // ... 16 color palette
}
```

## 🌐 Network Architecture

### API Integration

**Gemini API Calls:**
- Direct browser → Google AI API
- CORS handled by API endpoint
- Streaming responses for real-time output
- Error handling and retry logic

**Git Remote Operations:**
- HTTPS only (no SSH in browser)
- GitHub PAT authentication
- Progress callbacks for clone/push/pull
- Bandwidth optimization (shallow clones)

### Security Model

**Same-Origin Policy:**
- OPFS isolated per origin
- API keys scoped to domain
- No cross-origin file access

**Content Security Policy:**
```
default-src 'self';
connect-src 'self' https://generativelanguage.googleapis.com https://github.com;
script-src 'self' 'unsafe-eval';  // For xterm.js
style-src 'self' 'unsafe-inline'; // For terminal themes
```

## 📊 Performance Considerations

### Memory Management

**File Size Limits:**
- Individual files: 10MB (configurable)
- Directory scans: 1000 files max
- Git operations: 100MB repository limit
- Terminal history: 10,000 lines

**Optimization Strategies:**
- Lazy loading for large directories
- Streaming for file operations
- Background cleanup of temporary files
- Debounced API calls

### Loading Performance

**Bundle Optimization:**
- Code splitting by feature
- Tree shaking for unused core modules
- CDN for large dependencies (xterm.js)
- Service worker for caching

**Startup Time:**
- Progressive loading of features
- Cached OPFS handle initialization
- Deferred Git repository discovery
- Background prefetch of common commands

## 🧪 Testing Strategy

### Unit Tests (Vitest)

**Component Testing:**
- OPFS adapter with mocked storage
- Command router with sample inputs
- Git service with mocked responses
- Terminal output formatting

**Test Structure:**
```typescript
describe('OPFSAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigatorStorage();
  });
  
  it('should read file contents', async () => {
    // Test implementation
  });
});
```

### Integration Tests

**E2E Scenarios:**
- Full command execution workflows
- File import/export operations
- Git clone and basic operations
- Settings persistence

**Browser Testing:**
- Chrome/Chromium (primary target)
- Firefox (secondary)
- Safari (if OPFS supported)
- Edge (Chromium-based)

### Performance Tests

**Metrics:**
- Bundle size and loading time
- Memory usage during operations
- File operation latencies
- Terminal rendering performance

## 🚀 Deployment

### Build Process

**Vite Configuration:**
```typescript
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          xterm: ['xterm', 'xterm-addon-fit'],
          git: ['isomorphic-git'],
          core: ['@google/gemini-cli-core'],
        },
      },
    },
  },
});
```

### Hosting Requirements

**Static Hosting:**
- Any CDN or static host (GitHub Pages, Vercel, Netlify)
- HTTPS required for OPFS
- Proper MIME types for .wasm files
- Caching headers for performance

**Progressive Web App:**
- Service worker for offline support
- Web app manifest for installation
- Background sync for Git operations
- Push notifications for completions

## 🔮 Future Enhancements

### Phase 2 Features

**Enhanced Git Support:**
- Visual diff viewer
- Merge conflict resolution
- Branch visualization
- Commit graph display

**Improved File Management:**
- Visual file browser
- Drag & drop operations
- File search and filtering
- Bulk operations

### Phase 3 Features  

**Collaborative Features:**
- Real-time collaboration
- Shared workspaces
- Comment system
- Review workflow

**Advanced Integration:**
- VS Code web extension
- GitHub Codespaces support
- Multiple AI model support
- Plugin ecosystem

## 📋 Compatibility Matrix

| Feature | Node CLI | Web CLI | Notes |
|---------|----------|---------|--------|
| Terminal UI | ✅ Ink | ✅ xterm.js | Full compatibility |
| File operations | ✅ Node fs | ✅ OPFS | API compatible |
| Git operations | ✅ Native | ✅ isomorphic-git | Most commands |
| Shell commands | ✅ All | ❌ Git only | Security limitation |
| API integration | ✅ Full | ✅ Full | Same endpoints |
| Themes | ✅ Yes | ✅ Yes | Extended options |
| Settings | ✅ File | ✅ Browser | Different storage |
| Extensions | ✅ Node | ⚠️ Limited | Browser constraints |