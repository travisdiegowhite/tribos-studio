/**
 * DeviationCard — Plan deviation recommendation card.
 *
 * Surfaces when a workout deviates significantly from the plan.
 * Shows TSB impact, ranked adjustment options via the athlete's
 * coach persona, and accept/dismiss actions.
 */

import { useState } from 'react';
import { Paper, Text, Group, Button, Stack, Collapse, Badge, SimpleGrid, Box } from '@mantine/core';
import { Lightning, ArrowsClockwise, Bed, Minus, CheckCircle } from '@phosphor-icons/react';
import { classifyFS } from '../../lib/training/tsb-projection';
import { rankOptions } from '../../lib/training/coach-personas';
import type {
  PlanDeviationRow,
  AdjustmentOption,
  AdjustmentProjections,
  CoachPersona,
  RankedOption,
} from '../../lib/training/types';

interface DeviationCardProps {
  deviation: PlanDeviationRow;
  persona: CoachPersona;
  daysToQuality: number;
  swapFeasible: boolean;
  isNearRace: boolean;
  onResolve: (deviationId: string, option: AdjustmentOption) => void;
  resolving?: boolean;
}

const ZONE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  race_ready:  { bg: 'var(--mantine-color-green-0)',  text: 'var(--mantine-color-green-8)', label: 'Race ready' },
  building:    { bg: 'var(--mantine-color-teal-0)',   text: 'var(--mantine-color-teal-8)',  label: 'Building' },
  heavy_load:  { bg: 'var(--mantine-color-yellow-0)', text: 'var(--mantine-color-yellow-8)', label: 'Heavy load' },
  overreached: { bg: 'var(--mantine-color-red-0)',    text: 'var(--mantine-color-red-8)',   label: 'Overreached' },
};

const CONFIDENCE_LABEL: Record<string, string> = {
  power: 'Based on power data',
  hr: 'Estimated from heart rate',
  rpe: 'Estimated from effort rating',
  inferred: 'Estimated from ride type',
};

const OPTION_ICONS: Record<string, React.ReactNode> = {
  no_adjust: <CheckCircle size={14} />,
  modify: <Lightning size={14} />,
  swap: <ArrowsClockwise size={14} />,
  insert_rest: <Bed size={14} />,
  drop: <Minus size={14} />,
};

export default function DeviationCard({
  deviation,
  persona,
  daysToQuality,
  swapFeasible,
  isNearRace,
  onResolve,
  resolving = false,
}: DeviationCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const options = deviation.options_json as AdjustmentProjections | null;
  if (!options) return null;

  const tssSource = (deviation as any).tss_source || 'inferred';
  const fsGap = (options.planned ?? 0) - (options.no_adjust ?? 0);

  const ranked = rankOptions(persona, options, {
    fsGap,
    urgency: 'medium',
    daysToQuality,
    swapFeasible,
    isNearRace,
  });

  const top = ranked[0];
  if (!top) return null;

  const topTsb = options[top.option as keyof AdjustmentProjections] ?? 0;
  const topZone = classifyFS(topTsb);
  const zoneStyle = ZONE_STYLES[topZone] ?? ZONE_STYLES.building;

  const formatTsb = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(1)}`;
  const formatLabel = (key: string) => key.replace(/_/g, ' ');

  return (
    <Paper
      p="md"
      withBorder
      style={{
        borderRadius: 0,
        borderColor: 'var(--tribos-border-default)',
        borderLeft: '3px solid var(--color-teal)',
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="sm">
        <div>
          <Text size="sm" fw={700} tt="uppercase" ff="monospace" c="dimmed">
            Plan Deviation Detected
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            {CONFIDENCE_LABEL[tssSource] ?? CONFIDENCE_LABEL.inferred}
            {' · '}+{Math.round(deviation.tss_delta ?? 0)} TSS over planned
          </Text>
        </div>
        <Badge
          variant="light"
          size="sm"
          ff="monospace"
          style={{
            borderRadius: 0,
            backgroundColor: zoneStyle.bg,
            color: zoneStyle.text,
          }}
        >
          {zoneStyle.label}
        </Badge>
      </Group>

      {/* Top recommendation rationale */}
      <Box
        pl="sm"
        mb="md"
        style={{ borderLeft: '2px solid var(--color-teal)' }}
      >
        <Text size="sm" c="var(--tribos-text-secondary)" lh={1.6}>
          {top.rationale}
        </Text>
      </Box>

      {/* TSB impact comparison */}
      <SimpleGrid cols={3} spacing="xs" mb="md">
        {(['planned', 'no_adjust', top.option] as string[])
          .filter((v, i, a) => a.indexOf(v) === i)
          .map(key => {
            const tsb = options[key as keyof AdjustmentProjections] ?? 0;
            const z = classifyFS(tsb);
            const zs = ZONE_STYLES[z] ?? ZONE_STYLES.building;
            return (
              <Box key={key} style={{ textAlign: 'center' }}>
                <Text size="xs" ff="monospace" c="dimmed" tt="uppercase" mb={4}>
                  {formatLabel(key)}
                </Text>
                <Text size="lg" fw={600} ff="monospace" style={{ color: zs.text }}>
                  {formatTsb(tsb)}
                </Text>
              </Box>
            );
          })}
      </SimpleGrid>

      {/* Actions */}
      <Group gap="xs">
        <Button
          flex={1}
          color="teal"
          size="sm"
          loading={resolving}
          onClick={() => onResolve(deviation.id, top.option)}
          leftSection={OPTION_ICONS[top.option]}
          style={{ borderRadius: 0 }}
        >
          Apply — {formatLabel(top.option)}
        </Button>
        <Button
          variant="outline"
          color="gray"
          size="sm"
          loading={resolving}
          onClick={() => onResolve(deviation.id, 'no_adjust')}
          style={{ borderRadius: 0 }}
        >
          Dismiss
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="sm"
          onClick={() => setShowAll(!showAll)}
          style={{ borderRadius: 0 }}
        >
          {showAll ? 'Less' : 'Options'}
        </Button>
      </Group>

      {/* Expanded options */}
      <Collapse in={showAll}>
        <Stack gap="xs" mt="md" pt="md" style={{ borderTop: '1px solid var(--tribos-border-default)' }}>
          {ranked.slice(1).map(opt => (
            <Paper
              key={opt.option}
              p="xs"
              withBorder
              style={{
                borderRadius: 0,
                cursor: 'pointer',
                backgroundColor: hoveredOption === opt.option
                  ? 'var(--mantine-color-gray-1)' : 'var(--mantine-color-gray-0)',
              }}
              onMouseEnter={() => setHoveredOption(opt.option)}
              onMouseLeave={() => setHoveredOption(null)}
              onClick={() => onResolve(deviation.id, opt.option)}
            >
              <Group justify="space-between">
                <Group gap="xs">
                  {OPTION_ICONS[opt.option]}
                  <Text size="sm" fw={500}>{formatLabel(opt.option)}</Text>
                </Group>
                <Text size="sm" ff="monospace" c="dimmed">
                  {formatTsb(options[opt.option as keyof AdjustmentProjections] ?? 0)}
                </Text>
              </Group>
              <Collapse in={hoveredOption === opt.option}>
                <Text size="xs" c="dimmed" mt={4}>{opt.rationale}</Text>
              </Collapse>
            </Paper>
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
}
