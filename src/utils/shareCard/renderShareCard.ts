/**
 * Canvas 2D renderer for the activity share card.
 *
 * Draws a fixed-size branded card (1080×1350 post / 1080×1920 story) fully
 * client-side: Tribos header, activity title, Mapbox Static Images route map
 * (already privacy-trimmed), big stat tiles, and provider attribution.
 *
 * No DOM-to-image library — hand layout keeps output deterministic across
 * browsers and avoids webfont/CORS flakiness on iOS Safari.
 */
import { STRAVA_LOGO_PATH, STRAVA_ORANGE } from '../../components/StravaBranding';
import { getActivityNoun, getLoadLabel } from '../sportType';

// Structural shape sportType.ts helpers accept (its ActivityLike is unexported).
type ActivityLike = {
  sport_type?: string | null;
  type?: string | null;
  average_watts?: number | null;
  device_watts?: boolean | null;
};
import { decodePolyline, trimPolylineEnds, type LngLat } from './geometry';
import { buildShareMapUrl, type CardTheme } from './staticMap';
import { formatCardDate, formatCardDuration, splitValueUnit, truncateToWidth } from './format';

export type CardFormat = 'portrait' | 'story';

export interface ShareCardMetrics {
  /** Kilometers (RideAnalysisModal metrics memo convention). */
  distance: number;
  /** Meters. */
  elevation: number;
  /** Seconds. */
  duration: number;
  avgPower: number;
  avgHR: number;
  avgSpeed: number;
  powerTSS: number | null;
  estimatedTSS: number | null;
  powerSport: boolean;
}

export interface RenderShareCardOptions {
  ride: Record<string, unknown>;
  metrics: ShareCardMetrics | null;
  formatDistance?: (km: number) => string;
  formatElevation?: (m: number) => string;
  formatSpeed?: (kmh: number) => string;
  theme: CardTheme;
  format: CardFormat;
  showMap: boolean;
  trim_m: number;
}

export interface RenderShareCardResult {
  /** True when a map was requested but failed to load (card rendered stats-only). */
  mapFellBack: boolean;
}

export const CARD_DIMENSIONS: Record<CardFormat, { width_px: number; height_px: number }> = {
  portrait: { width_px: 1080, height_px: 1350 },
  story: { width_px: 1080, height_px: 1920 },
};

const PADDING_X = 64;
const CONTENT_W = 1080 - PADDING_X * 2; // 952

const MAP_LOAD_TIMEOUT_MS = 8000;

interface Palette {
  bg: string;
  text: string;
  secondary: string;
  muted: string;
  accent: string;
  border: string;
}

// Mirrors --color-* tokens in src/styles/global.css (light + dark themes).
const PALETTES: Record<CardTheme, Palette> = {
  dark: {
    bg: '#141410',
    text: '#F4F4F2',
    secondary: '#B9B8B0',
    muted: '#8A897F',
    accent: '#3BA89D',
    border: '#2E2E2A',
  },
  light: {
    bg: '#F4F4F2',
    text: '#141410',
    secondary: '#3D3C36',
    muted: '#7A7970',
    accent: '#2A8C82',
    border: '#DDDDD8',
  },
};

// Every face/weight drawn below — loaded up-front so fillText never falls
// back to a system font mid-render (fonts are already page-loaded from
// Google Fonts in index.html; this resolves from cache).
const FONT_SPECS = [
  '800 64px "Barlow Condensed"',
  '600 22px "Barlow Condensed"',
  '600 28px "Barlow Condensed"',
  '600 46px Barlow',
  '700 26px Barlow',
  '300 17px "DM Mono"',
  '400 24px "DM Mono"',
  '400 26px "DM Mono"',
  '400 36px "DM Mono"',
  '500 48px "DM Mono"',
  '500 92px "DM Mono"',
];

