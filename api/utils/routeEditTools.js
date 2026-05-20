// Route-edit tool definitions and validation for /api/route-coach.
//
// Unit 4 (PR-4A). The endpoint exposes a single tool, apply_route_edit,
// that constrains Claude to route-editing actions.
//
// Geometry mutation runs CLIENT-SIDE. The route-builder routing stack
// (Stadia/BRouter via src/utils/aiRouteEditService.js) is browser-coupled
// and cannot run inside a Vercel function, so the server's job is to
// validate Claude's tool call and return a normalized `editIntent`. The
// client (PR-4B) feeds that straight into v1's `applyRouteEdit`.
//
// `editIntent` mirrors the relevant fields of `classifyEditIntent`'s
// output in src/utils/aiRouteEditService.js — keep them in sync.

export const ROUTE_EDIT_TOOLS = [
  {
    name: 'apply_route_edit',
    description:
      "Apply a geometric change to the rider's current route. Use this " +
      "once you have decided on a specific modification the rider asked " +
      "for. Describe the change in prose first, then call this tool. The " +
      "structured parameters are mechanical instructions to the routing " +
      "engine, not user-facing copy.",
    input_schema: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: [
            'flatten',
            'add_climbing',
            'surface_gravel',
            'surface_paved',
            'scenic',
            'faster',
            'shorter',
            'longer',
            'avoid',
            'detour',
            'reverse',
            'shift_direction',
            'add_waypoint',
          ],
          description: 'The primary editing operation to apply.',
        },
        target_distance_km: {
          type: 'number',
          description:
            'For shorter/longer: the new TOTAL target distance in km ' +
            '(not the delta). The server converts it to a delta against ' +
            'the current route distance.',
        },
        elevation_delta_m: {
          type: 'number',
          description:
            'For flatten/add_climbing: approximate elevation gain change ' +
            'in meters (negative = flatten). Informational.',
        },
        avoid_location: {
          type: 'string',
          description:
            'For avoid/detour: free-text location to route around or ' +
            'through.',
        },
        direction: {
          type: 'string',
          enum: [
            'north',
            'south',
            'east',
            'west',
            'northeast',
            'northwest',
            'southeast',
            'southwest',
          ],
          description: 'For shift_direction: which way to bias the route.',
        },
        waypoint_coords: {
          type: 'array',
          description:
            'For add_waypoint: a [longitude, latitude] coordinate to ' +
            'route through.',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        reasoning: {
          type: 'string',
          description:
            'Brief internal note on why this edit fits the request ' +
            '(not shown to the rider).',
        },
      },
      required: ['intent', 'reasoning'],
    },
  },
];

// v1 intents the client's applyRouteEdit can execute today.
const IMPLEMENTED_INTENTS = new Set([
  'flatten',
  'surface_gravel',
  'surface_paved',
  'scenic',
  'faster',
  'shorter',
  'longer',
  'avoid',
  'detour',
  'reverse',
]);

// Conversational-only intents — defined in the schema so Claude can
// reach for them, but not yet wired to geometry. normalizeRouteEdit
// rejects these so Claude recovers gracefully (picks a real intent or
// tells the rider it can't do that yet).
const DEFERRED_INTENTS = new Set([
  'add_climbing',
  'shift_direction',
  'add_waypoint',
]);

const SIMPLE_SUMMARY = {
  flatten: 'Re-route to minimize climbing',
  surface_gravel: 'Shift the route toward gravel and unpaved paths',
  surface_paved: 'Shift the route toward paved surfaces',
  scenic: 'Prefer bike paths and quieter roads',
  faster: 'Find a more direct route',
  reverse: 'Reverse the route direction',
};

/**
 * Validate and normalize an apply_route_edit tool call into an editIntent
 * the client can pass to v1's applyRouteEdit.
 *
 * @param {object} input - The tool_use input from Claude.
 * @param {object} routeSnapshot - { stats: { distance_km, ... }, ... }
 * @returns {{ ok: true, intent: string, editIntent: object, reasoning: string, summary: string }
 *          | { ok: false, reason: string }}
 */
export function normalizeRouteEdit(input, routeSnapshot) {
  if (!input || typeof input !== 'object') {
    return { ok: false, reason: 'missing tool input' };
  }

  const { intent } = input;
  if (typeof intent !== 'string' || !intent) {
    return { ok: false, reason: 'intent is required' };
  }
  if (DEFERRED_INTENTS.has(intent)) {
    return {
      ok: false,
      reason:
        `the "${intent}" edit is not available yet — describe it to the ` +
        'rider and offer a supported alternative instead',
    };
  }
  if (!IMPLEMENTED_INTENTS.has(intent)) {
    return { ok: false, reason: `unknown intent "${intent}"` };
  }

  const reasoning = typeof input.reasoning === 'string' ? input.reasoning : '';

  switch (intent) {
    case 'flatten':
    case 'surface_gravel':
    case 'surface_paved':
    case 'scenic':
    case 'faster':
    case 'reverse':
      return {
        ok: true,
        intent,
        editIntent: { intent },
        reasoning,
        summary: SIMPLE_SUMMARY[intent],
      };

    case 'shorter':
    case 'longer': {
      const currentKm = Number(routeSnapshot?.stats?.distance_km);
      const targetKm = Number(input.target_distance_km);
      const editIntent = { intent };
      let summary = `Make the route ${intent}`;

      if (Number.isFinite(targetKm) && targetKm > 0) {
        if (Number.isFinite(currentKm) && currentKm > 0) {
          const delta = Math.abs(targetKm - currentKm);
          if (delta > 0) {
            // v1's applyShorter/LongerEdit treat distanceModifier as a
            // delta in km (amount to cut / add), not an absolute total.
            editIntent.distanceModifier = Number(delta.toFixed(1));
          }
        }
        summary =
          `${intent === 'longer' ? 'Extend' : 'Shorten'} the route to ` +
          `~${targetKm.toFixed(0)} km`;
      }

      return { ok: true, intent, editIntent, reasoning, summary };
    }

    case 'avoid':
    case 'detour': {
      const location =
        typeof input.avoid_location === 'string'
          ? input.avoid_location.trim()
          : '';
      if (!location) {
        return {
          ok: false,
          reason:
            `the "${intent}" edit needs a location — ask the rider what ` +
            `to ${intent === 'avoid' ? 'avoid' : 'route through'}`,
        };
      }
      return {
        ok: true,
        intent,
        editIntent: { intent, location },
        reasoning,
        summary:
          intent === 'avoid'
            ? `Route around "${location}"`
            : `Detour through "${location}"`,
      };
    }

    default:
      return { ok: false, reason: `unhandled intent "${intent}"` };
  }
}

export default { ROUTE_EDIT_TOOLS, normalizeRouteEdit };
