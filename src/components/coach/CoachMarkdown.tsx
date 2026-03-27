/**
 * CoachMarkdown — renders coach response text with markdown formatting.
 *
 * Wraps react-markdown with Mantine-compatible styling so bold, lists,
 * and paragraphs render correctly at any text size.
 */

import ReactMarkdown from 'react-markdown';

interface CoachMarkdownProps {
  children: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  color?: string;
}

const SIZE_MAP: Record<string, { fontSize: number; lineHeight: number }> = {
  xs: { fontSize: 12, lineHeight: 1.5 },
  sm: { fontSize: 14, lineHeight: 1.5 },
  md: { fontSize: 16, lineHeight: 1.55 },
  lg: { fontSize: 18, lineHeight: 1.6 },
};

export function CoachMarkdown({ children, size = 'sm', color }: CoachMarkdownProps) {
  const { fontSize, lineHeight } = SIZE_MAP[size] || SIZE_MAP.sm;

  return (
    <div
      style={{
        fontSize,
        lineHeight,
        color: color || 'inherit',
      }}
      className="coach-markdown"
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p style={{ margin: '0 0 0.5em 0' }}>{children}</p>
          ),
          strong: ({ children }) => (
            <strong style={{ fontWeight: 700 }}>{children}</strong>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: '0.25em 0 0.5em 0', paddingLeft: '1.25em' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '0.25em 0 0.5em 0', paddingLeft: '1.25em' }}>{children}</ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: '0.15em' }}>{children}</li>
          ),
          // Keep code inline and styled
          code: ({ children }) => (
            <code
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.9em',
                padding: '0.1em 0.3em',
                borderRadius: 2,
                backgroundColor: 'var(--color-bg-secondary, rgba(0,0,0,0.05))',
              }}
            >
              {children}
            </code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
