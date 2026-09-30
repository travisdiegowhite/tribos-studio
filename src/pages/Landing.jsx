import { Link } from 'react-router-dom';
import { Button } from '@mantine/core';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

// Landing sections — a short "about" page. The product itself is the front
// door (/ lands guests in the route builder); this page lives at /welcome
// for anyone who wants the pitch. Layout follows the "Blend — landing" board
// in docs/DESIGN-OVERHAUL-PLAN-2026-09.md.
import LandingHero from '../components/landing/LandingHero';
import WeekLedger from '../components/landing/WeekLedger';
import CoachQuote from '../components/landing/CoachQuote';

import '../components/landing/landing.css';

function Landing() {
  return (
    <div className="lp-shell">
      <SEO
        title="tribos.studio - Cycling Route Builder, Coach & Training Platform"
        description="tribos is an AI route builder and cycling coach. Build routes free with no account; create a free account to sync Strava, Garmin, or Wahoo and get coaching from your real ride history."
        keywords="cycling route builder, cycling route planner, cycling coach, cycling training platform, bike route builder, cycling training plans, strava route builder, garmin route sync, cycling analytics, cycling power analysis"
        url="https://tribos.studio/welcome"
        image="https://tribos.studio/og-image.svg"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [getOrganizationSchema(), getWebSiteSchema()],
        }}
      />

      <header className="lp-nav">
        <nav className="lp-wrap lp-nav-inner" aria-label="Main">
          <Link to="/welcome" className="lp-wordmark">tribos</Link>
          <div className="lp-nav-links">
            <Link to="/ride/new" className="lp-nav-link lp-hide-narrow">Build a route</Link>
            <a href="#coach" className="lp-nav-link lp-hide-narrow">How the coach works</a>
            <Link to="/auth" className="lp-nav-link">Sign in</Link>
            <Button component={Link} to="/auth?mode=signup" size="sm">
              Start riding
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <LandingHero />
        <WeekLedger />
        <CoachQuote />
      </main>

      <footer className="lp-wrap">
        <div className="lp-footer">
          <span className="lp-mark" aria-hidden="true">
            <span style={{ background: 'var(--color-ink)' }} />
            <span style={{ background: 'var(--color-signal)' }} />
            <span style={{ background: 'var(--color-border)' }} />
          </span>
          <span>Travis makes tribos, built on ideas while riding Boulder County roads.</span>
          <span style={{ flexGrow: 1 }} />
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/support">Support</a>
          <a href="mailto:travis@tribos.studio">Contact</a>
          <a href="mailto:travis@tribos.studio?subject=Abuse%20Report">Report abuse</a>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
