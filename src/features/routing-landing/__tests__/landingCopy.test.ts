import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allLandingCopy } from '../landingCopy';
import { allComfortCopy } from '../../../utils/comfortLevels';

const ABSOLUTES = /\b(never|always|guaranteed)\b/i;
// Describe roads as a rider sees them (spec copy rules).
const JARGON = /\b(LTS|traffic stress|level of traffic stress)\b/i;

describe('routing landing copy', () => {
  const lines = [...allLandingCopy(), ...allComfortCopy()];

  it('has copy to check', () => {
    expect(lines.length).toBeGreaterThan(30);
  });

  it.each(lines)('no absolutes: %s', (line) => {
    expect(line).not.toMatch(ABSOLUTES);
  });

  it.each(lines)('no metric jargon: %s', (line) => {
    expect(line).not.toMatch(JARGON);
  });

  it('reads the product name from the constant, not a literal in components', () => {
    const dir = join(__dirname, '..');
    const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    const brand = /\btribos\b(?![-.@])/i;
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^import .*$/gm, '');
      // String literals on one line, and JSX text between tags.
      const literals = [...text.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
      const jsxText = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
      for (const piece of [...literals, ...jsxText]) expect(piece, f).not.toMatch(brand);
    }
  });
});
