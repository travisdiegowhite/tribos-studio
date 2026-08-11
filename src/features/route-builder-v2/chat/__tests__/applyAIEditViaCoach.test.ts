import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks for the store, auth, geometry engine, and mutation utils ──────────

const setRouteGeometry = vi.fn();
const setRouteStats = vi.fn();
let storeState: Record<string, unknown>;

// NOTE: vi.mock paths resolve relative to THIS test file (one level below
// the chat/ modules), hence the extra `..` compared to the module imports.
vi.mock('../../../../stores/routeBuilderStore', () => ({
  useRouteBuilderStore: { getState: () => storeState },
}));

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

const applyRouteEdit = vi.fn();
vi.mock('../../../../utils/aiRouteEditService', () => ({
  applyRouteEdit: (...a: unknown[]) => applyRouteEdit(...a),
}));

const fetchElevationGain = vi.fn();
vi.mock('../../../../utils/routeMutation', () => ({
  computeDistanceKm: (coords: Array<[number, number]>) => coords.length * 10,
  rerouteShortened: (coords: unknown) => Promise.resolve(coords),
  fetchElevationGain: (...a: unknown[]) => fetchElevationGain(...a),
}));

vi.mock('../../telemetry/trackRb2', () => ({ trackRb2: () => {} }));

import { applyAIEditViaCoach } from '../applyAIEditViaCoach';
import { clearCheckpoints, checkpointCount, pushCheckpoint } from '../editCheckpoints';
import type { Coordinate } from '../../../../types/geo';

const GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [-105.27, 40.01],
    [-105.25, 40.03],
    [-105.23, 40.01],
  ] as Coordinate[],
};
const STATS = { distance_km: 30, elevation_gain_m: 300, duration_s: 3600 };

function mockFetchResponse(body: Record<string, unknown>) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const EDITED_COORDS = [
  [-105.27, 40.01],
  [-105.26, 40.05],
  [-105.23, 40.01],
] as Coordinate[];

beforeEach(() => {
  vi.clearAllMocks();
  clearCheckpoints();
  storeState = {
    routeGeometry: GEOMETRY,
    routeStats: { ...STATS },
    routeProfile: 'road',
    routeType: 'loop',
    setRouteGeometry,
    setRouteStats,
  };
  fetchElevationGain.mockResolvedValue(450);
  applyRouteEdit.mockResolvedValue({
    success: true,
    editedRoute: { coordinates: EDITED_COORDS },
    comparison: { elevationDelta: 150 },
    message: 'done',
  });
});

describe('applyAIEditViaCoach — failure classification', () => {
  it.each([
    [429, 'infra'],
    [500, 'infra'],
    [503, 'infra'],
    [400, 'refusal'],
  ] as const)('marks HTTP %d as %s', async (status, kind) => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ error: 'nope' }),
    }) as unknown as typeof fetch;

    const res = await applyAIEditViaCoach('hillier', [], 'route-1');
    expect(res.ok).toBe(false);
    expect(res.failureKind).toBe(kind);
  });

  it('marks a network throw as infra', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    const res = await applyAIEditViaCoach('hillier', [], 'route-1');
    expect(res.ok).toBe(false);
    expect(res.failureKind).toBe('infra');
  });
});

describe('applyAIEditViaCoach — phases', () => {
  it('emits rerouting then measuring during a geometry edit', async () => {
    mockFetchResponse({
      message: 'ok',
      proposedEdits: [{ editIntent: { intent: 'add_climbing' } }],
    });
    const onPhase = vi.fn();

    await applyAIEditViaCoach('hillier', [], 'route-1', true, false, { onPhase });

    expect(onPhase.mock.calls.map((c) => c[0])).toEqual(['rerouting', 'measuring']);
  });

  it('emits no phases for a conversational reply', async () => {
    mockFetchResponse({ message: 'Just chatting.', proposedEdits: [] });
    const onPhase = vi.fn();

    await applyAIEditViaCoach('hello', [], 'route-1', true, false, { onPhase });

    expect(onPhase).not.toHaveBeenCalled();
  });
});

describe('applyAIEditViaCoach — request body', () => {
  it('sends units, routeType, and planAware to the endpoint', async () => {
    mockFetchResponse({ message: 'Just chatting.', proposedEdits: [] });

    await applyAIEditViaCoach('hello', [], 'route-1', false, true);

    const body = JSON.parse(
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.units).toBe('imperial');
    expect(body.planAware).toBe(false);
    expect(body.routeSnapshot.routeType).toBe('loop');
  });
});

