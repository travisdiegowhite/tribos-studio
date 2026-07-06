/**
 * ForumMarkdown — renders user-authored forum content as markdown.
 *
 * Modeled on CoachMarkdown but tuned for user content: quotes, links
 * (opened in a new tab), and @mention highlighting. react-markdown does
 * not render raw HTML by default, which is what we want for user input.
 */

import ReactMarkdown from 'react-markdown';

const MENTION_REGEX = /(@[A-Za-z0-9_.-]{2,60})/g;

// Wrap @mentions in styled spans within plain text nodes
function highlightMentions(children) {
  const walk = (node, key) => {
    if (typeof node === 'string') {
      const parts = node.split(MENTION_REGEX);
      if (parts.length === 1) return node;
      return parts.map((part, i) =>
        /^@[A-Za-z0-9_.-]{2,60}$/.test(part) ? (
          <span
            key={`${key}-${i}`}
            style={{ color: 'var(--color-teal)', fontWeight: 600 }}
          >
            {part}
          </span>
        ) : (
          part
        )
      );
    }
    if (Array.isArray(node)) return node.map((n, i) => walk(n, `${key}-${i}`));
    return node;
  };
  return walk(children, 'm');
}

function ForumMarkdown({ children, size = 'sm' }) {
  const fontSize = size === 'xs' ? 12 : size === 'md' ? 16 : 14;

  return (
    <div style={{ fontSize, lineHeight: 1.55, color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p style={{ margin: '0 0 0.6em 0' }}>{highlightMentions(children)}</p>
          ),
          h1: ({ children }) => <p style={{ margin: '0 0 0.5em 0', fontWeight: 700, fontSize: '1.15em' }}>{children}</p>,
          h2: ({ children }) => <p style={{ margin: '0 0 0.5em 0', fontWeight: 700, fontSize: '1.1em' }}>{children}</p>,
          h3: ({ children }) => <p style={{ margin: '0 0 0.5em 0', fontWeight: 700 }}>{children}</p>,
          strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ color: 'var(--color-teal)' }}
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: '0 0 0.6em 0',
                padding: '0.25em 0.75em',
                borderLeft: '3px solid var(--color-teal)',
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul style={{ margin: '0.25em 0 0.6em 0', paddingLeft: '1.25em' }}>{children}</ul>
          ),
          ol: ({ children }) => (
            <ol style={{ margin: '0.25em 0 0.6em 0', paddingLeft: '1.25em' }}>{children}</ol>
          ),
          li: ({ children }) => <li style={{ marginBottom: '0.15em' }}>{highlightMentions(children)}</li>,
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
          img: () => null, // no inline images in v1 (no upload pipeline yet)
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default ForumMarkdown;
