import { Box, Text, Skeleton, SimpleGrid, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { translateCTL, translateATL, translateTSB, translateTrend, colorToVar } from '../../lib/fitness/translate';
import { METRIC_TOOLTIPS } from '../../lib/fitness/tooltips';

function StatusBar({ ctl, atl, tsb, ctlDeltaPct, weekRides, weekPlanned, loading }) {
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

  const cells = [
    {
      label: 'FORM',
      sublabel: 'TSB \u2014 freshness',
      value: tsb > 0 ? `+${tsb}` : String(tsb),
      color: tsb >= 0 ? 'var(--color-teal)' : 'var(--color-orange)',
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

  return (
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
  );
}

export default StatusBar;
