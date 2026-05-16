# P1.3 Discovery Report

Brief discovery findings to confirm assumptions before building.

## Styling system

Inline `style={{...}}` on Mantine `<Box>` / `<Text>` is the dominant pattern.
There are no CSS modules, no styled-components, and no Tailwind. Brand colors
live as raw hex codes in JSX (e.g. `#2A8C82`, `#141410`, `#F4F4F2`). Some
shared CSS variables exist (`var(--color-bg)`, `var(--color-teal)`,
`var(--tribos-*)`) and are preferred for color references where available;
hex codes are fine where the variable doesn't exist or the override is
local. We will match this convention — inline styles on Mantine primitives,
brand hex codes (or vars where they exist) sourced from `src/theme.js` and
the design-system notes in the spec.

## Existing sub-components

`src/components/RouteBuilder/index.js` already re-exports a handful of
constants/components useful for the new page:

- `MAPBOX_TOKEN`, `BASEMAP_STYLES`, `CYCLOSM_STYLE`, `WAYPOINT_COLORS`
- `BikeInfrastructureLayer`, `RoutePOILayer`, `ElevationProfile`,
  `RouteStatsPanel`, `RouteExportMenu`, `MapControls`,
  `BikeInfrastructureLegend`, `CollapsibleSection`,
  `MapTutorialOverlay`, `RoutePreviewMap`

`AlternativeRouteLayers.jsx` and `AIEditPanel.jsx` live alongside but are
not exported through the barrel. `WaypointList.jsx` is also unused
elsewhere. We treat these as reusable visual primitives: the new page
imports `BikeInfrastructureLayer` and `RoutePOILayer` directly so we
don't have to port their Mapbox sources.

## Mapbox setup specifics

`react-map-gl` `<Map>` + `Marker` + `Source` + `Layer` imports.
`MAPBOX_TOKEN` is `import.meta.env.VITE_MAPBOX_TOKEN`, re-exported from
`src/components/RouteBuilder/index.js`. Styles come from `BASEMAP_STYLES`;
default is `'mapbox://styles/mapbox/dark-v11'`. CSS import:
`import 'mapbox-gl/dist/mapbox-gl.css'`. There is no `useMapboxToken` hook —
the token is read straight off the environment.

## Existing nav (AppShell)

`AppShell.jsx` is a layout component pages wrap themselves in. The nav bar
is hard-coded into AppShell at height 60. The decision in the spec ("render
the dropdown only on /route-builder-2 initially") means we don't modify
AppShell; we render the `<PersonaDropdown />` inside `RouteBuilder2.tsx`
positioned to sit visually next to the nav (top of map, top-right or
top-left of the content area). That keeps AppShell stable for non-v2
pages.

## Persona state

`useCoachCheckIn(userId)` exposes `persona: PersonaId` and
`savePersona(id, 'manual')`. Persona is stored in
`user_coach_settings.coaching_persona`. We consume that hook directly.

`PersonaId = 'hammer' | 'scientist' | 'encourager' | 'pragmatist' | 'competitor'`.

## Responsive breakpoints

`useMediaQuery('(max-width: 768px)')` from `@mantine/hooks` — used in
`RouteBuilder.jsx` and `AppShell.jsx`. No bespoke hook; we use the
Mantine helper as-is. 768px is the project's "mobile" boundary.

## Brand-token enforcement

Colors are referenced as hex codes in inline styles. `src/theme.js`
defines the Mantine color tuples but the page-level styling is inline
hex throughout the codebase. We will follow that pattern. The Tribos
palette from the spec is the source of truth; references to the old
blue (`#3A5A8C`) are forbidden.

## Notes on scope adjustments

- **Mobile parallel design** is implemented as a single component tree
  that branches on `isMobile` at composition points (specifically
  `<ChatShell />` chooses `<ChatPanel />` vs `<ChatDrawer />`, and the
  page-level layout switches between desktop overlays and mobile sheets).
  Each branch renders a different DOM structure — this satisfies the
  "parallel build, not media-query overrides" requirement while keeping
  one entry point.
- **Persona dropdown placement** is inside the page (top-right of the
  map area) rather than appended to `AppShell`. Modifying `AppShell` to
  conditionally render the dropdown only on `/route-builder-2` would
  add coupling between a layout component and a specific page, which
  the project otherwise avoids.
- **Layer toggles** include surface, gradient, POI, bike infra, and
  familiar segments per the spec. POI is the only one P1.2's
  `useRouteAnalysis` directly supports. Surface, gradient, bike infra,
  and familiar segments are local UI state (toggles); when toggled on,
  they swap the rendered layer source. Familiar-segments is rendered
  in a disabled state with a "Connect Strava to enable" tooltip when
  the user has no Strava connection (data is unavailable until Phase 2
  wires the familiarity service).
