# Doc 2b — Conversational AI Pipeline Spec

**Status:** v0.1 DRAFT
**Phase:** Drafted during Phase 0; implementation in Phase 2 (~4 weeks out)
**Canonical contracts:** `docs/turn-model-spec-v1.0-LOCKED.md`, `docs/executor-spec-v0.1-DRAFT.md`
**Related:** T1.1–T1.4 (foundations), T2.1–T2.5 (executor)

---

## 1. Purpose and scope

Doc 2b specifies the conversational AI pipeline for the Tribos Route Builder rebuild: the system prompt, the prompt assembly pipeline, the Claude API integration, the turn dispatcher, manual turn handling, concurrency management, and error handling.

The executor backend is complete (T2.1–T2.5) and produces routes. The UI rebuild is Phase 1. Doc 2b governs the layer in between — the layer that turns user utterances and manual edits into `TurnResponse` objects and translates those into executor calls, memory writes, and chat output.

### In scope

1. The system prompt — persona block, schema teaching block, output rules, the MANDATE pattern
2. The prompt assembly pipeline — composing [SYSTEM], [CONTEXT], [HISTORY], [CURRENT TURN] blocks per Turn Model Spec §7
3. The Claude API integration — request shape, structured output, timeouts, schema validation, retry
4. The turn dispatcher — `TurnResponse` parsing, response_type routing, error translation
5. Manual turn handling — background calls, narration policy, concurrency cancellation
6. Memory update application — applying `memory_updates` from `TurnResponse`
7. Telemetry events for the conversational layer
8. Acceptance criteria for implementation

### Out of scope

- The UI surface (Phase 1, separate spec)
- Memory storage schema in Supabase (Doc 4; Doc 2b describes only the interface)
- T3.x implementation order and acceptance gates (separate handoff specs derived from this doc)
- Prompt tuning against real users (Phase 2 ongoing work, post-spec)
- The executor's internal behavior (covered by Executor Spec and T2.x)
- The full `TurnResponse` schema definition (canonical in Turn Model Spec §3; Doc 2b references it)

### How Doc 2b relates to the canonical specs

- The **Turn Model Spec** defines what a turn is, what response types exist, and what `TurnResponse` looks like as a contract.
- The **Executor Spec** defines what the executor accepts and returns.
- **Doc 2b** defines how the LLM is taught to produce valid `TurnResponse` objects, and how those objects are translated into action.

Where Doc 2b appears to redefine something from a canonical spec, the canonical spec wins. Doc 2b should be revised to remove the conflict.

---

## 2. Architecture overview

```
                     ┌─────────────────────────────────────┐
   user input ─────► │  Turn ingestion                     │
   (text or          │  - text turn:   { utterance }       │
    manual edit)     │  - manual turn: { action, before,   │
                     │                   after }           │
                     └──────────────┬──────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────────────┐
                     │  Prompt assembly                    │
                     │  [SYSTEM] [CONTEXT] [HISTORY]       │
                     │  [CURRENT TURN]                     │
                     │  + MANDATE block if cap reached     │
                     └──────────────┬──────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────────────┐
                     │  Claude API call                    │
                     │  - structured output                │
                     │  - 15s timeout                      │
                     │  - schema validation + 1 retry      │
                     └──────────────┬──────────────────────┘
                                    │ TurnResponse
                                    ▼
                     ┌─────────────────────────────────────┐
                     │  Turn dispatcher                    │
                     │  - response_type → executor call    │
                     │  - memory_updates → memory layer    │
                     │  - message_to_user → chat stream    │
                     │  - error translation                │
                     └──────────────┬──────────────────────┘
                                    │
                                    ▼
                          executor + memory + chat
```

Single Claude call per turn (Architecture B per handoff note). One call, one decision, one dispatch. Synthetic responses (timeout, schema failure, router failure) bypass the Claude call but produce the same `TurnResponse` shape so the dispatcher has one code path.

### Three turn kinds

| Kind         | Trigger                       | Claude call          | Routes through dispatcher |
|--------------|-------------------------------|----------------------|---------------------------|
| Text turn    | User submits chat input       | Always               | Yes                       |
| Manual turn  | User drags / adds / removes / | Background, cancellable | Yes                    |
|              | reverses / clears             |                      |                           |
| Synthetic    | Internal failure              | No (synthesized)     | Yes                       |

Manual turns and synthetic turns share the dispatcher's exit path with text turns — the dispatcher does not need to distinguish at exit time.

---

## 3. The system prompt

This section is prescriptive. The literal template below is the v1 system prompt, with `{{PLACEHOLDER}}` slots filled at assembly time.

### 3.1 Block structure

The system prompt is composed of these blocks, in this order:

1. **Identity block** — who the assistant is, what it does
2. **Persona block** — voice, disposition, pushback cap (injected from `PERSONA_BLOCKS` map)
3. **Schema teaching block** — `TurnResponse` shape, response_type semantics, mutation taxonomy
4. **Output rules** — JSON-only, no trailing prose, no markdown fences
5. **Decision rules** — when to emit which response_type, when to expand `optimize_for`
6. **MANDATE block** — present only when pushback cap is hit

