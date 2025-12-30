# Visual Hierarchy Design Guide

> **Core Principle**: Reserve bright green (`#22c55e` / `lime`) for only 1-2 focal points per view. When everything is emphasized, nothing is.

This guide establishes visual hierarchy standards for the entire Tribos application. All pages and components should follow these principles.

---

## Table of Contents

1. [Color Hierarchy Tiers](#color-hierarchy-tiers)
2. [Interaction States](#interaction-states)
3. [Dark Mode Considerations](#dark-mode-considerations)
4. [Typography Hierarchy](#typography-hierarchy)
5. [Component-Specific Guidelines](#component-specific-guidelines)
6. [Page-by-Page Audit](#page-by-page-audit)
7. [Spacing & Layout](#spacing--layout)
8. [Z-Index & Layering](#z-index--layering)
9. [Implementation Checklist](#implementation-checklist)

---

## Color Hierarchy Tiers

### Tier 1 - Primary Focus (Bright Accent)

These elements demand immediate attention. **Limit to 1-2 per screen.**

| Context | Element | Color |
|---------|---------|-------|
| Training Hub | Training Status Badge (OPTIMAL/FRESH/etc.) | `lime` filled |
| Training Hub | Ask AI Coach Button | `lime` filled |
| Route Builder | Generate Route Button | `lime` filled |
| Dashboard | Primary CTA | `lime` filled |

**Implementation Rules:**
- Only ONE `variant="filled"` button with `color="lime"` per view
- Status badges are the exception (they're informational, not interactive)
- Never stack two Tier 1 elements vertically adjacent

### Tier 2 - Supporting Context (Muted Accents)

Important but secondary information. Use lower saturation and opacity.

| Element | Current | Target | Implementation |
|---------|---------|--------|----------------|
| TSB Value | Bright colored text | `gray.5` or `dimmed` | `c="dimmed"` |
| Weekly TSS | Prominent badge | Inline text | Remove badge wrapper |
| Ride Count Ring | `formStatus.color` | `gray.6` | Static neutral color |
| Secondary buttons | `variant="light"` | `variant="subtle"` or `variant="light" color="gray"` |

**Color Specifications for Tier 2:**
```
Mantine colors at position 4-5 (e.g., green.4, blue.5)
Opacity: 0.6-0.7 for backgrounds
Text: c="dimmed" or explicit gray.6
```

### Tier 3 - Background Information (Neutral)

Reference data that shouldn't compete for attention.

| Elements | Treatment |
|----------|-----------|
| CTL/ATL labels and values | `c="dimmed"`, `size="sm"` |
| Timestamps and metadata | `c="dimmed"`, `size="xs"` |
| Historical ride details | Neutral card, no colored badges |
| Form label (text, not badge) | `c="dimmed"` |

---

## Interaction States

### Hover States

| Component Type | Default | Hover | Active |
|----------------|---------|-------|--------|
| Primary Button | `lime` filled | Darken 10% | Darken 15% |
| Secondary Button | `gray` light | `gray.1` bg | `gray.2` bg |
| Card (clickable) | `dark.6` bg | `dark.5` bg | Scale 0.99 |
| Link | `lime.6` text | Underline | `lime.7` text |

### Focus States (Accessibility)

```css
/* All interactive elements must have visible focus */
:focus-visible {
  outline: 2px solid var(--mantine-color-lime-6);
  outline-offset: 2px;
}
```

### Selected/Active States

| Component | Selected State |
|-----------|----------------|
| Tab | `lime` text, bottom border |
| Card (selectable) | `lime` border, subtle `lime` bg (0.1 opacity) |
| Checkbox/Radio | `lime` fill |
| Dropdown item | `dark.5` background |

---

## Dark Mode Considerations

The app uses dark mode (`dark.6`, `dark.7` backgrounds). Bright colors are MORE prominent on dark backgrounds.

### Saturation Adjustments

| Color | Light Mode | Dark Mode | Reason |
|-------|------------|-----------|--------|
| Lime/Green | `lime.6` | `lime.5` or `lime.4` | Reduce eye strain |
| Red (alerts) | `red.6` | `red.5` | Less aggressive |
| Yellow (warnings) | `yellow.6` | `yellow.5` | Better contrast |

### Background Colors

```
Primary surfaces:  var(--mantine-color-dark-7)  // #1a1b1e
Card surfaces:     var(--mantine-color-dark-6)  // #25262b
Elevated surfaces: var(--mantine-color-dark-5)  // #2c2e33
Hover states:      var(--mantine-color-dark-4)  // #373a40
```

### Avoid

- Pure white text on bright colored backgrounds
- Multiple bright colors adjacent to each other
- Bright borders on dark cards (use opacity instead)

---

## Typography Hierarchy

### Font Weights

| Purpose | Weight | Usage |
|---------|--------|-------|
| Page titles | `fw={700}` | `<Title order={1}>` |
| Section headers | `fw={600}` | `<Title order={2}>` or `<Text fw={600}>` |
| Card titles | `fw={600}` | `<Text fw={600} size="lg">` |
| Labels | `fw={500}` | `<Text fw={500} size="sm">` |
| Body text | `fw={400}` | Default |
| Metadata | `fw={400}` | `c="dimmed" size="xs"` |

### Text Sizes

| Context | Size | Example |
|---------|------|---------|
| Hero metrics | `size="3rem"` or larger | FTP display, main stat |
| Primary values | `size="xl"` | TSB number, weekly distance |
| Secondary values | `size="lg"` | CTL, ATL values |
| Labels | `size="sm"` | "Weekly TSS", "Last Ride" |
| Metadata | `size="xs"` | Timestamps, IDs |

### When to Use `c="dimmed"`

- Labels for values (e.g., "CTL:", "Last updated:")
- Metadata and timestamps
- Supporting context text
- Placeholder content

---

## Component-Specific Guidelines

### Training Status Card (Hero)

```
+------------------------------------------+
|  [OPTIMAL]  <-- ONLY bright element      |
|                                          |
|  CTL: 45  ATL: 52  TSB: -7   (dimmed)    |
|                                          |
|  "You're in the optimal zone..."         |
|                                          |
|  [Ask AI Coach]  [Suggested Workout]     |
|      ^filled        ^light/subtle        |
+------------------------------------------+
```

### Race Goals - Progressive Disclosure

| Time to Race | Visual Treatment |
|--------------|------------------|
| 2+ weeks | Compact inline: `Badge size="xs" color="gray"` with text "OMW in 34 days" |
| 1-2 weeks | Elevated card: Subtle border, `yellow.1` background tint |
| Race week | Prominent: Full card, `yellow` left border accent, top of section |
| Race day | Hero treatment: Can use Tier 1 colors |

**Implementation:**
```jsx
const getRaceVisualWeight = (daysUntil) => {
  if (daysUntil <= 0) return 'hero';      // Race day
  if (daysUntil <= 7) return 'prominent'; // Race week
  if (daysUntil <= 14) return 'elevated'; // 1-2 weeks
  return 'compact';                        // 2+ weeks
};
```

### Workout Difficulty Badges

**Current Problem:** 6 competing colors (teal, green, lime, yellow, orange, red)

**Solution:** Use a single accent color with intensity variation:

| Difficulty | Current | Target |
|------------|---------|--------|
| Recovery | `teal` | `gray.5` |
| Achievable | `green` | `gray.6` with `✓` icon |
| Productive | `lime` filled | `lime` filled (Tier 1) |
| Stretch | `yellow` | `yellow.6` outline |
| Breakthrough | `orange` | `orange.6` outline |
| Not Recommended | `red` | `red.6` outline with icon |

Only "Productive" (the recommended level) gets bright treatment.

### Training Zone Colors

Zones are semantic and well-established. Keep the 7-color system BUT:

- Use for **charts and data visualization only**
- Don't use zone colors for buttons or interactive elements
- Reduce saturation when used as backgrounds

```javascript
// Zone colors for charts (keep these)
zone1: '#3B82F6', // Recovery - Blue
zone2: '#22C55E', // Endurance - Green
zone3: '#EAB308', // Tempo - Yellow
zone4: '#F97316', // Threshold - Orange
zone5: '#EF4444', // VO2max - Red
zone6: '#A855F7', // Anaerobic - Purple
zone7: '#EC4899', // Neuromuscular - Pink

// When used as backgrounds, add opacity
backgroundColor: `${zoneColor}20` // 20 = ~12% opacity
```

### Metrics Bar

**Priority Order** (left to right):
1. Form Status Badge (Tier 1 - only colored element)
2. TSB value (Tier 2 - muted)
3. Weekly summary (Tier 3 - neutral text)
4. CTL/ATL (Tier 3 - dimmed, smallest)

```jsx
// Target implementation
<Group>
  <Badge color={formStatus.color} variant="filled">OPTIMAL</Badge>
  <Text size="sm" c="dimmed">TSB: +5</Text>
  <Divider orientation="vertical" />
  <Text size="xs" c="dimmed">This week: 3 rides, 245 TSS</Text>
  <Text size="xs" c="dimmed">CTL: 45 | ATL: 52</Text>
</Group>
```

---

## Page-by-Page Audit

### Dashboard.jsx

**Issues Found:**
- Quick action cards all use similar visual weight
- Multiple `electricLime` usages competing

**Recommendations:**
| Element | Current | Target |
|---------|---------|--------|
| Primary quick action | `electricLime` border | Keep (Tier 1) |
| Secondary actions | `zone4`, `info` borders | `gray` or `dark.5` |
| Activity badges | Multiple colors | Neutral with icon differentiation |

### TrainingDashboard.jsx

**Issues Found:**
- `FitnessMetricsBar` has 5 colored elements
- `TodaysFocusCard` has bright badge AND bright button
- `RingProgress` uses `formStatus.color`

**Recommendations:**
| Component | Fix |
|-----------|-----|
| `FitnessMetricsBar` | Only Form badge colored, rest `dimmed` |
| `TodaysFocusCard` | Status badge Tier 1, Ask Coach button `variant="filled"`, Suggested Workout `variant="light" color="gray"` |
| `RingProgress` | Use `gray.6` for ring, number can inherit form color |
| Tabs | Keep `lime` for selected state only |

### RouteBuilder.jsx

**Issues Found:**
- AI suggestion cards with colored borders
- Multiple difficulty badges per suggestion
- Metric badges (distance, elevation, time) all colored

**Recommendations:**
| Element | Current | Target |
|---------|---------|--------|
| Selected suggestion | `electricLime` border | Keep (shows selection) |
| Unselected suggestions | Colored borders | `dark.5` border |
| Metric badges | Zone colors | `gray` badges with icons |
| Generate Route button | — | Only Tier 1 element |

### PlannerPage.tsx

**Issues Found:**
- WorkoutCard uses 10+ category colors
- All workouts equally emphasized

**Recommendations:**
- Use category colors as LEFT BORDER ACCENT only (3px)
- Card background should be neutral `dark.6`
- Selected workout can have subtle colored background tint
- Today's workouts get visual emphasis, future workouts muted

### Settings.jsx

**Issues Found:**
- Multiple connection status badges
- Action buttons competing

**Recommendations:**
- Connection status: Simple green checkmark or red X icon
- Primary action per section: Tier 1
- Secondary actions: `variant="subtle"`

### RideHistoryTable.jsx

**Issues Found:**
- Each row has TSS badge, power badge, difficulty badge
- Table becomes a rainbow

**Recommendations:**
- TSS: Plain text, no badge
- Power: Plain text with unit
- Difficulty: Icon only (no badge), tooltip for details
- Only highlight exceptional values (PRs, outliers)

---

## Spacing & Layout

### Breathing Room

| Relationship | Gap | Mantine Token |
|--------------|-----|---------------|
| Between major sections | 32px | `gap="xl"` |
| Between cards in section | 16px | `gap="md"` |
| Card internal padding | 16-24px | `p="md"` to `p="lg"` |
| Between form fields | 12px | `gap="sm"` |

### Hero Hierarchy

The primary content card should be visually dominant:

```jsx
// Hero card treatment
<Paper
  p="lg"
  radius="md"
  style={{
    background: `linear-gradient(135deg, ${formStatus.bg}, transparent)`,
    border: `1px solid ${formStatus.bg}`,
  }}
>
```

Secondary cards should be visually recessive:

```jsx
// Secondary card treatment
<Paper
  p="md"
  radius="md"
  withBorder  // Uses default muted border
>
```

---

## Z-Index & Layering

### Layer Stack

| Layer | Z-Index | Elements |
|-------|---------|----------|
| Base | 0 | Page content |
| Sticky | 100 | Tab bar, headers |
| Dropdown | 200 | Menus, selects |
| Modal backdrop | 300 | Modal overlay |
| Modal content | 301 | Modal body |
| Toast/Notification | 400 | Alerts, snackbars |
| Tooltip | 500 | Tooltips |

### Rules

- Never use arbitrary z-index values
- Modals should dim all content below
- Tooltips appear above everything
- Sticky elements shouldn't block important content

---

## Implementation Checklist

### Phase 1: High Impact (Do First) ✅ COMPLETED

- [x] **TrainingDashboard**: Reduce `TodaysFocusCard` to single Tier 1 element
- [x] **TrainingDashboard**: Mute `FitnessMetricsBar` colors (except Form badge)
- [x] **Dashboard**: Differentiate quick action card emphasis levels
- [x] **RaceGoalsPanel**: Implement progressive disclosure based on days-until-race
- [x] **RouteBuilder**: Neutral unselected suggestion cards (`AISuggestionCard`)

### Phase 2: Component Library ✅ COMPLETED

- [x] Create `<PrimaryButton>` wrapper that enforces Tier 1 usage
- [x] Create `<MetricBadge>` with consistent muted styling
- [x] Audit and standardize `WorkoutDifficultyBadge` colors
- [x] Create `<StatusBadge>` component with tier enforcement

**New components available at `src/components/ui/`:**

```jsx
import {
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
  FormStatusBadge,
  PriorityBadge,
  MetricBadge,
  MetricText,
  MetricGroup,
} from '../components/ui';

// Primary action (Tier 1) - limit to 1-2 per screen
<PrimaryButton leftSection={<IconMessageCircle size={16} />}>
  Ask AI Coach
</PrimaryButton>

// Secondary action (Tier 2/3)
<SecondaryButton rightSection={<IconChevronRight size={16} />}>
  View Details
</SecondaryButton>

// Status with tier control
<StatusBadge tier="primary" color="lime">OPTIMAL</StatusBadge>
<StatusBadge tier="secondary" color="blue">In Progress</StatusBadge>
<StatusBadge tier="muted" color="gray">Archived</StatusBadge>

// Metrics (muted by default)
<MetricBadge icon={<IconRuler size={14} />} value="45.2 km" />
<MetricBadge icon={<IconMountain size={14} />} value="850m" highlighted />
```

### Phase 3: Data Visualization ✅ COMPLETED

- [x] Zone colors: Use for charts only, not interactive elements
- [x] Add opacity to zone colors when used as backgrounds
- [x] Standardize chart color palette across components

**New utilities at `src/components/ui/zoneColors.js`:**

```jsx
import {
  ZONE_COLORS,
  getZoneColor,
  getZoneBackgroundColor,
  getZoneBorderColor,
  CHART_COLORS,
  getChartSeriesColor,
} from '../components/ui';

// For charts - full saturation
<Bar fill={getZoneColor(zone)} />

// For backgrounds - with opacity
style={{ backgroundColor: getZoneBackgroundColor(zone, 0.1) }}

// For multi-series charts
{series.map((s, i) => <Line stroke={getChartSeriesColor(i)} />)}
```

### Phase 4: Polish (In Progress)

- [x] Audit all `color="lime"` and `color="green"` usages (145+ found)
- [x] Fix RouteBuilder secondary actions (Export GPX, metric badges)
- [x] Fix TrainingPlanBrowser (plan count, checkmarks, buttons)
- [ ] Continue auditing remaining components
- [ ] Add focus states to all interactive elements
- [ ] Test color contrast for accessibility (WCAG AA)

**Key files updated:**
- `RouteBuilder.jsx`: Export GPX, AI suggestion badges → gray
- `TrainingPlanBrowser.jsx`: Plan counts, checkmarks, secondary buttons → gray

### Phase 5: Documentation

- [ ] Add Storybook stories showing correct tier usage
- [ ] Document color tokens in theme.js with tier annotations
- [ ] Create PR template checklist for visual hierarchy

---

## Color Reference

### Tier Mapping

| Tier | Mantine Colors | Hex Range | Opacity |
|------|----------------|-----------|---------|
| Tier 1 | `lime.6`, `green.6` | Full saturation | 100% |
| Tier 2 | `*.4`, `*.5` | Mid saturation | 60-80% |
| Tier 3 | `gray.*`, `dimmed` | Low saturation | 40-60% |

### Semantic Colors

| Purpose | Token | Hex | Usage |
|---------|-------|-----|-------|
| Primary Focus | `lime.6` | `#84cc16` | Status badge, primary CTA |
| Success | `green.6` | `#22c55e` | Confirmations, completed states |
| Warning | `yellow.6` | `#eab308` | Caution, tired state |
| Error | `red.6` | `#ef4444` | Errors, fatigued state |
| Info | `blue.6` | `#3b82f6` | Informational, charts |
| Neutral | `gray.6` | `#6b7280` | Labels, secondary text |

---

## Before/After Mental Model

### Before (Current)
> "There's a lot of color on this page. Everything seems important. What should I focus on?"

### After (Target)
> "I'm OPTIMAL. I can Ask the AI Coach. Everything else is context I can explore if needed."

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│  TIER 1: Bright, filled, 1-2 per screen         │
│  └─ Status badges, primary CTA                  │
│                                                 │
│  TIER 2: Muted, light variant, supporting       │
│  └─ Secondary buttons, important metrics        │
│                                                 │
│  TIER 3: Dimmed, neutral, background            │
│  └─ Labels, metadata, historical data           │
│                                                 │
│  ZONES: Charts only, not interactive elements   │
│                                                 │
│  RACE PROXIMITY: Compact → Elevated → Hero      │
└─────────────────────────────────────────────────┘
```
