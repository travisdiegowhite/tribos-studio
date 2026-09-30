import { Link } from 'react-router-dom';

// The coach in its own voice — one exchange, no bubbles or bot icons.

export default function CoachQuote() {
  return (
    <section id="coach" className="lp-coach">
      <div className="lp-wrap lp-coach-inner" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="lp-coach-label">The coach, unedited</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.55 }}>
            &ldquo;Legs feel heavy and I&rsquo;ve only got an hour tomorrow. Should I still do the
            intervals?&rdquo;
          </p>
          <p className="lp-coach-quote">
            No. Heavy legs plus a short window is a recovery day wearing a disguise. Spin for an
            hour, keep it under 150 W, and we&rsquo;ll put the intervals on Saturday before the long
            ride instead.
          </p>
          <Link to="/learn/metrics" style={{ fontSize: 15 }}>
            See the numbers the coach reads &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
