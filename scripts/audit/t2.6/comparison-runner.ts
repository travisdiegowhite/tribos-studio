/**
 * T2.6 one-off audit script.
 *
 * Runs the same waypoint sets through both:
 *   - legacy pipeline (`smartCyclingRouter.getSmartCyclingRoute`)
 *   - new pipeline (`getRouterClient().solve(...)`)
 *
 * For each test case, captures:
 *   - distance (km), elevation gain (m), wall time (ms), provider used
 *   - the full geometry, dumped to `docs/audit/t2.6/geojson/<case>.geojson`
 *
 * Flags discrepancies above set thresholds. The visual inspection step
 * (Step 8 of the T2.6 spec) is human-driven: open the GeoJSON files in
 * https://geojson.io after the script runs.
 *
 * Delete this directory once T2.6 is closed (per spec, throwaway).
 *
 * Usage:
 *   npx tsx scripts/audit/t2.6/comparison-runner.ts
 *
 * Requires environment:
 *   VITE_STADIA_API_KEY, VITE_MAPBOX_TOKEN, VITE_SUPABASE_URL,
 *   VITE_SUPABASE_ANON_KEY
 *
 * Note: this script imports modules that read `import.meta.env`. Run
 * it with `tsx` (not plain `node`) and with a `.env` populated.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getSmartCyclingRoute } from '../../../src/utils/smartCyclingRouter';
import { getRouterClient } from '../../../src/routing/RouterClient';
import type { RoutingProfile } from '../../../src/routing/executor';

type Coord = [number, number];

interface TestCase {
  name: string;
  waypoints: Coord[];
  profile: RoutingProfile;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Erie short road loop',
    waypoints: [
      [-105.0500, 40.0500],
      [-105.1063, 40.0500],
      [-105.1063, 40.0764],
      [-105.0500, 40.0764],
      [-105.0500, 40.0500],
    ],
    profile: 'road',
  },
  {
    name: 'Erie to Lyons one-way (climbing)',
    waypoints: [
      [-105.0500, 40.0500],
      [-105.2700, 40.2247],
    ],
    profile: 'road',
  },
  {
    name: 'Boulder Front Range gravel loop',
    waypoints: [
      [-105.2705, 40.0150],
      [-105.3500, 40.0800],
      [-105.4000, 40.1200],
      [-105.3000, 40.1000],
      [-105.2705, 40.0150],
    ],
    profile: 'gravel',
  },
  {
    name: 'Boulder flat commute',
    waypoints: [
      [-105.2705, 40.0150],
      [-105.2400, 40.0050],
      [-105.2100, 40.0200],
    ],
    profile: 'commute',
  },
  {
    name: 'Nederland MTB loop',
    waypoints: [
      [-105.5108, 39.9614],
      [-105.5400, 39.9800],
      [-105.5600, 39.9700],
      [-105.5400, 39.9500],
      [-105.5108, 39.9614],
    ],
    profile: 'mtb',
  },
  {
    name: 'Long road climb — Boulder to Estes Park',
    waypoints: [
      [-105.2705, 40.0150],
      [-105.5217, 40.3772],
    ],
    profile: 'road',
  },
];

interface RunOutcome {
  distance_km: number;
  elevation_m: number;
  duration_ms: number;
  provider_used: string;
  coordinates_count: number;
  geometry: Coord[];
  ok: boolean;
  error?: string;
}

const OUT_DIR = path.join(process.cwd(), 'docs', 'audit', 't2.6', 'geojson');

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

async function runLegacy(test: TestCase): Promise<RunOutcome> {
  const start = Date.now();
  try {
    const result = await getSmartCyclingRoute(
      test.waypoints as unknown as Array<[number, number]>,
      {
        profile: test.profile === 'mtb' ? 'mountain' : test.profile === 'commute' ? 'commuting' : test.profile,
        mapboxToken: process.env.VITE_MAPBOX_TOKEN,
      },
    ) as {
      coordinates?: Coord[];
      distance_m?: number;
      distance?: number;
      elevationGain?: number;
      source?: string;
    } | null;
    if (!result) {
      return {
        distance_km: 0,
        elevation_m: 0,
        duration_ms: Date.now() - start,
        provider_used: 'none',
        coordinates_count: 0,
        geometry: [],
        ok: false,
        error: 'legacy returned null',
      };
    }
    const distance_m = result.distance_m ?? result.distance ?? 0;
    return {
      distance_km: distance_m / 1000,
      elevation_m: result.elevationGain ?? 0,
      duration_ms: Date.now() - start,
      provider_used: result.source ?? 'unknown',
      coordinates_count: result.coordinates?.length ?? 0,
      geometry: result.coordinates ?? [],
      ok: true,
    };
  } catch (err) {
    return {
      distance_km: 0,
      elevation_m: 0,
      duration_ms: Date.now() - start,
      provider_used: 'none',
      coordinates_count: 0,
      geometry: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runNew(test: TestCase): Promise<RunOutcome> {
  const start = Date.now();
  const client = getRouterClient();
  const result = await client.solve(
    {
      waypoints: test.waypoints,
      profile: test.profile,
      shape: 'loop',
    },
    {
      mapbox_token: process.env.VITE_MAPBOX_TOKEN,
      training_goal: 'endurance',
    },
  );
  if (!result.ok) {
    return {
      distance_km: 0,
      elevation_m: 0,
      duration_ms: Date.now() - start,
      provider_used: 'none',
      coordinates_count: 0,
      geometry: [],
      ok: false,
      error: `${result.reason.kind}`,
    };
  }
  return {
    distance_km: result.route.stats.distance_km,
    elevation_m: result.route.stats.elevation_gain_m,
    duration_ms: result.metadata.duration_ms,
    provider_used: result.metadata.provider_used ?? 'unknown',
    coordinates_count: result.route.geometry.length,
    geometry: result.route.geometry,
    ok: true,
  };
}

function writeGeoJSON(test: TestCase, legacy: RunOutcome, fresh: RunOutcome) {
  const file = path.join(
    OUT_DIR,
    test.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.geojson',
  );
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          source: 'legacy',
          name: test.name,
          provider_used: legacy.provider_used,
          distance_km: legacy.distance_km,
          elevation_m: legacy.elevation_m,
          duration_ms: legacy.duration_ms,
        },
        geometry: { type: 'LineString', coordinates: legacy.geometry },
      },
      {
        type: 'Feature',
        properties: {
          source: 'new',
          name: test.name,
          provider_used: fresh.provider_used,
          distance_km: fresh.distance_km,
          elevation_m: fresh.elevation_m,
          duration_ms: fresh.duration_ms,
        },
        geometry: { type: 'LineString', coordinates: fresh.geometry },
      },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(geojson, null, 2));
}

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Comparing ${TEST_CASES.length} cases.\n`);
  for (const test of TEST_CASES) {
    console.log(`=== ${test.name} (${test.profile}) ===`);
    const legacy = await runLegacy(test);
    const fresh = await runNew(test);

    if (!legacy.ok) console.log(`  LEGACY FAILED: ${legacy.error}`);
    if (!fresh.ok) console.log(`  NEW FAILED: ${fresh.error}`);

    if (legacy.ok && fresh.ok) {
      console.log(
        `  Legacy: ${legacy.distance_km.toFixed(2)} km, ${legacy.elevation_m} m, ${legacy.duration_ms} ms, provider=${legacy.provider_used}`,
      );
      console.log(
        `  New:    ${fresh.distance_km.toFixed(2)} km, ${fresh.elevation_m} m, ${fresh.duration_ms} ms, provider=${fresh.provider_used}`,
      );

      const distDiff = Math.abs(legacy.distance_km - fresh.distance_km);
      const elevDiff = Math.abs(legacy.elevation_m - fresh.elevation_m);
      if (distDiff > 0.5) console.log(`  ⚠ distance differs by ${distDiff.toFixed(2)} km`);
      if (elevDiff > 30) console.log(`  ⚠ elevation differs by ${elevDiff} m`);
      if (fresh.elevation_m === 0 && legacy.elevation_m > 0) {
        console.log(`  🔴 NEW ELEVATION ZERO BUG: legacy reports ${legacy.elevation_m} m`);
      }
      if (fresh.elevation_m === 0 && legacy.elevation_m === 0) {
        console.log(`  ℹ both pipelines report 0 m elevation (likely no enrichment step ran)`);
      }
      if (fresh.duration_ms > legacy.duration_ms * 1.5 && legacy.duration_ms > 200) {
        console.log(
          `  ⚠ latency: new is ${((fresh.duration_ms / legacy.duration_ms - 1) * 100).toFixed(0)}% slower`,
        );
      }

      writeGeoJSON(test, legacy, fresh);
    }
    console.log('');
  }
  console.log(`\nGeoJSON outputs in: ${OUT_DIR}`);
  console.log('Open them in https://geojson.io for visual inspection.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
