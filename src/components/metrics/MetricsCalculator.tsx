/**
 * MetricsCalculator — Tabbed container for EFI, TWL, TCAS calculators
 *
 * Educational tool for understanding Tribos proprietary metrics.
 * Publicly accessible at /learn/metrics.
 */
import { Tabs, Text, Stack, Box } from '@mantine/core';
import { EFICalculator } from './EFICalculator';
import { TWLCalculator } from './TWLCalculator';
import { TCASCalculator } from './TCASCalculator';

export function MetricsCalculator() {
  return (
    <Stack gap="md">
      <div>
        <Text style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          fontSize: 20, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--color-text-primary)',
        }}>
          Training Metrics Calculator
        </Text>
        <Text size="sm" c="dimmed" mt={4}>
          Explore how Tribos proprietary metrics work. Adjust the sliders to see how different
          training patterns affect your scores.
        </Text>
      </div>

      <Tabs defaultValue="efi">
        <Tabs.List>
          <Tabs.Tab value="efi">
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>EFI</Text>
          </Tabs.Tab>
          <Tabs.Tab value="twl">
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>TWL</Text>
          </Tabs.Tab>
          <Tabs.Tab value="tcas">
            <Text style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 600 }}>TCAS</Text>
          </Tabs.Tab>
        </Tabs.List>

        <Box mt="md">
          <Tabs.Panel value="efi">
            <Stack gap="xs">
              <Text size="sm" fw={600}>Execution Fidelity Index</Text>
              <Text size="xs" c="dimmed" mb="sm">
                How faithfully are you executing your planned workouts? EFI combines volume accuracy,
                intensity zone matching, and session consistency into a single 0-100 score.
              </Text>
              <EFICalculator />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="twl">
            <Stack gap="xs">
              <Text size="sm" fw={600}>Terrain-Weighted Load</Text>
              <Text size="xs" c="dimmed" mb="sm">
                TSS is terrain-blind. TWL adjusts your training load for climbing rate, gradient
                variability, and altitude — revealing the hidden physiological cost of where you ride.
              </Text>
              <TWLCalculator />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="tcas">
            <Stack gap="xs">
              <Text size="sm" fw={600}>Time-Constrained Adaptation Score</Text>
              <Text size="xs" c="dimmed" mb="sm">
                Standard metrics reward volume. TCAS measures how efficiently you turn available
                training hours into real fitness — validating that your gains are aerobically sound.
              </Text>
              <TCASCalculator />
            </Stack>
          </Tabs.Panel>
        </Box>
      </Tabs>
    </Stack>
  );
}
