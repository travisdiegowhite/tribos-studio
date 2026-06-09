// Drift guard: HANDLED_HEALTH_TYPES is duplicated between the Vercel webhook
// handler and the Cloudflare worker because the worker can't import across
// packages (see the DUPLICATION NOTE in the worker source). If the two sets
// drift, one door accepts health events the processor no-ops on (queue bloat)
// or drops types the other still expects. This test parses both source files
// and fails the build when they disagree.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function extractHandledHealthTypes(filePath) {
  const source = readFileSync(resolve(repoRoot, filePath), 'utf8');
  const match = source.match(/HANDLED_HEALTH_TYPES\s*=\s*new Set\(\[([^\]]*)\]\)/);
  if (!match) throw new Error(`HANDLED_HEALTH_TYPES literal not found in ${filePath}`);
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
    .sort();
}

describe('HANDLED_HEALTH_TYPES drift guard', () => {
  it('matches between api/garmin-webhook.js and the Cloudflare worker', () => {
    const vercel = extractHandledHealthTypes('api/garmin-webhook.js');
    const worker = extractHandledHealthTypes('cloudflare-workers/garmin-webhook/src/index.js');
    expect(worker).toEqual(vercel);
  });

  it('contains the five types the health processor persists', () => {
    const vercel = extractHandledHealthTypes('api/garmin-webhook.js');
    expect(vercel).toEqual(['bodyComps', 'dailies', 'hrv', 'sleeps', 'stressDetails']);
  });
});