export async function renderShareCard(
  canvas: HTMLCanvasElement,
  options: RenderShareCardOptions,
): Promise<RenderShareCardResult> {
  const { ride, theme, format, showMap, trim_m } = options;
  const { width_px, height_px } = CARD_DIMENSIONS[format];
  const palette = PALETTES[theme];

  canvas.width = width_px;
  canvas.height = height_px;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  await loadFonts();

  // Fetch the map image first (if any) so the card paints in one pass.
  const isStory = format === 'story';
  const mapRegion = {
    x: PADDING_X,
    y: 336,
    w: CONTENT_W,
    h: isStory ? 1080 : 570,
  };

  let mapImage: HTMLImageElement | null = null;
  let mapFellBack = false;
  if (showMap) {
    const coords = getRouteCoords(ride);
    const trimmed = trimPolylineEnds(coords, trim_m);
    const url = buildShareMapUrl({
      coords: trimmed,
      theme,
      // Static API request is half-size + @2x → exact region pixel size.
      width_px: Math.round(mapRegion.w / 2),
      height_px: Math.round(mapRegion.h / 2),
    });
    if (url) {
      try {
        mapImage = await loadImage(url, MAP_LOAD_TIMEOUT_MS);
      } catch {
        mapFellBack = true;
      }
    } else {
      mapFellBack = true;
    }
  }

  // ── Background ──────────────────────────────────────────────────────
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width_px, height_px);
  ctx.textBaseline = 'alphabetic';

  // ── Header ──────────────────────────────────────────────────────────
  ctx.fillStyle = palette.text;
  ctx.font = '800 64px "Barlow Condensed"';
  drawLetterSpaced(ctx, 'TRIBOS', PADDING_X, 104, 4);

  ctx.fillStyle = palette.muted;
  ctx.font = '600 22px "Barlow Condensed"';
  drawLetterSpaced(ctx, 'DEPARTMENT OF CYCLING INTELLIGENCE', PADDING_X, 140, 4);

  ctx.fillStyle = palette.accent;
  ctx.fillRect(PADDING_X, 162, CONTENT_W, 3);

  // ── Title block ─────────────────────────────────────────────────────
  const name = typeof ride.name === 'string' && ride.name.trim() ? ride.name.trim() : 'Untitled activity';
  ctx.fillStyle = palette.text;
  ctx.font = '600 46px Barlow';
  ctx.fillText(truncateToWidth(ctx, name, CONTENT_W), PADDING_X, 248);

  const dateLine = [formatCardDate(ride.start_date_local as string | undefined), getActivityNoun(ride as ActivityLike).toUpperCase()]
    .filter(Boolean)
    .join(' · ');
  ctx.fillStyle = palette.muted;
  ctx.font = '400 26px "DM Mono"';
  ctx.fillText(dateLine, PADDING_X, 296);

  // ── Map / stats ─────────────────────────────────────────────────────
  const hasMap = mapImage !== null;
  if (hasMap && mapImage) {
    drawImageCover(ctx, mapImage, mapRegion.x, mapRegion.y, mapRegion.w, mapRegion.h);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(mapRegion.x + 1, mapRegion.y + 1, mapRegion.w - 2, mapRegion.h - 2);

    // Mapbox requires attribution on images that leave the app — the URL is
    // built with attribution=false, so the credit MUST be drawn here.
    drawMapAttribution(ctx, mapRegion);
    drawStatsGrid(ctx, options, palette, mapRegion.y + mapRegion.h + 20);
  } else {
    drawStatsStacked(ctx, options, palette, mapRegion, isStory);
  }

  // ── Footer ──────────────────────────────────────────────────────────
  const footerRuleY = isStory ? 1812 : 1252;
  const footerBaseline = isStory ? 1876 : 1310;
  ctx.fillStyle = palette.border;
  ctx.fillRect(PADDING_X, footerRuleY, CONTENT_W, 2);

  ctx.fillStyle = palette.muted;
  ctx.font = '400 24px "DM Mono"';
  ctx.fillText('tribos.studio', PADDING_X, footerBaseline);

  drawProviderAttribution(ctx, ride, theme, palette, footerBaseline);

  return { mapFellBack };
}

// ── Stats layouts ─────────────────────────────────────────────────────

interface StatEntry {
  label: string;
  value: string;
  unit: string;
}

function getPrimaryStats(options: RenderShareCardOptions): StatEntry[] {
  const { metrics, formatDistance, formatElevation } = options;
  const distance_km = metrics?.distance ?? 0;
  const elevation_m = metrics?.elevation ?? 0;

  const distStr = formatDistance ? formatDistance(distance_km) : `${distance_km.toFixed(1)} km`;
  const elevStr = formatElevation ? formatElevation(elevation_m) : `${Math.round(elevation_m)} m`;
  const dist = splitValueUnit(distStr);
  const elev = splitValueUnit(elevStr);

  return [
    { label: 'DISTANCE', value: dist.value, unit: dist.unit },
    { label: 'ELEVATION', value: elev.value, unit: elev.unit },
    { label: 'TIME', value: formatCardDuration(metrics?.duration), unit: '' },
  ];
}

