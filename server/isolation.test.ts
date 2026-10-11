// The bridge runs in Node and imports a few modules from src/ (the blueprint
// validator, the prompt rules, the shared protocol). `npm run typecheck` already
// rejects DOM globals in them: tsconfig.server.json has no DOM lib. This covers
// what the types do not: a browser package or a UI layer pulled into the server,
// and the web app reaching into server/ or Node.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'server');
const SRC = join(ROOT, 'src');

/** Layers of the web app that only make sense in a browser. */
const UI_LAYERS = ['src/components/', 'src/state/', 'src/storage/'];

// `import type` and `export type` are erased before the code runs, so they are not followed.
const STATIC = /^\s*(?:import|export)\s+(type\s+)?(?:[^'"();=]*?\s+from\s+)?['"]([^'"]+)['"]/gm;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function specifiersOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const match of source.matchAll(STATIC)) {
    if (!match[1]) out.push(match[2]);
  }
  for (const match of source.matchAll(DYNAMIC)) out.push(match[1]);
  return out;
}

const isRelative = (specifier: string) => specifier.startsWith('.');
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const repoPath = (file: string) => relative(ROOT, file).split(sep).join('/');

function resolveRelative(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  const found = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!found) throw new Error(`${repoPath(from)} imports "${specifier}", which is not a file`);
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !isTest(path) ? [path] : [];
  });
}

/** Every file the entry points load at runtime. */
function importGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of specifiersOf(file)) {
      if (isRelative(specifier)) queue.push(resolveRelative(file, specifier));
    }
  }
  return seen;
}

describe('server / web app isolation', () => {
  const shared = [...importGraph(sourceFiles(SERVER))].filter((file) => file.startsWith(SRC + sep));

  it('follows the server into src/', () => {
    const paths = shared.map(repoPath);
    expect(paths).toContain('src/bridge/protocol.ts');
    expect(paths).toContain('src/scenes/build.ts');
  });

  it('keeps UI layers and components out of the server', () => {
    const offenders = shared
      .map(repoPath)
      .filter((path) => path.endsWith('.tsx') || UI_LAYERS.some((layer) => path.startsWith(layer)));
    expect(offenders).toEqual([]);
  });

  it('keeps packages out of the modules the server shares with the web app', () => {
    const offenders = shared.flatMap((file) =>
      specifiersOf(file)
        .filter((specifier) => !isRelative(specifier))
        .map((specifier) => `${repoPath(file)} imports "${specifier}"`),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps server/ and Node out of the web app', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      specifiersOf(file)
        .filter((specifier) =>
          isRelative(specifier) ? resolveRelative(file, specifier).startsWith(SERVER + sep) : specifier.startsWith('node:'),
        )
        .map((specifier) => `${repoPath(file)} imports "${specifier}"`),
    );
    expect(offenders).toEqual([]);
  });
});
