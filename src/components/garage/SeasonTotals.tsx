import { Box } from '@mantine/core';
import type { SeasonTotals as Totals } from '../../lib/gear/wearSeries';
import { formatWhole } from '../../lib/gear/wearSeries';
import { FONT } from './garageTokens';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontFamily: FONT.display, fontSize: 24, fontWeight: 700, lineHeight: 1, color: 'var(--color-text-primary)' }}>{value}</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 9, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</span>
    </Box>
  );
}

/** Six numbers for the window the timeline shows. */
export function SeasonTotals({ totals, useImperial, sinceLabel }: { totals: Totals; useImperial: boolean; sinceLabel: string }) {
  const u = useImperial ? 'mi' : 'km';
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
      <Stat value={formatWhole(totals.distanceM, useImperial)} label={`${u} since ${sinceLabel}`} />
      <Stat value={formatWhole(totals.wetM, useImperial)} label={`wet ${u}`} />
      <Stat value={formatWhole(totals.offroadM, useImperial)} label={`gravel ${u}`} />
      <Stat value={formatWhole(totals.indoorM, useImperial)} label={`trainer ${u}`} />
      <Stat value={totals.costPerUnit !== null ? `$${totals.costPerUnit.toFixed(2)}` : '—'} label={`per ${useImperial ? 'mile' : 'km'}`} />
      <Stat value={String(totals.partsReplaced)} label="parts replaced" />
    </Box>
  );
}
