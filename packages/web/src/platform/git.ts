/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { opfsAdapter } from './opfs-fs.js';

// Type alias for isomorphic-git filesystem interface
type GitFS = NonNullable<Parameters<typeof git.clone>[0]['fs']>;

/**
 * Git operations using isomorphic-git over OPFS
 */
export class GitService {
  private authToken?: string;

  constructor(private fs = opfsAdapter) {}

  /**
   * Set authentication token for Git operations
   */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /**
   * Get authentication token (returns undefined if not set)
   */
  getAuthToken(): string | undefined {
    return this.authToken;
  }

  /**
   * Get authentication callback for isomorphic-git
   */
  private getAuth() {
    if (!this.authToken) return undefined;
    return () => ({
      username: this.authToken,
      password: '',
    });
  }

  /**
   * Clone a repository
   */
  async clone(
    dir: string,
    url: string,
    options: {
      branch?: string;
      depth?: number;
      singleBranch?: boolean;
    } = {},
  ): Promise<void> {
    const { branch, depth = 1, singleBranch = true } = options;

    await git.clone({
      fs: this.fs as GitFS,
      http,
      dir,
      url,
      ref: branch,
      depth,
      singleBranch,
      onAuth: this.getAuth(),
    });
  }

  /**
   * Initialize a new repository
   */
  async init(dir: string): Promise<void> {
    await git.init({
      fs: this.fs as GitFS,
      dir,
    });
  }

  /**
   * Get repository status
   */
  async status(dir: string): Promise<
    Array<{
      file: string;
      status: string;
    }>
  > {
    const files = await git.statusMatrix({
      fs: this.fs as GitFS,
      dir,
    });

    return files.map(([file, head, workdir, stage]) => {
      let status = 'unknown';

      if (head === 1 && workdir === 1 && stage === 1) status = 'unmodified';
      else if (head === 0 && workdir === 1 && stage === 0) status = 'untracked';
      else if (head === 0 && workdir === 1 && stage === 1) status = 'added';
      else if (head === 1 && workdir === 0 && stage === 0) status = 'deleted';
      else if (head === 1 && workdir === 1 && stage === 0) status = 'modified';
      else if (head === 1 && workdir === 0 && stage === 1) status = 'removed';

      return { file, status };
    });
  }

  /**
   * Add files to staging area
   */
  async add(dir: string, filepath: string): Promise<void> {
    await git.add({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      filepath,
    });
  }

  /**
   * Remove files from staging area
   */
  async remove(dir: string, filepath: string): Promise<void> {
    await git.remove({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      filepath,
    });
  }

  /**
   * Commit changes
   */
  async commit(
    dir: string,
    message: string,
    options: {
      author?: { name: string; email: string };
      committer?: { name: string; email: string };
    } = {},
  ): Promise<string> {
    const { author, committer } = options;

    return await git.commit({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      message,
      author: author || {
        name: 'Gemini CLI Web',
        email: 'user@gemini-cli-web.local',
      },
      committer: committer ||
        author || {
          name: 'Gemini CLI Web',
          email: 'user@gemini-cli-web.local',
        },
    });
  }

  /**
   * Get commit log
   */
  async log(
    dir: string,
    options: {
      depth?: number;
      since?: Date;
      ref?: string;
    } = {},
  ): Promise<
    Array<{
      oid: string;
      message: string;
      author: { name: string; email: string; timestamp: number };
      committer: { name: string; email: string; timestamp: number };
    }>
  > {
    const { depth = 10, since, ref } = options;

    const commits = await git.log({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      depth,
      since,
      ref,
    });

    return commits.map((commit) => ({
      oid: commit.oid,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        timestamp: commit.commit.author.timestamp,
      },
      committer: {
        name: commit.commit.committer.name,
        email: commit.commit.committer.email,
        timestamp: commit.commit.committer.timestamp,
      },
    }));
  }

  /**
   * List branches
   */
  async listBranches(dir: string, remote = false): Promise<string[]> {
    return await git.listBranches({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      remote: remote ? 'origin' : undefined,
    });
  }

  /**
   * Create and checkout a new branch
   */
  async branch(
    dir: string,
    branchName: string,
    checkout = false,
  ): Promise<void> {
    await git.branch({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      ref: branchName,
      checkout,
    });
  }

  /**
   * Checkout a branch or commit
   */
  async checkout(dir: string, ref: string): Promise<void> {
    await git.checkout({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      dir,
      ref,
    });
  }

  /**
   * Fetch from remote
   */
  async fetch(
    dir: string,
    options: {
      remote?: string;
      ref?: string;
    } = {},
  ): Promise<void> {
    const { remote = 'origin', ref } = options;

    await git.fetch({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      http,
      dir,
      remote,
      ref,
      onAuth: this.getAuth(),
    });
  }

  /**
   * Pull from remote
   */
  async pull(
    dir: string,
    options: {
      remote?: string;
      ref?: string;
      author?: { name: string; email: string };
    } = {},
  ): Promise<void> {
    const { remote = 'origin', ref, author } = options;

    await git.pull({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      http,
      dir,
      remote,
      ref,
      onAuth: this.getAuth(),
      author: author || {
        name: 'Gemini CLI Web',
        email: 'user@gemini-cli-web.local',
      },
    });
  }

  /**
   * Push to remote
   */
  async push(
    dir: string,
    options: {
      remote?: string;
      ref?: string;
    } = {},
  ): Promise<void> {
    const { remote = 'origin', ref } = options;

    await git.push({
      fs: this.fs as Parameters<typeof git.add>[0]['fs'],
      http,
      dir,
      remote,
      ref,
      onAuth: this.getAuth(),
    });
  }

  /**
   * Get diff between working directory and HEAD
   */
  async diff(dir: string, filepath?: string): Promise<string> {
    // isomorphic-git doesn't have built-in diff, so we'll implement basic version
    const status = await this.status(dir);
    const changes = filepath
      ? status.filter((s) => s.file === filepath)
      : status;

    return changes
      .map((change) => `${change.status.padEnd(10)} ${change.file}`)
      .join('\n');
  }

  /**
   * Check if directory is a git repository
   */
  async isRepo(dir: string): Promise<boolean> {
    try {
      await git.listBranches({
        fs: this.fs as Parameters<typeof git.add>[0]['fs'],
        dir,
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const gitService = new GitService();
