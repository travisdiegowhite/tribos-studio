# Doc 2b Handoff Note — Context from Prior Conversation

**Purpose:** This document captures decisions, context, and constraints from the conversation that produced the Turn Model Spec, Executor Spec, and T1.x/T2.x handoff specs. It exists so the Doc 2b drafting chat starts with the right mental model rather than reconstructing decisions from the locked specs alone.

**How to use:** Read this once at the start of the Doc 2b chat, then refer back as needed. The locked specs in `docs/` are canonical; this note is *context*.

---

## What's locked and shipped

Phase 0 is nearly complete. The backend is built.

**Specs (in `docs/`):**
- `turn-model-spec-v1.0-LOCKED.md` — the canonical contract for the conversational Route Builder
- `executor-spec-v0.1-DRAFT.md` — the executor architecture
- `T1.1` through `T1.4` — foundation specs (all shipped)
- `T2.1` through `T2.5` — executor build specs (all shipped)

**Code in production-adjacent state (not yet wired into any UI):**
- Distance unit contract (`_km` / `_m` suffixes, runtime asserts)
- Coordinate format contract (`[lng, lat]` canonical, boundary converters)
- Claude-failure fallback (Tier 1/2/3 heuristic generation)
- PostHog baseline instrumentation (full event catalog firing on the legacy pipeline)
- `RouterClient` — multi-provider routing with cache, dedup, fallback chain
- `ConstraintBuilder` — 16 reliable/best-effort handlers + 3 stubs
- `MutationHandlers` — `applyMutation`, `applyMutations` with all-or-nothing rollback
- `ManualHandlers` — drag/add/remove/reverse/clear
- `Executor` facade — `getExecutor()` exposes all four operations

The executor is complete, tested, instrumented, and waiting to be wired into a UI and a conversational pipeline.

---

## The big plan that governs everything

Original plan was: spec everything top-down, build full backend, then build UI last.

**Travis revised this mid-build.** New plan, locked:

| Phase | Work | Status |
|---|---|---|
| Phase 0 | T2.5 + Doc 2b | T2.5 done; Doc 2b is what the next chat drafts |
| Phase 1 | UI rebuild against *current* backend | Not started |
| Phase 2 | Conversational pipeline implementation (per Doc 2b) | Not started |
| Phase 3 | Cutover — wire new pipeline into new UI | Not started |

This means **Doc 2b is the spec for Phase 2, drafted now during Phase 0, sitting in `docs/` for ~4 weeks before implementation.** Re-read it at the start of Phase 2 — Phase 1 UI work may surface things that change requirements.

The shift to UI-first happened because Travis pointed out: the current UI has no chat surface. The whole conversational architecture has been designed for a UI that doesn't exist yet. UI-first lets you build the visible structure against the existing (3-suggestion form-based) backend, then swap in the conversational pipeline once Doc 2b ships.

---

## The eight response types (locked in Turn Model Spec §1)

Every turn produces exactly one of:

1. `cold_start` — no route exists; build one
2. `modify` — route exists; mutate it
3. `replace` — discard existing route, build fresh
4. `alternatives` — produce 3 candidates without committing
5. `clarify` — ask user a question, no action
6. `pushback` — user request conflicts with reality; propose counter
7. `explain` — answer questions about route OR narrate manual edits
8. `refuse` — out-of-scope redirect (never refuses legitimate route requests)

Doc 2b's prompt must teach the LLM these eight types and when to emit each. This is the central design challenge of Doc 2b.

---

## The 19 mutations (locked in Turn Model Spec §3.1)

Mutations carry the semantic load of "what does the user want." Doc 2b's prompt determines which mutations the LLM emits for which utterances.

**Reliable (10):** `extend_distance`, `shorten_distance`, `trim_route`, `reverse_route`, `increase_climbing`, `reduce_climbing`, `change_surface_mix`, `change_traffic_preference`, `anchor_through`, `avoid_segment`, `swap_to_familiar`, `swap_to_unfamiliar`

