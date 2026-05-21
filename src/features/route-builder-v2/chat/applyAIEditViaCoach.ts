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
import {
  computeDistanceKm,
  rerouteShortened,
  fetchElevationGain,
} from '../../../utils/routeMutation';
import type { EditResult } from './replicatedEditLogic';
import type { Coordinate } from '../../../types/geo';

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAPBOX_TOKEN: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_MAPBOX_TOKEN as string | undefined) ?? '';

export async function applyAIEditViaCoach(
  text: string,
  conversationHistory: ConversationTurn[],
  routeId: string | null,
): Promise<EditResult & { routeChanged: boolean }> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: 'empty input', routeChanged: false };
  if (!routeId) return { ok: false, reason: 'no route id', routeChanged: false };

  const state = useRouteBuilderStore.getState();
  const routeGeometry = state.routeGeometry;
  const routeStats = state.routeStats;
  const routeProfile = state.routeProfile ?? 'road';

  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) {
    return { ok: false, reason: 'no current route', routeChanged: false };
  }

  // Auth token for the endpoint's Bearer gate.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, reason: 'not authenticated', routeChanged: false };
  }

  // Local date for the prompt's temporal anchor.
  const now = new Date();
  const userLocalDate = {
    dateString: now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }),
  };

  let data: { message?: string; proposedEdit?: { editIntent?: unknown } | null };
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
        routeSnapshot: {
          geometry: routeGeometry,
          stats: routeStats,
          routeProfile,
          startLocation: routeGeometry.coordinates[0],
        },
        userLocalDate,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        ok: false,
        reason: err.error || `endpoint returned ${res.status}`,
        routeChanged: false,
      };
    }

    data = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'fetch failed';
    return { ok: false, reason: msg, routeChanged: false };
  }

  const message = data.message || 'Done.';
  const proposedEdit = data.proposedEdit;

  // Case 1: Claude responded conversationally without proposing an edit
  // (clarifying question, refusal, or just chat). Return the prose, no
  // geometry mutation, no stat change.
  if (!proposedEdit?.editIntent) {
    return {
      ok: true,
      assistantText: message,
      distance_km: Math.round(routeStats?.distance_km ?? 0),
      elevation_gain_m: Math.round(routeStats?.elevation_gain_m ?? 0),
      routeChanged: false,
    };
  }

  // Case 2: Claude proposed an edit. Hand the intent to v1's
  // client-side applyRouteEdit machinery — this is the geometry mutation.
  try {
    const editResult = await applyRouteEdit({
      routeGeometry,
      routeProfile,
      routeStats: routeStats ?? { distance_km: 0, elevation_gain_m: 0, duration_s: 0 },
      editIntent: proposedEdit.editIntent,
      mapboxToken: MAPBOX_TOKEN,
    }) as {
      success: boolean;
      editedRoute?: {
        coordinates?: Array<[number, number]>;
        needsReroute?: boolean;
      };
      message?: string;
    };

    if (!editResult?.success || !editResult.editedRoute?.coordinates) {
      // The intent was structurally valid but the geometry op failed.
      // Return Claude's prose plus a note; route stays unchanged.
      return {
        ok: true,
        assistantText: `${message} (Note: the geometry change didn't apply — ${editResult?.message || 'unknown error'}.)`,
        distance_km: Math.round(routeStats?.distance_km ?? 0),
        elevation_gain_m: Math.round(routeStats?.elevation_gain_m ?? 0),
        routeChanged: false,
      };
    }

    let nextCoords = editResult.editedRoute.coordinates as Coordinate[];

    if (editResult.editedRoute.needsReroute) {
      nextCoords = await rerouteShortened(nextCoords, routeProfile);
    }

    const distance_km = computeDistanceKm(nextCoords);
    const elevation_gain_m =
      (await fetchElevationGain(nextCoords)) ?? routeStats?.elevation_gain_m ?? 0;

    const newStats = {
      distance_km,
      elevation_gain_m,
      duration_s: routeStats?.duration_s ?? 0,
    };

    state.setRouteGeometry({ type: 'LineString', coordinates: nextCoords });
    state.setRouteStats(newStats);

    return {
      ok: true,
      assistantText: message,
      distance_km: Math.round(distance_km),
      elevation_gain_m: Math.round(elevation_gain_m),
      routeChanged: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'geometry op threw';
    return {
      ok: true,
      assistantText: `${message} (Note: the geometry change didn't apply — ${msg}.)`,
      distance_km: Math.round(routeStats?.distance_km ?? 0),
      elevation_gain_m: Math.round(routeStats?.elevation_gain_m ?? 0),
      routeChanged: false,
    };
  }
}
