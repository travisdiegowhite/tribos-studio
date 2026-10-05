/**
 * The spin-off contract: nothing in src/features/shop/ may import from the
 * rest of tribos except host.tsx. If this fails, route the dependency through
 * host.tsx (or copy the helper into the feature) rather than widening the
 * allowlist — every exception is something a future standalone app would
 * have to untangle.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'features', 'shop');
const HOST = join(ROOT, 'host.tsx');

// npm packages the shop may use. A spin-off app installs exactly these.
const ALLOWED_PACKAGES = [
  'react',
  'react-dom',
  'react-router-dom',
  '@mantine/core',
  '@mantine/notifications',
  '@phosphor-icons/react',
  '@supabase/supabase-js',
  'html5-qrcode', // camera scanning (loaded on demand)
  'qrcode', // QR label generation
  'vitest',
  'node:fs',
  'node:path',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|jsx?)$/.test(name) ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const specs = new Set<string>();
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specs.add(m[1]);
  return [...specs];
}

const packageName = (spec: string) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);

describe('shop feature boundary', () => {
  const files = walk(ROOT).filter((f) => f !== HOST);

  it('finds the feature files', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('imports nothing from tribos except through host.tsx', () => {
    const leaks: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('@/')) {
          leaks.push(`${relative(ROOT, file)} → ${spec}`);
          continue;
        }
        if (!spec.startsWith('.')) continue;
        const target = resolve(dirname(file), spec);
        if (target !== ROOT && !target.startsWith(ROOT + sep)) leaks.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(leaks, `Imports that reach outside src/features/shop/:\n  ${leaks.join('\n  ')}`).toEqual([]);
  });

  it('uses only the agreed npm packages', () => {
    const extra: string[] = [];
    for (const file of files) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('.') || spec.startsWith('@/')) continue;
        if (!ALLOWED_PACKAGES.includes(packageName(spec))) extra.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    expect(extra, `Packages not on the shop's list (add them deliberately):\n  ${extra.join('\n  ')}`).toEqual([]);
  });
});
