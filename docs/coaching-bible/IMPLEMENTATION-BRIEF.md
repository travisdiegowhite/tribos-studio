# Coaching Bible — Implementation Brief

Goal: make the Tribos coach *decide* instead of *describe*. Today the coach reads rider metrics and narrates them, which produces the same generic feel as Strava's Athlete Intelligence. The fix is structural, not a prompt tweak: a small rules layer decides which evidence-backed rules apply to the rider's state, and the model voices those decisions in persona.

Read all three files in this folder before writing code:
- `IMPLEMENTATION-BRIEF.md` (this file) — what to build, in what order, and what "done" means
- `coaching-rules.yaml` — the rules: triggers, claims, confidence, persona lines, forbidden phrasings
- `coach-system-prompt.md` — the prompt template the coach runs on, with injection slots
- `tribos-coaching-bible-source-base.md` — the research behind every rule; reference only, never loaded into a prompt

## Constraints (non-negotiable)

1. **No new services, no new infrastructure.** This is a YAML file, one pure TypeScript function, a prompt template, and tests. It runs wherever the coach call already runs.
2. **The rules engine is a pure function.** `evaluateRules(riderState, rules) → FiredRule[]`. No I/O, no LLM calls, no database access inside it. It must be trivially unit-testable and readable by the founder without AI help.
3. **The model never decides which rules apply.** The engine decides; the model voices. If a rule isn't in the injected block, the coach does not invent it.
4. **Do not touch the route builder, the Today page hero state machine, or ingestion.** This work is scoped to the coach call path only.
5. **Map to real fields, don't invent them.** `coaching-rules.yaml` uses a `RiderState` contract (below). Before writing the engine, find where TFI/AFI/FS, RSS, EF, PD bests, and segment comparisons actually live and write a single adapter `toRiderState()` that builds the contract from real data. If a field doesn't exist yet, the rule that needs it is skipped with `reason: missing_input` — never approximated.
6. **Existing language policies still apply**: mostly date-agnostic voice; specific dates only when verified; no coach lingo in user-facing text (say "hard day" not "VO2max session," "how ready you are" not "readiness score").
7. **Keep it small.** If a phase is growing past ~300 lines of new code, stop and say so.

## RiderState contract

The engine consumes this shape. Build it with one adapter function; fill what's available, leave the rest `null`.

```ts
type RiderState = {
  // identity / context
  age: number | null;
  persona: 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor';
  goalType: 'race' | 'endurance_event' | 'general_fitness' | null;
  weeksToEvent: number | null;
  weeklyHours4wkMean: number | null;
  fearOfFailureFlag: boolean | null;          // from intake, if captured

  // load model (existing)
  tfi: number | null;                          // fitness index
  afi: number | null;                          // fatigue index
  fs: number | null;                           // form/freshness score
  rss7d: number[] | null;                      // last 7 daily RSS values, most recent last
  rss3wkMean: number | null;                   // weekly RSS mean of prior 3 weeks

  // distribution (existing or computable from sessions)
  midZoneShare4wk: number | null;              // 0–1, share of RSS from tempo/threshold-range sessions
  hardSessions4wk: number | null;              // count of sessions whose goal was high-intensity
  easySessions4wk: number | null;              // count of sessions clearly easy
  strengthSessions8wk: number | null;
  daysSinceLastRide: number | null;

  // performance evidence (existing engine)
  efTrend: 'ahead' | 'consistent' | 'behind' | 'insufficient' | null;
  pdShortTrend: 'ahead' | 'consistent' | 'behind' | 'insufficient' | null;   // 1–5 min bests vs 90-day
  pdLongTrend: 'ahead' | 'consistent' | 'behind' | 'insufficient' | null;    // 20–60 min bests vs 90-day

  // durability (Phase 4 — null until built)
  freshVsFatiguedDrop5min: number | null;      // fraction, e.g. 0.12
  longRideDecoupling: number | null;           // fraction, EF first third vs last third, last long ride

  // readiness (Phase 3 — null until check-in exists)
  wellness: { sleep: number; fatigue: number; mood: number } | null;   // 1–5 each, today
  wellnessLowStreak: number | null;            // consecutive days with any item ≤2
  hrvBelowBandDays: number | null;             // consecutive days 7-day Ln rMSSD below baseline − 0.5 SD
  hrvReadings7d: number | null;
  illnessFlag: boolean | null;

  // environment
  eventTempDeltaC: number | null;              // forecast event temp − 30-day training mean temp
};
```

