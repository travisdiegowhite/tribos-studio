/**
 * applyAIEditViaCoach — /api/route-coach edit dispatch for the v2 chat.
 *
 * PR-4B swaps v2's chat from the keyword-classifier dispatch
 * (`replicatedEditLogic.applyAIEdit`) to this function. It POSTs the
 * user's message + conversation history + a route snapshot to the
 * conversational `/api/route-coach` endpoint; the server runs Claude and
 * the tool DECISION, returning prose plus an optional `proposedEdit`.
 *
 * The geometry mutation still happens client-side: when the server
 * proposes an edit, `proposedEdit.editIntent` is handed to v1's
 * `applyRouteEdit` — the same machinery `replicatedEditLogic.ts` uses.
 * The browser-coupled routing stack (Stadia/BRouter) can't run in a
 * serverless function, which is why the apply stays on the client.
 *
 * Same `EditResult` contract as `applyAIEdit`, extended with
 * `routeChanged` so `submitChatMessage` knows whether to suffix stats.
 */
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { supabase } from '../../../lib/supabase';
import { applyRouteEdit } from '../../../utils/aiRouteEditService';
import { trackRb2 } from '../telemetry/trackRb2';
import {
  computeDistanceKm,
  rerouteShortened,
  fetchElevationGain,
} from '../../../utils/routeMutation';
import { pushCheckpoint, popCheckpoint } from './editCheckpoints';
import type { RouteCheckpoint } from './editCheckpoints';
import type { EditResult } from './replicatedEditLogic';
import type { ChatPhase } from './types';
import type { Coordinate } from '../../../types/geo';

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApplyAIEditOptions {
  /** Progress callback for client-side geometry phases. This function
   *  never emits null — submitChatMessage owns clearing the phase. */
  onPhase?: (phase: ChatPhase) => void;
}

export interface ApplyAIEditExtras {
  routeChanged: boolean;
  /** Only on ok:false — infra (retryable outage) vs refusal (phrasing). */
  failureKind?: 'infra' | 'refusal';
  /** The pre-edit snapshot pushed for this edit (geometry edits only). */
  previousCheckpoint?: RouteCheckpoint | null;
  /** applied < requested edits (result kept, per partial-apply policy). */
  partialApplied?: boolean;
  /** The last applied op was restore_previous. */
  wasRestore?: boolean;
}

const MAPBOX_TOKEN: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_MAPBOX_TOKEN as string | undefined) ?? '';

