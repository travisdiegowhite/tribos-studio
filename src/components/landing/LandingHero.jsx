import { Link } from 'react-router-dom';
import { Button } from '@mantine/core';
import { fullRoute } from './routeData';
import { haversineKm } from '../../utils/distanceUnits';

// The hero's route sheet draws the real Erie gravel loop from routeData.js as
// a line on paper rather than a map tile — the mockup's "field notes" look,
// and no Mapbox token or tile download needed on the pitch page.

const VIEW_W = 400;
const PAD = 16;

function projectRoute(coords) {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  // Equirectangular with a cos(lat) correction is plenty for a ~50 mi loop.
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * kx;
  const spanY = maxLat - minLat;
  const scale = (VIEW_W - PAD * 2) / Math.max(spanX, spanY);
  const height = Math.round(spanY * scale + PAD * 2);
  const pts = coords.map(([lon, lat]) => [
    PAD + (lon - minLon) * kx * scale,
    PAD + (maxLat - lat) * scale,
  ]);
  return { pts, height, minLon };
}

function toPath(pts) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

// The one real climb is the loop's western reach toward Coal Creek Canyon:
// the longest contiguous run of points within ~0.06° of the westernmost point.
function climbRange(coords, minLon) {
  let best = [0, 0];
  let start = -1;
  coords.forEach(([lon], i) => {
    const inClimb = lon < minLon + 0.06;
    if (inClimb && start < 0) start = i;
    if ((!inClimb || i === coords.length - 1) && start >= 0) {
      const end = inClimb ? i : i - 1;
      if (end - start > best[1] - best[0]) best = [start, end];
      start = -1;
    }
  });
  return best;
}

const { pts, height, minLon } = projectRoute(fullRoute);
const [climbStart, climbEnd] = climbRange(fullRoute, minLon);
const ROUTE_PATH = toPath(pts);
const CLIMB_PATH = toPath(pts.slice(climbStart, climbEnd + 1));
const START = pts[0];

const distance_km = fullRoute.slice(1).reduce(
  (sum, [lng, lat], i) => sum + haversineKm(fullRoute[i][1], fullRoute[i][0], lat, lng),
  0,
);

export default function LandingHero() {
  return (
    <section className="lp-wrap">
      <div className="lp-hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingTop: 16 }}>
          <h1 className="lp-hero-title">Routes that fit the training you&rsquo;re actually doing.</h1>
          <p className="lp-lede">
            Tell tribos how the week has gone. It picks today&rsquo;s session, then draws a road to
            ride it on: climbs where the intervals go, quiet lanes on recovery days.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
            <Button component={Link} to="/ride/new" size="lg" className="lp-cta">
              Build a route
            </Button>
            <span className="tribos-stamp">No account needed</span>
          </div>
        </div>

        <figure className="lp-sheet" style={{ margin: 0 }}>
          <div className="lp-sheet-head">
            <span>Saturday &middot; Long ride, gravel</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, color: 'var(--color-text-muted)' }}>
              sheet 14
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 36, lineHeight: 1, textTransform: 'uppercase' }}>
            Erie gravel loop
          </div>

          <div className="lp-route">
            <svg viewBox={`0 0 ${VIEW_W} ${height}`} role="img" aria-label="Route map of the Erie gravel loop">
              <path
                d={CLIMB_PATH}
                fill="none"
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(4 3)"
                className="lp-overprint"
                style={{ stroke: 'var(--color-highlight)' }}
              />
              <path
                className="lp-route-line"
                d={ROUTE_PATH}
                pathLength={1}
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ stroke: 'var(--color-ink)' }}
              />
              <circle cx={START[0]} cy={START[1]} r={5} style={{ fill: 'var(--color-ink)' }} />
            </svg>
            {/* One hand note, set in the loop's empty south-west corner so it
                never sits on the line. */}
            <span className="tribos-hand lp-note-climb" style={{ left: 0, top: '38%', maxWidth: '34%' }}>
              &uarr; the one climb. sit at 170&nbsp;W
            </span>
          </div>

          <div className="lp-stats">
            <span>{distance_km.toFixed(1)} km</span>
            <span>{(distance_km * 0.621371).toFixed(1)} mi</span>
            <span style={{ color: 'var(--color-text-muted)' }}>gravel</span>
          </div>

          <p className="lp-coach-note">
            The lime stretch is the one real climb. Sit at 170 W up it and don&rsquo;t chase
            anyone. Everything else is conversation pace.
          </p>
        </figure>
      </div>
    </section>
  );
}
