/**
 * RepeatsGrid — the REPEATS comparison as a sector grid: one row per effort,
 * one column per equal stretch of the anchor, each cell the effort's average
 * of one metric over that stretch, shaded by how it sits against the
 * sector's median across the efforts shown.
 *
 * Why cells and not lines: the stored streams are RDP-simplified, so a long
 * straight is a couple of instantaneous samples (see utils/repeatSectors).
 * A sector average is what the data can honestly say; a sector without
 * enough samples is left blank.
 *
 * Same scrub contract as RepeatsStrip: hovering a column reports the
 * sector's midpoint in km, so the map markers and legend readouts follow.
 */
import { useMemo } from "react";
import { Box, Text } from "@mantine/core";
import type { StreamRow } from "../../utils/streamChartData";
import {
  binEffort,
  gridSectorCount,
  sectorBounds,
  sectorIndexAt,
  sectorMedians,
  sectorSpreads,
  type SectorKey,
} from "../../utils/repeatSectors";
import type { RepeatMetric } from "./RepeatsStrip";

const ROW_KEY: Record<RepeatMetric, SectorKey> = {
  power: "power",
  heartRate: "heartRate",
  speed: "speed_kmh",
};

export interface RepeatsGridEffort {
  id: string;
  color: string;
  label: string;
  rows: StreamRow[] | null;
}

export interface RepeatsGridProps {
  efforts: RepeatsGridEffort[];
  metric: RepeatMetric;
  unit?: string;
  /** Distance domain end, km (the anchor's length). */
  xMaxKm: number;
  /** Rows carrying the anchor's elevation, drawn as the header profile. */
  elevationRows?: StreamRow[] | null;
  hoverX: number | null;
  onHoverX: (x: number | null) => void;
}

/** Samples a sector needs before its average is shown. */
const MIN_SAMPLES = 3;
const LABEL_W = 108;
const CELL_MIN_W = 48;
const PROFILE_H = 34;
const MAX_TINT = 0.5;

const MONO = "'Courier Prime', monospace";
const BORDER = "var(--color-border)";
const ABOVE = "var(--color-signal)";
const BELOW = "var(--color-easy)";

function formatKm(km: number): string {
  return km >= 10 ? km.toFixed(0) : km.toFixed(1).replace(/\.0$/, "");
}