## Output contract

```ts
type FiredRule = {
  id: string;                    // e.g. 'TID-1'
  claim: string;                 // plain-language, one sentence
  confidence: 'settled' | 'leaning' | 'contested';
  personaLine: string;           // the line for riderState.persona
  neverSay: string[];
  priority: number;              // lower = more important; the prompt gets at most 3
};
```

`evaluateRules` returns fired rules sorted by priority. The coach prompt receives **at most three**. If more fire, drop the lowest priority and log the rest — the coach should say one or two things well, not six things badly. RDY (readiness) rules always outrank prescription rules: don't prescribe a hard day to someone the engine says should skip.

## Phases

### Phase 1 — Behavior floor (prompt only, no new computation)
- Install `coach-system-prompt.md` as the coach's system prompt. Wire the `{{persona}}`, `{{rider_context}}`, and `{{fired_rules}}` slots; for this phase `{{fired_rules}}` is an empty block.
- The CB-1 … CB-9 behavior rules in the prompt apply unconditionally. This alone removes most of the generic feel: rationale on every prescription, task-level feedback, a next action, continuity reference.
- Done when: five fixture conversations (one per persona) each produce output that (a) contains a "because," (b) ends with a concrete next step, (c) contains no self-level praise ("great job," "you're amazing"), (d) contains no coach lingo from the banned list in the prompt. Write these as string-level tests against saved model outputs; don't over-engineer an eval harness.

### Phase 2 — Rules engine + rules computable from existing data
- Add `coaching-rules.yaml` to the repo and a loader with schema validation (zod or equivalent, whatever the project already uses).
- Implement `toRiderState()` adapter and `evaluateRules()`.
- Rules that can fire in this phase: TID-1, TID-2, TPR-1, TPR-2, TPR-3, TPR-4 (if forecast is available; else skip), MST-1, MST-2, MST-3, MST-4, DUR-4.
- Inject fired rules into `{{fired_rules}}`.
- Done when: the eval fixtures in `coaching-rules.yaml` → `evals:` all pass (each fixture is a RiderState plus `mustFire` and `mustNotFire` lists). Every fixture is a plain object; no factories.

### Phase 3 — Readiness check-in (one new feature)
- A three-question morning check-in: sleep, fatigue, mood/stress, 1–5 each. One table or three columns on an existing daily table — founder's call, keep it minimal. This is the highest-evidence readiness input in the literature (better than HRV) and it's cheap.
- Populate `wellness`, `wellnessLowStreak`. If HRV is already ingested from any device, populate `hrvBelowBandDays` using a 7-day rolling mean of Ln rMSSD and a band of ±0.5 SD; require ≥3 readings/week or leave null.
- Rules that unlock: RDY-1, RDY-2, RDY-3, RDY-4, TPR-5.
- Done when: RDY-4 fixture passes (bad subjective + good HRV → coach modifies, never overrides), and the Today page "am I cleared" question is answered by an RDY rule where one fires.

### Phase 4 — Durability (new computation on existing data)
- For every PD best, record kJ (or kJ/kg) accumulated before the effort. Bin: fresh (<10 kJ/kg prior) vs fatigued (≥20 kJ/kg prior). Compute `freshVsFatiguedDrop5min` over the 90-day window.
- For rides >2 h with a steady section, compute EF in the first vs last third → `longRideDecoupling`.
- Rules that unlock: DUR-1, DUR-2, DUR-3.
- Done when: DUR fixtures pass and a gravel-goal rider with low durability gets a long-ride-with-late-effort prescription in persona voice.

## What not to do

- Don't put paper citations in the prompt or in user-facing output. The rules carry citation keys for the founder's reference only.
- Don't let the model see the whole rules file. It sees fired rules only.
- Don't add a "rule explanation" UI. If the founder wants a debug view later, it's a dev-only page.
- Don't rewrite existing persona definitions. The prompt template references them; it doesn't replace intake or persona selection.
- Don't add HRV-guided daily plan changes on single readings. The evidence is for rolling averages only.

## Reporting back

After each phase, produce a short summary: files touched, line count added, fixtures passing, and any RiderState field you could not populate and why. If you had to guess at a field mapping, say so explicitly — a wrong silent mapping is worse than a skipped rule.
