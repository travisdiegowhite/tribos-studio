/**
 * ProprietaryMetricsBar — Dashboard display for EFI, TWL, TCAS
 *
 * Sits above StatusBar on the Today page. Shows compact metric cells
 * with click-to-expand detail panels using Mantine Collapse.
 */
import { useState } from 'react';
import { Box, Text, SimpleGrid, Skeleton, Collapse, Tooltip, Anchor } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { translateEFI, translateTWL, translateTCAS, METRICS_TOOLTIPS } from '../../lib/metrics/translate';
import { colorToVar } from '../../lib/fitness/translate';
import { SCORE_COLORS, scoreBand } from '../../lib/metrics/types';
import { MetricScoreBadge } from '../metrics/MetricScoreBadge';
import { MetricBarRow } from '../metrics/MetricBarRow';

interface MetricsData {
  efi: {
    score: number;
    session_score: number;
    vf: number;
    ifs: number;
    cf: number;
  } | null;
  twl: {
    score: number;
    base_tss: number;
    m_terrain: number;
    overage_percent: number;
    vam: number;
    gvi: number;
    alpha_component: number;
    beta_component: number;
    gamma_component: number;
  } | null;
  tcas: {
    score: number;
    he: number;
    aq: number;
    taa: number;
    fv: number;
  } | null;
  data_readiness: {
    efi_available: boolean;
    twl_available: boolean;
    tcas_available: boolean;
    tcas_days_remaining: number;
    has_provider: boolean;
    has_training_plan: boolean;
  };
}

interface Props {
  metrics: MetricsData | null;
  loading: boolean;
}

function scoreHex(score: number): string {
  return SCORE_COLORS[scoreBand(score)].bg;
}

export default function ProprietaryMetricsBar({ metrics, loading }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return (
      <SimpleGrid cols={isMobile ? 1 : 3} spacing={0}>
        {[1, 2, 3].map((i) => (
          <Box key={i} style={{ padding: '14px 16px', border: '0.5px solid var(--color-border)' }}>
            <Skeleton height={12} width={40} mb={6} />
            <Skeleton height={24} width={50} />
          </Box>
        ))}
      </SimpleGrid>
    );
  }

  const readiness = metrics?.data_readiness;

  const toggleExpand = (key: string) => {
    setExpanded(prev => prev === key ? null : key);
  };

  return (
    <div>
      <SimpleGrid cols={isMobile ? 1 : 3} spacing={0}>
        {/* EFI Cell */}
        <MetricCell
          label="EFI"
          subtitle="28-day"
          value={metrics?.efi ? String(Math.round(metrics.efi.score)) : null}
          color={metrics?.efi ? scoreHex(metrics.efi.score) : undefined}
          status={metrics?.efi ? translateEFI(metrics.efi.score) : undefined}
          tooltip={METRICS_TOOLTIPS.efi(metrics?.efi?.score ?? null)}
          emptyMessage={
            !readiness?.has_training_plan
              ? 'Start a training plan to unlock'
              : !readiness?.has_provider
                ? 'Connect Strava or Garmin'
                : 'Complete matched workouts to see EFI'
          }
          emptyLink={!readiness?.has_training_plan ? '/train' : '/settings'}
          isExpanded={expanded === 'efi'}
          onToggle={() => toggleExpand('efi')}
        />

        {/* TWL Cell */}
        <MetricCell
          label="TWL"
          subtitle="last ride"
          value={metrics?.twl ? String(Math.round(metrics.twl.score)) : null}
          color={metrics?.twl ? scoreHex(
            // Map overage to a score-like value for coloring
            Math.max(0, 100 - metrics.twl.overage_percent * 2)
          ) : undefined}
          badge={metrics?.twl && metrics.twl.overage_percent > 0
            ? `+${metrics.twl.overage_percent}%`
            : undefined}
          status={metrics?.twl ? translateTWL(metrics.twl.overage_percent) : undefined}
          tooltip={METRICS_TOOLTIPS.twl(metrics?.twl?.score ?? null, metrics?.twl?.base_tss ?? null)}
          emptyMessage={
            !readiness?.has_provider
              ? 'Connect Strava or Garmin'
              : 'Complete a ride to see terrain load'
          }
          emptyLink="/settings"
          isExpanded={expanded === 'twl'}
          onToggle={() => toggleExpand('twl')}
        />

        {/* TCAS Cell */}
        <MetricCell
          label="TCAS"
          subtitle="6-week"
          value={metrics?.tcas ? String(Math.round(metrics.tcas.score)) : null}
          color={metrics?.tcas ? scoreHex(metrics.tcas.score) : undefined}
          status={metrics?.tcas ? translateTCAS(metrics.tcas.score) : undefined}
          tooltip={METRICS_TOOLTIPS.tcas(metrics?.tcas?.score ?? null)}
          emptyMessage={
            readiness?.tcas_days_remaining && readiness.tcas_days_remaining > 0
              ? `Available in ${readiness.tcas_days_remaining} more days`
              : !readiness?.has_provider
                ? 'Connect Strava or Garmin'
                : 'Building... need 6 weeks of data'
          }
          emptyLink="/settings"
          isExpanded={expanded === 'tcas'}
          onToggle={() => toggleExpand('tcas')}
        />
      </SimpleGrid>

      {/* Expanded detail panels */}
      <Collapse in={expanded === 'efi'}>
        {metrics?.efi && <EFIDetail efi={metrics.efi} />}
      </Collapse>
      <Collapse in={expanded === 'twl'}>
        {metrics?.twl && <TWLDetail twl={metrics.twl} />}
      </Collapse>
      <Collapse in={expanded === 'tcas'}>
        {metrics?.tcas && <TCASDetail tcas={metrics.tcas} />}
      </Collapse>
    </div>
  );
}

