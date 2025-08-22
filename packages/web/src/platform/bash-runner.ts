/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Opfs } from './opfs.js';
import { CmdHandler, ExecResult } from './commands.js';

const splitArgs = (s: string): string[] => {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
};

const extractRedirect = (line: string) => {
  const m = line.match(/(.*?)(\s*>>?\s*)(.+)$/);
  if (!m) return { cmd: line.trim(), redirect: null as null | { append: boolean; path: string } };
  return { cmd: m[1].trim(), redirect: { append: m[2].includes('>>'), path: m[3].trim() } };
};

export class BashRunner {
  constructor(
    private fs: Opfs,
    private registry: Map<string, CmdHandler>,
    private cwd = '/workspace',
  ) {}

  getCwd() {
    return this.cwd;
  }

  setCwd(abs: string) {
    this.cwd = abs;
  }

  async exec(command: string): Promise<ExecResult> {
    const segments = command
      .split('\n')
      .flatMap((l) => l.split(';'))
      .map((s) => s.trim())
      .filter(Boolean);
    let last: ExecResult = { stdout: '', stderr: '', code: 0 };
    for (const seg of segments) {
      const { cmd, redirect } = extractRedirect(seg);
      const argv = splitArgs(cmd);
      const name = argv.shift();
      if (!name) continue;
      const handler = this.registry.get(name);
      if (!handler) return { stdout: '', stderr: `command not found: ${name}\n`, code: 127 };
      const res = await handler(argv, {
        fs: this.fs,
        cwd: this.cwd,
        setCwd: (d) => {
          this.cwd = d;
        },
      });
      if (redirect) {
        const path = this.fs.toAbs(this.cwd, redirect.path);
        await this.fs.writeFile(path, res.stdout, redirect.append);
        last = { stdout: '', stderr: res.stderr, code: res.code };
      } else {
        last = res;
      }
      if (last.code !== 0) break;
    }
    return last;
  }
}

