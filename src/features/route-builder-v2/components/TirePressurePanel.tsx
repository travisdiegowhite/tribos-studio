/**
 * TirePressurePanel — Route Builder 2.0 tire-pressure calculator.
 *
 * Reuses the shared calculateTirePressure model (rider+bike weight, tire
 * width, surface, tubeless). Surface and a sensible tire width seed from the
 * route's profile when available, but everything is adjustable — the calc is
 * useful with or without a route, so this panel isn't gated on one.
 */

import { useMemo, useState } from 'react';
import { Box, Group, Switch, Text, UnstyledButton } from '@mantine/core';
import { Gauge, WarningCircle } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import {
  calculateTirePressure,
  mapRouteSurfaceToPressSurface,
  type Surface,
} from '../../../utils/tirePressure';

export interface TirePressurePanelProps {
  /** Route profile (road/gravel/mountain…) used to seed surface + tire width. */
  routeProfile?: string;
  isImperial?: boolean;
}

const TIRE_WIDTHS = [25, 28, 32, 40, 47];
const SURFACES: Surface[] = ['paved', 'mixed', 'gravel', 'unpaved'];
const SURFACE_LABELS: Record<Surface, string> = {
  paved: 'Paved',
  mixed: 'Mixed',
  gravel: 'Gravel',
  unpaved: 'Unpaved',
};

function defaultWidthForProfile(profile?: string): number {
  switch (profile?.toLowerCase()) {
    case 'gravel':
      return 40;
    case 'mountain':
    case 'mtb':
      return 47;
    case 'commuting':
      return 32;
    default:
      return 28;
  }
}

