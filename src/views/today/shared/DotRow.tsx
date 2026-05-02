interface Props {
  total: number;
  completed: number;
}

/**
 * 5-dot week completion indicator. Filled dots = completed planned rides;
 * outlined dots = remaining slots. Renders exactly `total` dots; if total is
 * zero, falls back to 5 outlined dots so the cell preserves layout.
 */
export function DotRow({ total, completed }: Props) {
  const slots = total > 0 ? total : 5;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 12 }}>
      {Array.from({ length: slots }).map((_, idx) => {
        const isFilled = idx < completed;
        return (
          <span
            key={idx}
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              background: isFilled ? 'var(--color-teal)' : 'transparent',
              border: `1px solid ${isFilled ? 'var(--color-teal)' : 'var(--color-border)'}`,
              borderRadius: 0,
            }}
          />
        );
      })}
    </div>
  );
}
