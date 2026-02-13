# Tribos Studio Styling Architecture Audit

> Generated 2026-02-13 for rebranding preparation

## 1. Styling Architecture

**Framework:** Mantine UI v8 + custom CSS variables
**No:** Tailwind, CSS-in-JS, CSS modules, PostCSS

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/theme.js` | Mantine `createTheme()` config + design tokens | ~578 |
| `src/styles/global.css` | CSS custom properties + global styles | ~740 |
| `index.html` | Google Fonts preload + critical CSS | 91 |
| `src/App.jsx` | MantineProvider + route definitions | 244 |
| `src/hooks/useThemeTokens.js` | Theme-aware hook for components | 113 |

### How Components Reference Styles

- **Mantine component props** (`color`, `size`, `radius`) — ~95% of components
- **Inline styles with CSS vars** (`style={{ color: 'var(--tribos-text-primary)' }}`) — 1,436 instances
- **Depth presets** — JS objects from `theme.js` applied via `style={{...depth.card}}`
- **CSS utility classes** — `.tribos-depth-card`, `.tribos-accent-card` for elevation
- **Minimal `sx` prop** — 3 components

### Color Palette

#### Surfaces

| Token | Dark | Light |
|-------|------|-------|
| `--tribos-void` / bg-primary | `#000000` | `#F4F6F5` |
| `--tribos-nav` | `#08090b` | `#FAFBFA` |
| `--tribos-panel` | `#12161b` | `#F0F2F0` |
| `--tribos-card` | `#181d24` | `#FFFFFF` |
| `--tribos-card-hover` | `#1e242d` | `#F5F7F5` |
| `--tribos-elevated` | `#2a323e` | `#FFFFFF` |
| `--tribos-input` | `#111519` | `#FFFFFF` |

#### Text

| Token | Dark | Light |
|-------|------|-------|
| `--tribos-text-100` (primary) | `#f4f5f7` | `#171a18` |
| `--tribos-text-200` | `#d0d5dc` | `#2d312f` |
| `--tribos-text-300` (secondary) | `#a0a8b4` | `#3d4240` |
| `--tribos-text-400` (muted) | `#6d7888` | `#5f6563` |
| `--tribos-text-500` | `#4a5363` | `#8a8e8c` |
| `--tribos-text-600` | `#2e343e` | `#b0b4b2` |

#### Borders

| Token | Dark | Light |
|-------|------|-------|
| `--tribos-border-subtle` | `#1a2029` | `#E5E8E6` |
| `--tribos-border-default` | `#2a3140` | `#D0D4D1` |
| `--tribos-border-hover` | `#3a4455` | `#B8BDB9` |

#### Accent Colors

| Color | Dark | Light |
|-------|------|-------|
| Green (primary) | `#4ade80` | `#22A822` |
| Green bright | `#86efac` | `#32CD32` |
| Amber | `#f5a623` | `#D4920A` |
| Blue | `#60a5fa` | `#2563EB` |
| Purple | `#a78bfa` | `#7C3AED` |
| Red | `#f87171` | `#DC2626` |

#### Training Zone Colors (hardcoded in `src/components/ui/zoneColors.js`)

| Zone | Color | Name |
|------|-------|------|
| 1 | `#3B82F6` | Recovery (blue) |
| 2 | `#22C55E` | Endurance (green) |
| 3 | `#EAB308` | Tempo (yellow) |
| 3.5 | `#f59e0b` | Sweet Spot (amber) |
| 4 | `#F97316` | Threshold (orange) |
| 5 | `#EF4444` | VO2max (red) |
| 6 | `#A855F7` | Anaerobic (purple) |
| 7 | `#EC4899` | Neuromuscular (pink) |

### Depth System

Pre-bundled JS objects in `theme.js`:

- **`depth.card`** — gradient background + layered shadows + edge highlight
- **`depth.accentCard`** — green-tinted border + green glow
- **`depth.recessed`** — inset shadow for input-like areas
- **`depth.panel`** — side panel gradient + panel shadow