**Best-effort (3):** `smooth_route`, `change_route_shape`, `avoid_exposure` (often returns `context_missing` without weather)

**Experimental / stubs (3 — currently throw `mutation_not_supported`):** `change_climb_character`, `anchor_at_poi`, `avoid_segment_by_property`

**Safety net (1):** `optimize_for` — see below

Doc 2b should set LLM expectations honestly. For experimental/stub mutations, the prompt should either:
- Avoid emitting them in v1 (preferred), OR
- Be ready for `mutation_not_supported` to come back and translate to `pushback` with helpful explanation

---

## `optimize_for` — Option Y locked

`optimize_for { criterion: "scenery" | "training_value" | "speed" | "social" }` is in the mutation taxonomy but the executor's handler **throws `unsupported_mutation` if it receives a raw `optimize_for`**.

The design (Option Y): the LLM is responsible for *expanding* `optimize_for` into component mutations before emitting. The executor never sees the raw form. If it does, the LLM violated its contract.

Initial expansion guidance (from Turn Model Spec §5.6 — the executor spec has more):
- `scenery` → `change_surface_mix { path-heavy }` + `change_traffic_preference { low }`
- `training_value` → constraints derived from `context.training_goal`
- `speed` → `smooth_route { simplify_turns }` + `change_traffic_preference { low }`
- `social` → `anchor_at_poi { popular cycling spot }` + memory-fact-driven region bias

**Doc 2b must include explicit prompt instructions that `optimize_for` requires expansion.** This is the conversational moat — the LLM uses cycling expertise to define "scenic" contextually (scenic in Erie ≠ scenic in San Francisco). It's also the highest-risk mutation. Heavy prompt testing recommended.

---

## Persona-modulated behavior (locked)

Five personas, locked behavior:

| Persona | Pushback cap | Disposition |
|---|---|---|
| The Hammer | 5 | Pushes hard, takes longer to relent |
| The Competitor | 4 | Results-focused |
| The Scientist | 4 | Data-driven; pushes on physiological grounds |
| The Pragmatist | 3 | Life-aware; doesn't nag |
| The Encourager | 3 | Warm; process-focused |

Persona **affects** tone, phrasing, pushback likelihood, and the cap value. Persona **does not affect** the response_type set, schema, executor behavior, or whether memory updates fire.

For Doc 2b: persona is a **prompt layer** that injects voice/disposition into the system prompt. It does not change architecture. Implementation likely means a `PERSONA_BLOCKS` map injected into the system prompt's persona section.

---

## Pushback cap mechanics (locked)

- Counter scoped to current route session
- Increments on every `pushback` response
- Resets on any non-pushback response
- Router-failure pushbacks DON'T increment (per T2.3)
- When counter hits the persona's cap, the prompt includes a **MANDATE block** disabling pushback for that turn

The mandate text (suggested):
> `MANDATE: pushback is disabled this turn. Honor the user's request as stated. You may include a brief acknowledgment but do not propose an alternative.`

This is system-level enforcement. The persona sets which cap, but the override is non-negotiable. Doc 2b's dispatcher must track the counter and inject the mandate when the cap is hit.

---

## Compositional mutations + rollback (locked)

A single turn can emit multiple mutations in one `route_operation`:

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

Handles "make the first half easier and the second half harder."

**Rollback contract (T2.3 enforced):** if any mutation in the array fails, the entire operation rolls back. The result includes `partial: originalRoute` — the *pre-turn* state, NOT the intermediate state after some mutations succeeded. The conversational dispatcher (Doc 2b) must convert this to `pushback` with the failure reason.

Doc 2b should set expectations: the LLM emits arrays of mutations when needed, but knows that failure rolls back everything. This affects prompt design — the LLM should be conservative about compositional mutations on unreliable handlers.

---

## Memory and history scope (locked)

Three layers, per Turn Model Spec §8:

**Conversation history**
- Full session, all turns (text + manual)
- Lives in Zustand, hydrated on route load
- No trim within a session

**Memory facts (Supabase, keyed to user_id)**
- `session` scope — cleared on route discard or `replace`
- `persistent` scope — survives across routes/sessions
- LLM emits memory updates in TurnResponse; storage layer enforces scope rules