// ─── MetricCell ──────────────────────────────────────────────────────────────

interface MetricCellProps {
  label: string;
  subtitle: string;
  value: string | null;
  color?: string;
  badge?: string;
  status?: { label: string; color: string };
  tooltip: string;
  emptyMessage: string;
  emptyLink: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function MetricCell({
  label, subtitle, value, color, badge, status, tooltip,
  emptyMessage, emptyLink, isExpanded, onToggle,
}: MetricCellProps) {
  const hasData = value !== null;

  const content = (
    <Box
      onClick={hasData ? onToggle : undefined}
      style={{
        padding: '14px 16px',
        border: '0.5px solid var(--color-border)',
        backgroundColor: isExpanded ? 'var(--color-bg-secondary)' : 'var(--color-card)',
        cursor: hasData ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
      }}
    >
      <Text style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: 11, fontWeight: 700, letterSpacing: '2px',
        textTransform: 'uppercase',
        color: 'var(--color-text-muted)',
        marginBottom: 4,
      }}>
        {label}
        <span style={{ fontSize: 9, letterSpacing: '1px', marginLeft: 6, fontWeight: 600 }}>
          {subtitle}
        </span>
      </Text>

      {hasData ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <Text style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 24, fontWeight: 700,
            color: color || 'var(--color-text-primary)',
            lineHeight: 1.2,
          }}>
            {value}
          </Text>
          {badge && (
            <Text style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 12, fontWeight: 600,
              color: 'var(--color-text-muted)',
            }}>
              {badge}
            </Text>
          )}
        </div>
      ) : (
        <div>
          <Text style={{
            fontFamily: "'Barlow', sans-serif",
            fontSize: 13, color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}>
            {emptyMessage}
          </Text>
          <Anchor
            href={emptyLink}
            size="xs"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.5px' }}
          >
            Set up →
          </Anchor>
        </div>
      )}

      {hasData && status && (
        <Text style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 12, fontWeight: 600, letterSpacing: '0.5px',
          color: colorToVar(status.color as 'teal' | 'orange' | 'gold' | 'coral' | 'muted'),
          marginTop: 4,
        }}>
          {status.label}
        </Text>
      )}
    </Box>
  );

  return (
    <Tooltip
      label={tooltip}
      multiline
      w={280}
      withArrow
      position="bottom"
      styles={{
        tooltip: {
          fontSize: 13, lineHeight: 1.5, padding: '10px 14px',
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
        },
      }}
    >
      {content}
    </Tooltip>
  );
}