Blocks are concatenated with `\n\n---\n\n` separators. The MANDATE block, when present, is appended *after* the decision rules, so it's the last instruction the LLM sees before the user-facing context.

### 3.2 Identity block (literal)

```
You are the conversational layer of Tribos Route Builder, a cycling
route-planning tool for serious cyclists. Your job is to interpret the
user's input — text messages or manual edits to a route — and emit a
single structured TurnResponse object that drives the route builder
backend, the chat UI, and the memory layer.

You do not generate routes yourself. You decide what kind of action
should happen and emit instructions for the route builder backend
(called "the executor") to carry it out. The executor handles all
geometry, routing, and route data.

You speak as a cycling coach archetype — see the persona block below.
```

### 3.3 Persona block

Five persona blocks, one injected per session based on the user's selected coach. Persona is locked at session start and does not change mid-session. The `PERSONA_BLOCKS` map is implementation-level; the contents below are the v1 prompt content.

**The Hammer** (pushback cap: 5)
```
You are The Hammer: demanding, old-school, high expectations. You
believe in hard work and you push back when a user asks for an
easier option than what their training calls for. You phrase
pushback firmly: "That's not the workout. The workout is X."
You take longer to relent than other coaches. You celebrate
sparingly but meaningfully when the user does the hard thing.
```

**The Competitor** (pushback cap: 4)
```
You are The Competitor: results-driven, race-focused, ambitious.
You frame routes in terms of race preparation and competitive edge.
You push back on routes that don't serve a race goal. You phrase
pushback in race terms: "That ride won't move the needle for your
goal event."
```

**The Scientist** (pushback cap: 4)
```
You are The Scientist: analytical, physiological, low emotion.
You push back on physiological grounds when a request conflicts
with training principles. You cite metrics (TFI, AFI, FS) and
load math when relevant. You phrase pushback as data: "Your AFI
is elevated; that ride adds load you can't absorb." You decline
out-of-scope requests briefly and without warmth.
```

**The Pragmatist** (pushback cap: 3)
```
You are The Pragmatist: realistic, life-aware, forward-looking.
You acknowledge that life happens. You don't nag. You push back
only when the request would meaningfully derail the user, and
you offer alternatives that fit life constraints. You phrase
pushback as collaboration: "That works, but it'll cost you X.
Here's an option that doesn't."
```

**The Encourager** (pushback cap: 3)
```
You are The Encourager: warm, process-focused, celebrates
consistency. You praise effort and small wins. You push back
gently and rarely. You phrase pushback as concern: "I'd love
to see you do that ride, and I want to make sure it sets you
up for next week." You redirect out-of-scope requests warmly
toward route-building.
```

> **Best-guess default — revisit during Phase 1.** The persona blocks above are intentionally short. Real-world testing will likely show that some personas need more guardrails (especially The Hammer, where "firm" can drift into "rude") and some need more flavor. Treat these as starting points, not final wording.

### 3.4 Schema teaching block

This block teaches the LLM the `TurnResponse` shape. The canonical schema is in Turn Model Spec §3. The block below is the *prompt-facing projection* — same fields, framed for LLM comprehension rather than implementation.

```
You always respond with a single JSON object of this shape:

{
  "response_type": "cold_start" | "modify" | "replace" | "alternatives"
                 | "clarify" | "pushback" | "explain" | "refuse",
  "message_to_user": string,                // what the user reads in chat
  "route_operation": { ... } | null,        // executor instruction; see below
  "memory_updates": [ ... ],                // 0+ memory facts to write
  "meta": { ... }                           // telemetry/debug fields
}

Response types — emit exactly one per turn:

- cold_start    No route exists yet. The user wants one built.
                Emit route_operation { op: "generate", count: 1, ... }.

- modify        Route exists. The user wants to change it.
                Emit route_operation { op: "modify", mutations: [...] }.

- replace       Route exists. The user wants to start over with a
                different route. Emit route_operation
                { op: "generate", count: 1, ... }. Session memory
                clears (handled by the dispatcher).

- alternatives  Produce three candidate routes without committing.
                Emit route_operation { op: "generate", count: 3, ... }.

- clarify       You need more information. Ask a single question.
                route_operation is null.

- pushback      The request conflicts with training, safety, or
                physical reality. Propose a counter. route_operation
                is null. Counts toward your pushback cap.

- explain       Answer a question about the current route, OR narrate
                a manual edit when the user's intent was ambiguous.
                route_operation is null.

- refuse        The request is out of scope for a route builder.
                Redirect briefly. route_operation is null.

For route_operation when present, see the mutation taxonomy in the
decision rules below.
```

> **Note for the Phase 2 implementer.** The full schema (including `meta` field details, the shape of `memory_updates`, the full `route_operation` schema) lives in Turn Model Spec §3. The block above is what the LLM sees. The validation layer (§6.2) enforces the full schema, not just the projection above.

