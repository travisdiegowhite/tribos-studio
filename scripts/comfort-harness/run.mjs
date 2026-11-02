#!/usr/bin/env node
/**
 * Entry point for the comfort harness: bundles harness.ts (and the src/
 * modules it uses) with esbuild, then runs it. One command:
 *
 *   npm run harness:comfort -- --engine brouter-tribos --baseline scripts/comfort-harness/results/<baseline>.json
 *
 * esbuild ships with Vite, so there is nothing extra to install. Vite-only
 * syntax is handled here: `?raw` imports (the BRouter profile templates)
 * load as text, and `import.meta.env` reads process.env.
 */

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = resolve(root, 'node_modules/.cache/comfort-harness/harness.mjs');

const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'raw',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const env = {
  VITE_STADIA_API_KEY: process.env.VITE_STADIA_API_KEY || process.env.STADIA_API_KEY || '',
  VITE_USE_STADIA_MAPS: 'true',
  VITE_BROUTER_URL: process.env.VITE_BROUTER_URL || process.env.BROUTER_URL || '',
  DEV: false,
  PROD: true,
  MODE: 'harness',
};

await build({
  entryPoints: [resolve(root, 'scripts/comfort-harness/harness.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  plugins: [rawPlugin],
  define: { 'import.meta.env': JSON.stringify(env) },
  // Keep the Stadia client's dependency tree out of runs that don't use it.
  splitting: false,
});

const { main } = await import(pathToFileURL(outfile).href);
// The harness logs per run; silence the production clients' chatter.
const quiet = process.argv.includes('--verbose') ? null : console.log;
if (quiet) {
  console.log = (...a) => {
    const s = typeof a[0] === 'string' ? a[0] : '';
    if (/^[\s\d]{4} |^\nwrote|^wrote/.test(s)) quiet(...a);
  };
}
await main(process.argv.slice(2));
