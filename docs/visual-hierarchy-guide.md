# Visual Hierarchy Design Guide

> **Core Principle**: Reserve bright green (`#22c55e` / `lime`) for only 1-2 focal points per view. When everything is emphasized, nothing is.

---

## Color Hierarchy Tiers

### Tier 1 - Primary Focus (Bright Green/Lime)

These elements demand immediate attention and should be limited to **1-2 per screen**:

| Element | Rationale |
|---------|-----------|
| Training Status Badge (OPTIMAL/FRESH/etc.) | Immediate answer to "how is my training going?" |
| Ask AI Coach Button | Primary engagement action |

### Tier 2 - Supporting Context (Muted Green or Gray-Green)

Important but secondary information. Use `teal`, `gray`, or desaturated green variants:

| Element | Current State | Target State |
|---------|---------------|--------------|
| TSB Value | Bright display | Muted, smaller text |
| Weekly TSS | Prominent | Inline metric |
| Ride Count Ring | Colorful | Neutral gray with subtle accent |

### Tier 3 - Background Information (Neutral Grays/Whites)

Reference data that supports decision-making but shouldn't compete for attention:

- CTL/ATL labels and values
- Form label
- Historical ride details (e.g., "Lunch Gravel Ride" card)
- Timestamps and metadata

---

## Component-Specific Guidelines

### Training Status Card

```
+------------------------------------------+
|  [OPTIMAL]  <-- ONLY bright green element|
|                                          |
|  CTL: 45  ATL: 52  TSB: -7   (muted)     |
|                                          |
|  "You're in the optimal zone..."         |
|                                          |
|  [Ask AI Coach]  [Suggested Workout]     |
|      ^primary        ^secondary          |
+------------------------------------------+
```

### Race Goals Section

**Current Problem**: Takes too much visual weight for future context

**Recommendations**:
- Reduce card prominence significantly
- Consider compact inline display: "OMW in 34 days"
- Auto-expand or gain visual weight inside 2 weeks of race date
- Use neutral border, subtle background

### Metrics Bar

**Priority Order** (left to right = most to least important):
1. Form Status Badge (color-coded)
2. TSB value
3. Weekly progress
4. CTL/ATL (reference only)

---

## Spacing & Layout

### Breathing Room

| Element Relationship | Minimum Gap |
|---------------------|-------------|
| Between major sections | `lg` (24px) |
| Between cards in same section | `md` (16px) |
| Internal card padding | `md` to `lg` |

### Hero Hierarchy

The Training Status Card should be the **clear hero** of the Today tab:
- Larger than surrounding elements
- Gradient background to draw eye
- Clear call-to-action buttons

---

## User Goals This Hierarchy Supports

1. **Understand training status at a glance**
   - One badge tells the story
   - Supporting numbers available but not competing

2. **Know they can engage with AI Coach**
   - Primary action button is immediately visible
   - Not buried among other equally-bright elements

3. **Access details when needed**
   - Secondary information is discoverable
   - Doesn't overwhelm the primary message

---

## Implementation Checklist

### High Priority
- [ ] Audit all uses of `color="lime"` and `color="green"` in components
- [ ] Reduce Race Goals card visual weight
- [ ] Ensure only Training Status badge uses bright green
- [ ] Make Ask AI Coach the only filled green button on Today tab

### Medium Priority
- [ ] Update FitnessMetricsBar to use muted colors for CTL/ATL
- [ ] Add more vertical spacing between major sections
- [ ] Review RingProgress colors (currently uses form status color)

### Lower Priority
- [ ] Consider progressive disclosure for Race Goals (expand near race date)
- [ ] Audit button variants across all tabs for consistency
- [ ] Review icon colors for unnecessary emphasis

---

## Color Reference

| Purpose | Color Token | Hex | Usage |
|---------|-------------|-----|-------|
| Primary Focus | `lime` | `#84cc16` | Status badge, primary CTA |
| Positive State | `teal` | `#14b8a6` | Fresh form, success |
| Warning | `yellow` | `#eab308` | Tired, caution |
| Alert | `red` | `#ef4444` | Fatigued, errors |
| Neutral | `gray` | `#6b7280` | Labels, secondary text |
| Supporting | `blue` | `#3b82f6` | Charts, informational |

---

## Before/After Mental Model

### Before (Current)
> "There's a lot of green on this page. What should I focus on?"

### After (Target)
> "I'm OPTIMAL. I can ask the AI Coach if I want guidance. Everything else is context."