export async function applyAIEditViaCoach(
  text: string,
  conversationHistory: ConversationTurn[],
  routeId: string | null,
  /** When false ("just riding"), the server omits training-plan context. */
  planAware: boolean = true,
  /** Rider's display units — the coach narrates in these (prose only). */
  isImperial: boolean = false,
  opts: ApplyAIEditOptions = {},
): Promise<EditResult & ApplyAIEditExtras> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty input', routeChanged: false, failureKind: 'refusal' };
  }

  const state = useRouteBuilderStore.getState();
  const routeGeometry = state.routeGeometry;
  const routeStats = state.routeStats;
  const routeProfile = state.routeProfile ?? 'road';
  const routeType = state.routeType ?? null;

  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
    return { ok: false, reason: 'no current route', routeChanged: false, failureKind: 'refusal' };
  }

  // Auth token for the endpoint's Bearer gate.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, reason: 'not authenticated', routeChanged: false, failureKind: 'infra' };
  }

  // Local date for the prompt's temporal anchor.
  const now = new Date();
  const userLocalDate = {
    dateString: now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  };

  let data: {
    message?: string;
    proposedEdit?: { editIntent?: unknown } | null;
    proposedEdits?: Array<{ editIntent?: unknown }> | null;
  };
  try {
    const res = await fetch('/api/route-coach', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        message: trimmed,
        conversationHistory,
        routeId,
        planAware,
        units: isImperial ? 'imperial' : 'metric',
        routeSnapshot: {
          geometry: routeGeometry,
          stats: routeStats,
          routeProfile,
          routeType,
          startLocation: routeGeometry.coordinates[0],
        },
        userLocalDate,
      }),
    });

    if (!res.ok) {
      // Distinguish an infrastructure failure (rate limit / 5xx / network) from
      // a normal Claude refusal so we can both alert on it and tell the user
      // it's transient rather than "your edit was rejected".
      const err = await res.json().catch(() => ({}));
      const isInfra = res.status === 429 || res.status >= 500;
      const reason =
        res.status === 429
          ? 'The coach is busy right now — give it a few seconds and try again.'
          : res.status >= 500
            ? 'The coach is temporarily unavailable — try again in a moment.'
            : err.error || `endpoint returned ${res.status}`;
      trackRb2('coach_api_failed', { status: res.status });
      return {
        ok: false,
        reason,
        routeChanged: false,
        failureKind: isInfra ? 'infra' : 'refusal',
      };
    }

    data = await res.json();
  } catch (err) {
    trackRb2('coach_api_failed', { status: 0, error_name: err instanceof Error ? err.name : 'unknown' });
    return {
      ok: false,
      reason: 'The coach is temporarily unreachable — check your connection and try again.',
      routeChanged: false,
      failureKind: 'infra',
    };
  }

  const message = data.message || 'Done.';

  // The endpoint may propose multiple edits for a compound request ("hillier
  // AND longer"). Fall back to the single-edit field for older responses.
  const edits = (
    Array.isArray(data.proposedEdits) && data.proposedEdits.length > 0
      ? data.proposedEdits
      : data.proposedEdit
        ? [data.proposedEdit]
        : []
  ).filter((e): e is { editIntent: object } => !!e && e.editIntent != null);

  // Case 1: conversational reply (clarifying question, refusal, chat).
  if (edits.length === 0) {
    return {
      ok: true,
      assistantText: message,
      distance_km: Math.round(routeStats?.distance_km ?? 0),
      elevation_gain_m: Math.round(routeStats?.elevation_gain_m ?? 0),
      routeChanged: false,
    };
  }

  // Case 2: apply the edits in sequence — each one operates on the geometry
  // the previous produced, re-routing between, with one final write.
  // `restore_previous` is executed here (not in the geometry engine): it
  // pops a checkpoint pushed by an earlier successful edit, so "go back
  // and make it longer" restores first, then edits the restored route.
  let curCoords = routeGeometry.coordinates as Coordinate[];
  let curDistance = routeStats?.distance_km ?? computeDistanceKm(curCoords);
  // Running elevation so a second edit in the sequence reasons on the
  // first edit's result instead of the pre-sequence gain.
  let curElevationM = routeStats?.elevation_gain_m ?? 0;
  const durationS = routeStats?.duration_s ?? 0;
  let applied = 0;
  let geometryEditApplied = false;
  let lastFailure: string | null = null;
  // When the LAST applied op was a restore, its checkpoint stats are
  // authoritative — skip the final elevation re-fetch.
  let restoredStats: RouteCheckpoint['stats'] | null = null;

  opts.onPhase?.('rerouting');

  for (const edit of edits) {
    const intentName = (edit.editIntent as { intent?: string }).intent;

    if (intentName === 'restore_previous') {
      const checkpoint = popCheckpoint();
      if (!checkpoint) {
        lastFailure =
          'no earlier version from this chat to restore — the Undo button (⌘Z) covers manual edits';
        continue;
      }
      curCoords = checkpoint.geometry.coordinates;
      curDistance = checkpoint.stats.distance_km;
      curElevationM = checkpoint.stats.elevation_gain_m;
      restoredStats = checkpoint.stats;
      applied += 1;
      continue;
    }

    try {
      const editResult = (await applyRouteEdit({
        routeGeometry: { type: 'LineString', coordinates: curCoords },
        routeProfile,
        routeType: routeType ?? undefined,
        routeStats: {
          distance_km: curDistance,
          elevation_gain_m: curElevationM,
          duration_s: durationS,
        },
        editIntent: edit.editIntent,
        mapboxToken: MAPBOX_TOKEN,
      })) as {
        success: boolean;
        editedRoute?: { coordinates?: Array<[number, number]>; needsReroute?: boolean };
        comparison?: { elevationDelta?: number | null };
        message?: string;
      };

      if (!editResult?.success || !editResult.editedRoute?.coordinates) {
        lastFailure = editResult?.message || 'unknown error';
        continue;
      }

      let nextCoords = editResult.editedRoute.coordinates as Coordinate[];
      if (editResult.editedRoute.needsReroute) {
        nextCoords = await rerouteShortened(nextCoords, routeProfile);
      }
      curCoords = nextCoords;
      curDistance = computeDistanceKm(curCoords);
      if (Number.isFinite(editResult.comparison?.elevationDelta)) {
        curElevationM += Number(editResult.comparison?.elevationDelta);
      }
      restoredStats = null;
      geometryEditApplied = true;
      applied += 1;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : 'geometry op threw';
    }
  }

  // Nothing applied — return prose with a note; route unchanged.
  if (applied === 0) {
    return {
      ok: true,
      assistantText: `${message} (Note: the change didn't apply — ${lastFailure ?? 'unknown error'}.)`,
      distance_km: Math.round(routeStats?.distance_km ?? 0),
      elevation_gain_m: Math.round(routeStats?.elevation_gain_m ?? 0),
      routeChanged: false,
    };
  }

  // Elevation for the combined result: a pure restore already knows its
  // stats; geometry edits get one authoritative fetch.
  let elevation_gain_m: number;
  if (restoredStats) {
    elevation_gain_m = restoredStats.elevation_gain_m;
  } else {
    opts.onPhase?.('measuring');
    elevation_gain_m = (await fetchElevationGain(curCoords)) ?? routeStats?.elevation_gain_m ?? 0;
  }

  // Checkpoint the route this sequence replaced — but only when a real
  // geometry edit ran. A pure restore must NOT push the version it just
  // left, or repeated "go back" would bounce between two versions
  // instead of walking further back.
  let previousCheckpoint: RouteCheckpoint | null = null;
  if (geometryEditApplied) {
    previousCheckpoint = {
      geometry: { type: 'LineString', coordinates: routeGeometry.coordinates as Coordinate[] },
      stats: {
        distance_km:
          routeStats?.distance_km ?? computeDistanceKm(routeGeometry.coordinates as Coordinate[]),
        elevation_gain_m: routeStats?.elevation_gain_m ?? 0,
        duration_s: durationS,
      },
    };
    pushCheckpoint(previousCheckpoint);
  }
  state.setRouteGeometry({ type: 'LineString', coordinates: curCoords });
  state.setRouteStats({ distance_km: curDistance, elevation_gain_m, duration_s: durationS });

  // Partial result stays applied (rider's choice in review) — but name the
  // failure and offer the one-word way back.
  const partialApplied = applied < edits.length;
  const partial = partialApplied
    ? ` (Applied ${applied} of ${edits.length} changes — ${lastFailure ?? 'the rest failed'}. Say "revert" to go back.)`
    : '';

  return {
    ok: true,
    assistantText: `${message}${partial}`,
    distance_km: Math.round(curDistance),
    elevation_gain_m: Math.round(elevation_gain_m),
    routeChanged: true,
    previousCheckpoint,
    partialApplied,
    wasRestore: restoredStats != null,
  };
}
