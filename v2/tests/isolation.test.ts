// v2 isolation: v2 must not import anything from v1.
//
// The rebuild lives in v2/ and the current game lives at the repository root. A stray
// `../src/...` import would couple the two codebases and could drag v1's renderer, storage, or
// data layer into v2's bundle — exactly what "separately built" is meant to prevent.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const v2Root = process.cwd();
const srcRoot = join(v2Root, 'src');

function allFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** Import specifiers in a TS file (static imports, re-exports, and dynamic import()). */
function importSpecifiers(src: string): string[] {
  const specs: string[] = [];
  const staticRe = /(?:^|\n)\s*(?:import|export)[^;'"]*?from\s*['"]([^'"]+)['"]/g;
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticRe, bareRe, dynRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[1]) specs.push(m[1]);
  }
  return specs;
}

describe('v2 does not depend on v1', () => {
  const files = allFiles(srcRoot).filter((f) => f.endsWith('.ts'));

  it('finds v2 source files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no v2 source file escapes the v2 directory', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(src)) {
        if (!spec.startsWith('.')) continue;
        // A relative import that climbs above v2/src is reaching into v1 territory.
        const resolved = join(file, '..', spec);
        const rel = relative(v2Root, resolved);
        if (rel.startsWith('..')) {
          offenders.push(`${relative(v2Root, file)} imports ${spec}`);
        }
      }
    }
    expect(offenders, `v2 files importing outside v2/:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no v2 source file references v1 paths by name', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const spec of importSpecifiers(src)) {
        if (spec.includes('/../src/') || spec.startsWith('../../../../src/') || spec.includes('/../data/')) {
          offenders.push(`${relative(v2Root, file)} imports ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('v2 has its own package.json, tsconfig and vite config', () => {
    for (const f of ['package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js']) {
      expect(() => readFileSync(join(v2Root, f), 'utf8')).not.toThrow();
    }
  });

  it('v2 reads its own data directory, not the v1 one', () => {
    // The loader globs '/data/**/*.json' which resolves relative to the Vite root (v2/).
    const loader = readFileSync(join(srcRoot, 'data', 'loader.ts'), 'utf8');
    expect(loader).toContain("import.meta.glob('/data/**/*.json'");
    // And v2/data must actually contain the content.
    const units = readdirSync(join(v2Root, 'data', 'units')).filter((n) => n.endsWith('.json'));
    expect(units.length).toBeGreaterThanOrEqual(10);
  });
});