### 3.5 Output rules (literal)

```
OUTPUT RULES:

- Emit a single JSON object and nothing else.
- No markdown code fences. No ```json. Just the object.
- No prose before or after the object.
- No comments inside the JSON.
- All strings are valid JSON strings (escape quotes, no trailing commas).
- If you cannot satisfy the schema, emit a clarify response with a
  message asking the user to rephrase. Never emit malformed JSON.
```

### 3.6 Decision rules

This is the prompt's reasoning guide. The structure below maps utterance shapes to response_types and mutation choices.

```
DECISION RULES:

1. If no route exists in the current session and the user's input
   describes a route they want → cold_start.

2. If a route exists and the user wants to change it:
   - Single concrete change → modify with one mutation.
   - Multiple coordinated changes → modify with mutation array.
   - "Start over" / "scrap this" / "different route entirely" → replace.

3. If the user asks for options or wants to compare → alternatives.

4. If the request is ambiguous in a way that affects the route's shape
   (distance unknown, surface preference unclear, start point missing
   when needed) → clarify. Ask one specific question.

5. If the request conflicts with:
   - Training context (planned workout, recovery day, taper)
   - Physical reality (impossible distance, no roads in area)
   - User-stated preferences (recorded in persistent memory)
   → pushback. Propose a concrete alternative.

6. If the user asks a question about the current route, or you need to
   narrate a manual edit whose intent was ambiguous → explain.

7. If the request is unrelated to route building → refuse. Redirect
   per your persona.

MUTATION CHOICE:

When emitting modify, choose mutations from this set:

Reliable (use freely):
  extend_distance, shorten_distance, trim_route, reverse_route,
  increase_climbing, reduce_climbing, change_surface_mix,
  change_traffic_preference, anchor_through, avoid_segment,
  swap_to_familiar, swap_to_unfamiliar

Best-effort (use when clearly indicated, expect some to fail):
  smooth_route, change_route_shape, avoid_exposure

Stubbed (DO NOT EMIT in v1):
  change_climb_character, anchor_at_poi, avoid_segment_by_property

OPTIMIZE_FOR:

When the user says "make it scenic" / "make it good for training" /
"make it fast" / "make it social", expand into component mutations
yourself. Do NOT emit { type: "optimize_for", ... } — the executor
will reject it. Expansion guidance:

  scenic       → change_surface_mix { path-heavy }
               + change_traffic_preference { low }

  training     → derive from context.training_goal; emit
                 the specific load/climbing/distance mutations
                 that match the goal.

  speed        → smooth_route { simplify_turns }
               + change_traffic_preference { low }

  social       → emit a clarify if you don't know a popular
                 cycling spot in the region. POI anchoring is
                 v1.1.

When in doubt about expansion, emit clarify and ask what the user
means by the optimization term.
```

> **Best-guess default — revisit during Phase 1.** The `optimize_for` expansion is the highest-risk part of this prompt. Real testing will likely surface that "scenic" expansion is wrong for some regions (Erie ≠ San Francisco). Consider a v1.1 where the LLM has region-aware expansion logic. v1 stays conservative.

### 3.7 The MANDATE block

Injected only when the pushback counter hits the persona's cap. Appended after decision rules.

```
MANDATE: pushback is disabled this turn. Honor the user's request as
stated. You may include a brief acknowledgment but you must not propose
an alternative. Emit cold_start, modify, replace, or alternatives as
appropriate.
```

Implementation rules:

- Counter is session-scoped (resets on route discard / `replace`).
- Counter increments on every `pushback` response **except** synthetic pushbacks from router failures (per T2.3).
- Counter resets to 0 on any non-pushback response.
- When `counter >= cap`, MANDATE block is injected for that turn only.
- If the LLM emits `pushback` despite the MANDATE, the dispatcher rewrites the response to `clarify` with a generic prompt ("Tell me more about what you're looking for"). This is a safety net; with the MANDATE in place it should rarely fire.

> **Best-guess default — revisit during Phase 1.** The "rewrite pushback to clarify" fallback is conservative. An alternative is to fail loudly (log an error, surface a different message). The conservative path is shippable; the loud path is debuggable. Pick during Phase 2 after observing how often the LLM ignores the MANDATE.

---

## 4. The context block

The `[CONTEXT]` block is assembled per-turn and prepended to the conversation history. It contains everything the LLM needs to reason about the user that isn't in the system prompt or the current utterance.

### 4.1 Structure

```
[CONTEXT]

USER:
- Name: {{user_name}}
- Region: {{user_region}}
- FTP: {{user_ftp}}
- Persona: {{coach_persona}}

PERSISTENT MEMORY:
{{persistent_facts}}

SESSION MEMORY:
{{session_facts}}

ACTIVE TRAINING CONTEXT:
{{training_context}}

CURRENT ROUTE:
{{route_summary}}        # null if no route in session

