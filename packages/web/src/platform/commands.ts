/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Opfs } from './opfs.js';

export type ExecResult = { stdout: string; stderr: string; code: number };
export type CmdHandler = (
  argv: string[],
  ctx: { fs: Opfs; cwd: string; setCwd: (cwd: string) => void },
) => Promise<ExecResult>;

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', code: 0 });
const err = (stderr: string, code = 1): ExecResult => ({ stdout: '', stderr, code });

export const cmd_pwd: CmdHandler = async (_argv, { cwd }) => ok(cwd + '\n');

export const cmd_cd: CmdHandler = async (argv, { fs, cwd, setCwd }) => {
  const path = argv[0];
  if (!path) return err('cd: missing operand\n');
  const abs = fs.toAbs(cwd, path);
  const kind = await fs.existsDirOrFile(abs);
  if (kind !== 'directory') return err(`cd: ${path}: No such directory\n`);
  setCwd(abs);
  return ok();
};

export const cmd_ls: CmdHandler = async (argv, { fs, cwd }) => {
  const path = argv[0] ? fs.toAbs(cwd, argv[0]) : cwd;
  const items = await fs.listDir(path);
  const out = items.map((i) => i.name + (i.kind === 'directory' ? '/' : '')).join('\n');
  return ok(out + (out ? '\n' : ''));
};

export const cmd_mkdir: CmdHandler = async (argv, { fs, cwd }) => {
  const paths = argv.filter((a) => !a.startsWith('-'));
  if (paths.length === 0) return err('mkdir: missing operand\n');
  for (const p of paths) {
    await fs.ensureDir(fs.toAbs(cwd, p));
  }
  return ok();
};

export const cmd_cat: CmdHandler = async (argv, { fs, cwd }) => {
  if (argv.length === 0) return err('cat: missing operand\n');
  let out = '';
  for (const p of argv) {
    const abs = fs.toAbs(cwd, p);
    out += await fs.readFile(abs);
  }
  return ok(out);
};

export const cmd_echo: CmdHandler = async (argv) => ok(argv.join(' ') + '\n');

export const cmd_rm: CmdHandler = async (argv, { fs, cwd }) => {
  const recursive = argv.includes('-r') || argv.includes('-rf') || argv.includes('-fr');
  const paths = argv.filter((a) => !a.startsWith('-'));
  if (paths.length === 0) return err('rm: missing operand\n');
  for (const p of paths) {
    await fs.remove(fs.toAbs(cwd, p), recursive);
  }
  return ok();
};

export const cmd_cp: CmdHandler = async (argv, { fs, cwd }) => {
  const recursive = argv.includes('-r') || argv.includes('-R');
  const paths = argv.filter((a) => !a.startsWith('-'));
  if (paths.length < 2) return err('cp: missing file operand\n');
  const dest = fs.toAbs(cwd, paths.pop()!);
  await fs.ensureDir(fs.existsDir(dest) ? dest : fs.dirname(dest));
  for (const srcRel of paths) {
    const src = fs.toAbs(cwd, srcRel);
    const kind = await fs.existsDirOrFile(src);
    if (kind === 'directory') {
      if (!recursive) return err(`cp: -r not specified for directory ${srcRel}\n`);
      const target = fs.join(dest, fs.basename(src));
      await fs.copyDir(src, target);
    } else if (kind === 'file') {
      const target = fs.existsDir(dest) ? fs.join(dest, fs.basename(src)) : dest;
      await fs.copyFile(src, target);
    }
  }
  return ok();
};

export const cmd_mv: CmdHandler = async (argv, { fs, cwd }) => {
  if (argv.length < 2) return err('mv: missing file operand\n');
  const dest = fs.toAbs(cwd, argv.pop()!);
  await fs.ensureDir(fs.existsDir(dest) ? dest : fs.dirname(dest));
  for (const srcRel of argv) {
    const src = fs.toAbs(cwd, srcRel);
    const target = fs.existsDir(dest) ? fs.join(dest, fs.basename(src)) : dest;
    await fs.move(src, target);
  }
  return ok();
};

// ----- Extended commands: head, tail, grep, sed -----
const parseN = (args: string[], def = 10) => {
  const i = args.findIndex((a) => a === '-n');
  if (i >= 0 && args[i + 1])
    return { n: Math.max(0, Number(args[i + 1]) || def), rest: args.filter((_, idx) => idx !== i && idx !== i + 1) };
  return { n: def, rest: args };
};

export const cmd_head: CmdHandler = async (argv, { fs, cwd }) => {
  const { n, rest } = parseN(argv);
  if (!rest.length) return err('head: missing file operand\n');
  let out = '';
  for (const p of rest) {
    const abs = fs.toAbs(cwd, p);
    const text = await fs.readFile(abs);
    const lines = text.split(/\r?\n/).slice(0, n).join('\n');
    out += lines + (lines.length ? '\n' : '');
  }
  return ok(out);
};

