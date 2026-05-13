# Tribos Route Builder — Turn Model Specification

**Status:** LOCKED v1.0
**Scope:** Canonical contract for the conversational Route Builder. All other Route Builder docs reference this one.
**Owner:** Travis

---

## 0. Purpose

The Route Builder is a **conversation that produces a route**. Every user action — text message, waypoint drag, button click — is a *turn* in that conversation. This spec defines:

- The 8 response types a turn can produce
- The structured-output contract from the LLM
- The turn protocol (text turns vs manual turns)
- The 19 mutation types
- How persona affects behavior
- The pushback cap (persona-modulated 3–5)
- Memory and history scope

This is the locked reference. Implementation specs (AI pipeline, manual edits, memory) refer back to types and contracts defined here.

---

## 1. Response Types

Every turn produces exactly one of these 8 response types. The LLM decides which.

| Type | When | Route changes? | Chat message? |
|---|---|---|---|
| `cold_start` | No route exists; user described what they want | Yes (new route) | Yes |
| `modify` | Route exists; user requested a change that is actionable | Yes (mutate current) | Yes |
| `replace` | Route exists; user request implies discarding and starting over | Yes (new route) | Yes |
| `alternatives` | User explicitly asked to see options | No (current unchanged); produces 3 candidates user can pick from | Yes |
| `clarify` | Request is underspecified or ambiguous; no action taken | No | Yes (the question) |
| `pushback` | Request is specified but conflicts with stated constraints or physical/training reality | No (proposes counter) | Yes |
| `explain` | User asked *about* the route, not for a change; OR manual edit just executed and narration is warranted | No | Yes |
| `refuse` | Out of scope (e.g., nutrition question, irrelevant chitchat) — short redirect | No | Yes |

**Notes:**

- `refuse` is *redirect*, not a hard refusal. The model never refuses a route-building request. It only declines to engage with off-topic asks.
- `pushback` is subject to the consecutive-pushback cap (§5).
- `explain` covers two distinct cases: text-turn questions ("how steep is that climb?") and manual-turn narration ("Pulled you east through Niwot, now 31mi"). Both are non-mutating informational responses.

---

## 2. Turn Input Types

A turn is initiated by either a `TextTurn` or a `ManualTurn`.

```ts
type Turn = TextTurn | ManualTurn;

type TextTurn = {
  kind: "text";
  user_message: string;
  timestamp: string; // ISO 8601
};

type ManualTurn = {
  kind: "manual";
  action: ManualAction;
  before: RouteSnapshot;
  after: RouteSnapshot;
  timestamp: string;
};

type ManualAction =
  | "drag_waypoint"
  | "add_waypoint"
  | "remove_waypoint"
  | "reverse_route"
  | "clear_route";

type RouteSnapshot = {
  geometry: Coordinate[]; // [lng, lat] — see §10
  waypoints: Waypoint[];
  stats: { distance_km: number; elevation_gain_m: number; };
};
```

**Key invariant:** for `ManualTurn`, the route has *already* been mutated by the time the turn is dispatched. The router (Stadia/BRouter/Mapbox) ran synchronously on the drag/click; the LLM call runs *after* and *cannot* alter `after`. The LLM's job on a manual turn is interpretation, not action.

---

## 3. LLM Structured Output Contract

Every LLM call (text turn OR manual turn) returns a single JSON object matching this schema:

```ts
type TurnResponse = {
  response_type:
    | "cold_start" | "modify" | "replace" | "alternatives"
    | "clarify" | "pushback" | "explain" | "refuse";

  // Streamed to chat. Empty string allowed for silent manual turns (see §4.2).
  message_to_user: string;

  // Present for: cold_start, modify, replace, alternatives.
  // null for all other types.
  route_operation: RouteOperation | null;

  // Present for: clarify, pushback. Optional otherwise.
  follow_up_question: string | null;

  // Always an array. Empty if nothing new to remember this turn.
  memory_updates: MemoryFact[];

  // Internal: short reason for chosen response_type. Logged for debugging.
  reasoning: string;
};

type RouteOperation =
  | { op: "generate"; constraints: GenerationConstraints }
  | { op: "modify"; mutations: Mutation[] }
  | { op: "alternatives"; constraints: GenerationConstraints; count: 3 };

type MemoryFact = {
  scope: "session" | "persistent";
  fact: string;
  expires_at?: string; // optional ISO 8601; persistent facts may set TTL
};

type GenerationConstraints = {
  goal?: TrainingGoal;
  duration_minutes?: number;
  distance_km?: number;
  elevation_gain_m?: number;
  surface_mix?: SurfaceMix;
  start_coord?: Coordinate;
  like_ride_id?: string; // reference a past ride as template
  // ...additional fields documented in Doc 2
};

type Scope = { start_km: number; end_km: number };
```

