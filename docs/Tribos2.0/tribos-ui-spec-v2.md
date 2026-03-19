# Tribos UI/UX Redesign Spec
### Creative & UX Direction for Claude Code Implementation
Version 2.0 — March 2026

---

## 1. What Tribos Actually Is

Tribos is a personal cycling intelligence layer. It unifies your rides, your fitness, your routes, and your coaching into one coherent picture — answering the question every cyclist has but no single tool currently answers:

**Given everything — my fitness, my fatigue, my roads, my time, my plan — what do I do today, and where do I ride?**

Strava knows your rides. TrainingPeaks knows your load. Komoot knows your terrain. None of them talk to each other. Tribos is the connective tissue. You give it your data and it uses it to make you understand where and how to ride to meet your fitness goals.

### What this changes about the UI

The data is the narrator. Your fitness curve, your training plan, your route history, your week — that's the story the app tells. The AI coach is one voice interpreting that story. It does not lead. It does not dominate. It contextualizes.

This distinction must be visible in the information hierarchy of every screen. The coach comment appears *after* the data. The data speaks first.

### The connective tissue must be visible

The current site presents features. The redesigned site must present the *relationship between features*. A new user landing on Tribos should see, within 30 seconds, that the app knows their plan, knows their fitness state, and has already matched their ride history to today's workout. That chain — plan → fitness → route — is the product. If the UI treats each piece as a separate tab with a separate job, the chain is invisible and users leave.

### What Tribos is not

- Not a social fitness app (no feed, no kudos, no follower counts)
- Not a TrainingPeaks clone (no data overload on first view, no intimidating empty states)
- Not a Strava replacement (route discovery is not the core loop)
- Not a coaching app where the AI is the main character
- Not a feature aggregator where tools sit next to each other unconnected

---

## 2. Brand System

### Color tokens

**Backgrounds**
- `--color-base`: `#F4F4F2` — page background
- `--color-base-secondary`: `#EBEBЕ8` — subtle surface variation
- `--color-base-border`: `#DDDDD8` — default borders, dividers
- `--color-card`: `#FFFFFF` — card surfaces

**Text**
- `--color-text-primary`: `#141410` — headings, labels, primary content
- `--color-text-secondary`: `#3D3C36` — body text, descriptions
- `--color-text-muted`: `#7A7970` — metadata, timestamps, hints

**Accents — semantic, never swap**
- `--color-teal`: `#2A8C82` — primary actions, CTAs, active states, positive fitness trends
- `--color-orange`: `#D4600A` — effort, fatigue, high-intensity, negative TSB
- `--color-gold`: `#C49A0A` — achievement, PRs, optimal training zones, scheduled items
- `--color-coral`: `#C43C2A` — warnings, alerts, overreaching, gear replacement

**Navigation**
- `--color-nav`: `#141410`
- Active text: `#F4F4F2`
- Inactive text: `#7A7970`
- Hover text: `#C0BDB4`
- Active underline: `--color-teal`, 2px, flush to bottom edge

**Retired — do not use**
- Steel blue `#3A5A8C` is fully retired everywhere

### Typography

- **Headings / UI labels**: Barlow Condensed — all caps, letter-spacing 2–4px, weight 700
- **Body / readable prose**: Barlow — sentence case, weight 400, line-height 1.55
- **Data / metrics**: DM Mono — numbers, distances, times, power values, TSS, CTL/ATL/TSB, dates, percentages

Font scale:
- Screen title: 20–22px Barlow Condensed, weight 700, letter-spacing 2px
- Section label: 9–10px Barlow Condensed, weight 700, letter-spacing 1.5px, all caps, muted
- Body / coach message: 12–13px Barlow, weight 400, line-height 1.55
- Metric value large: 16–22px DM Mono, weight 700
- Metric value small: 10–11px DM Mono, weight 700
- Metric unit: 9px Barlow Condensed, all caps, letter-spacing 1px, muted
- Badge / chip: 9–10px Barlow Condensed, letter-spacing 0.5–1.5px

### Geometry

