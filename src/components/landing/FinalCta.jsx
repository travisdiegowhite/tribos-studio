import { Link } from 'react-router-dom';
import { Button } from '@mantine/core';

// Closing band: the same two ways in as the hero.

export default function FinalCta() {
  return (
    <section className="lp-wrap">
      <div className="lp-cta-band">
        <h2 className="lp-h2">Start with a ride.</h2>
        <div className="lp-cta-actions">
          <Button component={Link} to="/ride/new" size="lg" className="lp-cta">
            Build a route
          </Button>
          <Link to="/auth?mode=signup" className="lp-nav-link">
            Create a free account &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