> ⚠️ Depth presets use **hardcoded hex values** in gradient stops, not CSS variables.

---

## 2. Component Inventory

**122 total components** | ~95% Mantine-based | ~70% use CSS vars | ~30% hardcoded colors

### By Category

#### Buttons & Controls (3)
| Component | Path | Hardcoded? |
|-----------|------|-----------|
| PrimaryButton | `src/components/ui/PrimaryButton.jsx` | `color="lime"` |
| SecondaryButton | `src/components/ui/PrimaryButton.jsx` | `color="gray"` |
| MapControls | `src/components/MapControls.jsx` | Uses theme |

#### Badges & Chips (5)
| Component | Path | Hardcoded? |
|-----------|------|-----------|
| MetricBadge | `src/components/ui/MetricBadge.jsx` | CSS vars |
| StatusBadge | `src/components/ui/StatusBadge.jsx` | ✅ Status color map |
| DifficultyBadge | `src/components/DifficultyBadge.jsx` | ✅ Difficulty color map |
| FormStatusBadge | `src/components/ui/StatusBadge.jsx` | ✅ FRESH/READY/etc. colors |
| PriorityBadge | `src/components/ui/StatusBadge.jsx` | ✅ A/B/C race colors |

#### Cards & Containers (8)
| Component | Path | Hardcoded? |
|-----------|------|-----------|
| CoachCard | `src/components/coach/CoachCard.jsx` | depth presets + CSS vars |
| PlanCard | `src/components/training/PlanCard.jsx` | ✅ METHODOLOGY_COLORS |
| WorkoutCard | `src/components/planner/WorkoutCard.tsx` | Mantine color names |
| PersonalRecordsCard | `src/components/PersonalRecordsCard.jsx` | Theme tokens |
| FuelCard | `src/components/fueling/FuelCard.jsx` | Theme styling |
| AISuggestionCard | `src/components/AISuggestionCard.jsx` | Theme tokens |
| ActivePlanCard | `src/components/training/ActivePlanCard.jsx` | Theme styling |
| RoadPreferencesCard | `src/components/settings/RoadPreferencesCard.jsx` | Theme tokens |

#### Modals & Dialogs (7)
| Component | Path |
|-----------|------|
| HealthCheckInModal | `src/components/HealthCheckInModal.jsx` |
| RaceGoalModal | `src/components/RaceGoalModal.jsx` |
| OnboardingModal | `src/components/OnboardingModal.jsx` |
| FitUploadModal | `src/components/FitUploadModal.jsx` |
| CrossTrainingModal | `src/components/CrossTrainingModal.tsx` |
| PlanCustomizationModal | `src/components/training/PlanCustomizationModal.jsx` |
| ActivityLinkingModal | `src/components/training/ActivityLinkingModal.jsx` |

#### Navigation (4)
| Component | Path |
|-----------|------|
| AppShell | `src/components/AppShell.jsx` |
| BreadcrumbNav | `src/components/BreadcrumbNav.jsx` |
| CollapsibleSection | `src/components/CollapsibleSection.jsx` |
| PageHeader | `src/components/PageHeader.jsx` |

#### Charts & Data Viz (8)
| Component | Path |
|-----------|------|
| ZoneDistributionChart | `src/components/ZoneDistributionChart.jsx` |
| TrainingLoadChart | `src/components/TrainingLoadChart.jsx` |
| PowerDurationCurve | `src/components/PowerDurationCurve.jsx` |
| ActivityPowerCurve | `src/components/ActivityPowerCurve.jsx` |
| AerobicDecoupling | `src/components/AerobicDecoupling.jsx` |
| HealthTrendsChart | `src/components/HealthTrendsChart.jsx` |
| ElevationProfile | `src/components/ElevationProfile.jsx` |
| CriticalPowerModel | `src/components/CriticalPowerModel.jsx` |

