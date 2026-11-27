/**
 * What the landing shows after "Make my route". A first cut of the result
 * view (spec §2) and the ladder states (§3): the headline stat, the comfort
 * strip, flagged stretches as heads-ups with Show on map, "Edit, save or
 * send" (hands the loop to Route Builder 2, where Save and Send to Garmin /
 * Wahoo live), Download GPX, and the alternatives and refused answers.
 * Alternatives mini-maps are still to come.
 *
 * Neither alternatives nor refused use error styling: they're answers.
 */

import { Button } from '@mantine/core';
import { ComfortStrip } from '../../components/comfort/ComfortStrip';
import type { ComfortCandidate, ComfortPlan } from '../../utils/comfortLadder';
import { formatMiles } from '../../utils/comfortLadder';
import { comfortChip, type ComfortLevel } from '../../utils/comfortLevels';
import { exportAndDownloadRoute } from '../../utils/routeExport';
import { PRODUCT_NAME } from '../../utils/product';
import { LANDING_COPY, flaggedLine, headsUpTitle, stretchLength } from './landingCopy';
import { trackLanding } from './landingTelemetry';

const C = LANDING_COPY.result;

interface Props {
  plan: ComfortPlan;
  shown: ComfortCandidate | null;
  onShow: (c: ComfortCandidate) => void;
  onTryLevel: (level: ComfortLevel) => void;
  onTryAnother: () => void;
  /** Zoom the map to a stretch (meters from the start). */
  onFocus?: (start_m: number, end_m: number) => void;
  /** Hand the shown loop to the route builder. */
  onOpenInBuilder?: (c: ComfortCandidate) => void;
}

interface SummaryProps {
  c: ComfortCandidate;
  onTryAnother: () => void;
  onFocus?: (start_m: number, end_m: number) => void;
  onOpenInBuilder?: (c: ComfortCandidate) => void;
}

function RouteSummary({ c, onTryAnother, onFocus, onOpenInBuilder }: SummaryProps) {
  const v = c.validation;
  const flagged = v.headsUps.filter((h) => h.kind === 'flagged');
  const unknown = v.headsUps.filter((h) => h.kind === 'unknown');
  const download = () => {
    exportAndDownloadRoute(
      {
        name: `${PRODUCT_NAME} ${formatMiles(c.distance_m)} loop`,
        coordinates: c.coordinates.map(([lng, lat]) => [lng, lat] as [number, number]),
        distanceKm: c.distance_m / 1000,
        routeType: 'loop',
      },
      'gpx',
    );
    trackLanding('route_exported', { destination: 'gpx', kind: c.kind, level: c.level });
  };
  return (
    <section className="rl-result" aria-labelledby="rl-result-stat">
      <p className="rl-chips">
        {formatMiles(c.distance_m)} · {comfortChip(c.level)}
      </p>
      <p id="rl-result-stat" className="rl-stat">
        <strong className="rl-num">{Math.round(v.withinPct)}%</strong> {C.withinSuffix}
      </p>
      <p className="rl-sub">{flaggedLine(flagged.length)}</p>
      <div className="rl-strip">
        <ComfortStrip validation={v} units="mi" onSelectStretch={onFocus} compact />
      </div>
      {[...flagged, ...unknown].length > 0 && (
        <ul className="rl-headsups">
          {[...flagged, ...unknown].map((h) => (
            <li key={`${h.kind}-${h.start_m}`} className={`rl-headsup rl-headsup-${h.kind}`}>
              <p className="rl-headsup-title">{headsUpTitle(h.start_m)}</p>
              <p>
                <span className="rl-num">{stretchLength(h.length_m)}</span> · {h.title}
              </p>
              {h.reasons.length > 0 && <p className="rl-headsup-reasons">{h.reasons.join(', ')}</p>}
              {onFocus && (
                <button
                  type="button"
                  className="rl-link-button"
                  onClick={() => onFocus(h.start_m, h.start_m + h.length_m)}
                >
                  {C.showOnMap}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="rl-actions">
        {onOpenInBuilder && (
          <Button onClick={() => onOpenInBuilder(c)} data-testid="rl-open-in-builder">
            {C.openInBuilder}
          </Button>
        )}
        <Button variant={onOpenInBuilder ? 'default' : 'filled'} onClick={download}>
          {C.downloadGpx}
        </Button>
        <Button variant="default" onClick={onTryAnother}>
          {C.tryAnother}
        </Button>
      </div>
      {onOpenInBuilder && <p className="rl-free">{C.openInBuilderHint}</p>}
    </section>
  );
}

export function LandingResult({ plan, shown, onShow, onTryLevel, onTryAnother, onFocus, onOpenInBuilder }: Props) {
  if (shown) {
    return (
      <>
        <RouteSummary c={shown} onTryAnother={onTryAnother} onFocus={onFocus} onOpenInBuilder={onOpenInBuilder} />
        {plan.outcome === 'alternatives' && plan.alternatives.length > 1 && (
          <AlternativeList plan={plan} shown={shown} onShow={onShow} />
        )}
      </>
    );
  }

  if (plan.outcome === 'alternatives') {
    return (
      <section className="rl-result" aria-live="polite">
        <p className="rl-sub">{C.alternativesTitle}</p>
        <AlternativeList plan={plan} shown={null} onShow={onShow} />
      </section>
    );
  }

  // refused
  const r = plan.refusal!;
  const choose = (c: ComfortCandidate) => {
    trackLanding('alternative_chosen', { kind: c.kind });
    onShow(c);
  };
  return (
    <section className="rl-result" aria-live="polite">
      <p className="rl-stat-plain">{r.message}</p>
      <div className="rl-actions rl-actions-stack">
        {r.shorter && (
          <Button variant="default" onClick={() => choose(r.shorter!)}>
            {C.shorterLoop} ({formatMiles(r.shorter.distance_m)})
          </Button>
        )}
        {r.nearbyStart && (
          <Button variant="default" onClick={() => choose(r.nearbyStart!)}>
            {C.nearbyStart} ({r.nearbyStart.note})
          </Button>
        )}
        {r.tryLevel && (
          <Button variant="default" onClick={() => onTryLevel(r.tryLevel!)}>
            {C.refusedTryLevel(r.tryLevel)}
          </Button>
        )}
      </div>
    </section>
  );
}

function AlternativeList({ plan, shown, onShow }: { plan: ComfortPlan; shown: ComfortCandidate | null; onShow: (c: ComfortCandidate) => void }) {
  return (
    <ul className="rl-alternatives">
      {plan.alternatives.map((a, i) => (
        <li key={`${a.kind}-${i}`}>
          <button
            type="button"
            className="rl-alternative"
            aria-pressed={shown === a}
            onClick={() => {
              trackLanding('alternative_chosen', { kind: a.kind });
              onShow(a);
            }}
          >
            <span className="rl-alt-note">{a.note}</span>
            <span className="rl-alt-stat">
              <span className="rl-num">{Math.round(a.validation.withinPct)}%</span> within Comfort {a.level}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