// ─── Detail Panels ───────────────────────────────────────────────────────────

function DetailBox({ children }: { children: React.ReactNode }) {
  return (
    <Box style={{
      padding: '16px',
      borderLeft: '0.5px solid var(--color-border)',
      borderRight: '0.5px solid var(--color-border)',
      borderBottom: '0.5px solid var(--color-border)',
      backgroundColor: 'var(--color-bg-secondary)',
    }}>
      {children}
    </Box>
  );
}

function EFIDetail({ efi }: { efi: NonNullable<MetricsData['efi']> }) {
  return (
    <DetailBox>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <MetricScoreBadge label="EFI" score={efi.score} size="lg" />
        <div style={{ flex: 1 }}>
          <MetricBarRow label="Volume Fidelity" value={efi.vf} displayValue={`${(efi.vf * 100).toFixed(0)}%`} color="#2A8C82" />
          <MetricBarRow label="Intensity Fidelity" value={efi.ifs} displayValue={`${(efi.ifs * 100).toFixed(0)}%`} color="#C49A0A" />
          <MetricBarRow label="Consistency" value={efi.cf} displayValue={`${(efi.cf * 100).toFixed(0)}%`} color="#D4600A" />
        </div>
      </div>
      <Anchor href="/learn/metrics" size="xs" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        Learn how EFI is calculated →
      </Anchor>
    </DetailBox>
  );
}

function TWLDetail({ twl }: { twl: NonNullable<MetricsData['twl']> }) {
  return (
    <DetailBox>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: 'var(--color-text-muted)' }}>
            TSS {Math.round(twl.base_tss)}
          </Text>
          <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 28, fontWeight: 700, color: scoreHex(Math.max(0, 100 - twl.overage_percent * 2)) }}>
            TWL {Math.round(twl.score)}
          </Text>
          {twl.overage_percent > 0 && (
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--color-text-muted)' }}>
              +{twl.overage_percent}% terrain
            </Text>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <MetricBarRow label="Climbing (VAM)" value={twl.alpha_component} maxValue={0.15} displayValue={`${twl.vam} m/hr`} color="#2A8C82" />
          <MetricBarRow label="Gradient Variability" value={twl.beta_component} maxValue={0.36} displayValue={`σ ${twl.gvi?.toFixed(1)}%`} color="#C49A0A" />
          <MetricBarRow label="Altitude" value={twl.gamma_component} maxValue={0.10} displayValue={`${(twl.gamma_component / 0.05 * 1000 + 1000).toFixed(0)}m avg`} color="#D4600A" />
        </div>
      </div>
      <Anchor href="/learn/metrics" size="xs" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        Learn how TWL is calculated →
      </Anchor>
    </DetailBox>
  );
}

function TCASDetail({ tcas }: { tcas: NonNullable<MetricsData['tcas']> }) {
  return (
    <DetailBox>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <MetricScoreBadge label="TCAS" score={tcas.score} size="lg" />
        <div style={{ flex: 1 }}>
          <MetricBarRow label="Hours Efficiency" value={tcas.he} maxValue={2.0} displayValue={tcas.he.toFixed(2)} color="#2A8C82" />
          <MetricBarRow label="Adaptation Quality" value={tcas.aq} maxValue={1.2} displayValue={tcas.aq.toFixed(2)} color="#C49A0A" />
          <MetricBarRow label="Training Age Adj" value={tcas.taa - 1} maxValue={1.0} displayValue={`${tcas.taa.toFixed(2)}×`} color="#D4600A" />
        </div>
      </div>
      <Anchor href="/learn/metrics" size="xs" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
        Learn how TCAS is calculated →
      </Anchor>
    </DetailBox>
  );
}
