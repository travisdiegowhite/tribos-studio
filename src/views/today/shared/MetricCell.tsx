import type { ReactNode } from 'react';
import type { ColorToken } from '../../../utils/todayVocabulary';
import { colorVar } from '../../../utils/todayVocabulary';

interface Props {
  label: string;
  visual: ReactNode;
  word: string;
  wordToken: ColorToken;
  subtitle?: string | null;
}

/**
 * Standard 4-cell metric layout: mono uppercase label, visual element,
 * interpretation word in semantic color, and a mono numeric subtitle.
 */
export function MetricCell({ label, visual, word, wordToken, subtitle }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        {label}
      </span>
      <div>{visual}</div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: colorVar(wordToken),
        }}
      >
        {word}
      </span>
      {subtitle ? (
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10,
            color: 'var(--color-text-muted)',
            letterSpacing: '0.04em',
          }}
        >
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
