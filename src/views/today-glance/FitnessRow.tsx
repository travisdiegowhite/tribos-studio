/**
 * FitnessRow — the fuller athlete-state row that tells the fitness story:
 * where you are (FORM), where you've been / heading (FITNESS sparkline + trend),
 * and current load (FATIGUE). Sits below the hero. Reuses the on-brand
 * FitnessSparkline from the live Today's shared components.
 */

import { Box, Group, Text } from '@mantine/core';
import { FitnessSparkline } from '../today/shared/FitnessSparkline';
import { C, FONT } from './tokens';
import type { TodayAthleteState } from './types';

function CellShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box style={{ background: C.card, border: `1px solid ${C.border}`, padding: 14 }}>
      <Text
        style={{
          fontFamily: FONT.mono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: C.text3,
          marginBottom: 8,
        }}
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

function ValueWord({ word, color }: { word: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: FONT.heading,
        fontSize: 22,
        fontWeight: 700,
        lineHeight: 1.1,
        color,
      }}
    >
      {word}
    </Text>
  );
}

export function FitnessRow({ state }: { state: TodayAthleteState }) {
  const delta = state.fitnessDelta28d;
  const arrow = delta > 0 ? '↗' : delta < 0 ? '↘' : '→';
  const deltaLabel = `${delta > 0 ? '+' : ''}${Math.round(delta)} (28d)`;

  return (
    <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 14 }}>
      {/* FORM — where you are */}
      <CellShell label="Form">
        <ValueWord word={state.formWord} color={state.formColor} />
        <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3, marginTop: 4 }}>
          FS {state.fs == null ? '—' : Math.round(state.fs)}
        </Text>
      </CellShell>

      {/* FITNESS — where you've been / heading */}
      <CellShell label="Fitness">
        <Box style={{ marginBottom: 6 }}>
          <FitnessSparkline history={state.fitnessHistory} empty={state.fitnessEmpty} height={34} />
        </Box>
        <Group justify="space-between" align="baseline">
          <Text style={{ fontFamily: FONT.heading, fontSize: 18, fontWeight: 600, color: state.fitnessColor }}>
            {state.fitnessWord}
          </Text>
          <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.text3 }}>
            {arrow} {deltaLabel} · TFI {state.tfi == null ? '—' : Math.round(state.tfi)}
          </Text>
        </Group>
      </CellShell>

      {/* FATIGUE — current load */}
      <CellShell label="Fatigue">
        <ValueWord word={state.fatigueWord} color={state.fatigueColor} />
        <Box style={{ position: 'relative', height: 6, background: C.secondary, marginTop: 10 }}>
          <Box
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round(state.fatigueRelative * 100)}%`,
              backgroundColor: state.fatigueColor,
            }}
          />
        </Box>
        <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3, marginTop: 6 }}>
          AFI {state.afi == null ? '—' : Math.round(state.afi)}
        </Text>
      </CellShell>
    </Box>
  );
}
