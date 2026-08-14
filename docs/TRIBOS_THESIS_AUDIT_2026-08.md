# Tribos Thesis Audit — Grade and Propose

**Date:** 2026-08-14
**Mode:** Read-only audit. Every fix below is a **proposal** for review and approval — nothing has been implemented.
**Thesis under test:** *A rider should never have to interpret anything. The system carries the burden of translation. Every default surface answers a rider question in plain language, backed by evidence from their actual rides. Raw numbers exist — visible where they build trust, fully available behind a door — but a metric is never the thing a rider must decode to know what's going on.*

**Method:** Every rider-facing default surface was walked component-by-component (file:line cited throughout), graded against the six principles (P1 Legend Test, P2 Sentence Rule, P3 Question Test, P4 Evidence Hierarchy, P5 Decision Rule, P6 The Door), with charts classified and every user-facing metric string inventoried. Dead code (defined but never mounted) is graded separately — it doesn't count against the live product but is flagged where it contains thesis-compliant assets worth harvesting or violations worth purging.

---

## Executive summary

**The translation layer exists — it's just losing the layout war.** The codebase contains genuinely excellent plain-language machinery: the Spine's `summaryLine` ("You're carrying productive load. Peak in 9 days, right on The Rad."), the glance's word-first fitness cells, the segment comparison verdicts ("Same effort, more speed — you're getting more out of every watt here."), the evidence engine's receipts ("Best 1-minute power in the last 3 weeks: 414W on 2026-08-02, up 4.3%…"). But on the surfaces riders actually see:

1. **The canonical `/today` renders a 41px raw Form Score as its hero** with an 11px jargon fragment ("LOADING · optimal") beneath it, above a full-width interactive dashed-projection chart. The interpreting sentence — the best one in the app — is a 13px right-aligned caption.
2. **The ride detail surface is a wall of undecoded numbers** including literal `NP`, `IF`, and `TSS` labels, with zero ride-level interpretation and no door (full stats *are* the default).
3. **`/progress` opens on a chart labeled `CTL`** — six user-facing Peaksware strings in one component, no interpreting sentence anywhere in it.
4. **Banned vocabulary is systemic**: ~40 live user-facing sites render TSS/CTL/ATL/TSB/NP/IF, including a push notification body, a publicly-shared image, coach-product recommendation rationales, and a public marketing page.
5. **The coach-layer guardrails are real but full of holes**: the banned-vocabulary prompt rule is only sent to beginner-tier athletes; two LLM endpoints have no vocabulary rules at all; and the persona definitions themselves instruct the model in "Weekly TSS compliance."
6. **The evidence engine's receipts never reach a surface.** Every persistent fitness verdict on every surface is pure load-model output with no evidence context — exactly the failure the founding test case (FS −19 while demonstrably strong) exists to catch.
7. **The Door does not exist.** `grep` for "show me the numbers" (and every variant) returns zero hits. Stats pages are undifferentiated peer tabs and top-level nav items, and the only door-like affordance on Today is labeled `CLICK FOR TFI / AFI DETAIL` — jargon as the doorknob.

The single highest-leverage observation: **the fallback `/today/glance` already implements the thesis hierarchy correctly** (word at 22px → verdict sentence → metric chips at 13px), while the default `/today` Spine inverts it. The target pattern is already written, reviewed, and shipped — on the wrong route.

---

## 1. Scorecard

Pass ✓ · Partial ◐ · Fail ✗ · not applicable —

| Surface (route) | Default? | P1 Legend | P2 Sentence | P3 Question | P4 Hierarchy | P5 Decision | P6 Door |
|---|---|---|---|---|---|---|---|
| Today Spine (`/today`) | **Yes — home** | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Today Glance (`/today/glance`) | fallback | ◐ | ◐ | ✓ | ✓ | ✓ | ◐ |
| Legacy Dashboard (`/today/legacy`) | fallback | ◐ | ◐ | ✓ | ✗ | — | ◐ |
| Ride detail (`RideAnalysisModal`) | Yes (via History) | ✗ | ✗ | ◐ | ✗ | — | ✗ |
| Train — Calendar tab (`/train`, default tab) | **Yes — nav** | ✗ | ✗ | ✓ | ✗ | — | ✗ |
| Train — Coach tab (check-in) | Yes (tab) | ✗ | ◐ | ✓ | ◐ | ✗ | — |
| Train — Trends/Power/Insights tabs | Yes (tabs) | ✗ | ✗ | ◐ | ✗ | ◐ | ✗ |
| Progress (`/progress`) | **Yes — nav** | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ |
| Route Builder 2 (`/ride/new`) | **Yes — nav** | ◐ | ✓ | ✓ | ✓ | — | — |
| Coach chat (`/api/coach` surfaces) | Yes | ◐ | ✓ | ✓ | ✓ | ◐ | — |
| Proactive insight card + generation | Yes | ✗ | ◐ | ✓ | ◐ | — | — |
| Push notifications | Yes (default-on) | ✗ | ◐ | ✓ | ◐ | — | — |
| Onboarding modal + intake | Yes | ◐ | ✓ | ✓ | ✓ | — | — |
| Emails (welcome, nudges, beta) | Yes | ◐ | ✓ | ✓ | ✓ | — | — |
| `/learn/metrics` (public) | linked from app | ✗ | ✓ | ✓ | ✓ | — | ✓ |
| Settings (`/settings`) | Yes | ◐ | ✓ | — | ✓ | — | — |
| Community widgets (`/community`) | Yes | ✗ | ✗ | ◐ | ✗ | — | — |
| Share card (exported image) | Yes | ✗ | ✗ | — | ✗ | — | — |
| Landing (`/welcome`) | public | ✓ | ✓ | ✓ | ✓ | — | — |

---

## 2. Violations, ranked by how badly each betrays the thesis

### CRITICAL

---

#### C1. The canonical Today surface is metric-as-hero, inverted from the thesis — and from its own fallback