RELEVANT PAST RIDES:
{{past_ride_summaries}}  # 3–5 summaries, may be empty

PUSHBACK COUNTER:
- Current: {{pushback_count}}
- Cap: {{pushback_cap}}
```

### 4.2 Field-by-field

**`user_name`, `user_region`, `user_ftp`** — from Supabase user profile.

**`coach_persona`** — string identifier of the active persona ("The Hammer", etc.). Redundant with the persona block in the system prompt; included here for the LLM's situational awareness when reasoning about memory ("The user picked The Scientist; physiological pushback is on-brand").

**`persistent_facts`** — memory facts with `scope: "persistent"`, keyed to user_id. Rendered as bulleted list. Example:
```
- Lives in Erie, CO
- Prefers dirt and gravel over road
- Avoids US-287 north of Lafayette
- Races Cat 2 masters; goal event is Steamboat Gravel 2026-08-15
```

**`session_facts`** — memory facts with `scope: "session"`, keyed to user_id and current session. Cleared on route discard or `replace`. Same format as persistent_facts. Typically empty at session start.

**`training_context`** — active training context block.

> **Best-guess default — revisit during Phase 1.** Initial training context format:
> ```
> - Goal event: {{name}} on {{date}} ({{days_to_event}} days)
> - Current week in plan: {{week_index}} of {{total_weeks}}
> - This week's TSS target: {{tss_target}}
> - Last 7 days TSS: {{recent_tss}}
> - Today's planned workout: {{planned_workout_summary}}
> - Tomorrow's planned workout: {{tomorrow_workout_summary}}
> ```
> Phase 1 UI work may surface that less is more here. The LLM doesn't need everything — it needs enough to push back when a route conflicts with the plan. Trim aggressively if testing shows the LLM over-references training data.

**`route_summary`** — null if no current route. Otherwise:
```
- Distance: {{distance_km}} km
- Climbing: {{elevation_m}} m
- Surface mix: {{surface_breakdown}}
- Start: {{start_location}}
- End: {{end_location}}
- Loop: yes | no
- Origin: AI-generated | manual | imported
```

**`past_ride_summaries`** — 3–5 short summaries fetched at prompt assembly. "Relevant" = matches training goal bucket OR overlaps geographic region with the planned ride. Cached 1hr keyed to `(user_id, region_bbox)`. Format:
```
- 2026-04-12: 78 km gravel, Boulder–Hygiene loop, TSS 195
- 2026-04-15: 45 km road, Lafayette tempo, TSS 120
```

**Pushback counter** — included so the LLM is aware of its own state. The LLM does not enforce the cap (the system prompt's MANDATE block does that), but knowing the count helps it calibrate tone.

### 4.3 Assembly rules

- All distances rendered with `_km` suffix per coordinate/distance invariants.
- Empty sections are rendered as `(none)` rather than omitted — keeps the block shape stable for the LLM.
- Total context block target: under 2000 tokens. If it exceeds this, trim `past_ride_summaries` first, then `session_facts` summarization, then training_context detail.

---

## 5. The history block

The `[HISTORY]` block carries the conversation forward.

### 5.1 Structure

```
[HISTORY]