export const cmd_tail: CmdHandler = async (argv, { fs, cwd }) => {
  const { n, rest } = parseN(argv);
  if (!rest.length) return err('tail: missing file operand\n');
  let out = '';
  for (const p of rest) {
    const abs = fs.toAbs(cwd, p);
    const text = await fs.readFile(abs);
    const lines = text.split(/\r?\n/);
    const slice = lines.slice(Math.max(0, lines.length - n)).join('\n');
    out += slice + (slice.length ? '\n' : '');
  }
  return ok(out);
};

type GrepOpts = { i?: boolean; n?: boolean; r?: boolean; l?: boolean; E?: boolean; max?: number };

const parseGrep = (argv: string[]): { opts: GrepOpts; pattern: string; files: string[] } => {
  const opts: GrepOpts = {};
  const files: string[] = [];
  let pattern = '';
  for (const a of argv) {
    if (a === '-i') opts.i = true;
    else if (a === '-n') opts.n = true;
    else if (a === '-r') opts.r = true;
    else if (a === '-l') opts.l = true;
    else if (a === '-E') opts.E = true;
    else if (a.startsWith('--max-count=')) opts.max = Number(a.split('=')[1]) || undefined;
    else if (!pattern) pattern = a;
    else files.push(a);
  }
  return { opts, pattern, files };
};

const makeRegex = (pat: string, { i, E }: GrepOpts): RegExp => {
  const flags = i ? 'i' : '';
  const src = E ? pat : pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(src, flags);
};

export const cmd_grep: CmdHandler = async (argv, { fs, cwd }) => {
  const { opts, pattern, files } = parseGrep(argv);
  if (!pattern) return err('grep: missing PATTERN\n');
  const rx = makeRegex(pattern, opts);
  if (!files.length) return err('grep: missing FILE\n');
  const targets: string[] = [];
  for (const f of files) {
    const abs = fs.toAbs(cwd, f);
    const kind = await fs.existsDirOrFile(abs);
    if (kind === 'directory' && opts.r) {
      for await (const fp of fs.walk(abs)) targets.push(fp);
    } else if (kind === 'file') {
      targets.push(abs);
    }
  }
  let out = '';
  let matched = 0;
  for (const path of targets) {
    const text = await fs.readFile(path);
    const lines = text.split(/\r?\n/);
    let fileHadMatch = false;
    for (let i = 0; i < lines.length; i++) {
      if (rx.test(lines[i])) {
        if (opts.l) {
          out += path + '\n';
          fileHadMatch = true;
          break;
        }
        const prefix = (targets.length > 1 ? path + ':' : '') + (opts.n ? i + 1 + ':' : '');
        out += prefix + lines[i] + '\n';
        matched++;
        if (opts.max && matched >= opts.max) break;
      }
    }
    if (opts.max && matched >= opts.max) break;
    if (opts.l && fileHadMatch) continue;
  }
  return ok(out);
};

type SedSpec = { search: string; replace: string; flags: string; inPlace: boolean };

const parseSed = (argv: string[]): { spec?: SedSpec; files: string[] } => {
  let inPlace = false;
  const files: string[] = [];
  let expr = '';
  for (const a of argv) {
    if (a === '-i') inPlace = true;
    else if (!expr && a.startsWith('s')) expr = a;
    else files.push(a);
  }
  const m = expr.match(/^s(.)([\s\S]*?)\1([\s\S]*?)\1([gimuy]*)$/);
  if (!m) return { files };
  const [, , search, replace, flags] = m;
  return { spec: { search, replace, flags, inPlace }, files };
};

export const cmd_sed: CmdHandler = async (argv, { fs, cwd }) => {
  const { spec, files } = parseSed(argv);
  if (!spec) return err('sed: bad substitution\n');
  if (!files.length) return err('sed: missing file operand\n');
  const rx = new RegExp(spec.search, spec.flags.includes('i') ? 'gi' : 'g');
  let out = '';
  for (const f of files) {
    const abs = fs.toAbs(cwd, f);
    const text = await fs.readFile(abs);
    const replaced = text.replace(rx, spec.replace);
    if (spec.inPlace) {
      await fs.writeFile(abs, replaced, false);
      out += `${abs}: updated\n`;
    } else {
      out += replaced + (replaced.endsWith('\n') ? '' : '\n');
    }
  }
  return ok(out);
};

export const defaultCommandRegistry = () =>
  new Map<string, CmdHandler>([
    ['pwd', cmd_pwd],
    ['cd', cmd_cd],
    ['ls', cmd_ls],
    ['mkdir', cmd_mkdir],
    ['cat', cmd_cat],
    ['echo', cmd_echo],
    ['rm', cmd_rm],
    ['cp', cmd_cp],
    ['mv', cmd_mv],
    ['head', cmd_head],
    ['tail', cmd_tail],
    ['grep', cmd_grep],
    ['sed', cmd_sed],
  ]);