**Surface:** `/today` (Today Spine) — the home route; `/dashboard` redirects here.
**Breaks:** P4 (metric in hero position, sentence as caption), P1 (acronym-led labels, band fragments requiring decoding), P2 (no adjacent sentence at the node).

Findings:
- `src/views/today-spine/FitnessNode.tsx:198-230` — label `FORM · FS` (9px, acronym leads), then the raw FS value at **fontSize 41** (`:201-213`), then the interpreting text at **fontSize 11**: band fragments like `LOADING · optimal`, `NEUTRAL · grey zone`, `TOO FRESH · transition` (`nodeView.ts:71-87`) — jargon-shaped labels, not sentences, at ¼ the number's size.
- `FitnessNode.tsx:292-294` — three more number-as-hero stats (`TFI · FITNESS`, `AFI · FATIGUE`, `WK VOLUME`; label 8px, value 20px).
- `src/views/today-spine/TodaySpine.tsx:54-65` — the H1 is `TODAY — {date}` at 34px; the page's one interpreting sentence (`data.summaryLine`) renders at **13px, right-aligned, max-width 300px** — visually a caption to the date.
- The sentence being demoted is the best copy in the app (`getTodaySpine.ts:457-471`): *"You're carrying productive load. Peak in 9 days, right on The Rad."*
- Contrast: the fallback `/today/glance` gets this right — `FitnessRow.tsx:73-77` renders the word (`Optimal load`) at 22px/fw700 with `FS -19` at 13px beneath; `ClearanceBand.tsx:78-91` renders a verdict sentence, then FS/TFI/AFI as quiet chips.

**Founding-test-case trace:** at FS −19 the Spine shows a 41px **−19** with "LOADING · optimal" beneath — the number is what the rider reads, and there is no evidence context anywhere on the surface (see C6). The thesis-compliant rendering already exists one route over.