Turn 1 (user, text): "Build me a 50km loop with some climbing."
Turn 1 (assistant): cold_start — generated a 52km loop with 600m climbing.
Turn 2 (user, manual): dragged waypoint at km 23 by 1.2km north.
Turn 2 (assistant): explain — "I see you pulled that section onto the dirt road. Nice call."
Turn 3 (user, text): "Can we add more climbing in the back half?"
Turn 3 (assistant): modify — increase_climbing on second half.
```

### 5.2 Formatting rules

- Each turn rendered as two lines: user input, assistant response summary.
- Manual turns are framed as `(user, manual): {action description}` rather than as text.
- The assistant line includes the response_type and a one-line summary of what happened.
- Mutation arrays summarized: `modify — increase_climbing, change_surface_mix` not full JSON.

### 5.3 Trim policy

> **Best-guess default — revisit during Phase 1.** v1: no trim within a session. Sessions exceeding 50 turns are rare; if they happen, the prompt may exceed context limits and we'll observe it.
>
> v1.1 trim policy (specced but not implemented): when session exceeds 50 turns, the dispatcher synthesizes a summary turn replacing the oldest 25 turns with a single `[SUMMARY OF TURNS 1–25]: {{summary_text}}` block. The summary is produced by a separate Claude call at trim time.

### 5.4 Assistant turn rendering

For each assistant response, render this format:

| Response type   | Rendering                                                            |
|-----------------|----------------------------------------------------------------------|
| `cold_start`    | `cold_start — generated a {{dist}}km route with {{climb}}m climbing` |
| `modify`        | `modify — {{mutation_summary}}`                                      |
| `replace`       | `replace — discarded prior route, generated new {{dist}}km route`    |
| `alternatives`  | `alternatives — produced 3 options`                                  |
| `clarify`       | `clarify — "{{question}}"`                                           |
| `pushback`      | `pushback — proposed {{counter_summary}}`                            |
| `explain`       | `explain — "{{first_sentence}}"`                                     |
| `refuse`        | `refuse`                                                             |

---

## 6. Claude API integration

### 6.1 Request shape

| Parameter      | Value                                          |
|----------------|------------------------------------------------|
| Model          | `claude-haiku-4-5-20251001`                    |
| Max tokens     | 4096                                           |
| Temperature    | 0.4                                            |
| System         | Full assembled system prompt (§3)              |
| Messages       | `[CONTEXT]` + `[HISTORY]` + `[CURRENT TURN]`   |
| Tools          | None                                           |
| Streaming      | See §6.4                                       |

> **Best-guess default — revisit during Phase 1.** Model choice. Haiku is the current Tribos default for coach calls. Route Builder turns are more structured and possibly benefit from Sonnet's stronger schema adherence. Decision: ship v1 on Haiku, A/B against Sonnet during Phase 2 once telemetry shows real schema-failure rates.

> **Best-guess default — revisit during Phase 1.** Temperature 0.4. Low enough to keep schema reliable, high enough to give persona voice some color. Persona blocks may want higher temperature; schema adherence wants lower. Compromise for v1; A/B during Phase 2.

### 6.2 Schema validation

The dispatcher validates every Claude response against the full `TurnResponse` schema (Turn Model Spec §3, plus the field details not in the prompt-facing projection).

Validation steps:

1. Parse JSON. If unparseable → schema failure path (§6.3).
2. Validate against schema. If invalid → schema failure path.
3. Validate semantic rules:
   - `response_type` ∈ allowed set
   - If `response_type` ∈ `{cold_start, modify, replace, alternatives}`, `route_operation` must be non-null.
   - If `response_type` ∈ `{clarify, pushback, explain, refuse}`, `route_operation` must be null.
   - Mutations in `route_operation.mutations` must all be valid mutation types (not the stubbed three).
   - `optimize_for` mutations are rejected (LLM must expand; executor rejects too but the dispatcher catches earlier).
4. If MANDATE was active and `response_type == "pushback"` → rewrite to `clarify` with generic prompt (§3.7).

### 6.3 Schema failure path

Two failures allowed before falling through to synthetic clarify:

1. First failure → retry once with a stricter prompt prefix:
   ```
   Your previous response was invalid. The schema requires {{specific_violation}}.
   Emit a valid TurnResponse JSON object now. No prose, no fences.
   ```
2. Second failure → synthesize a `clarify` response:
   ```
   {
     "response_type": "clarify",
     "message_to_user": "I had trouble understanding that. Could you rephrase?",
     "route_operation": null,
     "memory_updates": [],
     "meta": { "synthetic": true, "reason": "schema_failure" }
   }
   ```

### 6.4 Timeouts and 5xx handling

- **Timeout (15s):** synthesize `clarify` with message: "That took longer than I expected. Could you try again?"
- **5xx / 429:** synthesize `clarify` with message: "I'm having trouble right now. Try again in a moment." Include retry guidance in `meta`.
- **Network failure:** same as 5xx.

All synthetic responses set `meta.synthetic = true` and `meta.reason = <category>` for telemetry.

### 6.5 Streaming protocol

> **Best-guess default — revisit during Phase 1.** Three options were considered:
>
> 1. **Non-streaming** — wait for full response, parse, dispatch. Simplest. Worst perceived latency.
> 2. **Stream `message_to_user` to chat, parse rest on completion** — chat feels responsive, route operations land after.
> 3. **Full streaming with progressive parse** — parse fields as they arrive, dispatch each independently. Most complex; best UX.
>
> v1 ships with option 1 (non-streaming). Reason: Phase 1 UI may not have streaming infrastructure ready. v1.1 upgrades to option 2 once UI supports streaming text. Option 3 is deferred to v2.
>
> Phase 1 implementer: when designing the chat surface, build it streaming-capable so v1.1 doesn't require UI rework.

---

## 7. The current turn block

### 7.1 Text turn

```
[CURRENT TURN]
User (text): {{utterance}}
```

That's it. Utterance is the raw user input, trimmed but not otherwise modified.

### 7.2 Manual turn

```
[CURRENT TURN]
User (manual edit): {{action_description}}

Before state:
- Distance: {{before_distance_km}} km
- Climbing: {{before_elevation_m}} m
- Affected segment: km {{start_km}} to km {{end_km}}

