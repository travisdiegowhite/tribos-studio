import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

// The spin-off rule: only host.ts may import tribos code. Everything else in
// the feature imports packages or files inside src/features/shop/.
const ROOT = resolve(process.cwd(), 'src/features/shop');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('shop feature boundary', () => {
  it('only host.ts imports from outside src/features/shop', () => {
    const leaks: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      if (file === join(ROOT, 'host.ts')) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2];
        const isAlias = spec.startsWith('@/');
        const escapes = spec.startsWith('.') && relative(ROOT, resolve(dirname(file), spec)).startsWith('..');
        if (isAlias || escapes) leaks.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(leaks, `Import tribos through host.ts instead:\n${leaks.join('\n')}`).toEqual([]);
  });

  it('owner.ts stays import-free so AppShell can read it without loading the feature', () => {
    expect(readFileSync(join(ROOT, 'owner.ts'), 'utf8')).not.toMatch(/\bimport\b/);
  });
});
