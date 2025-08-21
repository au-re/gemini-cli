/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GitService } from '../platform/git.js';
import { opfsAdapter } from '../platform/opfs-fs.js';

// Mock isomorphic-git
vi.mock('isomorphic-git', () => ({
  default: {
    clone: vi.fn(),
    init: vi.fn(),
    statusMatrix: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    log: vi.fn(),
    listBranches: vi.fn(),
    branch: vi.fn(),
    checkout: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    fetch: vi.fn(),
  },
}));

// Mock isomorphic-git/http/web
vi.mock('isomorphic-git/http/web', () => ({
  default: {},
}));

describe('GitService', () => {
  let service: GitService;
  let mockGit: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGit = (await import('isomorphic-git')).default;
    service = new GitService(opfsAdapter as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authentication', () => {
    it('should set and get auth token', () => {
      const token = 'ghp_test_token';
      service.setAuthToken(token);

      expect(service.getAuthToken()).toBe(token);
    });

    it('should return undefined when no token set', () => {
      expect(service.getAuthToken()).toBeUndefined();
    });
  });

  describe('repository operations', () => {
    it('should initialize repository', async () => {
      await service.init('/test/repo');

      expect(mockGit.init).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
      });
    });

    it('should clone repository', async () => {
      const url = 'https://github.com/user/repo.git';
      const dir = '/test/repo';

      await service.clone(dir, url);

      expect(mockGit.clone).toHaveBeenCalledWith({
        fs: opfsAdapter,
        http: expect.anything(),
        dir,
        url,
        ref: undefined,
        depth: 1,
        singleBranch: true,
        onAuth: undefined,
      });
    });

    it('should clone with authentication', async () => {
      service.setAuthToken('test-token');
      const url = 'https://github.com/user/repo.git';
      const dir = '/test/repo';

      await service.clone(dir, url);

      expect(mockGit.clone).toHaveBeenCalledWith({
        fs: opfsAdapter,
        http: expect.anything(),
        dir,
        url,
        ref: undefined,
        depth: 1,
        singleBranch: true,
        onAuth: expect.any(Function),
      });
    });
  });

  describe('status operations', () => {
    it('should get repository status', async () => {
      const mockStatusMatrix = [
        ['file1.js', 1, 1, 1], // unmodified
        ['file2.js', 0, 1, 0], // untracked
        ['file3.js', 1, 1, 0], // modified
        ['file4.js', 0, 1, 1], // added
      ];

      mockGit.statusMatrix.mockResolvedValue(mockStatusMatrix);

      const status = await service.status('/test/repo');

      expect(status).toEqual([
        { file: 'file1.js', status: 'unmodified' },
        { file: 'file2.js', status: 'untracked' },
        { file: 'file3.js', status: 'modified' },
        { file: 'file4.js', status: 'added' },
      ]);
    });
  });

  describe('commit operations', () => {
    it('should add files', async () => {
      await service.add('/test/repo', 'file.js');

      expect(mockGit.add).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        filepath: 'file.js',
      });
    });

    it('should commit with default author', async () => {
      const commitId = 'abc123';
      mockGit.commit.mockResolvedValue(commitId);

      const result = await service.commit('/test/repo', 'Test commit');

      expect(mockGit.commit).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        message: 'Test commit',
        author: { name: 'Gemini CLI Web', email: 'user@gemini-cli-web.local' },
        committer: {
          name: 'Gemini CLI Web',
          email: 'user@gemini-cli-web.local',
        },
      });

      expect(result).toBe(commitId);
    });

    it('should commit with custom author', async () => {
      const commitId = 'abc123';
      const author = { name: 'John Doe', email: 'john@example.com' };
      mockGit.commit.mockResolvedValue(commitId);

      await service.commit('/test/repo', 'Test commit', { author });

      expect(mockGit.commit).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        message: 'Test commit',
        author,
        committer: author,
      });
    });
  });

  describe('branch operations', () => {
    it('should list branches', async () => {
      const branches = ['main', 'feature/test', 'bugfix/issue'];
      mockGit.listBranches.mockResolvedValue(branches);

      const result = await service.listBranches('/test/repo');

      expect(result).toEqual(branches);
      expect(mockGit.listBranches).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        remote: undefined,
      });
    });

    it('should create branch', async () => {
      await service.branch('/test/repo', 'new-feature', false);

      expect(mockGit.branch).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        ref: 'new-feature',
        checkout: false,
      });
    });

    it('should checkout branch', async () => {
      await service.checkout('/test/repo', 'main');

      expect(mockGit.checkout).toHaveBeenCalledWith({
        fs: opfsAdapter,
        dir: '/test/repo',
        ref: 'main',
      });
    });
  });

  describe('log operations', () => {
    it('should get commit log', async () => {
      const mockCommits = [
        {
          oid: 'abc123',
          commit: {
            message: 'First commit',
            author: {
              name: 'John',
              email: 'john@test.com',
              timestamp: 1234567890,
            },
            committer: {
              name: 'John',
              email: 'john@test.com',
              timestamp: 1234567890,
            },
          },
        },
      ];

      mockGit.log.mockResolvedValue(mockCommits);

      const result = await service.log('/test/repo');

      expect(result).toEqual([
        {
          oid: 'abc123',
          message: 'First commit',
          author: {
            name: 'John',
            email: 'john@test.com',
            timestamp: 1234567890,
          },
          committer: {
            name: 'John',
            email: 'john@test.com',
            timestamp: 1234567890,
          },
        },
      ]);
    });
  });

  describe('remote operations', () => {
    it('should push to remote', async () => {
      service.setAuthToken('test-token');

      await service.push('/test/repo');

      expect(mockGit.push).toHaveBeenCalledWith({
        fs: opfsAdapter,
        http: expect.anything(),
        dir: '/test/repo',
        remote: 'origin',
        ref: undefined,
        onAuth: expect.any(Function),
      });
    });

    it('should pull from remote', async () => {
      service.setAuthToken('test-token');

      await service.pull('/test/repo');

      expect(mockGit.pull).toHaveBeenCalledWith({
        fs: opfsAdapter,
        http: expect.anything(),
        dir: '/test/repo',
        remote: 'origin',
        ref: undefined,
        onAuth: expect.any(Function),
        author: { name: 'Gemini CLI Web', email: 'user@gemini-cli-web.local' },
      });
    });
  });

  describe('repository detection', () => {
    it('should detect git repository', async () => {
      mockGit.listBranches.mockResolvedValue(['main']);

      const isRepo = await service.isRepo('/test/repo');

      expect(isRepo).toBe(true);
    });

    it('should detect non-git directory', async () => {
      mockGit.listBranches.mockRejectedValue(new Error('Not a git repository'));

      const isRepo = await service.isRepo('/test/not-repo');

      expect(isRepo).toBe(false);
    });
  });
});
