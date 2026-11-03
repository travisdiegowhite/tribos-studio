/**
 * The old marketing landing, condensed into a dismissible first-visit card
 * (decided 2026-11-02). Alongside the builder, not a modal: the form stays
 * usable while it's open. Shown once, and only when storage works
 * (landingPrefs.shouldShowFirstVisitCard).
 */

import { Button } from '@mantine/core';
import { LANDING_COPY } from './landingCopy';

const C = LANDING_COPY.firstVisit;

export function FirstVisitCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="rl-first-visit" aria-labelledby="rl-first-visit-title">
      <span className="tribos-stamp rl-first-visit-stamp" aria-hidden="true">
        {C.stamp}
      </span>
      <h2 id="rl-first-visit-title" className="rl-first-visit-title">
        {C.title}
      </h2>
      <p>{C.body}</p>
      <ul>
        {C.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <Button size="sm" onClick={onDismiss}>
        {C.dismiss}
      </Button>
    </aside>
  );
}
