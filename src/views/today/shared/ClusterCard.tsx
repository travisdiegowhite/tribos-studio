import type { CSSProperties, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/**
 * Outer wrapper for every Today view cluster. Flat white card, 1px hairline
 * border, no rounding, no shadow. 14px vertical / 16px horizontal padding.
 */
export function ClusterCard({ children, style, className }: Props) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--tribos-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 0,
        padding: '14px 16px',
        boxShadow: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
