interface Props {
  title: string;
  subtitle: string;
}

/**
 * Mono uppercase title + tertiary-text subtitle pair. Mirrors the sectional
 * label/subtitle pattern the spec specifies on every cluster.
 */
export function ClusterHeader({ title, subtitle }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--color-teal)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: 10,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        {subtitle}
      </span>
    </div>
  );
}
