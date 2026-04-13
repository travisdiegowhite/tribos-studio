import { Box, Text, Skeleton, SimpleGrid, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { translateCTL, translateATL, translateTSB, translateTrend, colorToVar } from '../../lib/fitness/translate';
import { METRIC_TOOLTIPS } from '../../lib/fitness/tooltips';

// Short, human-readable descriptor for each terrain class. Kept terse so
// the chip stays visually lightweight at the top of StatusBar.
const TERRAIN_LABELS = {
  flat: 'Flat',
  rolling: 'Rolling',
  hilly: 'Hilly',
  mountainous: 'Mountainous',
};

const TERRAIN_TOOLTIPS = {
  flat: 'Latest day classified as flat (< 8 m of elevation gain per km). TSS estimator treated it as a baseline terrain day.',
  rolling: 'Latest day classified as rolling (8–15 m/km). Kilojoule/inferred TSS was scaled by 1.05× to account for grade-induced cost.',
  hilly: 'Latest day classified as hilly (15–25 m/km). Kilojoule/inferred TSS was scaled by 1.10× to account for grade-induced cost.',
  mountainous: 'Latest day classified as mountainous (≥ 25 m/km). Kilojoule/inferred TSS was scaled by 1.15× to account for grade-induced cost.',
};

function StatusBar({ ctl, atl, tsb, ctlDeltaPct, weekRides, weekPlanned, loading, fsConfidence, todayTerrain }) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (loading) {
    return (
      <SimpleGrid cols={isMobile ? 2 : 5} spacing={0}>
        {[1, 2, 3, 4, 5].map((i) => (
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

  // Form Score confidence gating: when fsConfidence is low we prefix the
  // value with `~` and (at very low) switch to muted italic so the UI
  // subtly communicates that the number is an estimate.
  const formRaw = tsb > 0 ? `+${tsb}` : String(tsb);
  const isLowConf = fsConfidence != null && fsConfidence < 0.85;
  const isVeryLowConf = fsConfidence != null && fsConfidence < 0.60;
  const formValue = isLowConf ? `~${formRaw}` : formRaw;
  const formColor = isVeryLowConf
    ? 'var(--color-text-muted)'
    : tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)';

  const cells = [
    {
      label: 'FORM',
      sublabel: 'TSB \u2014 freshness',
      value: formValue,
      color: formColor,
      fontStyle: isVeryLowConf ? 'italic' : undefined,
      status: formTranslation.label,
      statusColor: colorToVar(formTranslation.color),
      tooltip: METRIC_TOOLTIPS.tsb(tsb),
    },
    {
      label: 'FITNESS',
      sublabel: 'CTL \u2014 chronic training load',
      value: String(ctl),
      color: 'var(--color-teal)',
      status: fitnessTranslation.label,
      statusColor: colorToVar(fitnessTranslation.color),
      tooltip: METRIC_TOOLTIPS.ctl(ctl),
    },
    {
      label: 'FATIGUE',
      sublabel: 'ATL \u2014 recent training load',
      value: String(atl),
      color: 'var(--color-orange)',
      status: fatigueTranslation.label,
      statusColor: colorToVar(fatigueTranslation.color),
      tooltip: METRIC_TOOLTIPS.atl(atl, ctl),
    },
    {
      label: 'TREND',
      sublabel: null,
      value: trendTranslation.label,
      color: colorToVar(trendTranslation.color),
      status: trendTranslation.subtitle,
      statusColor: 'var(--color-text-muted)',
      tooltip: 'Your fitness trajectory over the past 4 weeks, based on how your chronic training load (CTL) is changing.',
    },
    {
      label: 'THIS WEEK',
      sublabel: null,
      value: `${weekRides}/${weekPlanned}`,
      color: 'var(--color-teal)',
      status: null,
      statusColor: null,
      tooltip: null,
    },
  ];

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

  return (
    <Box>
      {terrainChip}
    <SimpleGrid cols={isMobile ? 2 : 5} spacing={0}>
      {cells.map((cell) => {
        const content = (
          <Box
            key={cell.label}
            style={{
              padding: '16px 20px',
              border: '0.5px solid var(--color-border)',
              backgroundColor: 'var(--color-card)',
              cursor: cell.tooltip ? 'help' : 'default',
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
                marginBottom: cell.sublabel ? 1 : 4,
              }}
            >
              {cell.label}
            </Text>
            {cell.sublabel && (
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

        if (cell.tooltip) {
          return (
            <Tooltip
              key={cell.label}
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
              {content}
            </Tooltip>
          );
        }
        return content;
      })}
    </SimpleGrid>
    </Box>
  );
}

export default StatusBar;