### 3.1 Mutation Types (full v1 set)

19 mutations total. Mutations marked **(scoped)** accept an optional `scope?: Scope` field; all others apply to the whole route.

```ts
type Mutation =
  // ---- Geometric ----
  | { type: "extend_distance"; delta_km: number; scope?: Scope }                                          // scoped
  | { type: "shorten_distance"; delta_km: number; scope?: Scope }                                         // scoped
  | { type: "trim_route"; from: "start" | "end"; amount_km: number }
  | { type: "reverse_route" }
  | { type: "smooth_route"; target: "remove_doublebacks" | "remove_dead_ends" | "simplify_turns" }
  | { type: "change_route_shape"; target: "loop" | "out_and_back" | "point_to_point" }

  // ---- Climbing ----
  | { type: "increase_climbing"; magnitude: "small" | "moderate" | "large"; scope?: Scope }               // scoped
  | { type: "reduce_climbing"; magnitude: "small" | "moderate" | "large"; scope?: Scope }                 // scoped
  | { type: "change_climb_character";
      target: "punchy" | "sustained" | "rolling" | "flat"; scope?: Scope }                                // scoped

  // ---- Routing preferences ----
  | { type: "change_surface_mix"; target: SurfaceMix; scope?: Scope }                                     // scoped
  | { type: "change_traffic_preference"; target: "low" | "minimal"; scope?: Scope }                       // scoped
  | { type: "avoid_exposure"; exposure_type: "wind" | "sun"; condition?: WeatherContext }

  // ---- Anchoring & avoidance ----
  | { type: "anchor_through"; coordinate: Coordinate }
  | { type: "anchor_at_poi";
      poi_query: string; poi_type?: POIType; position_hint?: "start" | "middle" | "end" }
  | { type: "avoid_segment"; segment_id: string }
  | { type: "avoid_segment_by_property";
      property: "steep_climb" | "exposed" | "busy_road" | "rough_surface"; locator?: { km?: number } }

  // ---- Familiarity ----
  | { type: "swap_to_familiar"; region: string }
  | { type: "swap_to_unfamiliar"; region: string }

  // ---- High-level (qualitative) ----
  | { type: "optimize_for"; criterion: "scenery" | "training_value" | "speed" | "social" };
```

**Scoped mutations (7):** `extend_distance`, `shorten_distance`, `increase_climbing`, `reduce_climbing`, `change_climb_character`, `change_surface_mix`, `change_traffic_preference`.

**Why structured output (Architecture B, not A or C):**
- The model decides response type *while* reasoning, not before. Eliminates the "add a climb matched flatten" class of bug.
- One call per turn, one response shape, one dispatcher. Easy to test.
- If perceived latency becomes a problem, layer a triage pass (Architecture C) on top later without changing this contract.

### 3.2 Shared Executor Invariant

**Mutations and ManualActions share a single execution layer.**

The `RouteOperationExecutor` module exposes one handler per mutation type and one per ManualAction. The LLM-driven path (text turn → mutation) and the UI-driven path (manual turn → ManualAction) both call into this module. Examples:

- `executor.reverse(route)` — invoked both by the `reverse_route` mutation and by the user clicking the reverse button
- `executor.anchorThrough(route, coord)` — invoked both by `anchor_through` mutation and by the user dragging a waypoint

This means: every routing capability the UI exposes is also available to the LLM, and vice versa. New capabilities are added to the executor once; both paths gain them simultaneously.

