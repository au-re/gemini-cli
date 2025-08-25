/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// OPFS utility class providing high-level file operations and path helpers
export class Opfs {
  private root!: FileSystemDirectoryHandle;

  static async create(): Promise<Opfs> {
    try {
      const storage = navigator.storage as StorageManager & {
        getDirectory: () => Promise<FileSystemDirectoryHandle>;
      };
      await storage.persist?.();
    } catch {
      // ignore
    }
    const fs = new Opfs();
    const storage = navigator.storage as StorageManager & {
      getDirectory: () => Promise<FileSystemDirectoryHandle>;
    };
    fs.root = await storage.getDirectory();
    await fs.ensureDir('/workspace');
    return fs;
  }

  private dirEntries(
    dh: FileSystemDirectoryHandle,
  ): AsyncIterableIterator<[string, FileSystemHandle]> {
    type DirectoryWithEntries = FileSystemDirectoryHandle & {
      entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    return (dh as DirectoryWithEntries).entries();
  }

  async readFile(path: string): Promise<string> {
    const { parent, name } = await this.parentAndName(path);
    const fh = await parent.getFileHandle(name);
    const file = await fh.getFile();
    return file.text();
  }

  async writeFile(
    path: string,
    content: string | ArrayBuffer,
    append = false,
  ): Promise<void> {
    await this.ensureDir(this.dirname(path));
    const { parent, name } = await this.parentAndName(path);
    const fh = await parent.getFileHandle(name, { create: true });
    const ws = await fh.createWritable({ keepExistingData: append });
    if (append) {
      const len = (await fh.getFile()).size;
      await ws.seek(len);
    }
    await ws.write(content);
    await ws.close();
  }

  async listDir(
    path: string,
  ): Promise<Array<{ name: string; kind: 'file' | 'directory' }>> {
    const dh = await this.getDir(path);
    const out: Array<{ name: string; kind: 'file' | 'directory' }> = [];
    for await (const [name, h] of this.dirEntries(dh)) {
      out.push({ name, kind: h.kind });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  async remove(path: string, recursive = false): Promise<void> {
    const { parent, name } = await this.parentAndName(path);
    await parent.removeEntry(name, { recursive });
  }

  async existsDir(path: string): Promise<boolean> {
    try {
      await this.getDir(path);
      return true;
    } catch {
      return false;
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const { parent: sp, name: sn } = await this.parentAndName(src);
    const sfh = await sp.getFileHandle(sn);
    const buf = await (await sfh.getFile()).arrayBuffer();
    await this.writeFile(dest, buf);
  }

  async copyDir(src: string, dest: string): Promise<void> {
    await this.ensureDir(dest);
    const sdh = await this.getDir(src);
    for await (const [name, h] of this.dirEntries(sdh)) {
      const s = this.join(src, name);
      const d = this.join(dest, name);
      if (h.kind === 'directory') await this.copyDir(s, d);
      else await this.copyFile(s, d);
    }
  }

  async move(src: string, dest: string): Promise<void> {
    if (await this.existsDir(src)) {
      await this.copyDir(src, dest);
      await this.remove(src, true);
    } else {
      await this.copyFile(src, dest);
      await this.remove(src);
    }
  }

  async ensureDir(path: string): Promise<void> {
    if (path === '/') return;
    let dir = this.root;
    for (const seg of this.parts(path)) {
      dir = await dir.getDirectoryHandle(seg, { create: true });
    }
  }

  private async getDir(path: string): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const seg of this.parts(path)) {
      dir = await dir.getDirectoryHandle(seg);
    }
    return dir;
  }

  private async parentAndName(path: string) {
    const parts = this.parts(path);
    const name = parts.pop();
    if (!name) throw new Error('Invalid path');
    let dir = this.root;
    for (const seg of parts) dir = await dir.getDirectoryHandle(seg);
    return { parent: dir, name };
  }

  normalize(p: string): string {
    const parts: string[] = [];
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return '/' + parts.join('/');
  }

  join(a: string, b: string) {
    return this.normalize(a.replace(/\/+$/, '') + '/' + b);
  }

  dirname(p: string): string {
    const ps = this.parts(p);
    ps.pop();
    return '/' + ps.join('/');
  }

  basename(p: string): string {
    const ps = this.parts(p);
    return ps.pop() ?? '';
  }

  toAbs(cwd: string, path: string) {
    return path.startsWith('/')
      ? this.normalize(path)
      : this.normalize(this.join(cwd, path));
  }

  parts(p: string): string[] {
    const abs = this.normalize(p);
    return abs === '/' ? [] : abs.slice(1).split('/');
  }

  async existsDirOrFile(path: string): Promise<'file' | 'directory' | null> {
    try {
      await this.getDir(path);
      return 'directory';
    } catch {
      /* ignore */
    }
    try {
      const { parent, name } = await this.parentAndName(path);
      await parent.getFileHandle(name);
      return 'file';
    } catch {
      /* ignore */
    }
    return null;
  }

  async *walk(dir: string): AsyncGenerator<string> {
    const dh = await this.getDir(dir);
    for await (const [name, h] of this.dirEntries(dh)) {
      const path = this.join(dir, name);
      if (h.kind === 'directory') yield* this.walk(path);
      else yield path;
    }
  }
}

export default Opfs;
