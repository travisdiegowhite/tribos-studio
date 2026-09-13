import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VALID_STEPS } from './activation.js';

// completeActivationStep() rejects an unknown step name with a console.error
// and returns — it never throws — so a typo at a call site is invisible in
// production. The COROS webhook shipped with 'first_activity' and no COROS
// athlete could ever complete first_sync. This walks every call site in
// api/ and checks the literal against VALID_STEPS, in the same spirit as
// schemaContract.test.js.

const API = join(process.cwd(), 'api');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts)$/.test(name) && !/\.test\.(js|ts)$/.test(name)) out.push(p);
  }
  return out;
}

const CALL = /completeActivationStep\(\s*[^,]+,\s*[^,]+,\s*(['"`])([^'"`]+)\1/g;

describe('completeActivationStep call sites', () => {
  const calls = [];
  for (const file of walk(API)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) calls.push({ file: file.slice(API.length + 1), step: m[2] });
  }

  it('finds the webhook call sites', () => {
    const files = new Set(calls.map((c) => c.file));
    expect(files.has('coros-webhook-process.js')).toBe(true);
    expect(files.has('strava-webhook.js')).toBe(true);
  });

  it('every literal step name is a valid step', () => {
    const bad = calls.filter((c) => !VALID_STEPS.includes(c.step));
    expect(bad, `Unknown activation steps:\n${bad.map((b) => `  ${b.file}: '${b.step}'`).join('\n')}`).toEqual([]);
  });

  it('COROS completes first_sync like the other providers', () => {
    const coros = calls.filter((c) => c.file === 'coros-webhook-process.js').map((c) => c.step);
    expect(coros).toContain('first_sync');
  });
});
