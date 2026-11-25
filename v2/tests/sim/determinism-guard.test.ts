// Proves the DETERMINISM GUARD actually fires.
//
// A lint rule that is configured but never triggered is indistinguishable from no rule at all.
// This test writes known-bad files into a temp directory inside src/sim, runs ESLint on them
// programmatically, and asserts the specific rules report errors — then removes the files.
//
// This is deliberately a real ESLint run rather than a regex over the config: it proves the
// wiring (config → parser → rule → message), which is the part that silently breaks.

import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';

const v2Root = process.cwd();
const fixtureDir = join(v2Root, 'src', 'sim', '__lint_fixture__');

function writeFixture(name: string, body: string): string {
  mkdirSync(fixtureDir, { recursive: true });
  const p = join(fixtureDir, name);
  writeFileSync(p, body);
  return p;
}

async function lintFile(path: string): Promise<{ ruleId: string; message: string }[]> {
  const eslint = new ESLint({ cwd: v2Root });
  const results = await eslint.lintFiles([path]);
  const out: { ruleId: string; message: string }[] = [];
  for (const r of results) {
    for (const m of r.messages) out.push({ ruleId: m.ruleId ?? '(fatal)', message: m.message });
  }
  return out;
}

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

describe('determinism guard: the lint rule is live', () => {
  it('rejects Math.random() inside src/sim', async () => {
    const p = writeFixture('bad-random.ts', `export const roll = (): number => Math.random();\n`);
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-properties' && /seeded PRNG/.test(m.message))).toBe(
      true,
    );
  }, 30000);

  it('rejects Date.now() inside src/sim', async () => {
    const p = writeFixture('bad-clock.ts', `export const now = (): number => Date.now();\n`);
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-properties' && /Date\.now/.test(m.message))).toBe(
      true,
    );
  }, 30000);

  it('rejects a rendering import inside src/sim', async () => {
    const p = writeFixture('bad-import.ts', `import { Application } from 'pixi.js';\nexport const app = Application;\n`);
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  }, 30000);

  it('rejects a UI-layer import inside src/sim', async () => {
    const p = writeFixture(
      'bad-layer.ts',
      `import { el } from '../ui/dom';\nexport const x = el;\n`,
    );
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-imports' && /must not import/.test(m.message))).toBe(
      true,
    );
  }, 30000);

  it('rejects window inside src/sim', async () => {
    const p = writeFixture('bad-window.ts', `export const w = (): unknown => window;\n`);
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-globals' && /headless/.test(m.message))).toBe(true);
  }, 30000);

  it('rejects performance.now() inside src/sim', async () => {
    const p = writeFixture('bad-perf.ts', `export const t = (): number => performance.now();\n`);
    const msgs = await lintFile(p);
    expect(msgs.some((m) => m.ruleId === 'no-restricted-globals')).toBe(true);
  }, 30000);

  it('does NOT reject clean, pure sim code', async () => {
    const p = writeFixture(
      'good-pure.ts',
      `export function add(a: number, b: number): number {\n  return a + b;\n}\n`,
    );
    const msgs = await lintFile(p);
    expect(msgs.filter((m) => m.ruleId !== null)).toEqual([]);
  }, 30000);

  it('DOES allow Math.random outside src/sim (the guard is scoped, not global)', async () => {
    // The renderer may legitimately use Math.random for cosmetic jitter.
    const p = join(v2Root, 'src', '__lint_outside__', 'ok.ts');
    mkdirSync(join(v2Root, 'src', '__lint_outside__'), { recursive: true });
    writeFileSync(p, `export const jitter = (): number => Math.random();\n`);
    try {
      const msgs = await lintFile(p);
      expect(msgs.filter((m) => m.ruleId === 'no-restricted-properties')).toEqual([]);
    } finally {
      rmSync(join(v2Root, 'src', '__lint_outside__'), { recursive: true, force: true });
    }
  }, 30000);
});