**Detailed executor spec lives in Doc 2.** This spec only mandates that the shared-executor pattern is the architecture.

---

## 4. Turn Protocol

### 4.1 Text turn

```
1. Receive TextTurn from user.
2. Append to conversation history.
3. Build prompt (see §7) with:
   - Current route state (or null)
   - Session history (full)
   - Persistent memory facts
   - Relevant past rides (see §8)
   - Active persona (see §5, §6)
   - Consecutive-pushback counter + persona cap
4. Single Claude call (Sonnet 4.5, structured output).
5. Parse TurnResponse.
6. Dispatch by response_type:
   - cold_start / modify / replace / alternatives → execute route_operation via shared executor
   - clarify / pushback / explain / refuse → no route change
7. Apply memory_updates.
8. Stream message_to_user to chat.
9. Update consecutive-pushback counter (§5).
10. Persist new turn to history.
```

### 4.2 Manual turn

```
1. User performs manual action (drag/add/remove/reverse/clear).
2. Shared executor runs synchronously. Route mutates immediately. Map updates.
3. Construct ManualTurn { action, before, after }.
4. Append to conversation history.
5. Build prompt — same as text turn but with explicit manual-turn framing.
6. Single Claude call IN BACKGROUND (does not block UI).
7. Parse TurnResponse. Valid response_types are limited to: explain, clarify, pushback.
   - Any other response_type from the LLM is a contract violation; fall back to a silent "explain" with empty message.
8. If message_to_user is non-empty, stream to chat. Empty message = silent turn (intent unambiguous, no narration needed).
9. Apply memory_updates.
10. Persist turn to history.
```

**Concurrency rule:** if a text turn arrives while a manual-turn LLM call is still in flight, cancel the manual-turn call. The new text turn supersedes it.

---

## 5. Pushback Cap

- Counter: `consecutive_pushbacks`, scoped to the current route session.
- Increments on every `pushback` response.
- Resets to 0 on any non-pushback response.
- Router-failure pushbacks (§12) do NOT increment the counter.

**Persona-modulated caps:**

| Persona | Cap |
|---|---|
| The Hammer | 5 |
| The Competitor | 4 |
| The Scientist | 4 |
| The Pragmatist | 3 |
| The Encourager | 3 |

When `consecutive_pushbacks` reaches the active persona's cap and the model would emit `pushback` again, the system overrides the response_type to `modify` (or `cold_start` / `replace` as appropriate) and executes the user's request as stated. Override is prompt-side: the prompt includes

> `MANDATE: pushback is disabled this turn. Honor the user's request as stated. You may include a brief acknowledgment but do not propose an alternative.`

This is a **system-level guardrail**. The persona sets *which* cap applies, but the override mechanism is non-negotiable. The model cannot exceed its persona's cap.

---

## 6. Persona

Personas (The Hammer, The Scientist, The Encourager, The Pragmatist, The Competitor) **affect** but **do not rule** turn behavior.