Zero border radius on all structural elements. Rectangular edges signal precision and athletic discipline. This is brand-defining — do not soften it.

Exceptions (only these):
- Toggle switches: pill shape (border-radius 50%)
- Persona icon backgrounds: maximum rx=2

Border weights:
- Interactive elements: 1px
- Card edges and structural dividers: 0.5px
- Coach card left accent: 3px solid `--color-teal`, no radius

### The retro stripe

Five bands, exact sequence, exact proportions:
Teal (flex 3) · Gold (flex 2) · Cream/base (flex 1) · Orange (flex 2) · Coral (flex 2)

Height: 3px. Position: immediately below the nav bar, full width. Sticky with the nav. Never reorder the bands. Never use this pattern anywhere else on screen.

### Spacing

- Page padding: 20px horizontal, 20px top
- Card internal padding: 14–16px
- Section gap: 14px between major sections
- Component gap: 8–10px between list items
- Inline gap: 6–8px

---

## 3. Navigation Architecture

### The problem being solved

The current site has 14 navigation destinations across two layers: a main nav (Home · Routes · Training · Planner · Cafe · Settings) and an 8-tab sub-nav inside Training (Coach · Today · Routes · Trends · Power · History · Insights · Calendar). New users never understand what lives where. The most valuable view — Training → Today, which shows the connective tissue working — is two levels deep and almost nobody finds it.

### New structure: four primary tabs

**TODAY · RIDE · TRAIN · PROGRESS**

Each tab has a single, clear job. Power-user depth is preserved inside TRAIN as a secondary nav — it's still accessible, just not in the primary navigation where it overwhelms new users.

### Nav bar spec

