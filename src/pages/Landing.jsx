import { Link } from 'react-router-dom';
import { Button } from '@mantine/core';
import SEO, { getOrganizationSchema, getWebSiteSchema } from '../components/SEO';

// Landing page — what guests see at / (and anyone at /welcome). It explains
// the whole product and keeps the guest route builder as the main way in.
// Layout follows the "Blend — landing" board in
// docs/DESIGN-OVERHAUL-PLAN-2026-09.md.
import LandingHero from '../components/landing/LandingHero';
import FeatureGrid from '../components/landing/FeatureGrid';
import HowItWorks from '../components/landing/HowItWorks';
import WeekLedger from '../components/landing/WeekLedger';
import CoachQuote from '../components/landing/CoachQuote';
import FinalCta from '../components/landing/FinalCta';

import '../components/landing/landing.css';

function Landing() {
  return (
    <div className="lp-shell">
      <SEO
        title="tribos.studio - Cycling Route Builder, Coach & Training Platform"
        description="tribos puts your cycling in one place: an AI route builder, a training calendar, a coach that reads your real rides, ride sync from Strava, Garmin, Wahoo and COROS, fitness tracking and a garage for your bikes. Build a route free with no account."
        keywords="cycling route builder, cycling route planner, cycling coach, cycling training platform, bike route builder, cycling training plans, strava route builder, garmin route sync, cycling analytics, cycling power analysis"
        url="https://tribos.studio/"
        image="https://tribos.studio/og-image.svg"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [getOrganizationSchema(), getWebSiteSchema()],
        }}
      />

      <header className="lp-nav">
        <nav className="lp-wrap lp-nav-inner" aria-label="Main">
          <Link to="/" className="lp-wordmark">tribos</Link>
          <div className="lp-nav-links">
            <a href="#features" className="lp-nav-link lp-hide-narrow">What&rsquo;s in it</a>
            <a href="#coach" className="lp-nav-link lp-hide-narrow">How the coach works</a>
            <Link to="/auth?mode=signup" className="lp-nav-link lp-hide-narrow">Sign up</Link>
            <Link to="/auth" className="lp-nav-link">Sign in</Link>
            <Button component={Link} to="/ride/new" size="sm">
              Build a route
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <LandingHero />
        <FeatureGrid />
        <HowItWorks />
        <WeekLedger />
        <CoachQuote />
        <FinalCta />
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