#### Layout & Structural (5)
| Component | Path |
|-----------|------|
| BottomSheet | `src/components/BottomSheet.jsx` |
| StepIndicator | `src/components/StepIndicator.jsx` |
| CollapsibleSection | `src/components/CollapsibleSection.jsx` |
| LoadingSkeletons | `src/components/LoadingSkeletons.jsx` |
| EmptyState | `src/components/EmptyState.jsx` |

#### Coach/AI (8)
| Component | Path | Hardcoded? |
|-----------|------|-----------|
| AICoach | `src/components/AICoach.jsx` | Theme styled |
| CoachCard | `src/components/coach/CoachCard.jsx` | depth presets |
| CoachCommandBar | `src/components/coach/CoachCommandBar.jsx` | Theme styling |
| CoachQuickActions | `src/components/coach/CoachQuickActions.jsx` | Theme buttons |
| CoachResponseArea | `src/components/coach/CoachResponseArea.jsx` | Theme text |
| TrainingPlanPreview | `src/components/coach/TrainingPlanPreview.jsx` | Theme tokens |
| Pulse | `src/components/Pulse.jsx` | ✅ `#F97316` hardcoded |
| AccountabilityCoach | `src/components/AccountabilityCoach.jsx` | Theme styling |

#### Specialized (10+)
RouteBuilder/*, Planner/*, WeatherWidget, SavedRoutesDrawer, RideAnalysisModal, RideHistoryTable, RecentRidesMap, ColoredRouteMap

### Hardcoded Color Hotspots

Files requiring manual color updates during rebrand:

1. `src/components/ui/zoneColors.js` — 7 zone hex colors + utility functions
2. `src/components/ui/StatusBadge.jsx` — status-specific color map
3. `src/components/DifficultyBadge.jsx` — easy/moderate/hard/recovery/intervals colors
4. `src/components/Pulse.jsx` — `primary: '#F97316'` (orange)
5. `src/components/training/PlanCard.jsx` — METHODOLOGY_COLORS
6. `src/components/EmptyState.jsx` — `gradient={{ from: 'teal', to: 'cyan' }}`
7. `src/theme.js` — depth preset gradient hex values

---

## 3. Dark Mode Status

**Status: Fully implemented and production-ready**

### Implementation

- **Provider:** `<MantineProvider defaultColorScheme="dark">` in `App.jsx`
- **Script:** `<ColorSchemeScript defaultColorScheme="dark" />` for SSR-safe init
- **Hook:** `useMantineColorScheme()` → `colorScheme`, `setColorScheme`, `toggleColorScheme`
- **Custom hook:** `src/hooks/useThemeTokens.js` → `isDark`, `isLight`, all token values

### Toggle Locations

1. **AppShell header** — Sun/Moon ActionIcon (primary toggle)
2. **Settings page** — Dark/Light button pair

### CSS Mechanism

```css
:root, :root[data-mantine-color-scheme='dark'] { /* dark vars (default) */ }
:root[data-mantine-color-scheme='light'] { /* light vars */ }
```

### What's NOT Used

- ❌ `next-themes`
- ❌ Tailwind `dark:` classes
- ❌ `prefers-color-scheme` media query (Mantine handles OS pref internally)
- ❌ `.dark` class or `[data-theme]` attribute

---

## 4. Font Loading

### Fonts in Use

| Font | Role | Weights | Source |
|------|------|---------|--------|
| DM Sans | Body + headings | 400-700 (variable) + italic | Google Fonts |
| JetBrains Mono | Code/monospace | 400, 500, 600 | Google Fonts |

### Loading Method

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

### Application

- `global.css` body: `font-family: 'DM Sans', -apple-system, ...system-stack`
- `theme.js` Mantine: `fontFamily`, `fontFamilyMonospace`, heading config
- Headings: DM Sans bold (700), h1=26px, h2=20px, h3=16px, h4=14px
- Letter-spacing: -0.01em, line-height: 1.5, antialiased rendering
- Service worker caches font files for 30 days (CacheFirst)
- No local font files — all loaded from Google Fonts CDN

### To Change Fonts

1. Update `<link>` in `index.html`
2. Update `fontFamily` + `fontFamilyMonospace` in `theme.js`
3. Update `font-family` in `global.css` body rule
4. Update `.initial-loader-text` in `index.html` inline styles

---

## 5. Layout Patterns

### Provider Hierarchy

```
StrictMode
└── PostHogProvider (analytics)
    └── HelmetProvider (SEO)
        └── MantineProvider (theme)
            └── DatesProvider (dates config)
                └── ErrorBoundary
                    └── Notifications
                        └── AuthProvider (Supabase)
                            └── UserPreferencesProvider (units, timezone)
                                └── CoachCommandBarProvider
                                    └── BrowserRouter
                                        └── AppRoutes
