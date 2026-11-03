/**
 * The card under the comfort control. Every word comes from
 * `comfortCard()` in src/utils/comfortLevels.ts, the module the router rules
 * read, so a threshold change moves the copy with it (spec acceptance).
 */

import { comfortCard, type ComfortLevel } from '../../utils/comfortLevels';

export function ComfortCard({ level, id }: { level: ComfortLevel; id?: string }) {
  const card = comfortCard(level);
  return (
    <div className="rl-comfort-card" id={id} aria-live="polite">
      <p className="rl-comfort-headline">
        <span className="rl-comfort-chip">
          Comfort {card.level} · {card.label}
        </span>{' '}
        {card.headline}
      </p>
      <dl className="rl-comfort-lists">
        <div>
          <dt>Roads like</dt>
          <dd>{card.roadsLike.join(' · ')}</dd>
        </div>
        <div>
          <dt>Short flagged stretches only</dt>
          <dd>{card.shortFlaggedStretchesOnly.join(' · ')}</dd>
        </div>
        <div>
          <dt>Kept off</dt>
          <dd>{card.keptOff.join(' · ')}</dd>
        </div>
      </dl>
      <p className="rl-comfort-tradeoff">{card.tradeoff}</p>
    </div>
  );
}
