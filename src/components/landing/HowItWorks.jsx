// How the pieces connect, in three steps.

const STEPS = [
  {
    title: 'Connect your rides',
    body: 'Link Strava, Garmin or Wahoo. Your history comes in, and tribos learns what your fitness actually is.',
  },
  {
    title: 'Set a goal',
    body: 'A race, an event or just getting fitter. Pick a plan, or ask the coach to build the next few weeks around your life.',
  },
  {
    title: 'Ride today’s session',
    body: 'Each morning tribos shows the workout, with one tap to build a route for it. Ride it, it syncs, and the plan adjusts.',
  },
];

export default function HowItWorks() {
  return (
    <section className="lp-wrap">
      <div className="lp-steps">
        <h2 className="lp-h2">How it fits together.</h2>
        <ol className="lp-step-list">
          {STEPS.map((s, i) => (
            <li key={s.title} className="lp-step">
              <span className="lp-step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="lp-h3">{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
