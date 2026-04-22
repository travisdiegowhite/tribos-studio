import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Group, Skeleton, Text, Tooltip } from '@mantine/core';
import useTodayChart from '../../../hooks/useTodayChart';
import { METRIC_DESCRIPTIONS } from '../../../lib/fitness/metricDescriptions';

/**
 * ProgressPreviewStrip — TODAY Tier 4 (bible §8, redesign spec §1.7).
 *
 * Full-width ~100-120px strip at the bottom of TODAY. Shows TFI/AFI/FS
 * current values + a mini 42-day TFI chart + 28-day delta. Clicking
 * anywhere on the strip navigates to /progress.
 *
 * "FITNESS · FATIGUE · FORM" header satisfies bible §9 full-name-first
 * requirement. Acronyms TFI/AFI/FS below it are acceptable because the
 * header has introduced the full names.
 */

const DM_MONO = "'JetBrains Mono', 'DM Mono', monospace";
const BARLOW_CONDENSED = "'Barlow Condensed', sans-serif";

const COLOR = {
  fitness: '#2A8C82',
  fatigue: '#C43C2A',
  form: '#C49A0A',
  ink: '#141410',
  muted: '#7A7970',
  border: '#DDDDD8',
  bg: '#F4F4F2',
  teal: '#2A8C82',
};

// Minimal TFI sparkline — no interactivity, TFI line only.
function MiniChart({ days }: { days: Array<{ tfi: number | null }> }) {
  const W = 200;
  const H = 52;
  const PAD = { l: 2, r: 2, t: 4, b: 4 };
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;

  const path = useMemo(() => {
    if (!days.length) return '';
    const nums = days.map((d) => d.tfi).filter((v): v is number => v != null && Number.isFinite(v));
    if (!nums.length) return '';
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const span = max - min || 1;
    const n = days.length;
    let d = '';
    let penDown = false;
    for (let i = 0; i < n; i++) {
      const v = days[i].tfi;
      if (v == null || Number.isNaN(v)) { penDown = false; continue; }
      const x = PAD.l + (i / Math.max(n - 1, 1)) * pw;
      const y = PAD.t + ph - ((v - min) / span) * ph;
      d += penDown ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
      penDown = true;
    }
    return d.trim();
  }, [days]);

  if (!path) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={COLOR.fitness} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface ProgressPreviewStripProps {
  userId?: string;
  activities?: unknown[];
  userFtp?: number;
}

export default function ProgressPreviewStrip({ userId, activities = [], userFtp }: ProgressPreviewStripProps) {
  const data = useTodayChart(userId, { activities, userFtp });

  const absDelta28 = useMemo(() => {
    const days = data.days;
    if (days.length < 2) return null;
    const last = days[days.length - 1]?.tfi;
    const base = days[Math.max(0, days.length - 29)]?.tfi;
    if (last == null || base == null) return null;
    return Math.round(last - base);
  }, [data.days]);

  const fmt = (n: number | null | undefined) => n == null ? '—' : String(Math.round(n));
  const fmtSigned = (n: number | null | undefined) => {
    if (n == null) return '—';
    const r = Math.round(n);
    return r > 0 ? `+${r}` : String(r);
  };
  const kpi = data.kpi;

  if (data.loading) {
    return (
      <Skeleton height={100} style={{ borderRadius: 0 }} />
    );
  }

  // Don't render strip if no fitness data at all
  if (!data.loading && data.days.length === 0) return null;

  return (
    <Link
      to="/progress"
      style={{ textDecoration: 'none', display: 'block' }}
      aria-label="See full progress — fitness, fatigue, and form analytics"
    >
      <div
        style={{
          backgroundColor: COLOR.bg,
          border: `1px solid ${COLOR.border}`,
          padding: '14px 18px',
          cursor: 'pointer',
          minHeight: 100,
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap={12}>
          {/* Left: header + stats + delta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700} style={{ fontFamily: BARLOW_CONDENSED, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: COLOR.ink, marginBottom: 6 }}>
              FITNESS · FATIGUE · FORM
            </Text>
            <Group gap={16} wrap="wrap" mb={6}>
              <Tooltip label={METRIC_DESCRIPTIONS.TFI.definition} multiline w={200} withArrow>
                <Text span style={{ fontFamily: DM_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR.muted }}>
                  TFI <span style={{ color: COLOR.fitness, fontWeight: 700 }}>{fmt(kpi.tfi)}</span>
                </Text>
              </Tooltip>
              <Tooltip label={METRIC_DESCRIPTIONS.AFI.definition} multiline w={200} withArrow>
                <Text span style={{ fontFamily: DM_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR.muted }}>
                  AFI <span style={{ color: COLOR.fatigue, fontWeight: 700 }}>{fmt(kpi.afi)}</span>
                </Text>
              </Tooltip>
              <Tooltip label={METRIC_DESCRIPTIONS.FS.definition} multiline w={200} withArrow>
                <Text span style={{ fontFamily: DM_MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: COLOR.muted }}>
                  FS <span style={{ color: COLOR.ink, fontWeight: 700 }}>{fmtSigned(kpi.fs)}</span>
                </Text>
              </Tooltip>
            </Group>
            {absDelta28 != null && (
              <Text style={{
                fontFamily: DM_MONO,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: absDelta28 > 0 ? COLOR.fitness : absDelta28 < 0 ? COLOR.fatigue : COLOR.muted,
              }}>
                {absDelta28 > 0 ? `+${absDelta28}` : String(absDelta28)} fitness over 28 days
              </Text>
            )}
          </div>

          {/* Right: mini chart + CTA */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <MiniChart days={data.days} />
            <Text style={{
              fontFamily: DM_MONO,
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: COLOR.teal,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}>
              SEE FULL PROGRESS →
            </Text>
          </div>
        </Group>
      </div>
    </Link>
  );
}