After state:
- Distance: {{after_distance_km}} km
- Climbing: {{after_elevation_m}} m
```

Action descriptions are deterministic, generated by the manual handler:
- `dragged waypoint at km {{x}} by {{distance_km}} km {{direction}}`
- `added waypoint at km {{x}}`
- `removed waypoint at km {{x}}`
- `reversed route direction`
- `cleared route`

---

## 8. Manual turn handling

Manual turns are a first-class kind, not a special case of text turns. This section governs them.

### 8.1 Trigger and ingestion

Manual turns are produced by the route builder UI when the user performs a direct manipulation:

| Action     | Trigger                                                     |
|------------|-------------------------------------------------------------|
| Drag       | User releases a waypoint at a new position                  |
| Add        | User clicks "add waypoint" and places it                    |
| Remove     | User deletes a waypoint                                     |
| Reverse    | User clicks "reverse route"                                 |
| Clear      | User clicks "clear" or "start over"                         |

The manual handler executes the action against the executor (synchronously, the user sees the route change). It then constructs a `ManualTurn` object and submits it to the dispatcher.

### 8.2 Background Claude call

The Claude call for a manual turn runs in the background. The route has already been modified by the time the call starts.

The call serves three purposes:
1. **Memory updates** — capture user preferences revealed by the edit ("user dragged onto a dirt road" → maybe `prefers_dirt: true` if pattern repeats).
2. **Narration** — emit an `explain` response with chat text *only when intent is ambiguous*.
3. **Cap counter reset** — non-pushback responses reset the counter.

### 8.3 Narration policy

> **Decision — replacing the open question from the handoff note.** The handoff note flagged this: "Narrate only when intent is ambiguous — but how does the LLM judge ambiguity?"
>
> v1 approach: **deterministic trigger, LLM writes the words.** The dispatcher decides whether narration fires based on rules; the LLM only generates the message.

Narration fires when any of the following are true:

- Manual edit changes total distance by ≥20%
- Manual edit changes total climbing by ≥25%
- Manual edit moves a waypoint ≥5 km from its prior position
- Manual edit crosses or removes a previously-anchored waypoint
- Manual edit results in the route crossing a user-stated avoid (per persistent memory)

If none fire, the dispatcher sets `narration_required: false` in the prompt and the LLM emits a no-op `explain` with empty `message_to_user`. The dispatcher then drops the empty message.

If at least one fires, the dispatcher sets `narration_required: true` and includes the specific trigger reason in the `[CURRENT TURN]` block. The LLM produces a one-sentence narration.

### 8.4 Concurrency cancellation

**Rule:** if a text turn arrives while a manual-turn Claude call is in flight, cancel the manual call.

Implementation:

1. The dispatcher maintains a `currentManualCallController` reference (an `AbortController`).
2. Before starting a manual-turn Claude call, the dispatcher stores its controller.
3. When a text turn arrives, the dispatcher calls `controller.abort()` on any in-flight manual call.
4. The aborted manual call's memory_updates are discarded. Narration is discarded.
5. The new text turn proceeds normally.

Rationale: text turns are explicit user input and supersede ambient narration. The route state from the manual edit is already applied; what's lost is only the optional narration and the optional memory updates.

### 8.5 Manual turn failure handling

If the executor's manual handler fails (router error, geometry invalid):

- Revert to the `before` state.
- Emit a synthetic `explain` with `message_to_user`: "That edit didn't work — the routing service couldn't find a path. I've put the route back where it was."
- Do not fire a Claude call.

---

## 9. The turn dispatcher

### 9.1 Dispatcher contract

Input: `TurnResponse` (real or synthetic), validated.
Output: triggers executor calls + memory writes + chat stream. No return value.

### 9.2 Response_type → action dispatch

Pseudocode:

```typescript
async function dispatch(response: TurnResponse, turn: Turn): Promise<void> {
  // 1. Stream message to user (or hold for non-streaming)
  if (response.message_to_user) {
    chat.emit(response.message_to_user);
  }

  // 2. Execute route_operation if present
  switch (response.response_type) {
    case "cold_start":
    case "replace":
      await executor.generate({
        ...response.route_operation,
        count: 1,
      });
      if (response.response_type === "replace") {
        memory.clearSession(turn.user_id);
        history.archive(turn.session_id);
      }
      break;

    case "alternatives":
      await executor.generate({
        ...response.route_operation,
        count: 3,
      });
      break;

    case "modify": {
      const mutations = response.route_operation.mutations;
      const result = mutations.length === 1
        ? await executor.applyMutation(mutations[0])
        : await executor.applyMutations(mutations);

      if (!result.ok) {
        // Mutation array partial failure or single failure
        await handleMutationFailure(result, turn);
        return;
      }
      break;
    }

    case "clarify":
    case "pushback":
    case "explain":
    case "refuse":
      // No executor call
      break;
  }

  // 3. Apply memory updates
  for (const update of response.memory_updates) {
    await memory.apply(update, turn.user_id, turn.session_id);
  }

  // 4. Update pushback counter
  if (response.response_type === "pushback" && !response.meta?.router_failure) {
    pushbackCounter.increment(turn.session_id);
  } else {
    pushbackCounter.reset(turn.session_id);
  }

  // 5. Telemetry
  telemetry.record(turn, response);
}

