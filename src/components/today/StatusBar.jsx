import { Box, Text, Skeleton, SimpleGrid, Tooltip, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { translateCTL, translateATL, translateTSB, translateTrend, colorToVar } from '../../lib/fitness/translate';
import { METRIC_TOOLTIPS } from '../../lib/fitness/tooltips';
import { translateEFI, translateTCAS, METRICS_TOOLTIPS } from '../../lib/metrics/translate';

const TERRAIN_LABELS = {
  flat: 'Flat',
  rolling: 'Rolling',
  hilly: 'Hilly',
  mountainous: 'Mountainous',
};

const TERRAIN_TOOLTIPS = {
  flat: 'Latest day classified as flat (< 8 m of elevation gain per km). Ride Stress Score (RSS) estimator treated it as a baseline terrain day.',
  rolling: 'Latest day classified as rolling (8–15 m/km). Kilojoule and inferred RSS tiers were scaled up by the spec §3.1 terrain multiplier.',
  hilly: 'Latest day classified as hilly (15–25 m/km). Kilojoule and inferred RSS tiers were scaled up by the spec §3.1 terrain multiplier.',
  mountainous: 'Latest day classified as mountainous (≥ 25 m/km). Kilojoule and inferred RSS tiers were scaled up by the spec §3.1 terrain multiplier.',
};

/**
 * StatusBar — the Today metric instrument cluster.
 *
 * On the v2 reflow Today view this is a single horizontal row of 7 cells:
 * FORM · FITNESS · FATIGUE · EFI · TCAS · TREND · THIS WEEK. Each cell is
 * tappable and navigates to /progress with the metric in focus.
 *
 * Props:
 *   - ctl, atl, tsb, ctlDeltaPct, weekRides, weekPlanned, loading,
 *     fsConfidence, todayTerrain  — existing fitness layer
 *   - proprietaryMetrics: { efi: { score }, tcas: { score } }  — adds
 *     EFI and TCAS cells. Pass null to omit them and fall back to the
 *     pre-v2 5-cell layout.
 *   - compact (default true): hides the small explanatory subtitle line
 *     ("FS — freshness", "TFI — training fitness index", etc.). The
 *     subtitles still render in the legacy 5-cell mode for non-Today
 *     surfaces that pass `compact={false}` explicitly.
 *   - onCellClick: optional override for the per-cell click handler. By
 *     default cells navigate to /progress?metric={id}. Used by Today to
 *     also fire PostHog `today_view.metric_expanded`.
 */
function StatusBar({
  ctl,
  atl,
  tsb,
  ctlDeltaPct,
  weekRides,
  weekPlanned,
  loading,
  fsConfidence,
  todayTerrain,
  proprietaryMetrics = null,
  compact = true,
  onCellClick,
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const navigate = useNavigate();

  const efiScore = proprietaryMetrics?.efi?.score ?? null;
  const tcasScore = proprietaryMetrics?.tcas?.score ?? null;
  const includeProprietary = proprietaryMetrics != null;

  const desktopCols = includeProprietary ? 7 : 5;
  const skeletonCount = includeProprietary ? 7 : 5;

  if (loading) {
    return (
      <SimpleGrid cols={isMobile ? 2 : desktopCols} spacing={0}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Box
            key={i}
            style={{
              padding: '16px 20px',
              border: '0.5px solid var(--color-border)',
            }}
          >
            <Skeleton height={12} width={60} mb={6} />
            <Skeleton height={24} width={40} />
          </Box>
        ))}
      </SimpleGrid>
    );
  }

  const formTranslation = translateTSB(tsb);
  const fitnessTranslation = translateCTL(ctl);
  const fatigueTranslation = translateATL(atl, ctl);
  const trendTranslation = translateTrend(ctlDeltaPct ?? 0, ctl);
  const efiTranslation = efiScore != null ? translateEFI(efiScore) : null;
  const tcasTranslation = tcasScore != null ? translateTCAS(tcasScore) : null;

  // Form Score confidence gating (existing behavior)
  const formRaw = tsb > 0 ? `+${tsb}` : String(tsb);
  const isLowConf = fsConfidence != null && fsConfidence < 0.85;
  const isVeryLowConf = fsConfidence != null && fsConfidence < 0.60;
  const formValue = isLowConf ? `~${formRaw}` : formRaw;
  const formColor = isVeryLowConf
    ? 'var(--color-text-muted)'
    : tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)';

  // Cells in the order the v2 brief specifies:
  // FORM · FITNESS · FATIGUE · EFI · TCAS · TREND · THIS WEEK
  const baseCells = [
    {
      id: 'form',
      label: 'FORM',
      sublabel: 'FS — freshness',
      value: formValue,
      color: formColor,
      fontStyle: isVeryLowConf ? 'italic' : undefined,
      status: formTranslation.label,
      statusColor: colorToVar(formTranslation.color),
      tooltip: METRIC_TOOLTIPS.tsb(tsb),
    },
    {
      id: 'fitness',
      label: 'FITNESS',
      sublabel: 'TFI — training fitness index',
      value: String(ctl),
      color: 'var(--color-teal)',
      status: fitnessTranslation.label,
      statusColor: colorToVar(fitnessTranslation.color),
      tooltip: METRIC_TOOLTIPS.ctl(ctl),
    },
    {
      id: 'fatigue',
      label: 'FATIGUE',
      sublabel: 'AFI — acute fatigue index',
      value: String(atl),
      color: 'var(--color-orange)',
      status: fatigueTranslation.label,
      statusColor: colorToVar(fatigueTranslation.color),
      tooltip: METRIC_TOOLTIPS.atl(atl, ctl),
    },
  ];

  const proprietaryCells = includeProprietary ? [
    {
      id: 'efi',
      label: 'EFI',
      sublabel: 'Execution Fidelity',
      value: efiScore != null ? String(efiScore) : '—',
      color: efiTranslation ? colorToVar(efiTranslation.color) : 'var(--color-text-muted)',
      status: efiTranslation?.label ?? null,
      statusColor: efiTranslation ? colorToVar(efiTranslation.color) : null,
      tooltip: METRICS_TOOLTIPS.efi(efiScore),
    },
    {
      id: 'tcas',
      label: 'TCAS',
      sublabel: 'Training Capacity',
      value: tcasScore != null ? String(tcasScore) : '—',
      color: tcasTranslation ? colorToVar(tcasTranslation.color) : 'var(--color-text-muted)',
      status: tcasTranslation?.label ?? null,
      statusColor: tcasTranslation ? colorToVar(tcasTranslation.color) : null,
      tooltip: METRICS_TOOLTIPS.tcas(tcasScore),
    },
  ] : [];

  const tailCells = [
    {
      id: 'trend',
      label: 'TREND',
      sublabel: null,
      value: trendTranslation.label,
      color: colorToVar(trendTranslation.color),
      status: trendTranslation.subtitle,
      statusColor: 'var(--color-text-muted)',
      tooltip: 'Your fitness trajectory over the past 4 weeks, based on how your training fitness index (TFI) is changing.',
    },
    {
      id: 'this_week',
      label: 'THIS WEEK',
      sublabel: null,
      value: `${weekRides}/${weekPlanned}`,
      color: 'var(--color-teal)',
      status: null,
      statusColor: null,
      tooltip: null,
    },
  ];

  const cells = [...baseCells, ...proprietaryCells, ...tailCells];

  const terrainLabel = todayTerrain ? TERRAIN_LABELS[todayTerrain] : null;
  const terrainTooltip = todayTerrain ? TERRAIN_TOOLTIPS[todayTerrain] : null;

  const terrainChip = terrainLabel ? (
    <Tooltip
      label={terrainTooltip}
      multiline
      w={280}
      withArrow
      position="bottom"
      styles={{
        tooltip: {
          fontSize: 13,
          lineHeight: 1.5,
          padding: '10px 14px',
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
        },
      }}
    >
      <Box
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          border: '0.5px solid var(--color-border)',
          backgroundColor: 'var(--color-card)',
          cursor: 'help',
          marginBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
          }}
        >
          TERRAIN
        </Text>
        <Text
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
          }}
        >
          {terrainLabel}
        </Text>
      </Box>
    </Tooltip>
  ) : null;

  const handleCellActivate = (cellId) => {
    if (onCellClick) {
      onCellClick(cellId);
      return;
    }
    navigate(`/progress?metric=${cellId}`);
  };

  return (
    <Box>
      {terrainChip}
      <SimpleGrid cols={isMobile ? 2 : desktopCols} spacing={0}>
        {cells.map((cell) => {
          const cellInner = (
            <Box
              style={{
                padding: '16px 20px',
                border: '0.5px solid var(--color-border)',
                backgroundColor: 'var(--color-card)',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <Text
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                  marginBottom: !compact && cell.sublabel ? 1 : 4,
                }}
              >
                {cell.label}
              </Text>
              {!compact && cell.sublabel && (
                <Text
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 12,
                    color: '#7A7970',
                    letterSpacing: '0.5px',
                    marginBottom: 4,
                  }}
                >
                  {cell.sublabel}
                </Text>
              )}
              <Text
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 24,
                  fontWeight: 700,
                  color: cell.color,
                  lineHeight: 1.2,
                  fontStyle: cell.fontStyle,
                }}
              >
                {cell.value}
              </Text>
              {cell.status && (
                <Text
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                    color: cell.statusColor,
                    marginTop: 4,
                  }}
                >
                  {cell.status}
                </Text>
              )}
            </Box>
          );

          const button = (
            <UnstyledButton
              key={cell.id}
              onClick={() => handleCellActivate(cell.id)}
              aria-label={`${cell.label} ${cell.value}`}
            >
              {cellInner}
            </UnstyledButton>
          );

          if (cell.tooltip) {
            return (
              <Tooltip
                key={cell.id}
                label={cell.tooltip}
                multiline
                w={280}
                withArrow
                position="bottom"
                styles={{
                  tooltip: {
                    fontSize: 13,
                    lineHeight: 1.5,
                    padding: '10px 14px',
                    backgroundColor: 'var(--color-card)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  },
                }}
              >
                {button}
              </Tooltip>
            );
          }
          return button;
        })}
      </SimpleGrid>
    </Box>
  );
}

export default StatusBar;
