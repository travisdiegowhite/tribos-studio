import { Box } from '@mantine/core';

interface MetricBarEmptyProps {
  height?: number;
}

const STRIPE_PATTERN =
  'repeating-linear-gradient(90deg, #EBEBE8 0, #EBEBE8 4px, #DDDDD8 4px, #DDDDD8 8px)';

/**
 * Empty-state visual for any zone bar (FORM, FATIGUE, EFI, TCAS, PLAN).
 *
 * Same width and height as the populated `<MetricBar>`, but renders the
 * striped pattern from the spec instead of zone fills. No marker. The
 * cell's word and subtitle communicate what's missing — this is just the
 * "data not yet populated" surface.
 */
export function MetricBarEmpty({ height = 8 }: MetricBarEmptyProps) {
  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: STRIPE_PATTERN,
      }}
    />
  );
}