**Relevant past rides**
- 3-5 ride summaries fetched at prompt assembly
- "Relevant" = matches training goal bucket OR overlaps geographic region
- Summarized, not full geometry
- Cached 1hr keyed to `(user_id, region_bbox)`

On "start over" / `replace`: **persistent memory survives, session memory clears, history archives.**

Doc 2b's prompt assembly must construct the `[CONTEXT]` block with persistent facts + session facts + relevant past rides + active training context.

---

## Coordinate / distance invariants (locked)

- All coordinates are `[lng, lat]` (GeoJSON convention)
- All distances are kilometers with `_km` suffix
- Meters use `_m` suffix
- Conversion only at boundaries (router APIs, etc.)

Doc 2b doesn't directly manipulate routes, but any prompt that includes geometric summaries or stats must use these units.

---

## Architecture choices baked into Doc 2b's design space

These are decisions already made that constrain what Doc 2b can be:

**1. Structured output (Architecture B).** Every turn = one Claude call returning a JSON `TurnResponse` with all fields. Not a classifier-then-action pipeline (Architecture A). Not yet a fast-triage-plus-deep pipeline (Architecture C — possible v2). One call, one decision, one dispatch.

**2. The executor is the consumer.** Doc 2b produces `TurnResponse` objects. The dispatcher in Doc 2b translates response_type into executor calls:
- `cold_start` / `replace` → `executor.generate(count: 1)`
- `alternatives` → `executor.generate(count: 3)`
- `modify` with single mutation → `executor.applyMutation`
- `modify` with multiple mutations → `executor.applyMutations`
- `clarify` / `pushback` / `explain` / `refuse` → no executor call; message-only

**3. Manual edits are also turns.** Per Turn Model §4.2, dragging a waypoint produces a `ManualTurn`. The LLM call still happens (for narration / memory updates) but in the background. Doc 2b's dispatcher must handle both turn kinds.

**4. Concurrency rule.** If a text turn arrives while a manual-turn LLM call is in flight, cancel the manual call. The new text turn supersedes it.

**5. Failure modes are explicit (Turn Model §12).**
- Claude timeout >15s → synthetic `clarify`
- Claude 5xx/429 → synthetic `clarify` with retry guidance
- Schema validation fails → one retry with stricter prompt, then synthetic `clarify`
- Router fails on `route_operation` → `pushback` (does NOT count toward cap)
- Manual turn router fails → revert to `before` state, emit `explain` with error
- Mutation array partial failure → rollback, convert to `pushback`

**No silent failures.** Every code path produces a user-visible response.

---

## What Doc 2b is and isn't

**Doc 2b is the spec for:**

1. The system prompt (persona block, schema definition, output rules)
2. The prompt assembly pipeline (assembling [SYSTEM], [CONTEXT], [HISTORY], [CURRENT TURN] blocks per Turn Model §7)
3. The Claude API integration (request shape, streaming, timeouts, schema validation, retry)
4. The turn dispatcher (TurnResponse → executor calls + memory updates + chat streaming)
5. Manual turn handling (the background LLM call after a manual action)
6. Concurrency management (canceling in-flight manual calls when text turns arrive)
7. Error handling across all failure modes

**Doc 2b is NOT the spec for:**