```

### AppShell (`src/components/AppShell.jsx`)

```
Box (min-height: 100dvh, --tribos-bg-primary)
├── Header (sticky, 56px, z-index: 100)
│   └── Logo + Desktop Nav (5 items) + Theme Toggle + Feedback
├── Main Content Area
├── Footer (desktop only: Privacy, Terms, Contact)
└── Mobile Bottom Tab Bar (fixed, 64px, 5 icon tabs)
```

**Responsive:** Desktop horizontal nav → Mobile bottom tab bar at 768px breakpoint

### Typical Page Pattern

```jsx
<AppShell>
  <Container size="xl" py="lg">
    <PageHeader title="..." subtitle="..." actions={...} />
    <Stack gap="lg">
      {/* page content */}
    </Stack>
  </Container>
</AppShell>
```

### Container Sizes

| Size | Use |
|------|-----|
| `xs` (36rem) | Auth forms |
| `md` (48rem) | Admin pages |
| `lg` (64rem) | Community pages |
| `xl` (88rem) | Dashboard, Settings (most common) |
| `100%` | RouteBuilder (full-width map) |

### Routes (11 total)

| Route | Auth | Layout |
|-------|------|--------|
| `/` | Public | No AppShell (landing page) |
| `/auth` | Public | Minimal |
| `/dashboard` | Protected | Standard AppShell |
| `/routes/new`, `/routes/:id` | Protected | Full-width AppShell |
| `/planner` | Protected | Standard AppShell |
| `/training` | Protected | Standard AppShell |
| `/community` | Protected | Standard AppShell |
| `/settings` | Protected | Standard AppShell |
| `/admin` | Protected | Standard AppShell |

### Responsive Patterns

- **Primary breakpoint:** 768px (`useMediaQuery`)
- **Grids:** `SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}`
- **Modals:** Full viewport on mobile
- **Touch targets:** 44px minimum
- **Input font-size:** 16px (prevents iOS zoom)
- **Safe area insets:** `env(safe-area-inset-bottom)` support

### Breakpoints (from theme.js)

```
xs: 480px   — Small phones
sm: 768px   — Tablets / primary mobile breakpoint
md: 1024px  — Small laptops
lg: 1200px  — Desktops
xl: 1400px  — Large desktops
```

---

## Rebranding Checklist

### To change the color palette:
1. Update CSS variables in `src/styles/global.css` (both dark and light blocks)
2. Update `darkTokens` and `lightTokens` in `src/theme.js`
3. Update Mantine `colors.green` array in `theme.js`
4. Update `depth` preset gradient hex values in `theme.js`
5. Update hardcoded colors in ~7 component files (listed above)
6. Update `<meta name="theme-color">` in `index.html`
7. Update critical CSS colors in `index.html` inline styles

### To change fonts:
1. Update Google Fonts `<link>` in `index.html`
2. Update `fontFamily` and heading `fontFamily` in `theme.js`
3. Update `font-family` in `global.css` body rule
4. Update `.initial-loader-text` font-family in `index.html`

### To change the logo:
1. Update logo reference in `AppShell.jsx` header
2. Update PWA icons if applicable (`vite.config.js` + `public/`)

### To modify layout/spacing:
1. Update `sharedTokens` in `theme.js` (spacing, radius scales)
2. Update Mantine component overrides in `theme.js`
3. Update `global.css` responsive rules
