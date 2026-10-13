import { Link } from 'react-router-dom';

// "What's in tribos": one cell per part of the product, flat on rules.
// Copy only claims what ships today; check the code before adding a cell.

const FEATURES = [
  {
    title: 'Routes',
    body: 'Describe the ride or draw it. Road, gravel or quiet lanes, shaped to the session, then exported as GPX, TCX or FIT for your head unit.',
    link: { to: '/ride/new', label: 'Build one now' },
  },
  {
    title: 'Calendar',
    body: 'Pick a plan and it fills your calendar. Races and your own rides sit alongside it, and you can move anything.',
  },
  {
    title: 'Coach',
    body: 'Ask it anything. It reads your real rides, moves sessions when your week changes and leaves a note saying why.',
  },
  {
    title: 'Sync',
    body: 'Connect Strava, Garmin, Wahoo or COROS once. Every ride lands on its own, with power, heart rate and the route.',
  },
  {
    title: 'Progress',
    body: 'Fitness, fatigue and form from the stress of each ride, plus power curves and the rides that moved them.',
    link: { to: '/learn/metrics', label: 'How the numbers work' },
  },
  {
    title: 'Garage',
    body: 'Your bikes and their parts, with wear tracked from the miles you actually ride. See which parts are wearing out.',
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="lp-wrap">
      <div className="lp-features">
        <h2 className="lp-h2">What&rsquo;s in tribos.</h2>
        <div className="lp-feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature">
              <h3 className="lp-h3">{f.title}</h3>
              <p>{f.body}</p>
              {f.link && (
                <Link to={f.link.to} className="lp-feature-link">
                  {f.link.label} &rarr;
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
