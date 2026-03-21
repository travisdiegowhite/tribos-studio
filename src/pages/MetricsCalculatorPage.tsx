/**
 * MetricsCalculatorPage — Public educational page for Tribos metrics
 *
 * Accessible without authentication at /learn/metrics.
 */
import { Container, Stack } from '@mantine/core';
import { MetricsCalculator } from '../components/metrics/MetricsCalculator';

export default function MetricsCalculatorPage() {
  return (
    <Container size="sm" py="xl" px={20}>
      <Stack gap="lg">
        <MetricsCalculator />
      </Stack>
    </Container>
  );
}