describe('applyAIEditViaCoach — checkpoints', () => {
  it('pushes a checkpoint of the pre-edit route on a successful apply', async () => {
    mockFetchResponse({
      message: 'Hillier now.',
      proposedEdits: [{ editIntent: { intent: 'add_climbing' } }],
    });

    const res = await applyAIEditViaCoach('hillier', [], 'route-1');

    expect(res.ok).toBe(true);
    expect(res.routeChanged).toBe(true);
    expect(checkpointCount()).toBe(1);
    expect(setRouteGeometry).toHaveBeenCalledWith({
      type: 'LineString',
      coordinates: EDITED_COORDS,
    });
    // The pre-edit snapshot is returned for the Keep/Revert review UI.
    expect(res.previousCheckpoint?.geometry.coordinates).toEqual(GEOMETRY.coordinates);
    expect(res.previousCheckpoint?.stats.distance_km).toBe(30);
    expect(res.partialApplied).toBe(false);
    expect(res.wasRestore).toBe(false);
  });

  it('restore_previous pops a checkpoint and writes it back without re-fetching elevation', async () => {
    const previous = {
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-105.3, 40.0],
          [-105.28, 40.02],
        ] as Coordinate[],
      },
      stats: { distance_km: 42, elevation_gain_m: 800, duration_s: 5400 },
    };
    pushCheckpoint(previous);
    mockFetchResponse({
      message: 'Restored your previous route.',
      proposedEdits: [{ editIntent: { intent: 'restore_previous' } }],
    });

    const res = await applyAIEditViaCoach('go back to the loop I had', [], 'route-1');

    expect(res.ok).toBe(true);
    expect(res.routeChanged).toBe(true);
    expect(setRouteGeometry).toHaveBeenCalledWith(previous.geometry);
    expect(setRouteStats).toHaveBeenCalledWith(
      expect.objectContaining({ distance_km: 42, elevation_gain_m: 800 }),
    );
    expect(applyRouteEdit).not.toHaveBeenCalled();
    expect(fetchElevationGain).not.toHaveBeenCalled();
    // A pure restore must not push the version it just left back onto
    // the stack — repeated "go back" walks further back, not in circles.
    expect(checkpointCount()).toBe(0);
    expect(res.wasRestore).toBe(true);
    // No Keep/Revert card for an explicit restore.
    expect(res.previousCheckpoint).toBeNull();
  });

  it('an empty checkpoint stack makes restore a graceful no-op', async () => {
    mockFetchResponse({
      message: 'Going back.',
      proposedEdits: [{ editIntent: { intent: 'restore_previous' } }],
    });

    const res = await applyAIEditViaCoach('undo that', [], 'route-1');

    expect(res.ok).toBe(true);
    expect(res.routeChanged).toBe(false);
    expect(res.ok && res.assistantText).toMatch(/no earlier version/i);
    expect(setRouteGeometry).not.toHaveBeenCalled();
  });
});

describe('applyAIEditViaCoach — multi-edit sequences', () => {
  it('keeps a partial result but names the failure and offers revert', async () => {
    applyRouteEdit
      .mockResolvedValueOnce({
        success: true,
        editedRoute: { coordinates: EDITED_COORDS },
        comparison: { elevationDelta: 150 },
        message: 'ok',
      })
      .mockResolvedValueOnce({ success: false, message: 'no hillier roads nearby' });
    mockFetchResponse({
      message: 'Longer and hillier coming up.',
      proposedEdits: [
        { editIntent: { intent: 'longer' } },
        { editIntent: { intent: 'add_climbing' } },
      ],
    });

    const res = await applyAIEditViaCoach('longer and hillier', [], 'route-1');

    expect(res.ok).toBe(true);
    expect(res.routeChanged).toBe(true);
    expect(res.partialApplied).toBe(true);
    const text = res.ok ? res.assistantText : '';
    expect(text).toMatch(/Applied 1 of 2/);
    expect(text).toMatch(/no hillier roads nearby/);
    expect(text).toMatch(/revert/i);
  });

  it('feeds the running elevation into the next edit in the sequence', async () => {
    mockFetchResponse({
      message: 'Both changes.',
      proposedEdits: [
        { editIntent: { intent: 'add_climbing' } },
        { editIntent: { intent: 'longer' } },
      ],
    });

    await applyAIEditViaCoach('hillier and longer', [], 'route-1');

    expect(applyRouteEdit).toHaveBeenCalledTimes(2);
    // First edit sees the original 300 m; second sees 300 + 150 delta.
    expect(applyRouteEdit.mock.calls[0][0].routeStats.elevation_gain_m).toBe(300);
    expect(applyRouteEdit.mock.calls[1][0].routeStats.elevation_gain_m).toBe(450);
    // The declared shape reaches the geometry engine.
    expect(applyRouteEdit.mock.calls[0][0].routeType).toBe('loop');
  });

  it('restore then edit works in one turn (restore first, edit the restored route)', async () => {
    const previous = {
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [-105.3, 40.0],
          [-105.28, 40.02],
          [-105.3, 40.0],
        ] as Coordinate[],
      },
      stats: { distance_km: 42, elevation_gain_m: 800, duration_s: 5400 },
    };
    pushCheckpoint(previous);
    mockFetchResponse({
      message: 'Back to the loop, then longer.',
      proposedEdits: [
        { editIntent: { intent: 'restore_previous' } },
        { editIntent: { intent: 'longer' } },
      ],
    });

    const res = await applyAIEditViaCoach('go back to the loop and make it longer', [], 'route-1');

    expect(res.ok).toBe(true);
    expect(res.routeChanged).toBe(true);
    // The geometry edit ran on the RESTORED route, not the current one.
    expect(applyRouteEdit.mock.calls[0][0].routeGeometry.coordinates).toEqual(
      previous.geometry.coordinates,
    );
    expect(applyRouteEdit.mock.calls[0][0].routeStats.elevation_gain_m).toBe(800);
  });
});
