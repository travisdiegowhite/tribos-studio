/**
 * MetricCitation — the sentence-first metric display primitive.
 *
 * The thesis rule (docs/TRIBOS_THESIS_AUDIT_2026-08.md, P4): plain language
 * carries the surface; the raw value renders subordinate — a quiet chip
 * citing the sentence, never the hero. This component makes that hierarchy
 * the API: `sentence` is required, metric chips are optional and always
 * render smaller and after the sentence, and an optional `receipt` line
 * carries a dated fact from the rider's own riding when one exists.
 *
 * Deliberately style-light (plain divs, no Mantine) so it can live inside
 * both Mantine surfaces and the Spine's token-styled canvas; hosts pass
 * font/shadow overrides through sentenceStyle / chipStyle.
 */

export interface MetricChipSpec {
  label: string;
  value: string | number;
  /** Optional accent for the value (e.g. a trend arrow's color). */
  color?: string;
}

export interface MetricCitationProps {
  /** The plain-language reading — the hero. Required by design. */
  sentence: string;
  /** Color for the sentence (e.g. the form band color). */
  color?: string;
  /** Raw values cited by the sentence; rendered as quiet chips beneath it. */
  metrics?: MetricChipSpec[];
  /** Optional evidence line — a dated, concrete fact ("Aug 2: 414W for 1 min"). */
  receipt?: string;
  size?: 'md' | 'lg';
  style?: React.CSSProperties;
  sentenceStyle?: React.CSSProperties;
  chipStyle?: React.CSSProperties;
}

export function MetricCitation({
  sentence,
  color,
  metrics,
  receipt,
  size = 'md',
  style,
  sentenceStyle,
  chipStyle,
}: MetricCitationProps) {
  const sentenceSize = size === 'lg' ? 22 : 18;
  return (
    <div style={style}>
      <div
        style={{
          fontWeight: 700,
          fontSize: sentenceSize,
          lineHeight: 1.2,
          color: color ?? 'inherit',
          ...sentenceStyle,
        }}
      >
        {sentence}
      </div>
      {metrics && metrics.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 5,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            opacity: 0.85,
            ...chipStyle,
          }}
        >
          {metrics.map((m) => (
            <span key={m.label} style={{ whiteSpace: 'nowrap' }}>
              <span style={{ letterSpacing: '.5px' }}>{m.label}</span>{' '}
              <span style={{ fontWeight: 600, color: m.color }}>{m.value}</span>
            </span>
          ))}
        </div>
      )}
      {receipt && (
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4, opacity: 0.75, ...chipStyle }}>
          {receipt}
        </div>
      )}
    </div>
  );
}