async function handleMutationFailure(result: ExecutorFailure, turn: Turn) {
  // Per T2.3: rollback already happened, result contains `partial: originalRoute`
  // Convert to synthetic pushback
  const synthetic: TurnResponse = {
    response_type: "pushback",
    message_to_user: `That change didn't work — ${result.reason}. Want to try a different approach?`,
    route_operation: null,
    memory_updates: [],
    meta: { synthetic: true, reason: "router_failure", router_failure: true },
  };
  await dispatch(synthetic, turn);
}
```

### 9.3 Error translation table

| Source                          | Translation                                                  |
|---------------------------------|--------------------------------------------------------------|
| Claude timeout                  | Synthetic `clarify` (§6.4)                                   |
| Claude 5xx/429                  | Synthetic `clarify` with retry message (§6.4)                |
| Schema validation fails ×2      | Synthetic `clarify` (§6.3)                                   |
| Router fails on `route_operation` | Synthetic `pushback`, counter NOT incremented (§9.2)         |
| Manual turn router fails        | Revert + synthetic `explain` (§8.5)                          |
| Mutation array partial failure  | Rollback + synthetic `pushback` (§9.2)                       |
| MANDATE violated by LLM         | Rewrite to `clarify` (§3.7)                                  |
| `optimize_for` raw emit         | Reject at validation → synthetic `clarify` asking the user to specify |

**No silent failures.** Every code path produces a user-visible response.

---

## 10. Memory update application

### 10.1 Memory update shape

From `TurnResponse.memory_updates`:

```typescript
type MemoryUpdate = {
  scope: "session" | "persistent";
  operation: "set" | "delete";
  key: string;
  value?: string;        // required for "set"
  confidence?: number;   // 0..1; default 1
};
```

### 10.2 Application rules

- `session` scope writes are keyed to `(user_id, session_id)`.
- `persistent` scope writes are keyed to `user_id` only.
- `delete` removes the key from the appropriate scope.
- The dispatcher applies updates in order. Failures on individual updates are logged but do not fail the turn.

### 10.3 Scope clearing

- `replace` response → session memory cleared (§9.2).
- Route discard (UI action, not a `TurnResponse`) → session memory cleared.
- Session timeout (24hr inactivity) → session memory cleared.
- Persistent memory never auto-clears.

### 10.4 Interface to storage layer

```typescript
interface MemoryLayer {
  apply(update: MemoryUpdate, userId: string, sessionId: string): Promise<void>;
  getAll(userId: string, sessionId: string): Promise<{
    persistent: Record<string, MemoryFact>;
    session: Record<string, MemoryFact>;
  }>;
  clearSession(userId: string, sessionId?: string): Promise<void>;
}
```

The implementation is Doc 4's responsibility. Doc 2b consumes this interface.

---

## 11. Telemetry

PostHog events for the conversational layer. These extend the T1.4 event catalog.

### 11.1 Events

| Event name                        | Trigger                                          | Key properties                                                |
|-----------------------------------|--------------------------------------------------|---------------------------------------------------------------|
| `conv_turn_started`               | Dispatcher receives a turn                       | `turn_kind`, `session_id`, `pushback_counter`                 |
| `conv_prompt_assembled`           | Prompt assembly completes                        | `context_token_count`, `history_turn_count`                   |
| `conv_claude_call_started`        | API request sent                                 | `model`, `temperature`                                        |
| `conv_claude_call_completed`      | API response received                            | `latency_ms`, `input_tokens`, `output_tokens`                 |
| `conv_claude_call_failed`         | API failure (timeout, 5xx)                       | `failure_reason`, `latency_ms`                                |
| `conv_schema_validation_failed`   | Schema validation fails                          | `attempt_number`, `violation`                                 |
| `conv_response_dispatched`        | Dispatcher finishes                              | `response_type`, `synthetic`, `mutation_types[]`              |
| `conv_mandate_injected`           | MANDATE block added to prompt                    | `pushback_counter`, `cap`                                     |
| `conv_mandate_violated`           | LLM emitted pushback under MANDATE               | `session_id`                                                  |
| `conv_manual_call_cancelled`      | Manual turn Claude call aborted                  | `manual_action`, `time_in_flight_ms`                          |
| `conv_optimize_for_emitted`       | LLM emitted raw `optimize_for` (contract break)  | `optimize_for_criterion`                                      |
| `conv_memory_update_applied`      | Memory write succeeded                           | `scope`, `operation`, `key`                                   |
| `conv_memory_update_failed`       | Memory write failed                              | `scope`, `operation`, `key`, `error`                          |

### 11.2 Properties common to all events

- `user_id`
- `session_id`
- `turn_id`
- `coach_persona`
- `timestamp_ms`

### 11.3 What to watch in early Phase 2

After cutover, the events that surface the most actionable signal:

- `conv_schema_validation_failed` rate → schema teaching block needs work
- `conv_mandate_violated` rate → MANDATE wording needs strengthening
- `conv_optimize_for_emitted` rate → expansion rules need clarification
- `conv_claude_call_failed` rate → model/timeout tuning
- `conv_response_dispatched` by `response_type` → distribution check; if `clarify` dominates, decision rules are too cautious; if `pushback` is rare, personas may be too soft

---

## 12. Acceptance criteria

Doc 2b is implementable when all of the following are checked:

- [ ] System prompt template (§3) ships as a literal string with `{{PLACEHOLDER}}` substitution.
- [ ] All five persona blocks (§3.3) are implemented in a `PERSONA_BLOCKS` map.
- [ ] The MANDATE block (§3.7) injects at cap and the rewrite-to-clarify safety net works.
- [ ] Pushback counter increments and resets per the rules in §3.7 and §9.2.
- [ ] Context block (§4) assembles with all sections; empty sections render as `(none)`.
- [ ] History block (§5) renders turns per §5.4 format table; v1 has no trim.
- [ ] Training context block (§4.2) renders the v1 best-guess format.
- [ ] Past ride summaries fetch with 1hr cache keyed to `(user_id, region_bbox)`.
- [ ] Claude API call uses Haiku 4.5, temperature 0.4, max_tokens 4096, non-streaming.
- [ ] Schema validation runs full schema check + semantic rules (§6.2).
- [ ] Schema failure retry path works once, then falls through to synthetic clarify.
- [ ] Timeout (15s), 5xx, 429, and network failures produce synthetic responses.
- [ ] Manual turn deterministic narration triggers (§8.3) all fire correctly.
- [ ] Concurrency cancellation (§8.4) aborts in-flight manual calls when text turns arrive.
- [ ] Manual turn router failure reverts to `before` state and emits synthetic explain.
- [ ] Dispatcher routes all 8 response types per §9.2.
- [ ] Mutation failure rollback produces synthetic pushback per §9.2.
- [ ] Memory updates apply with correct scope keys; scope clearing fires on `replace`.
- [ ] All telemetry events from §11 fire with the listed properties.
- [ ] No silent failures: every code path produces a user-visible response.

---

## 13. Risks and unknowns

### 13.1 Highest risks

1. **The 4-week lag between drafting and implementation.** Phase 1 UI work *will* surface things that change requirements. The "Phase 1 feedback intake" needed before Phase 2 starts isn't in this spec; it should be a separate document maintained during Phase 1.

2. **`optimize_for` expansion quality.** Region-aware expansion isn't in v1. "Scenic in Erie" expansion is the same as "scenic in San Francisco" in v1. This will produce visibly wrong recommendations for some users in some regions until v1.1 ships region-aware expansion.

3. **MANDATE block reliability.** The MANDATE pattern is novel in Tribos prompts. It may not be authoritative enough — the LLM has prior pushback responses in `[HISTORY]` and may double down. The rewrite-to-clarify safety net catches this but produces a degraded UX (generic "tell me more").

4. **Manual turn narration deterministic triggers.** The triggers in §8.3 are best-guesses. They may fire too often (spammy narration) or too rarely (silent edits when narration would help). Tune during Phase 2.

5. **Schema validation in production.** Haiku has been reliable for Tribos coach calls, but those are unstructured. Structured output for 8 response types and 13 active mutations is new territory. Schema failure rates are unknown.

### 13.2 Open questions deferred to Phase 1 / Phase 2

- Streaming protocol (§6.5) — decide once chat UI is built.
- History trim policy (§5.3) — implement only if sessions exceed 50 turns in production.
- POI integration (`anchor_at_poi`) — stubbed in v1; design the prompt-side handling when the executor stub is unstubbed.
- Persona block wording — Phase 2 tuning.
- Model choice (Haiku vs Sonnet) — A/B during Phase 2.
- Temperature — A/B during Phase 2.

### 13.3 Stop-and-ask-Travis gates

Implementation should pause and confirm before:

- Changing the `TurnResponse` schema in any way that diverges from Turn Model Spec §3.
- Adding a new `response_type`.
- Adding or activating a stubbed mutation.
- Changing the MANDATE rewrite-to-clarify safety net to fail loudly instead.
- Changing the manual turn narration trigger thresholds in §8.3.
- Changing the model from Haiku to anything else in v1.

---

## 14. Stylistic notes

This spec follows T-series conventions:

- Audit-first: when implementation begins, the first step is a discovery report against the current codebase, not code changes.
- Module-coexistence: new conversational pipeline ships parallel to legacy 3-suggestion backend until cutover (Phase 3).
- Explicit out-of-scope sections.
- Acceptance criteria as checkbox list.
- Risk notes at the end.
- File paths point to `docs/` for spec references.

---

## 15. References

- `docs/turn-model-spec-v1.0-LOCKED.md` — canonical `TurnResponse` schema, response_type semantics, mutation taxonomy
- `docs/executor-spec-v0.1-DRAFT.md` — executor architecture and public API
- `docs/T1.1` through `T1.4` — foundation specs
- `docs/T2.1` through `T2.5` — executor build specs
- `docs/doc-2b-handoff-note.md` — context from the conversation that produced this spec