export default function RepeatsGrid({
  efforts,
  metric,
  unit = "",
  xMaxKm,
  elevationRows = null,
  hoverX,
  onHoverX,
}: RepeatsGridProps) {
  const key = ROW_KEY[metric];

  const model = useMemo(() => {
    const edges = sectorBounds(xMaxKm, gridSectorCount(xMaxKm));
    const sectors = edges.length - 1;
    const rows = efforts.map((e) => ({
      ...e,
      bins: e.rows ? binEffort(e.rows, key, edges, MIN_SAMPLES) : null,
    }));
    const filled = rows.filter((r) => r.bins).map((r) => r.bins!);
    const medians = sectorMedians(filled);
    const spreads = sectorSpreads(filled);

    // Header profile: the anchor's elevation, min–max scaled into the band.
    let profile = "";
    const pts = (elevationRows ?? [])
      .filter((r) => r.elevation_m != null && r.x >= 0 && r.x <= edges[sectors])
      .map((r) => [r.x, r.elevation_m as number] as const);
    if (pts.length > 1) {
      const elevs = pts.map(([, e]) => e);
      const eMin = Math.min(...elevs);
      const eSpan = Math.max(...elevs) - eMin || 1;
      const len = edges[sectors] || 1;
      const line = pts
        .map(
          ([x, e], i) =>
            `${i === 0 ? "M" : "L"}${((x / len) * 1000).toFixed(1)} ${(100 - ((e - eMin) / eSpan) * 90).toFixed(1)}`,
        )
        .join(" ");
      profile = `${line} L${((pts[pts.length - 1][0] / len) * 1000).toFixed(1)} 100 L${((pts[0][0] / len) * 1000).toFixed(1)} 100 Z`;
    }

    return { edges, sectors, rows, medians, spreads, profile };
  }, [efforts, key, xMaxKm, elevationRows]);

  const { edges, sectors, rows, medians, spreads, profile } = model;
  const hoverSector =
    hoverX != null && Number.isFinite(hoverX) ? sectorIndexAt(edges, hoverX) : null;
  const anyValue = rows.some((r) => r.bins?.some((b) => b.mean != null));

  const columns = `${LABEL_W}px repeat(${sectors}, minmax(${CELL_MIN_W}px, 1fr))`;
  const mid = (i: number) => (edges[i] + edges[i + 1]) / 2;

  const cellBase = {
    position: "relative" as const,
    height: 34,
    borderLeft: `1px solid ${BORDER}`,
    borderTop: `1px solid ${BORDER}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const stickyLabel = {
    position: "sticky" as const,
    left: 0,
    zIndex: 1,
    background: "var(--color-card)",
  };
  const columnFocus = (i: number) =>
    hoverSector === i ? { outline: "1px solid var(--color-ink)", outlineOffset: -1 } : null;

  return (
    <Box
      data-testid="repeats-grid"
      style={{ borderTop: `1px solid ${BORDER}`, background: "var(--color-card)" }}
    >
      <Box style={{ overflowX: "auto" }} onPointerLeave={() => onHoverX(null)}>
        <Box
          role="grid"
          aria-label={`Average ${metric === "heartRate" ? "heart rate" : metric} by sector`}
          style={{ display: "grid", gridTemplateColumns: columns, minWidth: "100%" }}
        >
          {/* Header: unit, then the elevation profile across every sector. */}
          <Box style={{ ...stickyLabel, height: PROFILE_H, display: "flex", alignItems: "flex-end", padding: "0 8px 4px 16px" }}>
            <Text style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "1px", color: "var(--color-text-muted)" }}>
              {unit ? `AVG ${unit}` : ""}
            </Text>
          </Box>
          <Box style={{ gridColumn: `2 / span ${sectors}`, height: PROFILE_H, position: "relative" }}>
            {profile && (
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: "block" }} aria-hidden="true">
                <path d={profile} fill="var(--color-text-muted)" fillOpacity={0.2} />
              </svg>
            )}
          </Box>

          {/* Sector distance labels. */}
          <Box style={{ ...stickyLabel, borderTop: `1px solid ${BORDER}` }} />
          {Array.from({ length: sectors }, (_, i) => (
            <Box
              key={`h${i}`}
              onPointerEnter={() => onHoverX(mid(i))}
              style={{ ...cellBase, height: 22, ...columnFocus(i) }}
            >
              <Text style={{ fontFamily: MONO, fontSize: 9, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                {formatKm(edges[i])}–{formatKm(edges[i + 1])} km
              </Text>
            </Box>
          ))}

          {rows.map((r) => (
            <Box key={r.id} role="row" style={{ display: "contents" }}>
              <Box
                role="rowheader"
                style={{ ...stickyLabel, borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 16px", height: 34 }}
              >
                <span style={{ width: 10, height: 10, background: r.color, display: "inline-block", flexShrink: 0 }} />
                <Text style={{ fontFamily: MONO, fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                  {r.label}
                </Text>
              </Box>
              {Array.from({ length: sectors }, (_, i) => {
                const v = r.bins?.[i]?.mean ?? null;
                const med = medians[i];
                let tint: string | null = null;
                let alpha = 0;
                if (v != null && med != null && spreads[i] > 0) {
                  const d = v - med;
                  tint = d > 0 ? ABOVE : d < 0 ? BELOW : null;
                  alpha = Math.min(1, Math.abs(d) / (spreads[i] / 2)) * MAX_TINT;
                }
                return (
                  <Box
                    key={i}
                    role="gridcell"
                    data-testid={`repeats-cell-${r.id}-${i}`}
                    onPointerEnter={() => onHoverX(mid(i))}
                    style={{ ...cellBase, ...columnFocus(i) }}
                  >
                    {tint && alpha > 0 && (
                      <span
                        aria-hidden="true"
                        style={{ position: "absolute", inset: 0, background: tint, opacity: alpha, pointerEvents: "none" }}
                      />
                    )}
                    <Text
                      style={{
                        position: "relative",
                        fontFamily: MONO,
                        fontSize: 12,
                        fontWeight: 700,
                        color: v == null ? "var(--color-text-muted)" : "var(--color-text-primary)",
                      }}
                    >
                      {v == null ? "·" : Math.round(v)}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "8px 16px", borderTop: `1px solid ${BORDER}` }}
      >
        {anyValue ? (
          <>
            <LegendSwatch color={ABOVE} label="Above the sector median" />
            <LegendSwatch color={BELOW} label="Below" />
            <Text style={{ fontFamily: MONO, fontSize: 10, color: "var(--color-text-muted)" }}>
              · = too few samples on that stretch
            </Text>
          </>
        ) : (
          <Text style={{ fontFamily: MONO, fontSize: 11, color: "var(--color-text-muted)" }}>No measured traces to draw</Text>
        )}
      </Box>
    </Box>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 10, height: 10, background: color, opacity: MAX_TINT, display: "inline-block" }} />
      <Text component="span" style={{ fontFamily: MONO, fontSize: 10, color: "var(--color-text-secondary)" }}>
        {label}
      </Text>
    </span>
  );
}