- The UI surface (separate document, Phase 1)
- Memory storage in Supabase (Doc 4 — though Doc 2b can describe the interface)
- The full T3.1/T3.2/T3.3 implementation order (separate handoff specs)
- Tuning the prompt against real users (that's Phase 2 work, post-spec)

---

## Suggested structure for Doc 2b

Based on what's needed and the spec patterns established by Turn Model + Executor:

1. Purpose and scope
2. Architecture overview (the pipeline: input → prompt → Claude → TurnResponse → dispatch → executor + chat + memory)
3. The system prompt — persona block, schema, output rules, the MANDATE pattern
4. The context block — facts, history, past rides, training context
5. The history block — turn formatting, manual turn framing
6. The current turn block — text turns vs manual turns
7. Claude API integration — model, max_tokens, structured output, streaming, timeouts
8. Schema validation and retry logic
9. The turn dispatcher — TurnResponse parsing, response_type routing, error translation
10. Manual turn handling — background calls, narration policy, concurrency cancellation
11. Memory update application — applying memory_updates from TurnResponse
12. Telemetry events for the conversational layer
13. Out of scope (deferred to v2 or other docs)
14. Acceptance criteria for implementation
15. Open questions

This is suggestive, not prescriptive. The Doc 2b chat may discover a better organization during drafting.

---

## Open questions to resolve during Doc 2b drafting

These were flagged across earlier conversations but not settled:

1. **Streaming protocol.** Stream `message_to_user` to chat as it generates? Stream the full TurnResponse and parse on completion? Hybrid (parse `message_to_user` field-by-field, apply route_operation after)? This is a meaningful UX decision affecting perceived latency.

2. **History trim policy.** Spec says "summarize oldest 25 when session exceeds 50 turns." Out of scope for v1, but Doc 2b should leave room for the synthetic summary turn.

3. **Manual turn narration policy.** Per Travis's earlier answer: narrate only when intent is ambiguous. Doc 2b's prompt must teach the LLM to *judge* ambiguity and stay silent when the manual action is clear.

4. **`refuse` redirect behavior.** Persona-modulated: Encourager redirects to route-building topics; Scientist declines briefly. Doc 2b should encode this in persona blocks.

5. **POI integration.** `anchor_at_poi` is a stub but a real feature. Doc 2b should describe the prompt-side handling even if the executor stub remains. Defer the implementation, but the prompt design needs to know what's coming.

6. **Initial training context format.** Per spec, prompt includes "Active training context (current goal event, week-in-plan, recent load)." Doc 2b should formalize what this block looks like.

---

## Stylistic conventions for handoff specs (established in T-series)

Doc 2b should be a spec, not the implementation. Patterns established by T1.x/T2.x that should carry forward if any T3.x specs are written from Doc 2b:

- Audit-first: discovery step produces a report before code changes
- Explicit out-of-scope sections (resist "while you're in there" scope creep)
- Acceptance criteria as checkbox list
- Risk notes at the end
- Stop-and-ask-Travis gates for ambiguous decisions
- File paths pointed at `docs/` for spec references
- Module-coexistence pattern: new code ships parallel to legacy, no production cutover

---

## Tone and ethos

A pattern from the conversation that's worth preserving:

- **Push back when something feels off.** Travis values critical engagement over agreement.
- **Stress-test before locking.** Multiple specs were revised after stress-testing surfaced gaps.
- **Be honest about uncertainty.** The 3 stub mutations are stubbed because their design isn't settled; the spec says so explicitly rather than guessing.
- **The cheapest spec is the one that doesn't need refactoring later.** Spend the time upfront.
- **Decision options surfaced with `ask_user_input_v0`.** Travis prefers structured choices over open-ended questions.

---

## What's NOT in this note

This note is context for Doc 2b. It does NOT include:

- The full Turn Model spec (read `docs/turn-model-spec-v1.0-LOCKED.md`)
- The full Executor spec (read `docs/executor-spec-v0.1-DRAFT.md`)
- The detailed mutation taxonomy and confidence ratings (read T2.2)
- The executor's public API details (read T2.5)
- The PostHog event catalog (read T1.4)

The Doc 2b drafter should read all the specs in `docs/` before starting, then refer to this note for decisions and constraints that don't live in any single spec.

---

**Starting prompt for the Doc 2b chat:**

> I'm drafting Doc 2b — the Conversational AI Pipeline spec for the Tribos Route Builder rebuild. The executor backend is complete and locked. Read this handoff note for context, then read the locked specs in `docs/` (turn-model-spec-v1.0-LOCKED.md, executor-spec-v0.1-DRAFT.md, and the T1.x and T2.x specs as needed). Don't write the spec yet — let's first talk through how to structure it and what the hardest decisions will be.