Dark bar (#141410), full width, 46px height.

Left: TRIBOS wordmark (Barlow Condensed, 14px, weight 700, letter-spacing 4px, white)
Center: TODAY · RIDE · TRAIN · PROGRESS (Barlow Condensed, 10px, letter-spacing 2px)
Right: notification icon (orange dot badge if unread) + user avatar (initials, teal circle)

Active tab: white text + 2px teal underline flush to bottom
Inactive tab: `#7A7970` text, no underline
Hover: `#C0BDB4` text

Retro stripe immediately below nav bar.

**Avatar dropdown menu** (opens on tap/click):
- Profile / Settings
- Cafe (deprioritized — may be removed in a future release)
- Dark mode toggle
- Sign out

**Mobile nav (< 480px):**
Test at 375px. Priority order for fitting four tabs: (1) keep all four labels at 9px Barlow Condensed with tighter letter-spacing, (2) icon + label for active tab / icons-only for inactive tabs, (3) bottom tab bar as last resort. Whichever approach keeps all four tabs readable without truncation wins. The retro stripe stays visible in all cases.

### Tab responsibilities

**TODAY** — The daily intelligence view. Fitness state + today's plan + matched routes + coach context. This answers the core question. It is the default view and the front door of the app.

**RIDE** — Route library and route builder, unified. Matched routes come first (pre-filtered to today's workout). Builder is always accessible but not the default focus.

**TRAIN** — Training plan, calendar, and all deep analytics. Contains a secondary nav bar for Calendar · Trends · Power · History · Insights. This is the depth layer — all the features currently in the 8-tab Training sub-nav live here.

**PROGRESS** — Fitness trends, zone distribution, key insights, year-to-date. The reward screen. This is what makes training feel meaningful over time.

### What happened to the old nav items

- **Home** → replaced by TODAY
- **Routes** → becomes RIDE
- **Training** (and all 8 sub-tabs) → becomes TRAIN with internal secondary nav
- **Planner** → lives inside TRAIN → Calendar
- **Cafe** → moved to user settings / profile area, accessible from the avatar menu
- **Coach** → not a tab. The coach appears contextually in TODAY and TRAIN, as it already does in the Today sidebar. This is the right pattern.

---

## 4. Component Library

Build these before touching any screen. All screens depend on them.

### 4.1 Status Bar

The fitness snapshot. Appears at the top of the TODAY screen. Four cells in a horizontal row, separated by 0.5px dividers.

Structure per cell:
- Label: 9px Barlow Condensed, all caps, letter-spacing 1.5px, muted
- Value: 16px DM Mono, weight 700
- Sub-label: 9px DM Mono, muted or semantic color

Default four cells: Form/TSB · Fitness/CTL · Fatigue/ATL · This Week (rides · hours)

Color rules for values:
- TSB positive: `--color-teal` sub-label "FRESH" or "OPTIMAL"
- TSB –1 to –20: `--color-orange` sub-label "TIRED"
- TSB below –20: `--color-coral` sub-label "FATIGUED"
- CTL trending up: teal arrow sub-label
- ATL elevated: orange value

Background: white card, 0.5px border, no border-radius.

### 4.2 Intelligence Card

The hero component of the TODAY screen. This is where the connective tissue becomes visible — plan, fitness, and matched routes unified in one card.

Structure:
- **Header strip**: dark (#141410) background, full width. Left: "TODAY'S INTELLIGENCE" label (teal DM Mono 10px all caps). Right: date + race countdown (muted DM Mono 9px).
- **Body**: two-column layout inside the card (white background, 0.5px border)
  - Left column: today's planned workout from the training plan
  - Right column: routes matched to that workout from ride history
- **Footer strip**: base-secondary background. Left: plain-English summary of the match ("Tribos matched 3 routes from your history to today's workout"). Right: primary CTA button "RIDE TODAY →"

Left column content:
- "FROM YOUR PLAN" section label
- Workout type pill (dark background, teal text, DM Mono 9px all caps)
- Workout name (Barlow Condensed 15px weight 700)
- Meta line: duration · TSS · zone · nutrition guidance (DM Mono 11px muted)
- 2–3 sentence context about where this workout sits in the training plan
- Time selector: 30M · 60M · 90M · 2H+ chips (taps adjust the matched routes in right column)

Right column content:
- "ROUTES MATCHED TO THIS WORKOUT" section label
- "N ANALYZED FROM YOUR HISTORY" count (DM Mono 9px muted)
- List of 3 top matched routes: name + distance/elevation/terrain + match percentage
- Each route is tappable → navigates to RIDE tab with that route open
- Separated from left column by 0.5px vertical divider

This card must communicate: *Tribos analyzed your history and connected your plan to your terrain.* That's the sentence a new user needs to understand.

**Mobile layout (< 480px):** Columns stack vertically. Workout detail renders first (full width). Route matches render below it (full width, condensed — show route name, meta, and match percentage only; drop the match reason lines to save space). Time selector chips scroll horizontally if they overflow. Footer CTA spans full width.

### 4.3 Coach Strip

A supporting component. Appears below the Intelligence Card on TODAY, and contextually within TRAIN. Never leads a screen.

Structure:
- White background, 3px left border in `--color-teal`, 0.5px border other three sides
- Left: persona badge (dark rectangle, teal text, DM Mono 9px all caps)
- Right: coach message (12–13px Barlow, `--color-text-secondary`, line-height 1.55)
- Key data references within the message use `--color-text-primary` and weight 500 to stand out

The coach message should reference real numbers from the status bar. It interprets the data; it does not introduce new data.

### 4.4 Gear Alert

Surfaces actionable maintenance items. Only shown when a gear item needs attention.

Structure:
- Light coral background (`#FEF4F4`), 3px left border in `--color-coral`, 0.5px border
- Left: gear name (bold coral) + alert description (11px Barlow)
- Right: action button ("LOG REPLACEMENT" — coral fill, white text)

Only one gear alert surfaces at a time (the most urgent). "VIEW ALL" link if multiple exist.

### 4.5 Matched Route Card

Used in the RIDE screen grid. Represents one route matched to a workout.

Structure:
- White background, 0.5px border, no radius
- On hover: 1px teal border
- Type label: 9px Barlow Condensed, muted, all caps (e.g., "BEST MATCH · FLAT")
- Route name: 13px Barlow, weight 700
- Meta line: distance · elevation · terrain type (DM Mono 10px muted)
- Match reasons: 2 short lines (10px Barlow muted, checkmark prefix)
- Match percentage badge: small pill, teal or gold background, DM Mono 9px weight 700

Grid: 2 columns. The last slot in the grid is always a "BUILD NEW ROUTE +" dashed card.

### 4.6 Plan Progress Bar

Used in the TRAIN screen.

Structure:
- Plan name: 14px Barlow weight 700
- Sub-label: phase name + week count (11px Barlow muted)
- Phase badges: small inline pills (e.g., "BUILD PHASE", "WEEK 6 OF 12", "RACE IN 39 DAYS")
- Progress track: 4px height, base-secondary background, teal fill for elapsed weeks
- Start/end labels: 9px DM Mono muted

### 4.7 Week Summary Grid

Used in TRAIN. Four stat cells in a 2×2 or 4-column grid.

Cells: TSS (actual/planned) · Duration (actual/planned) · Workouts completed · Compliance percentage

Compliance below 50%: value in `--color-orange`
Compliance above 80%: value in `--color-teal`

### 4.8 Secondary Nav Bar

Used inside TRAIN. Horizontal strip of tabs.

Style: full-width flex row, each tab equal-height, 0.5px borders, no radius.
Active: `#141410` background, white text
Inactive: white background, muted text
Font: DM Mono or Barlow Condensed 9px, letter-spacing 1.5px, all caps

Tabs: CALENDAR · TRENDS · POWER · HISTORY · INSIGHTS

### 4.9 Zone Distribution Row

Used in PROGRESS. One row per training zone.

Structure: zone number (DM Mono 10px muted) · zone name (Barlow 11px) · bar (flex-1, 6px height) · percentage (DM Mono 10px weight 700)

Bar colors: Z1 teal low opacity · Z2 teal · Z3 gold · Z4 orange · Z5 coral
Insight line below the list: flagged in orange if zone distribution is off target.

### 4.10 Trend Insight Row

Used in PROGRESS. Each row represents one key insight derived from the data.

Structure: colored dot (8px, semantic color) + title (12px Barlow weight 700) + detail (10px Barlow muted, line-height 1.4)

Color of dot signals valence: teal = positive, gold = neutral/watch, orange = needs attention, coral = urgent.

---

## 5. Screen Specifications

### 5.1 TODAY

The front door. Answers: *given everything, what do I do today and where do I ride?*

Layout order:

1. **Status Bar** (Component 4.1) — full width, four cells. This is the first data a user sees every time they open the app. It should load first.

2. **Intelligence Card** (Component 4.2) — full width, the visual hero. Plan + matched routes side by side. The footer of this card contains the primary CTA for the entire screen.

3. **Coach Strip** (Component 4.3) — below the intelligence card. Interprets the status bar data in the context of today's workout. 2–4 sentences. References TSB, race countdown, compliance, or ramp rate — whatever is most relevant today.

4. **Gear Alert** (Component 4.4) — only rendered if a gear item needs attention. Full width, coral left border. Not shown if no alerts.

5. **Two-column section** — Week chart (left) and Fitness bars (right), equal width.
   - Week chart: planned vs actual bars for each day, DM Mono day labels, today's column in orange
   - Fitness bars: CTL · ATL · TSB · Ramp rate, each as a labeled horizontal bar with DM Mono value right-aligned. Section links to PROGRESS → Trends.

**Interaction notes:**
- Time selector chips on the Intelligence Card (30M · 60M · 90M · 2H+) filter the matched routes in the right column in real time. Pre-fetch all four route sets on page load.
- Tapping a matched route navigates to RIDE with that route selected.
- "RIDE TODAY →" CTA navigates to RIDE with today's workout pre-loaded.
- Coach strip persona name is tappable. Tapping opens an inline persona switcher — a horizontal strip of five persona tiles directly below the coach strip. Selecting a tile closes the switcher, updates the persona badge, refreshes the coach message, and persists the selection to the user profile (optimistic update — apply immediately, sync in background).
- On mobile, the Intelligence Card two-column layout stacks vertically: workout detail on top, route matches below. The time selector chips remain full-width. The footer CTA button spans full width.

**Empty state — no training plan connected:**
The left column of the Intelligence Card renders a fitness-derived suggestion instead of a plan workout:
- Label: "BASED ON YOUR FITNESS" (replaces "FROM YOUR PLAN")
- Suggested workout type derived from TSB: positive TSB → intensity possible, negative TSB → endurance/recovery
- Workout name: e.g., "60-Min Endurance Ride" with a muted sub-label "(suggested from your fitness state)"
- Context message: "You don't have an active training plan. Set one up to get structured workouts and smarter route matching." with a teal text link "→ SET UP A PLAN"
- Right column still shows route matches based on the suggested workout type — it still works, it's just less precise
- The Intelligence Card footer changes to: "Routes matched to your suggested workout · Set up a plan for structured training →"

**Empty state — no connected data at all (brand new user):**
The Intelligence Card becomes an onboarding card: connect prompt for Strava or Garmin. Status bar shows zero-state placeholders. Coach strip appears with a welcome message. Once data is connected, the card resolves to either the plan state or the fitness-suggestion state above.

### 5.2 RIDE

Unified route library and builder. Matched routes lead; the builder is always accessible.

Layout order:

1. **Builder prompt bar** — dark (#141410) background card. Left: "BUILD A NEW ROUTE" title + subtitle pre-filled with today's plan context ("Pre-filled from today's plan: 90 min · Endurance · Flat"). Right: "CONFIGURE →" outline button in teal. This bar is always visible but visually subordinate to the matched routes below it — the dark background signals it's a mode-switch, not the default action.

2. **Filter row** — two buttons: "WORKOUTS" (default active, dark fill) and "ALL ROUTES" (ghost). Switches the route list between matched-to-workout view and full library view.

3. **Today's matched routes** — section header "MATCHED TO TODAY'S WORKOUT — N ANALYZED" with the count. 2-column grid of Matched Route Cards (Component 4.5). Routes ordered by match percentage descending. Last slot: "+ BUILD NEW ROUTE" dashed card.

4. **Tomorrow's matched routes** — section header with tomorrow's date and workout type badge. Same 2-column card grid, slightly reduced opacity to signal "upcoming not today."

**Route builder flow (triggered from builder prompt bar or the + card):**

Opens as a panel (not a new page) overlaying the route grid, or navigates to a dedicated builder view if a full map is needed. Four steps:

Step 1 — Goal: 2×2 grid of goal tiles (Base Miles · Intervals · Recovery · Race Prep), pre-selected to match today's plan
Step 2 — Parameters: Duration slider · Surface selector · Start location · Two toggles (climbs / traffic). Smart defaults from ride history.
Step 3 — Building: Coach-voiced loading state ("Building your route from your saved preferences...")
Step 4 — Route Ready: Map preview + stats (distance · elevation · time) + coach note + "SEND TO GARMIN/WAHOO →" primary CTA

Step indicators: small rectangular bars at top (not numbered steps). Completed: teal. Current: dark. Remaining: base-border narrow.

**Segment library (accessed via secondary link):**
"MY SEGMENTS →" link opens the segment grid — the 50-segment analyzed view. This is a power-user feature, not surfaced prominently. It lives at the bottom of RIDE or behind a secondary action.

### 5.3 TRAIN

The depth layer. All features from the current 8-tab Training sub-nav live here.

Layout order:

1. **Plan Progress Bar** (Component 4.6) — active plan name, phase badges, progress track, week count and race countdown.

2. **Week Summary Grid** (Component 4.7) — four cells: TSS · Duration · Workouts · Compliance. Current week data.

3. **Secondary Nav Bar** (Component 4.8) — CALENDAR · TRENDS · POWER · HISTORY · INSIGHTS

4. **Content area** — renders the selected sub-tab content below the secondary nav. Default: CALENDAR showing the current week's plan.

**Calendar view:**
Monthly grid, same data that currently lives in Training → Calendar. Workout cards show type badge · name · duration · TSS. Completed days get a teal checkmark. Today gets an orange highlight border.

**Trends view:**
Training Ramp Rate card first (the most actionable metric). Then Fitness Journey chart (CTL/ATL/TSB over time). Then Training Zone Distribution with the bar chart and insight callout. Then Aerobic Efficiency (Pw:Hr) chart.

**Power, History, Insights:**
These render the existing content from the current Power, History, and Insights tabs — no content changes, just relocated inside TRAIN.

**Coach in TRAIN:**
The coach sidebar that currently appears on Training → Today moves here. When a user is viewing their calendar or trends, the coach strip appears below the secondary nav with context specific to what they're viewing (e.g., on Trends, the coach comments on ramp rate; on Calendar, the coach notes upcoming key workouts).

### 5.4 PROGRESS

The reward screen. Makes training meaningful over time.

Layout order:

1. **Zone Distribution** (Component 4.9) — full-width card. Five zone rows with colored bars. Insight callout below if distribution is off-target. Time filter (7D · 30D · 90D) top right.

2. **Key Trends** — full-width card. Three to five Trend Insight Rows (Component 4.10). These are plain-English summaries of what the data means, not raw charts. Examples:
   - "Training ramp rate +4 TSS/week — optimal range"
   - "Aerobic efficiency improving — +0.3% vs older rides"
   - "44% weekly compliance — below target, impacts Boulder Roubaix taper"

3. **Two-column section** — Year to Date stats (left) and Segment Intelligence (right).
   - YTD: rides · distance · elevation · moving time in a clean row list
   - Segments: total analyzed · PRs this month · top segment name + score

**Design tone:**
This screen should feel like an achievement report. Gold is used sparingly — only on genuine PRs and optimal metrics. The key trends section prioritizes plain English over chart density. A masters racer opening this screen should feel informed, not overwhelmed.

---

## 6. Interaction Principles

### Transitions

Opacity fade, 150–200ms between tab changes. No slide animations. Tribos transitions feel like a terminal switching views, not a consumer app animating.

### Within-screen state changes

- Intelligence Card time selector: matched routes update instantly (optimistic, pre-fetched)
- Gear alert dismiss: height collapses 200ms, removed from DOM
- Coach strip: appears on load, no animation needed
- Route card hover: border appears 150ms

### Loading states

Never show a spinner alone. Always pair with a coach-voiced message in a narrow strip:
- "Analyzing your routes against today's workout..."
- "Loading your training week..."
- "Calculating your fitness trends..."

Loading indicator: the retro stripe pulses (opacity animation, not width). No circular spinners.

### Error states

Surface as plain-language messages, not system alerts. The coach strip changes its left border from teal to coral and delivers the error in context: "I'm having trouble reaching Strava right now — your route matches may be incomplete. Check your connection and I'll re-analyze when you're back."

---

## 7. Existing User Protection

These constraints are non-negotiable throughout the redesign.

- **No auth changes.** Auth flow, Garmin integration, Strava integration — strictly out of scope. Do not touch.
- **No schema migrations without fallbacks.** If a column doesn't exist yet, the UI degrades gracefully — it hides the feature, it does not crash.
- **Feature flags on all screen-level changes.** TODAY, RIDE, TRAIN, PROGRESS each deploy independently behind flags.
- **Never ship more than one major screen change per deploy.** A bug in a combined deploy is impossible to bisect.
- **Read-only in phases 1 and 2.** No Supabase mutations until the coach check-in write in phase 3.
- **Staged rollout.** 10% of users Monday → 50% Wednesday → 100% Friday. Watch PostHog drop-off rates at each step.

---

## 8. Implementation Order

### Phase 1: Navigation restructure (no feature changes)
Replace the two-layer nav with the four-tab structure: TODAY · RIDE · TRAIN · PROGRESS. Map existing screens to new tabs — no content changes yet. TODAY renders the current Home content. RIDE renders current Routes. TRAIN renders current Training with its existing 8-tab sub-nav collapsed into the new secondary nav. PROGRESS renders current Trends. Ship this and let users orient before changing anything else. This is the lowest-risk, highest-orientation-value change in the entire redesign.

**Measure:** Do users click TRAIN more than they clicked the Training nav item? Does time-on-TODAY increase vs time-on-Home?

### Phase 2: TODAY screen — Intelligence Card
Build the Intelligence Card component. Pull today's planned workout from the existing training plan data. Pull the matched routes from the existing route analysis data (it's already there on the home screen, just not connected to the workout). Combine them into the two-column Intelligence Card layout. Add the status bar above it. This is the connective tissue made visible.

**Measure:** Route Created rate. Target: 14% → 25%+. Measure for 3–5 days before moving to Phase 3.

### Phase 3: RIDE screen unification
Combine the current Routes nav item and Training → Routes (the matched route analysis) into a single RIDE tab. Builder prompt at top, matched routes in the 2-column grid below, tomorrow's routes pre-loaded underneath. The segment library accessible via a secondary link.

### Phase 4: TRAIN depth consolidation
Collapse the current 8-tab Training sub-nav into the new secondary nav inside TRAIN. No content changes to the individual views — just restructuring how they're accessed. Add the plan progress bar and week summary grid above the secondary nav.

### Phase 5: PROGRESS and full polish
Build the PROGRESS screen with zone distribution, trend insight rows, and the two-column YTD/segments section. Full cross-screen consistency pass: typography, spacing, color semantics. Mobile audit at 375px, 390px, 428px.

### Phase 6: Launch gate
PostHog funnel verification, staged rollout, Threads launch content timed to the redesign.

---

## 9. Hard Constraints for Claude Code

- Do not add any new typeface. Only Barlow Condensed, Barlow, DM Mono.
- Do not use border-radius except on toggle switches and persona icon backgrounds.
- Do not use box shadows, text shadows, blur effects, or gradients.
- Do not use `#3A5A8C` (retired steel blue) anywhere.
- Do not use emoji in any UI element. SVG marks only.
- Do not touch auth, Garmin, or Strava integration code.
- Do not run database migrations without a schema-safe fallback.
- Do not ship more than one major screen change per deploy.
- Do not make the coach the headline of any screen. Data leads, coach interprets.
- Do not restore the 8-tab sub-nav as a primary navigation element.
- Do not use Inter, Roboto, Arial, or system fonts for any visible UI text.
- Do not add social features (feed, kudos, multi-user interactions) of any kind.
- Do not use purple, pink, or blue as accent colors.

---

## 10. Resolved Design Decisions

Resolve these before implementation begins:

All five questions resolved — March 2026.

1. **Mobile and desktop are equal priority.** The Intelligence Card two-column layout is used on desktop. On mobile (375px–428px), the columns stack: workout detail on top, route matches below. The status bar collapses from four cells to a 2×2 grid on narrow screens. Every component must be designed and tested at both breakpoints — not mobile-first, not desktop-first, both.

2. **Cafe moves to the avatar dropdown menu.** Access via the user avatar in the top-right nav. May be deprecated entirely in a future release — build the dropdown infrastructure but treat Cafe as a low-priority item within it.

3. **TODAY fully replaces Home.** The default route `/` renders TODAY. There is no separate Home view. The current Home content is absorbed into TODAY — the route matches panel already present on Home becomes the right column of the Intelligence Card.

4. **Users can switch coach persona directly from TODAY.** The coach strip on TODAY includes a small persona selector — the active persona name is tappable and opens a compact inline switcher (the five persona tiles in a horizontal strip, not a full modal). Selection persists to the user profile. The switcher closes after selection and the coach message updates immediately.

5. **No training plan: suggest a workout based on fitness state and encourage plan setup.** The left column of the Intelligence Card shows a fitness-derived workout suggestion (e.g., "Based on your TSB of –11, a 60-minute endurance ride is appropriate today") with a clear secondary prompt: "Set up a training plan to get structured workouts and smarter route matching →". The right column still shows route matches based on the suggested workout type. The Intelligence Card still works — it just uses fitness state instead of a plan as the left-column input.