function getSecondaryStats(options: RenderShareCardOptions): StatEntry[] {
  const { ride, metrics, formatSpeed } = options;
  if (!metrics) return [];
  const stats: StatEntry[] = [];

  if (metrics.powerSport && metrics.avgPower > 0) {
    stats.push({ label: 'AVG POWER', value: `${Math.round(metrics.avgPower)}`, unit: 'W' });
  }
  const load = metrics.powerTSS ?? metrics.estimatedTSS;
  if (load && load > 0) {
    stats.push({
      label: getLoadLabel(ride as ActivityLike).toUpperCase(),
      value: `${Math.round(load)}`,
      unit: '',
    });
  }
  if (metrics.avgSpeed > 0) {
    const spd = splitValueUnit(formatSpeed ? formatSpeed(metrics.avgSpeed) : `${metrics.avgSpeed.toFixed(1)} km/h`);
    stats.push({ label: 'AVG SPEED', value: spd.value, unit: spd.unit });
  } else if (metrics.avgHR > 0) {
    stats.push({ label: 'AVG HR', value: `${Math.round(metrics.avgHR)}`, unit: 'bpm' });
  }
  return stats.slice(0, 3);
}

/** Standard layout under the map: 3-col primary grid + optional secondary row. */
function drawStatsGrid(
  ctx: CanvasRenderingContext2D,
  options: RenderShareCardOptions,
  palette: Palette,
  top_y: number,
) {
  const primary = getPrimaryStats(options);
  const secondary = getSecondaryStats(options);
  const colW = CONTENT_W / 3;

  primary.forEach((stat, i) => {
    const x = PADDING_X + i * colW;
    ctx.fillStyle = palette.muted;
    ctx.font = '600 28px "Barlow Condensed"';
    drawLetterSpaced(ctx, stat.label, x, top_y + 44, 3);
    drawStatValue(ctx, stat, x, top_y + 140, colW - 32, 92, palette);
    if (i > 0) {
      ctx.fillStyle = palette.border;
      ctx.fillRect(x - 16, top_y + 16, 2, 132);
    }
  });

  if (secondary.length > 0) {
    const secTop = top_y + 190;
    secondary.forEach((stat, i) => {
      const x = PADDING_X + i * colW;
      ctx.fillStyle = palette.muted;
      ctx.font = '600 22px "Barlow Condensed"';
      drawLetterSpaced(ctx, stat.label, x, secTop + 26, 3);
      drawStatValue(ctx, stat, x, secTop + 82, colW - 32, 48, palette);
    });
  }
}

/** No-map layout: primary stats stacked large, centered in the vacated region. */
function drawStatsStacked(
  ctx: CanvasRenderingContext2D,
  options: RenderShareCardOptions,
  palette: Palette,
  region: { x: number; y: number; w: number; h: number },
  isStory: boolean,
) {
  const primary = getPrimaryStats(options);
  const secondary = getSecondaryStats(options);

  const regionBottom = region.y + region.h + (isStory ? 370 : 320);
  const rows = primary.length;
  const rowH = isStory ? 300 : 250;
  const blockH = rows * rowH;
  let y = region.y + Math.max(40, (regionBottom - region.y - blockH) / 2);

  primary.forEach((stat) => {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(PADDING_X, y + 12, 6, rowH - 96);

    const x = PADDING_X + 40;
    ctx.fillStyle = palette.muted;
    ctx.font = '600 28px "Barlow Condensed"';
    drawLetterSpaced(ctx, stat.label, x, y + 44, 3);
    drawStatValue(ctx, stat, x, y + rowH - 96, CONTENT_W - 40, isStory ? 128 : 110, palette);
    y += rowH;
  });

  if (secondary.length > 0) {
    const line = secondary
      .map((s) => `${s.label} ${s.value}${s.unit ? ` ${s.unit}` : ''}`)
      .join('   ·   ');
    ctx.fillStyle = palette.secondary;
    ctx.font = '400 26px "DM Mono"';
    ctx.fillText(truncateToWidth(ctx, line, CONTENT_W), PADDING_X, y + 30);
  }
}

/** Big numeral + smaller unit, auto-shrinking the numeral to fit maxWidth_px. */
function drawStatValue(
  ctx: CanvasRenderingContext2D,
  stat: StatEntry,
  x: number,
  baseline_y: number,
  maxWidth_px: number,
  fontSize_px: number,
  palette: Palette,
) {
  const unitFont = `400 ${Math.max(20, Math.round(fontSize_px * 0.4))}px "DM Mono"`;
  ctx.font = unitFont;
  const unitW = stat.unit ? ctx.measureText(stat.unit).width + 12 : 0;

  let size = fontSize_px;
  ctx.font = `500 ${size}px "DM Mono"`;
  while (size > 24 && ctx.measureText(stat.value).width + unitW > maxWidth_px) {
    size -= 4;
    ctx.font = `500 ${size}px "DM Mono"`;
  }

  ctx.fillStyle = palette.text;
  ctx.fillText(stat.value, x, baseline_y);
  if (stat.unit) {
    const valueW = ctx.measureText(stat.value).width;
    ctx.fillStyle = palette.secondary;
    ctx.font = unitFont;
    ctx.fillText(stat.unit, x + valueW + 12, baseline_y);
  }
}

