/**
 * The routing landing: the builder is the page (docs/ROUTING-LANDING-SPEC.md
 * §1). A start, a distance, a surface and a comfort level make a loop with no
 * AI, through the comfort ladder (src/utils/comfortLadder.ts).
 *
 * Not on `/` yet. RootRoute renders it for signed-out visitors only with
 * VITE_ROUTING_LANDING=true. Until then it previews at /ride/start.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Autocomplete, Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import SEO from '../../components/SEO';
import { COMFORT_LEVELS, comfortLabel, type ComfortLevel } from '../../utils/comfortLevels';
import type { ComfortCandidate, ComfortPlan } from '../../utils/comfortLadder';
import { PRODUCT_NAME } from '../../utils/product';
import { Segmented } from './Segmented';
import { ComfortCard } from './ComfortCard';
import { FirstVisitCard } from './FirstVisitCard';
import { LandingMap } from './LandingMap';
import { LandingResult } from './LandingResult';
import { LANDING_COPY } from './landingCopy';
import {
  DISTANCE_OPTIONS_MI,
  loadLandingForm,
  saveLandingForm,
  shouldShowFirstVisitCard,
  markFirstVisitCardSeen,
  type LandingForm,
  type LandingSurface,
} from './landingPrefs';
import { searchStart, reverseGeocodeStart, currentLocation, type StartSuggestion } from './geocodeStart';
import { planLandingRoute } from './landingEngine';
import { firstToShow } from './firstToShow';
import { trackLanding, routeResultProps } from './landingTelemetry';
import './routingLanding.css';

const C = LANDING_COPY;

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; plan: ComfortPlan }
  | { kind: 'error'; message: string };

export default function RoutingLanding() {
  const [form, setForm] = useState<LandingForm>(() => loadLandingForm());
  const [showCard, setShowCard] = useState<boolean>(() => shouldShowFirstVisitCard());
  const [suggestions, setSuggestions] = useState<StartSuggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [shown, setShown] = useState<ComfortCandidate | null>(null);
  const [bearingDeg, setBearingDeg] = useState(0);
  // Desktop: the first-visit card overlays the map column. Phone: above the form.
  const wide = useMediaQuery('(min-width: 62em)', true, { getInitialValueInEffect: false });
  const searchAbort = useRef<AbortController | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    trackLanding('landing_viewed', { first_visit: showCard });
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => saveLandingForm(form), [form]);

  const update = useCallback((patch: Partial<LandingForm>) => setForm((f) => ({ ...f, ...patch })), []);

  // Debounced start search.
  useEffect(() => {
    const q = form.startLabel.trim();
    if (q.length < 3 || suggestions.some((s) => s.label === form.startLabel)) return;
    const t = setTimeout(async () => {
      searchAbort.current?.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      try {
        setSuggestions(await searchStart(q, form.start, ctrl.signal));
      } catch {
        /* aborted or offline: keep what we have */
      }
    }, 250);
    return () => clearTimeout(t);
    // form.start only biases the search; don't refire on it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.startLabel]);

  const onStartChange = (label: string) => {
    const match = suggestions.find((s) => s.label === label);
    update(match ? { startLabel: label, start: match.coordinates } : { startLabel: label, start: label === form.startLabel ? form.start : null });
    setFieldError(null);
  };

  const useMyLocation = async () => {
    setLocating(true);
    setFieldError(null);
    try {
      const coord = await currentLocation();
      const label = (await reverseGeocodeStart(coord)) ?? 'My location';
      update({ start: coord, startLabel: label });
    } catch (err) {
      setFieldError((err as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const run = useCallback(
    async (f: LandingForm, bearing: number) => {
      if (!f.start) {
        setFieldError(C.needStart);
        return;
      }
      const id = ++runId.current;
      setStatus({ kind: 'working' });
      setShown(null);
      trackLanding('route_requested', {
        distance: f.distanceMi,
        surface: f.surface,
        comfort: f.comfortLevel,
        has_location: true,
        is_guest: true,
      });
      const t0 = performance.now();
      try {
        const plan = await planLandingRoute({
          start: f.start,
          distanceMi: f.distanceMi,
          surface: f.surface,
          comfortLevel: f.comfortLevel,
          bearingDeg: bearing,
        });
        if (id !== runId.current) return;
        trackLanding('route_result', routeResultProps(plan, Math.round(performance.now() - t0)));
        setStatus({ kind: 'done', plan });
        setShown(firstToShow(plan));
      } catch {
        if (id !== runId.current) return;
        trackLanding('route_result', { outcome: 'error', latency_ms: Math.round(performance.now() - t0) });
        setStatus({ kind: 'error', message: C.result.engineError });
      }
    },
    [],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBearingDeg(0);
    void run(form, 0);
  };

  const tryAnother = () => {
    const next = (bearingDeg + 90) % 360;
    setBearingDeg(next);
    void run(form, next);
  };

  const tryLevel = (level: ComfortLevel) => {
    const next = { ...form, comfortLevel: level };
    setForm(next);
    void run(next, bearingDeg);
  };

  const dismissCard = () => {
    markFirstVisitCardSeen();
    setShowCard(false);
  };

  const comfortOptions = useMemo(
    () => COMFORT_LEVELS.map((l) => ({ value: l, label: <span className="rl-seg-stack"><span className="rl-num">{l}</span><span className="rl-seg-sub">{comfortLabel(l)}</span></span>, ariaLabel: `${l} ${comfortLabel(l)}` })),
    [],
  );

  return (
    <div className="rl-shell">
      <SEO
        title={`${PRODUCT_NAME} · Bike routes on roads you’ll want to ride`}
        description={C.subline}
        url="https://tribos.studio/"
      />
      <header className="rl-nav">
        <Link to="/" className="rl-wordmark">
          {PRODUCT_NAME}
        </Link>
        <nav aria-label="Account">
          <Link to="/auth" className="rl-nav-link">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="rl-main">
        <div className="rl-left">
          {showCard && !wide && <FirstVisitCard onDismiss={dismissCard} />}
          <h1 className="rl-headline">{C.headline}</h1>
          <p className="rl-subline">{C.subline}</p>

          <form className="rl-form" onSubmit={onSubmit} noValidate>
            <div className="rl-field">
              <Autocomplete
                label={C.startLabel}
                placeholder={C.startPlaceholder}
                value={form.startLabel}
                onChange={onStartChange}
                data={suggestions.map((s) => s.label)}
                filter={({ options }) => options}
                error={fieldError}
                autoComplete="off"
                radius={0}
              />
              <Button variant="subtle" size="compact-sm" onClick={useMyLocation} loading={locating} className="rl-locate">
                {locating ? C.locating : C.useLocation}
              </Button>
            </div>

            <Segmented
              legend={C.distanceLegend}
              name="distance"
              value={form.distanceMi}
              options={DISTANCE_OPTIONS_MI.map((d) => ({ value: d, label: <><span className="rl-num">{d}</span> mi</>, ariaLabel: `${d} miles` }))}
              onChange={(d) => update({ distanceMi: d })}
            />

            <Segmented<LandingSurface>
              legend={C.surfaceLegend}
              name="surface"
              value={form.surface}
              options={[
                { value: 'road', label: 'Road' },
                { value: 'gravel', label: 'Gravel' },
                { value: 'mixed', label: 'Mixed' },
              ]}
              onChange={(s) => update({ surface: s })}
            />

            <Segmented<ComfortLevel>
              legend={C.comfortLegend}
              name="comfort"
              value={form.comfortLevel}
              options={comfortOptions}
              onChange={(l) => update({ comfortLevel: l })}
              describedBy="rl-comfort-card"
            />
            <ComfortCard level={form.comfortLevel} id="rl-comfort-card" />

            <Button type="submit" size="lg" loading={status.kind === 'working'} className="rl-submit">
              {status.kind === 'working' ? C.submitting : C.submit}
            </Button>
            <p className="rl-free">{C.free}</p>
          </form>

          <div aria-live="polite">
            {status.kind === 'done' && (
              <LandingResult plan={status.plan} shown={shown} onShow={setShown} onTryLevel={tryLevel} onTryAnother={tryAnother} />
            )}
            {status.kind === 'error' && <p className="rl-stat-plain">{status.message}</p>}
          </div>
        </div>

        <div className="rl-right">
          {showCard && wide && <FirstVisitCard onDismiss={dismissCard} />}
          <LandingMap start={shown?.start ?? form.start} route={shown} />
        </div>
      </main>

      <section className="rl-proofs" aria-label={`Why ${PRODUCT_NAME}`}>
        {C.proofs.map((p) => (
          <div key={p.title} className="rl-proof">
            <h2 className="rl-proof-title">{p.title}</h2>
            <p>{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="rl-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/support">Support</a>
        <a href="mailto:travis@tribos.studio">Contact</a>
      </footer>
    </div>
  );
}