export function TirePressurePanel({ routeProfile, isImperial = false }: TirePressurePanelProps) {
  const [riderWeightKg, setRiderWeightKg] = useState(75);
  const [tireWidthMm, setTireWidthMm] = useState(() => defaultWidthForProfile(routeProfile));
  const [surface, setSurface] = useState<Surface>(() =>
    routeProfile ? mapRouteSurfaceToPressSurface(routeProfile) : 'paved',
  );
  const [tubeless, setTubeless] = useState(true);

  const result = useMemo(
    () =>
      calculateTirePressure({
        riderWeightKg,
        tireWidthMm,
        surface,
        tubeless,
      }),
    [riderWeightKg, tireWidthMm, surface, tubeless],
  );

  return (
    <Box data-testid="rb2-tire-panel">
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 8,
        }}
      >
        Tire Pressure
      </Text>

      {/* Rider weight */}
      <Group justify="space-between" align="center" mb={8}>
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textSecondary }}>
          Rider weight
        </Text>
        <Group gap={6} align="center">
          <UnstyledButton
            aria-label="Decrease rider weight"
            data-testid="rb2-tire-weight-down"
            onClick={() => setRiderWeightKg((w) => Math.max(35, w - 1))}
            style={chipStyle(false)}
          >
            –
          </UnstyledButton>
          <Text
            data-testid="rb2-tire-weight"
            style={{ fontFamily: RB2_FONT.mono, fontSize: 13, color: RB2.textPrimary, minWidth: 48, textAlign: 'center' }}
          >
            {isImperial ? `${Math.round(riderWeightKg * 2.20462)} lb` : `${riderWeightKg} kg`}
          </Text>
          <UnstyledButton
            aria-label="Increase rider weight"
            data-testid="rb2-tire-weight-up"
            onClick={() => setRiderWeightKg((w) => Math.min(150, w + 1))}
            style={chipStyle(false)}
          >
            +
          </UnstyledButton>
        </Group>
      </Group>

      {/* Tire width */}
      <Text style={chipGroupLabel}>Tire width (mm)</Text>
      <Group gap={4} mb={8}>
        {TIRE_WIDTHS.map((w) => (
          <UnstyledButton
            key={w}
            data-testid={`rb2-tire-width-${w}`}
            onClick={() => {
              setTireWidthMm(w);
              trackRb2('tire_width_changed', { width: w });
            }}
            style={chipStyle(w === tireWidthMm)}
          >
            {w}
          </UnstyledButton>
        ))}
      </Group>

      {/* Surface */}
      <Text style={chipGroupLabel}>Surface</Text>
      <Group gap={4} mb={8}>
        {SURFACES.map((s) => (
          <UnstyledButton
            key={s}
            data-testid={`rb2-tire-surface-${s}`}
            onClick={() => {
              setSurface(s);
              trackRb2('tire_surface_changed', { surface: s });
            }}
            style={chipStyle(s === surface)}
          >
            {SURFACE_LABELS[s]}
          </UnstyledButton>
        ))}
      </Group>

      <Switch
        checked={tubeless}
        onChange={(e) => setTubeless(e.currentTarget.checked)}
        label="Tubeless"
        size="xs"
        color="teal"
        data-testid="rb2-tire-tubeless"
        mb={10}
        styles={{ label: { fontFamily: RB2_FONT.body, fontSize: 12, color: RB2.textSecondary } }}
      />

      {/* Result */}
      <Group gap={0} grow style={{ borderTop: `1px solid ${RB2.bgSecondary}`, paddingTop: 10 }}>
        <PressureReadout label="Front" psi={result.frontPsi} bar={result.frontBar} testid="rb2-tire-front" />
        <PressureReadout label="Rear" psi={result.rearPsi} bar={result.rearBar} testid="rb2-tire-rear" />
      </Group>

      {result.warnings.length > 0 && (
        <Box data-testid="rb2-tire-warnings" style={{ marginTop: 10 }}>
          {result.warnings.map((w, i) => (
            <Group key={i} gap={4} align="flex-start" wrap="nowrap" mb={2}>
              <WarningCircle size={13} color={RB2.coral} style={{ marginTop: 2, flexShrink: 0 }} />
              <Text style={{ fontFamily: RB2_FONT.body, fontSize: 11, color: RB2.textSecondary }}>
                {w}
              </Text>
            </Group>
          ))}
        </Box>
      )}

      <Group gap={4} mt={10} align="flex-start" wrap="nowrap">
        <Gauge size={11} color={RB2.textTertiary} style={{ marginTop: 2, flexShrink: 0 }} />
        <Text style={{ fontFamily: RB2_FONT.body, fontSize: 10, color: RB2.textTertiary, lineHeight: 1.3 }}>
          Starting point only — adjust ±5 PSI to taste, and check your tire&apos;s printed max.
        </Text>
      </Group>
    </Box>
  );
}

function PressureReadout({
  label,
  psi,
  bar,
  testid,
}: {
  label: string;
  psi: number;
  bar: number;
  testid: string;
}) {
  return (
    <Box data-testid={testid}>
      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: RB2.textTertiary }}>
        {label}
      </Text>
      <Text style={{ fontFamily: RB2_FONT.heading, fontSize: 22, color: RB2.textPrimary, lineHeight: 1.1 }}>
        {Math.round(psi)}
        <Text component="span" style={{ fontFamily: RB2_FONT.mono, fontSize: 11, color: RB2.textTertiary }}>
          {' '}PSI
        </Text>
      </Text>
      <Text style={{ fontFamily: RB2_FONT.mono, fontSize: 10, color: RB2.textTertiary }}>
        {bar.toFixed(1)} bar
      </Text>
    </Box>
  );
}

const chipGroupLabel = {
  fontFamily: RB2_FONT.mono,
  fontSize: 9,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: RB2.textTertiary,
  marginBottom: 4,
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 9px',
    fontFamily: RB2_FONT.mono,
    fontSize: 11,
    letterSpacing: '0.02em',
    border: `1px solid ${active ? RB2.teal : RB2.border}`,
    backgroundColor: active ? RB2.teal : 'transparent',
    color: active ? RB2.textInverse : RB2.textSecondary,
  };
}

export default TirePressurePanel;