// ── Attribution ───────────────────────────────────────────────────────

function drawMapAttribution(
  ctx: CanvasRenderingContext2D,
  region: { x: number; y: number; w: number; h: number },
) {
  const text = '© Mapbox © OpenStreetMap';
  ctx.font = '300 17px "DM Mono"';
  const textW = ctx.measureText(text).width;
  const pad = 8;
  const boxW = textW + pad * 2;
  const boxH = 28;
  const bx = region.x + region.w - boxW;
  const by = region.y + region.h - boxH;
  ctx.fillStyle = 'rgba(20, 20, 16, 0.55)';
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.fillStyle = 'rgba(244, 244, 242, 0.9)';
  ctx.fillText(text, bx + pad, by + 19);
}

function drawProviderAttribution(
  ctx: CanvasRenderingContext2D,
  ride: Record<string, unknown>,
  theme: CardTheme,
  palette: Palette,
  baseline_y: number,
) {
  const provider = typeof ride.provider === 'string' ? ride.provider : null;
  const rightEdge = 1080 - PADDING_X;

  if (provider === 'strava') {
    // Contractual: Strava data shown outside the app must carry
    // "Powered by Strava" (white on dark, orange on light per guidelines).
    const stravaColor = theme === 'dark' ? '#FFFFFF' : STRAVA_ORANGE;
    const logoSize = 28;

    ctx.font = '700 26px Barlow';
    const stravaW = measureLetterSpaced(ctx, 'STRAVA', 2);
    ctx.font = '400 24px "DM Mono"';
    const poweredW = ctx.measureText('POWERED BY').width;

    let x = rightEdge - stravaW;
    const logoX = x - logoSize - 8;
    const poweredX = logoX - poweredW - 12;

    ctx.fillStyle = palette.muted;
    ctx.fillText('POWERED BY', poweredX, baseline_y);

    const path = new Path2D(STRAVA_LOGO_PATH);
    ctx.save();
    ctx.translate(logoX, baseline_y - logoSize + 4);
    ctx.scale(logoSize / 24, logoSize / 24);
    ctx.fillStyle = stravaColor;
    ctx.fill(path);
    ctx.restore();

    ctx.fillStyle = stravaColor;
    ctx.font = '700 26px Barlow';
    drawLetterSpaced(ctx, 'STRAVA', x, baseline_y, 2);
  } else if (provider === 'garmin') {
    ctx.fillStyle = palette.muted;
    ctx.font = '400 24px "DM Mono"';
    const text = 'POWERED BY GARMIN';
    ctx.fillText(text, rightEdge - ctx.measureText(text).width, baseline_y);
  }
}

// ── Drawing/loading helpers ───────────────────────────────────────────

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.all(FONT_SPECS.map((spec) => document.fonts.load(spec)));
    await document.fonts.ready;
  } catch {
    // Offline / font failure degrades to system fonts — still render.
  }
}

function loadImage(url: string, timeout_ms: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.src = '';
      reject(new Error('Map image timed out'));
    }, timeout_ms);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Map image failed to load'));
    };
    // MUST be set before src or the canvas taints and toBlob() throws.
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Per-character letterspacing (Safari <17.4 lacks ctx.letterSpacing). */
function drawLetterSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing_px: number,
): number {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing_px;
  }
  return cursor - spacing_px;
}

function measureLetterSpaced(ctx: CanvasRenderingContext2D, text: string, spacing_px: number): number {
  let width = 0;
  for (const ch of text) width += ctx.measureText(ch).width + spacing_px;
  return width - spacing_px;
}

/** Extract the encoded polyline from the ride row's historical field variants. */
function getRouteCoords(ride: Record<string, unknown>): LngLat[] {
  const encoded =
    (ride.map_summary_polyline as string | undefined) ||
    (ride.summary_polyline as string | undefined) ||
    (ride.polyline as string | undefined) ||
    ((ride.map as { summary_polyline?: string } | undefined)?.summary_polyline);
  return decodePolyline(encoded) as LngLat[];
}

export function hasRoutePolyline(ride: Record<string, unknown> | null | undefined): boolean {
  if (!ride) return false;
  return Boolean(
    ride.map_summary_polyline ||
    ride.summary_polyline ||
    ride.polyline ||
    (ride.map as { summary_polyline?: string } | undefined)?.summary_polyline,
  );
}
