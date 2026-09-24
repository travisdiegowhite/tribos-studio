#!/usr/bin/env node
/**
 * Validate the Tribos BRouter profiles against a live server.
 *
 * BRouter's profile parser is Java, so the only way to know a profile is
 * syntactically valid is to upload it and route with it. This uploads each
 * profile in routing-profiles/ at its default parameters (and the road one
 * at quiet / direct), routes Erie → Boulder, and prints the distance and the
 * tag keys BRouter reported for the ways it rode — those keys are what the
 * traffic-stress and surface analyses see.
 *
 *   BROUTER_URL=https://tribos-brouter.fly.dev node scripts/validate-brouter-profiles.mjs
 *   node scripts/validate-brouter-profiles.mjs            # brouter.de
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.BROUTER_URL || 'https://brouter.de').replace(/\/$/, '');
const DIR = path.resolve('routing-profiles');
const ERIE_TO_BOULDER = '-105.05,40.05|-105.27,40.015';

function render(template, params) {
  return template.replace(
    /^(assign\s+(\w+)\s*=\s*)([^\s#]+)(\s*#\s*%\2%.*)$/gm,
    (line, head, name, value, tail) =>
      Object.prototype.hasOwnProperty.call(params, name) ? `${head}${params[name]}${tail}` : line,
  );
}

async function upload(text) {
  const resp = await fetch(`${BASE}/brouter/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: text,
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`upload ${resp.status}: ${body.slice(0, 200)}`);
  const id = JSON.parse(body).profileid;
  if (!id) throw new Error(`upload returned no profileid: ${body.slice(0, 200)}`);
  return id;
}

async function route(profileId) {
  const url = `${BASE}/brouter?lonlats=${ERIE_TO_BOULDER}&profile=${profileId}&alternativeidx=0&format=geojson`;
  const resp = await fetch(url);
  const body = await resp.text();
  if (!resp.ok) throw new Error(`route ${resp.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  const f = json.features?.[0];
  if (!f) throw new Error(`no route: ${body.slice(0, 200)}`);
  const msgs = f.properties.messages || [];
  const header = msgs[0] || [];
  const ti = header.indexOf('WayTags');
  const keys = new Map();
  for (const row of msgs.slice(1)) {
    for (const tok of String(row[ti] ?? '').split(/\s+/)) {
      const k = tok.split('=')[0];
      if (k) keys.set(k, (keys.get(k) ?? 0) + 1);
    }
  }
  return {
    km: (parseFloat(f.properties['track-length']) / 1000).toFixed(1),
    rows: msgs.length - 1,
    keys: [...keys.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' '),
  };
}

let failed = false;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.brf')).sort()) {
  const template = fs.readFileSync(path.join(DIR, file), 'utf8');
  const variants =
    file.includes('road')
      ? [{ traffic_tolerance: 0 }, { traffic_tolerance: 1 }, { traffic_tolerance: 2 }]
      : [{ traffic_tolerance: 1, gravel_target: 0.5 }, { traffic_tolerance: 0, gravel_target: 0.9 }];
  for (const params of variants) {
    const label = `${file} ${JSON.stringify(params)}`;
    try {
      const t = Date.now();
      const id = await upload(render(template, params));
      const r = await route(id);
      console.log(`OK   ${label} → ${id} ${r.km} km, ${r.rows} tag rows, ${Date.now() - t} ms\n     keys: ${r.keys}`);
    } catch (err) {
      failed = true;
      console.log(`FAIL ${label}: ${err.message}`);
    }
  }
}
process.exit(failed ? 1 : 0);
