/**
 * Re-export of coach.js's intent detectors for tests.
 *
 * api/coach.js constructs an Anthropic client and a Supabase client at module
 * scope, so importing it in a unit test fails on missing env. The detectors are
 * pure functions; this module lifts them out by parsing the source rather than
 * duplicating them, so a test asserting on their behaviour cannot drift from
 * the real implementation the way a hand-copied twin would.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = readFileSync(path.resolve(process.cwd(), 'api/coach.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`export function ${name}(`);
  if (start === -1) throw new Error(`${name} not found in api/coach.js`);
  // Functions are top-level, so the first line that is exactly "}" ends it.
  const end = src.indexOf('\n}\n', start);
  const body = src.slice(start + 'export '.length, end + 2);
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return ${name};`)();
}

export const detectCoachIntent = lift('detectCoachIntent');
export const detectIntentFromResponse = lift('detectIntentFromResponse');