### Persona affects
- Tone, phrasing, and length of `message_to_user`
- Likelihood of emitting `pushback` (within the persona's cap)
- The cap value itself (§5)
- Likelihood of volunteering data in `explain` responses
- Default route character when the request is ambiguous (Hammer → harder, Encourager → gentler)
- Whether `refuse` redirects toward route-building or declines flatly (Encourager redirects; Scientist declines briefly)

### Persona does NOT affect
- The set of valid `response_type` values
- The pushback cap being respected (only the cap *value* is persona-set; the *enforcement* is universal)
- Whether `memory_updates` fire
- The structured `route_operation` produced (only its description in `message_to_user`)
- Whether manual edits are honored

Persona is a **prompt layer**, not an architecture layer. Implementation: persona injects a system-prompt block describing voice, disposition, and cap value. It does not alter schema, dispatch, or guardrails.

---

## 7. Prompt Composition

Every turn's prompt assembles these blocks in order:

```
[SYSTEM]
  - Tribos identity + role
  - Persona voice block (see §6)
  - Schema definition (TurnResponse JSON)
  - Pushback cap state (counter value, persona cap; mandate text if cap hit)
  - Output format rules (JSON only, no prose, no markdown)

[CONTEXT]
  - Current route state (geometry summary, stats, key waypoints) OR null
  - Persistent memory facts (bulleted)
  - Session memory facts (bulleted)
  - Relevant past rides (3–5 ride summaries, see §8)
  - Active training context (current goal event, week-in-plan, recent load)

[HISTORY]
  - Full session conversation history (all prior turns this session)
  - Format: alternating user/assistant entries with turn type tags

[CURRENT TURN]
  - Text turn: the user's message
  - Manual turn: structured description of what changed, e.g.
    "User dragged waypoint #3 from [-105.32, 40.05] to [-105.28, 40.07].
     Route recalculated: was 32mi/1400ft, now 31mi/1100ft.
     Segment removed: 'Apple Valley climb' (3% for 2mi).
     Segment added: 'Hygiene flats'."
```

---

## 8. Memory and History Scope

### 8.1 Conversation history
- **Scope:** full session, all turns (text + manual).
- **Persistence:** lives in Zustand store, hydrated on route load.
- **Trim policy:** none within a session. If a session exceeds ~50 turns, summarize the oldest 25 into a single "earlier in this session" block (deferred prompt-engineering task; out of scope for v1, but schema must tolerate a synthetic summary turn).

### 8.2 Memory facts
Two scopes, both stored in Supabase keyed to user_id:

| Scope | Lifetime | Examples |
|---|---|---|
| `session` | Cleared when current route is discarded or `replace` fires | "user finds 1,500ft over 30mi too hard for today" |
| `persistent` | Survives across routes and sessions | "user prefers to avoid US-287", "user dislikes punchy climbs", "user's favorite coffee shop: Amante" |

The LLM emits memory facts in `memory_updates`. Storage layer (not the LLM) enforces scope rules.

### 8.3 Relevant past rides
- Definition of "relevant" for v1:
  - Rides matching the current route's primary training goal bucket (endurance, tempo, threshold, intervals, recovery), OR
  - Rides whose geometry overlaps the current route's geographic region (bounding-box intersection)
- **Cap: 5 rides max per prompt.**
- Summarized, not full geometry: `{ date, distance_km, elevation_gain_m, goal, user_rating, notes }`.
- Fetched server-side at prompt assembly. Caching: 1-hour TTL keyed to `(user_id, current_region_bbox)`.

### 8.4 On "start over" / `replace`
Per directive: **persistent memory survives; session memory clears.**
- All memory facts with scope `session` are deleted.
- All memory facts with scope `persistent` are retained.
- Conversation history is archived (not deleted — accessible via "see previous route" UI later) and the new route starts with an empty history.

---

## 9. Compositional Mutations

A single text turn may produce multiple mutations in one `route_operation`:

```json
{
  "response_type": "modify",
  "route_operation": {
    "op": "modify",
    "mutations": [
      { "type": "reduce_climbing", "magnitude": "moderate", "scope": { "start_km": 0, "end_km": 15 } },
      { "type": "increase_climbing", "magnitude": "moderate", "scope": { "start_km": 15, "end_km": 30 } }
    ]
  }
}
```

This handles compositional asks like "make the first half easier and the second half harder."

**Executor responsibility:** the shared executor applies mutations in array order. If any mutation fails (e.g., infeasible), the entire operation rolls back to the pre-turn route state and the response is converted to `pushback` with the failure reason. This is a system-level conversion, not an LLM decision.

---

## 10. Coordinate Format

**Canonical format throughout the turn pipeline: `[lng, lat]` arrays (GeoJSON convention).**

All `Coordinate` types in this spec are `[lng, lat]`. Conversion to/from `{lat, lng}` happens only at module boundaries (e.g., when calling Mapbox APIs that require `{lat, lng}`). Each boundary documents its conversion.

This is a deliberate departure from the current codebase's three-formats-in-flight problem. New code follows this rule strictly; existing code is updated as it's touched.

---

## 11. Distance Units

**Canonical unit throughout the turn pipeline: kilometers, stored as `number` named with `_km` suffix.**

Meters are used only inside router responses and are converted to km at the router boundary. Any field whose name lacks `_km` or `_m` suffix is a contract violation.

Helper functions for new code:
```ts
const M_TO_KM = (m: number) => m / 1000;
const KM_TO_M = (km: number) => km * 1000;
```

Audit obligation: every new code path that touches distance must annotate its variable with `_km` or `_m` suffix.

---

## 12. Error Handling

The conversational model assumes every turn produces a response. Empty responses are not permitted. Failure modes:

| Failure | Fallback |
|---|---|
| Claude API timeout (>15s) | Emit synthetic `clarify` response: "I'm having trouble responding right now — can you try again or rephrase?" |
| Claude API error (5xx, 429) | Same as above, with retry guidance |
| Schema validation fails on LLM response | One retry with stricter prompt; if still invalid, emit synthetic `clarify` |
| Router fails on `route_operation` | Emit `pushback`: "Couldn't build that route — usually means a waypoint is unreachable. Want to try anchoring through a different road?" Does NOT count against pushback cap. |
| Manual turn router fails | Revert route to `before` state; emit `explain` with error notice |
| Mutation array partial-failure | Roll back entire operation, convert response_type to `pushback` with failure reason (§9). Does NOT count against pushback cap. |

**No silent failures.** Every code path produces a user-visible response.

---

## 13. Out of Scope (v1)

The following are intentionally deferred to v2+ and **must not** appear in v1 implementation:

- Proactive AI suggestions (volunteering changes the user didn't ask for)
- Multi-turn lookahead / planning
- Cross-user memory / community-derived facts
- Voice input
- Auto-narration toggle (verbose/quiet user setting)
- Route versioning / branching with compare-and-revert

These may inform schema design (e.g., leaving room for additional response types) but no behavior is implemented.

**Note on `avoid_exposure`:** included in v1 mutation schema but flagged that full weather integration may be deferred to v1.5. The schema is locked; the *handler* may return a "weather unavailable" pushback in early v1.

**Note on `optimize_for`:** included in v1. This is the qualitative high-level mutation ("scenic," "training value," etc.). The mutation handler in the executor needs a heuristic mapping criterion → routing weights. Expect iteration on the heuristic post-beta; the schema is locked.

---

## 14. Acceptance Criteria

This spec is implementation-ready when:

- [ ] All 8 response types have at least one positive and one negative test fixture
- [ ] All 19 mutation types have at least one positive and one negative test fixture
- [ ] Pushback cap behavior is unit-tested at boundary cases for each persona (cap = 3 and cap = 5)
- [ ] Schema validation passes/fails are tested for each response_type
- [ ] Manual-turn cancellation on text-turn arrival is tested
- [ ] Coordinate format invariant has a lint rule or runtime assert at module boundaries
- [ ] Distance unit suffix convention has a lint rule or runtime assert
- [ ] Compositional mutation rollback (§9) has a test fixture
- [ ] Shared executor (§3.2) has one handler per mutation type and one per ManualAction, with mapping verified by test

---

## 15. Open Questions (resolve before Doc 2 lock)

1. `SurfaceMix` type shape — likely `{ road: number; gravel: number; path: number }` summing to 1.0, but Doc 2 should formalize.
2. `WeatherContext` type for `avoid_exposure` — defer definition until weather integration spec.
3. `POIType` enum for `anchor_at_poi` — likely `"coffee" | "water" | "food" | "bike_shop" | "restroom" | "viewpoint"`; finalize in Doc 2.
4. `TrainingGoal` enum — already defined elsewhere in Tribos codebase; reference, don't redefine.
5. `optimize_for` heuristic — how does each `criterion` value translate to routing weights? Doc 2 needs the initial mapping; expect post-beta iteration.

---

**Next docs (drafted in order):**
- Doc 2: Conversational AI Pipeline (implementation of §3, §4, §7) — includes shared executor spec
- Doc 3: Manual Edit Integration (implementation of §4.2)
- Doc 4: Memory Model (implementation of §8)
- Doc 5 (deferred): UI Surface
