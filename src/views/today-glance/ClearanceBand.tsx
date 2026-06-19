/**
 * FormBand — the "am I cleared" line of the glance, labelled FORM.
 *
 * A Form heat ramp (coral → orange → teal → gold → grey, mirroring the
 * todayVocabulary formZones) with a marker at the Form Score position, a
 * plain-language verdict ("cleared for quality" / "keep it easy"), and inline
 * FS / TFI / AFI values.
 */

import { Box, Group, Text } from '@mantine/core';
import { C, FONT } from './tokens';
import type { TodayAthleteState } from './types';

// Heat ramp, left (drained/coral) → right (stale/grey), matching formZones.
const RAMP = `linear-gradient(to right, ${C.coral} 0%, ${C.orange} 22%, ${C.teal} 50%, ${C.gold} 75%, #B4B2A9 100%)`;

function MetricChip({ label, value }: { label: string; value: number | null }) {
  return (
    <Group gap={4} align="baseline">
      <Text style={{ fontFamily: FONT.mono, fontSize: 10, letterSpacing: '1px', color: C.text3 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: C.text }}>
        {value == null ? '—' : Math.round(value)}
      </Text>
    </Group>
  );
}

export function ClearanceBand({ state }: { state: TodayAthleteState }) {
  const markerPct = `${Math.round(state.formRampPos * 100)}%`;
  return (
    <Box>
      <Group justify="space-between" align="center" mb={6}>
        <Text
          style={{
            fontFamily: FONT.mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: C.text3,
          }}
        >
          Form
        </Text>
        <Text
          style={{
            fontFamily: FONT.heading,
            fontSize: 15,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: state.formColor,
          }}
        >
          {state.formWord}
        </Text>
      </Group>

      {/* Heat ramp + marker */}
      <Box style={{ position: 'relative', height: 8, background: RAMP }}>
        <Box
          style={{
            position: 'absolute',
            top: -3,
            left: markerPct,
            transform: 'translateX(-50%)',
            width: 3,
            height: 14,
            backgroundColor: C.navy,
            border: '1px solid #FFFFFF',
          }}
        />
      </Box>

      {/* Plain-language verdict */}
      <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.text2, marginTop: 7 }}>
        {state.formVerdict}
      </Text>

      <Group gap={16} mt={6}>
        <MetricChip label="FS" value={state.fs} />
        <MetricChip label="TFI" value={state.tfi} />
        <MetricChip label="AFI" value={state.afi} />
        {state.confidenceTier && state.confidenceTier !== 'high' && (
          <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.text3, fontStyle: 'italic' }}>
            {state.confidenceTier} confidence
          </Text>
        )}
      </Group>
    </Box>
  );
}
