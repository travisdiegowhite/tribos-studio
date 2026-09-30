// The hand-drawn tick that marks "done" across the app. Done is always moss
// plus this mark — never a colour alone (see CLAUDE.md, Design System).

export default function HandTick({ size = 16, color = 'var(--color-done)', title }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.9)}
      viewBox="0 0 44 40"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flexShrink: 0, verticalAlign: '-2px' }}
    >
      <path
        d="M4 22 C 9 25, 12 30, 15 35 C 21 22, 30 11, 41 4"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: color }}
      />
    </svg>
  );
}
