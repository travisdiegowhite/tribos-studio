import { FONT, levelColor, levelSubtle } from './garageTokens';
import type { WearLevel } from '../../lib/gear/wearSeries';

/** Plain-word status chip: FRESH / WEARING IN / NEARLY DONE / PAST DUE. */
export function StatusChip({ level, word }: { level: WearLevel; word: string }) {
  const color = levelColor(level);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
        border: `1px solid ${color}`, background: levelSubtle(level),
        fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '1px',
        textTransform: 'uppercase', color, whiteSpace: 'nowrap', borderRadius: 0,
      }}
    >
      <span style={{ width: 5, height: 5, background: color, display: 'inline-block' }} />
      {word}
    </span>
  );
}

/** Neutral mono chip for facts: ROAD · 4,120 MI · 212 RIDES. */
export function FactChip({ children }: { children: string }) {
  return (
    <span
      style={{
        display: 'inline-block', padding: '3px 8px', border: '1px solid var(--color-border)',
        fontFamily: FONT.mono, fontSize: 11, fontWeight: 500, letterSpacing: '1px',
        textTransform: 'uppercase', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', borderRadius: 0,
      }}
    >
      {children}
    </span>
  );
}