**Proposed fix (copy + layout, no new data):**
1. Promote `summaryLine` to the page hero: full-width, ~20–24px, directly under the H1 (or replacing the H1's date-only payload). The date becomes the eyebrow.
2. Invert the FitnessNode: state word/sentence first at the large size ("Carrying productive load"), FS as a quiet chip (`FS −19`) beneath — adopt the glance `FitnessRow`/`ClearanceBand` hierarchy verbatim.
3. Replace the label `FORM · FS` with `FORM`; replace band fragments with the glance's verdict sentences (`athleteState.ts:33-40`: "productive load — steady aerobic", "overreached — recover").
4. Keep `TFI · FITNESS` / `AFI · FATIGUE` values but move them onto the flip face (they already have a home there) — front face carries words + FS chip only.

---

#### C2. The ride detail surface is unintelligible without decoding: bare `NP`, `IF`, `TSS` labels, zero interpretation, no door

**Surface:** `RideAnalysisModal` — the only ride detail surface (`src/components/RideAnalysisModal.jsx`, mounted at `TrainingDashboard.jsx:1183-1196`).
**Breaks:** P1 (Peaksware vocabulary user-facing — critical per policy), P2 (orphaned metrics throughout), P4 (number-grid hero, no sentence), P6 (full stats are the default; no door).

Findings:
- **Banned vocabulary rendered:** `NP` label (`:570`) with tooltips "Normalized Power — calculated from power meter stream" (`:565-566`); `IF` label (`:592`) with tooltip "Intensity Factor — …" (`:590`); tooltip "Variability Index — NP / Avg Power" (`:608`); the hero-grid load tile labeled **`TSS`** (`:519-524`, via `getLoadLabel` at `src/utils/sportType.ts:97-99` which returns the literal string `'TSS'`).
- **Feeder surfaces:** `RideHistoryTable.jsx:399` column header `TSS`; `:345` mobile badge `{n} TSS`. **Share card:** `src/utils/shareCard/renderShareCard.ts:259` burns `TSS` into the publicly-shared image.
- **No ride-level sentence exists.** The modal is map → 4-tile number grid (number 20px+/bold, label 10px dimmed — the exact P4 fail condition) → six more sections of undecoded tiles and charts. All prose is tooltip-only (invisible by default).
- **The app already knows what to say and throws it away:** `RidePacingChart.jsx:23-32` computes plain-language pacing descriptions (`'Got stronger'`, `'Faded slightly'`, `'Significant power drop'`) that are **never rendered**; the segment comparison verdicts (`segmentEffortComparison.ts:341-390` — "Faster on less effort with better efficiency — a strong sign of improving fitness.") render 9 sections deep, styled `c="dimmed"`, only when a segment matched. The unmounted `ActivityMetrics.jsx` already has the compliant EP/RI/RSS labels with plain-first tooltips.
- **Best-effort tiles cite nothing** (`ActivityPowerCurve.jsx:126-146`): `1min 414W` with no comparison, no date, no "best in 90 days" — the receipt shape the thesis mandates exists nowhere on the surface. (No "best in X days" phrasing exists anywhere in the codebase.)

**Proposed fix:**
1. **Relabel:** `NP` → `EP` ("Effective Power (EP) — your steady-effort equivalent"), `IF` → `RI` ("Ride Intensity (RI) — EP as % of your FTP"), `TSS` tile → `RSS` — the migrated `ActivityMetrics.jsx:161-171` labels are the exact copy to reuse. Fix `getLoadLabel` at the source (`sportType.ts:98`) so history table + share card inherit it (see X6 and Q3 for the running case).
2. **Add a ride summary sentence block at the top** (above the number grid): 1–2 sentences saying what the ride was and what it means, assembled from data already in hand — pacing `description`, dominant zone, segment verdicts, duration/intensity band. E.g. *"A steady 2-hour endurance ride — you got stronger as it went, and you set your fastest time yet on Lefthand Canyon."* The pieces are literally computed today and discarded.
3. **Promote the segment verdicts** to directly under the summary (they are the only receipts on the surface); un-dim them.
4. **Add the door:** default view = map + summary + hero facts; the Power Analysis / streams / zones / pacing sections collapse behind one labeled control ("Show me the numbers"). Content unchanged — one deliberate click.
5. **Post-engine:** when `power_curve_summary` baselines are queryable client-side, best-effort tiles gain their receipts ("414W · best in 90 days"). Mark: depends on evidence-engine backfills; do not build before the data exists.

---

#### C3. `/progress` opens on a Peaksware-labeled chart with no interpretation

**Surface:** `/progress` (main nav "PROGRESS"), first card = `FitnessProgressChart`.
**Breaks:** P1 (critical — `CTL` user-facing ×6), P2 (no sentence in the entire component), P4 (28px number-hero), P5 (`CTL TARGET ZONE` projection band the rider must read off a curve).

Findings (`src/components/progress/FitnessProgressChart.jsx`):
- User-facing `CTL` at `:376` (stat label under a 22–28px number), `:420` (legend `CTL (τ=42)`), `:463` (`+{n} CTL`), `:473` (`CTL TARGET ZONE`), `:482` (`name="CTL"` → legend/tooltip), `:142` (tooltip `CTL: {n}`); plus `:153` `… TSS target` in the tooltip and `:397` raw `τ={n}d` notation.
- `Progress.jsx:242` — KEY TRENDS row titled `Fitness (CTL): 62`.
- Forward projection rendered as a shaded rectangle (`:467-475`) and a raw TFI band readout (`:384-386`) — no calendar-terms sentence.
- Hardcoded single-athlete artifacts: `BOULDER_ROUBAIX`/`BWR` reference lines and `SEASON_START` (`:24-26`) — see M8.

**Proposed fix:**
1. Vocabulary sweep of the component: `CTL` → `TFI`/"Fitness", drop `τ=42` notation (it's door content at best), `TSS target` → `RSS target`. Note this chart plots *both* a legacy-formula line and server TFI (post-duality); if the two-line display is still wanted, label them "Fitness (classic formula)" vs "Fitness (full-spec)" — or retire the second line per the duality decision memo.
2. Give the page a headline sentence above the chart ("Your fitness base has grown steadily since March — up 14 points in 6 weeks."), computable from the same series the chart already fetches. The chart becomes the citation under it.
3. Replace the `CTL TARGET ZONE` band caption with a decision sentence when a race exists: *"Hold this rhythm and you arrive at {race} inside your target range"* / *"You're under target for {race} — the plan closes the gap if this month holds."* (Bands can stay as the subordinate visual.)
4. If `/progress` is designated the Door destination (see X5/Q2), its charts are legitimate — but its labels still must be Tribos vocabulary, and the entry affordances elsewhere must be labeled as the door.

---

#### C4. Banned Peaksware vocabulary is live across ~40 user-facing sites — including the coach product itself, a push notification, and a shared image

**Breaks:** P1 (flag any instance as critical, per policy and spec §6/`docs/TRIBOS_METRICS_SPECIFICATION.md:273`).

The highest-severity instances (full inventory in Appendix A):

| # | Site | String | Why it's worst-tier |
|---|---|---|---|
| 1 | `src/lib/training/coach-personas.ts:105,112,119,127,135` | Scientist persona rationales: *"Reducing the quality session by 30% keeps **TSB** within target range."*, *"Monitor **ATL** over next 48h."* | Rendered verbatim in the check-in `DeviationCard` (`:132`, `:219`) — banned vocabulary **as the coach's own voice**, the product's core differentiator |
| 2 | `src/data/coachingPersonas.ts:218` | Cold-start prompt chip **"Explain my CTL and ATL numbers"** (`CoachCard.jsx:107`) | Shown to riders with no chat history — the newest users — and *teaches* them the old vocabulary |
| 3 | `api/utils/pushNotification.js:182` | `~{n} TSS` in the `workout_preview` push body (default-on) | Leaves the app; no tooltip affordance possible |
| 4 | `src/utils/shareCard/renderShareCard.ts:259` | `TSS` label burned into the exported share image | Public-facing brand artifact |
| 5 | `src/components/metrics/*` on public `/learn/metrics` | `Planned TSS`, `Actual TSS`, `Base TSS`, `CTL now`, `CTL 6 weeks ago`, `TWL = TSS × M_terrain`, "TSS is terrain-blind" | Public, unauthenticated, linked from `ProprietaryMetricsBar` — a prospect's first metrics lesson is in TSS/CTL (see Q1: possibly deliberate competitor framing — needs a decision) |
| 6 | `src/components/TrainingCalendar.jsx:1218,1606,1829,1838` | Bare `TSS` ×4 on the **default tab of `/train`** | Core default surface |
| 7 | `src/components/ui/FtpMissingBadge.jsx:20` | "No FTP set — intensity, **TSS**, and form values are estimated…" | Targeted precisely at riders who haven't set FTP — the newest riders |
| 8 | `src/utils/planCompression.ts:347` | "…based on your **CTL** of {n}." pushed into user-visible warnings | Plan-creation flow |
| 9 | `src/components/planner/WorkoutModal.tsx:740-741` | Visible `IF {n}` + tooltip "Intensity Factor" | Calendar workout modal |
| 10 | `src/pages/Progress.jsx` + `FitnessProgressChart` + `HistoricalInsights.jsx:93,109,467,488,535` | `CTL` throughout | See C3 |

**Proposed fix:** one coordinated vocabulary sweep PR (copy-only, no schema/identifier changes — the rename freeze applies to code internals, not user strings, and CLAUDE.md explicitly scopes user-facing strings as in-scope):
- Persona rationale strings → Tribos vocabulary with the same analytical register (*"Reducing the quality session by 30% keeps your Form Score in the target range."*).
- Prompt chip → *"Explain my fitness and fatigue numbers"*.
- Push body → `~{n} RSS` — or better, drop the number: "Tomorrow: Sweet Spot 2×20 · 1h 30m · hard but doable" (P2 says the number needs a sentence; a push has no room, so prefer the words).
- `getLoadLabel` → `'RSS'` (single point fixes modal tile, history column, share card; running label needs Q3's decision).
- Calendar/planner/plan-browser/community-widget labels → `RSS`.
- `FtpMissingBadge` → "No FTP set — intensity, ride stress, and form are estimated…".
- `/learn/metrics`: pending Q1, either reframe as explicit competitor comparison ("Traditional load scores (the industry's TSS) are terrain-blind…") once, with Tribos labels on all controls — or rewrite fully in Tribos vocabulary.
- Enforce with the lint/test in X2 so the class of bug can't regrow.

---

#### C5. The coach vocabulary/translation rules are enforced only for beginners, and two LLM endpoints have no rules at all

**Surface:** all AI-generated copy (chat, check-ins, proactive insights).
**Breaks:** P1/P2 at the generation layer; spec §6 rules 1–2.

Findings:
- `api/coach.js:1577,1583` — the "NEVER use the old TrainingPeaks abbreviations" rule and the "TRANSLATE METRICS: Never open with raw numbers" rule are **inside** `if (experienceLevel === 'just_starting' || 'developing')` (`:1573`); the default is `'experienced'` (`:1572`), so most athletes' coach carries **no vocabulary or translation constraint**.
- `api/coach.js:948,966` — the always-sent COACHING_KNOWLEDGE block itself uses "…and their **rTSS** equivalents for running", putting a banned token in the model's mouth in the same file that bans it.
- `api/proactive-insights-process.js:194-197` — the entire system prompt is 4 lines (persona name/philosophy/voice) + "Be direct and reference actual numbers." No vocabulary rule, no translation rule, no data-correction notice — and its output renders verbatim in `ProactiveInsightCard.jsx:137`.
- `api/coach-check-in-generate.js:21-152` — injects `Current TFI: … | AFI: … | FS: …` (`:52`) with no vocabulary rule, no evidence section, no data-correction notice (the notice exists only in `api/coach.js:1532-1557`, yet check-in and insights both read memories/conversations that can contain pre-2026-08-02 values).
- `api/utils/personaData.js:16` (mirrored `src/data/coachingPersonas.ts:22`) — the Hammer's `emphasizes` field instructs: "**Weekly TSS compliance.** Power outputs vs. targets." The persona definition trains the model in banned vocabulary. Root cause: `docs/tribos_voice_bible.md` (v1.0, March 2026) predates the rename — its scenario examples and prompt template are written entirely in TSS/CTL ("85 TSS, right on target", "Current CTL: {ctl} | ATL: {atl}").
- `api/utils/checkInContext.js:40` — injects "(coach-adjusted from {n} **TSS** on {date})" into coach context; echo-prone.

**Proposed fix:**
1. Extract a single `COACH_VOICE_RULES` block (vocabulary ban + plain-English-first + translate-metrics + RSS-rarely-in-voice, i.e. spec §6 rules 1–3) into a shared module (`api/utils/coachVoiceRules.js`) and inject it **unconditionally** into every LLM endpoint: `coach.js`, `fitness-summary.js` (already has a good version — use it as the source text), `proactive-insights-process.js`, `coach-check-in-generate.js`, `coach-ride-analysis.js`, `accountability-coach.js`, `review-week.js`. Experience level should modulate *how much explaining* the coach does, not whether the ban applies.
2. Rewrite `personaData.js` / `coachingPersonas.ts` `emphasizes` fields in Tribos vocabulary; update the Voice Bible scenarios/template to match (doc change).
3. Move the data-correction notice into the shared module (or a sibling) so check-in and insight generation get it too.
4. `coach.js:948` → "…and their running equivalents (run stress from pace/HR)"; `checkInContext.js:40` → "(coach-adjusted from {n} RSS on {date})".

---

#### C6. Persistent fitness verdicts bypass the coach-layer gating — the exact failure the founding test case exists to catch

**Surface:** every persistent fitness-state display.
**Breaks:** P2 (interpretation with no evidence available), the coach messaging rules (speak on transitions/milestones, not weekly states; softening requires evidence confidence ≥ 0.4), and the audit's founding test case.

Findings:
- The evidence-engine gating (`deriveSpeakingCue`, `divergenceMaySoftenModel` in `api/utils/evidenceCoachSection.js:31-68`) exists **only** in the `/api/coach` chat path. Meanwhile:
  - `ClearanceBand.tsx:78-80` + `athleteState.ts:33-40` (glance) renders a **persistent FS verdict headline** ("overreached — recover") on every load — no confidence gate, no transition gate, no evidence input.
  - `FitnessNode.tsx`/`nodeView.ts:69-87` (Spine) renders `OVERREACHED` etc. as the standing state.
  - `api/fitness-summary.js` generates a **daily** LLM fitness-state take (4h cache) feeding `TODAY'S CALL` and `FitnessSummary` — a per-day model-state pronouncement that directly sidesteps "speak on transitions/milestones, not weekly states," with no evidence rows fetched and no confidence floor.
  - `CoachCard.jsx:30-62` — a hardcoded headline picked by **regex-scraping `TSB:`** out of the context string: "I notice some accumulated fatigue…", "Your body is asking for rest." Client-side model-state messaging with zero gating.
- At the founding case (FS −19, EF at all-time best): the band words themselves are calm ("carrying productive load" / "LOADING · optimal" — the −30 threshold saves the copy), **but** the rider sees a hero **−19** with no receipt anywhere, the daily AI take and check-in prompt receive only model numbers (`Current TFI… FS…`) with no evidence section, and nothing on any surface can say "…and yet your power says you're absorbing it well." The engine knows (verdict `ahead`, 0.70, with the 414W receipt); no surface can show it.
- One nuance worth preserving: `ClearanceBand.tsx:86-90` shows `fs_confidence` — a *load-model* confidence, not evidence-engine confidence. If both ever render, they must be labeled distinctly.

**Proposed fix (two stages):**
1. **Now (no engine dependency):** soften standing state copy from verdict-shaped to descriptive. "overreached — recover" as a permanent headline is a coach utterance; the persistent surface should describe ("You're deep in a heavy block") and leave prescriptions ("recover") to the gated coach layer. Kill `CoachCard.getCoachingMessage()`'s regex-driven verdicts outright (use the workout name / generic prompt instead). Decide `fitness-summary`'s cadence policy: either accept "daily weather report" as a deliberate exception to the transitions rule (document it), or gate its model-state language the same way.
2. **Post-engine (mark: depends on evidence engine reaching UI, Phase 2+):** the standing FS display gains its evidence line when a speaking-cue-worthy verdict exists — *"You're absorbing a heavy block (FS −19). Your power says it's working: best 1-min effort in 90 days on Aug 2."* This requires the engine's verdicts to be readable by the client, which they currently are not — see M4 for the schema/API gaps.

---

### MAJOR

---

#### M1. The Door does not exist anywhere in the product

**Breaks:** P6 (both directions).
- Zero matches for any "show me the numbers"-style affordance across `src/`.
- `/train`'s TRENDS/POWER/INSIGHTS — the natural door content — are undifferentiated peer tabs (`SecondaryNavBar.jsx:4-12`); `/progress` is a top-level nav item that *opens onto* the stats.
- The only Today door is `CLICK FOR TFI / AFI DETAIL` (`FitnessNode.tsx:307`) — a jargon label guarding a card flip; the Spine has **no link at all** to `/progress`.
- The one genuine labeled door pair in the app (`Learn how EFI is calculated →`, `ProprietaryMetricsBar.tsx:305,323`) lives on the unmounted legacy dashboard and points at the TSS-laden public page (C4 #5).
- Inverse direction is also violated in one spot: nothing is *only* plain language (good), except the coach's daily take, which cites no data a rider could check (covered by C6/M4).

**Proposed fix:** define the door once (see X5): a standard affordance — label in the register of "Show me the numbers" — placed (a) on Today near the form display → `/progress`, (b) on ride detail as the section-collapse control (C2), (c) as the entry label for `/train`'s stats tabs. `/progress` becomes the sanctioned door destination (Q2 decides whether it stays in top-level nav).

#### M2. Projections render as curves and number-ladders the rider must interpret

**Breaks:** P5.
- `SpinePanel.tsx:253-254` — dashed TFI projection curve, unlabeled y-axis, on the default home; scrubbing into the future shows a projected FS as a 41px number flagged only by an 11px `PROJECTED ·` prefix (`nodeView.ts:87`). Silent assumption: with no plan, the future is filled with the trailing 7-day average (`getTodaySpine.ts:386-390`) — "keep this up" is baked in and never said.
- `FitnessProgressChart.jsx:467-475` — `CTL TARGET ZONE` rectangle (C3).
- `CorrectionProposalCard.tsx:234-266` — "Projected outcome" as four raw TFI integers (Current/Without/With/Target band), no dates, no sentence.
- `DeviationCard.tsx:136-155` — three-column TSB grid the rider must compare.
- The calendar-terms decisions the thesis wants **already exist**: `summaryLine`'s "Peak in 9 days, right on {race}" (demoted to caption), and the dead `TodaysFocusCard.getStory()` taper narratives ("…it's race week! Reduce volume but keep some intensity.") at `TrainingDashboard.jsx:1214-1275`.

**Proposed fix:** every projection surface gets a decision sentence as its headline; the curve/grid becomes the citation. Spine: promote `summaryLine` (C1) and caption the projected span ("If you follow the plan, fitness peaks in ~3 weeks"); state the no-plan assumption in words ("assuming you keep riding like the last week"). CorrectionProposal: *"Take the two easy days and you're back in range by Thursday — skip them and you stay over target into next week"* above the (collapsed) numbers. DeviationCard: replace the TSB grid headline with the option's calendar consequence ("Thursday absorbs it; the weekend stays as planned"); numbers become the fine print. Scrubbed future days: label the state in words ("On plan, you'd be fresh here"), not a projected raw FS.

#### M3. Orphaned metrics across default surfaces

**Breaks:** P2 (number with no interpretation).
- `WeekSummaryGrid.jsx:64-119` (`/train` header): `RSS 213/300`, `COMPLIANCE 71%` — four naked 20px cells, no sentence in the file.
- `RidesMap.tsx:212-216` (Today): `THIS WEEK / ELEV / RIDES` chips, values 16px, no prose.
- Ride modal tiles (C2), TRENDS stat cells (`TrainingDashboard.jsx:1639-1654`), POWER tab's 3rem FTP hero (`:1774-1776`), `HealthTrendsChart` stat cells, `ZoneDistributionRow` on `/progress`.

**Proposed fix:** per the Sentence Rule, each cluster gets one adjacent line: WeekSummaryGrid → *"You're 71% through the week's plan with the big ride still ahead."* (computable from data already fetched); FTP hero → *"Your FTP — the anchor for all your zones and intensity targets."* Where a sentence genuinely can't earn its place (map chips), consider whether the number belongs on the default surface at all (X1's component makes the sentence a required prop, forcing the decision per-site).

#### M4. Receipts never reach any surface; the engine's stored shape isn't yet UI-consumable — schema/API gaps (post-engine proposals)

**Breaks:** P2 (claims without evidence on tap), and blocks C6-stage-2/C2-5.
The brief asks explicitly whether stored verdict objects are shaped for direct UI consumption. Mostly yes, with four gaps:
- **Storage** (`database/migrations/106_fitness_evidence_weekly.sql:13-27`): `verdict`, `confidence`, `score`, `signals` JSONB (structured receipts), `model_divergence` JSONB, `narrative_facts` JSONB — good.
- **Gap 1 — no read path:** RLS is `USING (false)` (service-role only, `106:34-36`) and no API endpoint exposes verdicts (`fitness_evidence_weekly` has zero `src/` references). A UI consumer needs a `GET /api/evidence-weekly?action=latest` (server-shaped, service key) or an RLS-select-own policy.
- **Gap 2 — gating isn't stored:** the speaking cue and `may_soften` are computed at prompt-build time (`evidenceCoachSection.js:31-68`) and not persisted, so a UI could not honor the same gating without re-deriving it. Propose persisting `speaking_cue` and `may_soften` per row at compute time (idempotent with the weekly job).
- **Gap 3 — receipts are prose-only at the top level:** `narrative_facts` is capped at 4 sentences (`evidenceEngine.js:523`); the structured data (dates, watts, percentiles) lives nested in `signals`. For UI chips ("Aug 2 · 414W · 90-day best"), propose a `receipts` JSONB of typed objects `{date, kind, value, unit, comparison, source_activity_id}` emitted alongside the facts.
- **Gap 4 — two "confidences" will collide** (`fs_confidence` vs engine `confidence`) — name them distinctly in any API payload.
All four are **post-engine** proposals: v1 is coach-narrative-only by decision; nothing above should ship before Phase 2 backfills land and the verdict distribution is accepted.

#### M5. The readiness score is a derived number presented as an independent signal

**Breaks:** P2 (a claim whose receipt would reveal it isn't a separate measurement).
`readinessFromFS(fs) = clamp(round(52 + fs*1.86), 28, 96)` (`getTodaySpine.ts:121-123`) — a linear restatement of FS — renders as a 0–100 ring with its own `WHY READINESS {n}` explainer (`FitnessNode.tsx:310-365`) whose rows are themselves band lookups, implying inputs (recovery, yesterday's effort) that aren't actually weighed. `nodeView.ts:6-8` concedes sleep/HRV are absent. If the audit's trust standard is "every claim has a real receipt," a synthetic second number wearing an explainer is a trust liability.
**Proposed fix:** either (a) remove the ring until a wearable feed makes readiness a real, distinct signal, or (b) relabel honestly as a restyled form display ("FORM, as a 0–100 gauge") and make `WHY READINESS` say exactly that. Recommend (a) — the form word already carries the message.

#### M6. Broken door: recent rides on Today navigate to a route that doesn't exist

`views/today/RecentRides.tsx:211` → `/history/${rideId}`; no such route in `App.jsx` — falls to the 404 catch-all. Breaks P6 (the path from Today to ride evidence). Note this component belongs to the unmounted `TodayView` family — **verify whether any mounted surface reaches it** before scheduling; if it's dead-only, fold into the dead-code purge (M9).
**Proposed fix:** route ride links to the existing detail surface (open `RideAnalysisModal` via `/train?tab=history` with a selected-ride param, or introduce a real `/ride/history/:id` route rendering the same component).

#### M7. Proactive insight text renders unguarded

`ProactiveInsightCard.jsx:137` renders `insight_text` verbatim from the 4-line-prompt generation path (C5). Until the shared voice rules land, this is the single most likely place for banned vocabulary or number-first coaching to reach a rider unreviewed. (Fix is C5's; listed separately because it's a rendering surface with no fallback filter.)
**Proposed fix:** C5 rule injection; optionally a cheap render-time guard that masks banned tokens (belt-and-braces, log to Sentry when it fires — it should never).

#### M8. Fabricated/hardcoded "facts" on trust surfaces

- `TrainingDashboard.jsx:1687-1688` — "Most Active Days: **Tue, Thu, Sat**" is a hardcoded string, not derived from data.
- `FitnessProgressChart.jsx:24-26` — `BOULDER_ROUBAIX`/`BWR`/`SEASON_START` hardcoded to one athlete's 2026 calendar, rendered as reference lines for everyone.
**Breaks:** P2 in its deepest sense — a receipt that isn't real poisons every real one. **Proposed fix:** derive or delete; race lines should come from the rider's `race_events` rows.

#### M9. The best thesis assets are dead code; the worst dead code carries live-looking violations

- **Harvest:** `TodaysFocusCard.getStory()` (`TrainingDashboard.jsx:1214-1275`) — perfect calendar-terms narratives, never mounted. `RidePacingChart` descriptions (C2). `ActivityMetrics.jsx` compliant labels. `translate.ts` / `lib/fitness/translate.ts` word maps unused by the surfaces that need them.
- **Purge:** `FitnessMetricsBar` (`TrainingDashboard.jsx:2053-2115`, contains the app's only "Training Stress Balance" string), `IntervalDetection.jsx` ("Intensity Factor"), `WeeklySportSummary`, `ActivityMetricsBadges` import.
**Proposed fix:** a dead-code PR that deletes the violating orphans and files the compliant assets where the live fixes (C1, C2, M2) will consume them.

#### M10. Glance first-run renders a dashboard of zeros instead of an honest empty state

`athleteState.ts:42-62` — `first-run` paints the full two-column layout with "Building baseline"/"Building history" placeholders; the Spine does this right (`SpineEmptyState` swap, `TodaySpine.tsx:201-212`). Breaks P2/P3 for the brand-new rider (a surface full of empty gauges answers no question).
**Proposed fix:** port the Spine's empty-state swap to the glance (relevant only while the glance remains a reachable fallback).

---

### MINOR

- **N1. Coach panel hierarchy:** `TODAY'S CALL` title (workout name, 18px) outranks the sentence (13px) — `CoachPanel.tsx:292-297`. Acceptable (title is words, not a number) but the sentence deserves ≥15px parity. Same for `FitnessSummary.jsx:99-115` (15px sentence under 24px numbers on legacy dashboard).
- **N2. Door labels in jargon:** `CLICK FOR TFI / AFI DETAIL` (`FitnessNode.tsx:307`) → "See the trend"; Spine chart caption is operating instructions, not meaning (`SpinePanel.tsx:368-372`).
- **N3. Acronym-first tooltip/gloss strings:** `METRICS_TOOLTIPS` leads with the acronym (`translate.ts:44-64`, "EFI 82 — You're executing…"); `tooltips.ts:19,30,43` are plain-first but load-bearing acronyms mid-sentence. Invert per spec §6 rule 2 (plain first, abbreviation second).
- **N4. Onboarding:** goal chip "Push FTP and performance" (`OnboardingModal.jsx:80`) uses FTP 8 screens before it's defined → "Push my limits" or "Get faster" (the label literally next to it). Beta email `HRV` undefined (`api/email.js:378`) → "recovery signals like heart-rate variability."
- **N5. Settings:** `W/kg` undefined (`Settings.jsx:1764,1809`) → "watts per kilogram (W/kg) — climbing power"; section subtitle uses FTP one line before defining it (`:1745-1754`, reorder).
- **N6. StatusBar/ProprietaryMetricsBar sublabels** (legacy dashboard) spell acronyms but keep number-as-hero (24px value / 14px words) — if the surface survives, invert; otherwise moot.
- **N7. `RampRateAlert`** has the right sentence-first structure but leaks `RSS/week` unit math into the headline (`:70-101`) — move the rate into the citation position ("+62 RSS/wk" as chip), keep "You're ramping harder than your body can absorb" as the message.
- **N8. Community widget chrome** (`WeeklyCheckInWidget`, `DiscussionThread:144-156`, `CafeCorner:927`) — app-authored `TSS/CTL/ATL/TSB` stat labels → Tribos names (rider-authored *content* is out of scope, Q6).

---

## 3. Cross-cutting proposals

**X1 — A `<MetricCitation>` primitive (sentence-first enforcement).** One component that renders `sentence` (required, hero position/size) + `metric` chip (optional, subordinate) + optional `receipt` line. The glance's `ClearanceBand`/`FitnessRow` are the reference implementations — extract, then migrate FitnessNode, StatusBar cells, WeekSummaryGrid, ride-modal tiles onto it. A metric display without an interpretation string becomes a type error, which is the Sentence Rule as API.

**X2 — Banned-vocabulary lint/test.** A vitest that extracts string literals from JSX text/label/tooltip props and prompt template literals under `api/`, failing on `\b(TSS|CTL|ATL|TSB|NP|IF|rTSS|Normalized Power|Intensity Factor|Training Stress Balance)\b` outside an explicit allowlist (internal identifiers, comments, DB column names, `OLD/`, admin components if exempted). Seed the allowlist from Appendix A's "internal-only" list; burn it down with C4. This is the only way the class stays fixed.

**X3 — One vocabulary module.** Four parallel FS-band→words implementations exist (`todayVocabulary.ts`, `getTodaySpine.ts:146-152`, `nodeView.ts:69-87`, `athleteState.ts:33-40`) plus the unused `lib/fitness/translate.ts`. Consolidate on `todayVocabulary.ts` (it already carries the "never TSS/CTL…" header) and have every surface import it — copy fixes then land once, and band-boundary drift (already visible: "optimal" vs "productive load") ends.

**X4 — Shared coach voice preamble** (C5's fix, generalized): `api/utils/coachVoiceRules.js` exporting the vocabulary/translation/correction blocks, imported by all seven LLM endpoints, un-gated. Add a prompt-regression test asserting every endpoint's assembled system prompt contains the ban text.

**X5 — Define the Door as a pattern.** One labeled affordance ("Show me the numbers" register), consistently placed: Today → `/progress`; ride modal → expands the stats sections; `/train` stats tabs grouped under it. Decide `/progress`'s nav status (Q2). Charts classified (b) in Appendix B move behind it; charts classified (a) stay with their sentences.

**X6 — `getLoadLabel` single-point rename** (`sportType.ts:97-99`): `'TSS'` → `'RSS'` fixes the ride modal tile, history column, and share card in one change. Running string needs Q3's decision first.

**X7 — Receipts pipeline (post-engine, sequenced after Phase 2 backfills):** M4's four items — read API, persisted `speaking_cue`/`may_soften`, typed `receipts` array, distinct confidence naming — as one schema/API PR, before any UI consumes verdicts.

**X8 — Dead-code harvest/purge PR** (M9): delete violating orphans, relocate compliant assets next to their future consumers.

---

## 4. Open questions (judgment calls made or deferred — for discussion, not silently decided)

1. **Is `/learn/metrics` deliberate competitor framing?** Its copy critiques TSS by name ("TSS is terrain-blind"). Policy says banned everywhere; marketing may want the contrast explicit exactly once. I graded it Critical but flagged it here: decide whether "naming the incumbent's metric to critique it" is a sanctioned exception (and if so, confine it to prose — the *slider labels* should be Tribos regardless). Note it also teaches EFI/TWL/TCAS, which aren't in the sanctioned metric list (RSS/TFI/AFI/FS/EP/RI) — is that trio still canon?
2. **What counts as the Door?** Is a top-level nav item labeled `PROGRESS` "one deliberate click, clearly labeled," or must the door be labeled in the "show me the numbers" register and entered *from* a plain-language surface? I graded assuming the latter (hence P6 fails). This decision moves several grades.
3. **Running vocabulary:** there is no Tribos name for run stress — the coach prompt says "rTSS", the UI says `Load`. Sanction a term (e.g., RSS with sport-scoped derivation note, or a run-specific name) before the C4 sweep touches run surfaces.
4. **Does persona choice license numbers?** The Scientist's whole register is analytical. I assumed the vocabulary ban and sentence-first rules still bind all personas (translation is the product), with the Scientist differing in *how much* explanation follows. Confirm.
5. **`fitness-summary`'s daily cadence** vs "speak on transitions/milestones": is a daily AI take a sanctioned "weather report" exception (my read: it's the product's front-door voice, so probably yes — but then its copy must stay descriptive, not verdict-shaped), or should it be gated to transitions too?
6. **Community scope:** rider-authored posts may say anything; I scoped only app-authored chrome (stat labels) as violations. Confirm.
7. **Spec §5 vs the thesis:** the spec's own FS display rules ("FS target badge: `FS: 8.2 | Target for Road Race: +5 to +20 ✓`", color zones) predate the subordination rule and are metric-first. If the thesis wins (I assumed it does), spec §5's display guidance needs an amendment note.
8. **Ride detail as door-or-default:** the modal is reached by clicking a ride — arguably already "one deliberate click." I graded it as a default surface because it's the canonical answer to "can I trust it?" and the entry point (History list) is itself metric-labeled. Confirm.
9. **The glance and legacy dashboard's future:** the glance is the thesis's best implementation and is unreachable from nav; the legacy dashboard still mounts `ProprietaryMetricsBar`/`StatusBar`. Port-then-delete (my recommendation: port glance hierarchy into the Spine per C1, then retire both fallbacks) or keep as fallbacks and fix in place?
10. **FTP exemption breadth:** FTP is retained deliberately — does that exempt it from P1's "prior domain knowledge" on first-contact surfaces (onboarding chip, N4)? I assumed no: retained ≠ undefined-on-first-use.

---

## Appendix A — Banned-vocabulary inventory (user-facing, live code)

**Default-nav surfaces:** `TrainingCalendar.jsx:1218,1606,1829,1838` (TSS ×4); `FtpMissingBadge.jsx:20` (TSS); `WorkoutModal.tsx:740-741` (IF / Intensity Factor); `FitnessProgressChart.jsx:142,153,376,420,463,473,482` (CTL ×6, TSS); `Progress.jsx:242` (CTL); `WorkoutPickerPanel.tsx:327` (TSS, on `/ride/new`).

**Tabs/modals/widgets:** `HistoricalInsights.jsx:93,109,467,488,535` (CTL ×5); `CheckInWeekBar.tsx:281,290` (TSS ×2); `DeviationCard.tsx:108` (TSS); `coach-personas.ts:105,112,119,127,135` (TSB/ATL ×5, rendered in DeviationCard); `coachingPersonas.ts:218` (CTL/ATL prompt chip); `TrainingPlanPreview.jsx:111` (TSS); `TrainNow.jsx:93,143` (TSB, TSS); `RideAnalysisModal.jsx:523,565,566,570,590,592,608` (TSS, NP ×3, IF ×2, "Normalized Power" ×2, "Intensity Factor"); `RideHistoryTable.jsx:345,399` (TSS ×2); `renderShareCard.ts:259` (TSS, exported image); `SegmentLibraryPanel.tsx:525` ("Normalized Power"); `SegmentEffortCompare.tsx:97` (NP in tooltip); `AerobicDecoupling.jsx:433` ("Normalized Power"); `PlanCard.jsx:111`, `TrainingPlanBrowser.jsx:1091,1144`, `PlanCustomizationModal.tsx:324`, `PlanConflictModal.tsx:126` (TSS); `planCompression.ts:347` (CTL, warning text); `ActivityLinkingModal.tsx:301` (fallback `target_tss` display); community: `WeeklyCheckInWidget.jsx:171,430`, `DiscussionThread.jsx:144,150,156,337`, `CafeCorner.jsx:927` (TSS/CTL/ATL/TSB); `RouteStatsPanel.jsx:291` (TSS, hidden v1 builder).

**Public page:** `MetricsCalculator.tsx:59`, `TWLCalculator.tsx:34,67,82`, `EFICalculator.tsx:69,70,88`, `TCASCalculator.tsx:45,46`.

**Notifications/prompts/context:** `pushNotification.js:182` (TSS push body); `pushNotification.js:153` (undefined `FS:` in push — proprietary but undefined, P1); `personaData.js:16` + `coachingPersonas.ts:22` ("Weekly TSS compliance" instruction); `checkInContext.js:40` (TSS annotation); `coach.js:948,966` (rTSS).

**Dead code (purge, don't count):** `TrainingDashboard.jsx:2085` ("Training Stress Balance"), `:2087,2102,2113`, `:1295`, `:1999-2043`; `IntervalDetection.jsx:413` ("Intensity Factor").

**Admin/internal (exempt):** `WorkoutTemplateManager.jsx`, `PlanTemplateManager.jsx`, `UserInsights.jsx`, `InternalMetricsAudit.tsx`.

## Appendix B — Chart classification per brief §3

**(a) Compliant subordinate visual (keep, with sentence):** glance form heat ramp (`ClearanceBand`); glance `FitnessSparkline` (word-first cell); `TrainingLoadChart` load lines on TRENDS (`TrainingLoadChart.jsx:161-206` — best-in-class legend: "Aerobic base — built over ~6 weeks"); `PlanProgressBar`.

**(b) Belongs behind the door (content fine, placement/label wrong today):** `FitnessProgressChart` (after C3 relabel); `HistoricalInsights` ×4 (after CTL relabel); `PowerDurationCurve`; `CriticalPowerModel` (W′/TTE jargon is door-native); `AerobicDecoupling`; `HealthTrendsChart`; `ZoneDistributionChart`; ride-modal streams/zones/pacing/power-curve (behind C2's in-modal door); `/learn/metrics` calculators.

**(c) Violates P1/P4 as rendered (on a default surface without subordination):** the Training Arc spine chart (`SpinePanel.tsx:211-348`) — interactive dashed projection as the home page's dominant visual with legend `FITNESS · TFI` and no interpreting sentence (C1/M2 fix: keep the visual, subordinate it to the promoted `summaryLine`, plain legend); TFI/AFI flip sparklines behind a jargon label (N2); readiness ring (M5); `WeekSummaryGrid` tiles (M3); `RideHistoryTable` TSS column (C4); `CheckInWeekBar` (C4/M2); `WeekChart`/`RidesMap` chips (M3).

## Appendix C — Evidence-engine UI-readiness (verdict-object shape check)

Requested by the brief: stored shape is `fitness_evidence_weekly(verdict, verdict_raw, score, confidence, signals JSONB, model_divergence JSONB, narrative_facts JSONB, engine_version, computed_at)` (`migrations/106:13-27`), written Mondays 04:00 UTC (`vercel.json:67-69`), read only by `api/coach.js:1439`. Verdict/confidence/receipts are present and the narrative facts are already rider-ready prose; the gaps for direct UI consumption are M4's four items (no read path by design, gating not persisted, receipts not typed, confidence naming collision). All UI consumption is **post-engine** by decision — v1 is coach-narrative-only.
