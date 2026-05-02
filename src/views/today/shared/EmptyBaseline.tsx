/**
 * Empty-state filler for any metric cell whose value isn't computed yet.
 * Renders the empty bar shell (no marker), the "Building baseline" word in
 * tertiary gray, and no numeric subtitle.
 */
export function EmptyBaseline() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          height: 6,
          width: '100%',
          background: 'var(--color-bg-secondary)',
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--tribos-neutral-gray)',
        }}
      >
        Building baseline
      </span>
    </div>
  );
}
