import { useState } from 'react';
import { Box, Text, Skeleton, SimpleGrid, Tooltip, Modal, UnstyledButton, Stack } from '@mantine/core';
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
  flat: 'Your latest ride was flat (under 8 m of climbing per km). Ride stress was estimated as a baseline terrain day.',
  rolling: 'Your latest ride was rolling (8–15 m of climbing per km). Ride stress estimates for rides without power data were scaled up for the extra climbing.',
  hilly: 'Your latest ride was hilly (15–25 m of climbing per km). Ride stress estimates for rides without power data were scaled up for the extra climbing.',
  mountainous: 'Your latest ride was mountainous (25+ m of climbing per km). Ride stress estimates for rides without power data were scaled up for the extra climbing.',
};

// Plain-language definitions for the "What these numbers mean" modal. This is
// the one place a new rider can read the definitions without hovering — the
// cell tooltips never fire on touch. Keep the wording word-first, abbreviation
// second, per spec §6.
const METRIC_GLOSSARY = [
  {
    key: 'tsb',
    title: 'Form',
    longName: 'Form score (FS)',
    definition:
      'Fitness minus fatigue. Positive means you are fresh and ready for a hard day or a race. Negative means you are carrying fatigue. Slightly negative is normal in the middle of a training block.',
  },
  {
    key: 'ctl',
    title: 'Fitness',
    longName: 'Training fitness index (TFI)',
    definition:
      'Your long-term training load, weighted toward the last six weeks or so. It builds slowly with consistent riding and fades slowly when you stop.',
  },
  {
    key: 'atl',
    title: 'Fatigue',
    longName: 'Acute fatigue index (AFI)',
    definition:
      'Your short-term training load, weighted toward the last week. It jumps after hard days and clears within days of rest.',
  },
  {
    key: 'rss',
    title: 'Ride stress',
    longName: 'Ride stress score (RSS)',
    definition:
      'One number for how hard a ride was, combining how long it lasted and how intense it felt. An easy hour is roughly 40 to 50; a hard race can be 200 or more. Each day\'s ride stress feeds your fitness and fatigue.',
  },
];

function StatusBar({ ctl, atl, tsb, ctlDeltaPct, weekRides, weekPlanned, loading, fsConfidence, todayTerrain }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [glossaryOpen, setGlossaryOpen] = useState(false);

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
      sublabel: 'Freshness \u2014 form score',
      value: formValue,
      color: formColor,
      fontStyle: isVeryLowConf ? 'italic' : undefined,
      status: formTranslation.label,
      statusColor: colorToVar(formTranslation.color),
      tooltip: METRIC_TOOLTIPS.tsb(tsb),
    },
    {
      label: 'FITNESS',
      sublabel: 'Training fitness index',
      value: String(ctl),
      color: 'var(--color-teal)',
      status: fitnessTranslation.label,
      statusColor: colorToVar(fitnessTranslation.color),
      tooltip: METRIC_TOOLTIPS.ctl(ctl),
    },
    {
      label: 'FATIGUE',
      sublabel: 'Acute fatigue index',
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
      tooltip: 'Your fitness trajectory over the past 4 weeks, based on how your training fitness index (TFI) is changing.',
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
      <UnstyledButton
        onClick={() => setGlossaryOpen(true)}
        style={{
          display: 'block',
          marginTop: 6,
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: '0.5px',
          color: 'var(--color-text-muted)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
        }}
      >
        What these numbers mean
      </UnstyledButton>
      <Modal
        opened={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        title="What these numbers mean"
        radius={0}
        size="md"
        styles={{
          title: {
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          },
        }}
      >
        <Stack gap="md">
          {METRIC_GLOSSARY.map((item) => {
            const rightNow =
              item.key === 'tsb'
                ? METRIC_TOOLTIPS.tsb(tsb)
                : item.key === 'ctl'
                  ? METRIC_TOOLTIPS.ctl(ctl)
                  : item.key === 'atl'
                    ? METRIC_TOOLTIPS.atl(atl, ctl)
                    : null;
            return (
              <Box key={item.key} style={{ borderTop: '0.5px solid var(--color-border)', paddingTop: 10 }}>
                <Text
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {item.title}
                </Text>
                <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#7A7970', marginBottom: 4 }}>
                  {item.longName}
                </Text>
                <Text size="sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  {item.definition}
                </Text>
                {rightNow && (
                  <Text size="sm" mt={6} style={{ color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
                    <Text span fw={700}>Right now: </Text>
                    {rightNow}
                  </Text>
                )}
              </Box>
            );
          })}
        </Stack>
      </Modal>
    </Box>
  );
}

export default StatusBar;
