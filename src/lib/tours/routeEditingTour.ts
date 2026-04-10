/**
 * Route Editing Tour — walkthrough of the editing and analysis tools
 * available after a route has been generated or loaded.
 *
 * All toolbar buttons in this tour only render when `routeGeometry`
 * exists, so every step uses `beforeShowPromise` to wait for its
 * anchor element. The tour is triggered manually via a dedicated
 * "?" button that only appears once a route exists.
 */

import type { StepOptions } from 'shepherd.js';

function waitForSelector(selector: string, timeoutMs = 8_000): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const started = Date.now();
    const interval = window.setInterval(() => {
      if (document.querySelector(selector) || Date.now() - started > timeoutMs) {
        window.clearInterval(interval);
        resolve();
      }
    }, 150);
  });
}

const BACK_BUTTON = {
  text: 'Back',
  classes: 'shepherd-button-secondary',
  action(this: { back: () => void }) {
    this.back();
  },
} as const;

const NEXT_BUTTON = {
  text: 'Next',
  action(this: { next: () => void }) {
    this.next();
  },
} as const;

const DONE_BUTTON = {
  text: 'Done',
  action(this: { complete: () => void }) {
    this.complete();
  },
} as const;

export function getRouteEditingSteps(): StepOptions[] {
  return [
    {
      id: 're-edit-mode',
      title: 'Edit mode',
      text: 'Click the <strong>scissors</strong> to enter edit mode. You can click any segment on the route to remove tangents or detours — we\u2019ll re-route around it automatically.',
      attachTo: { element: '[data-tour="rb-edit-mode"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-edit-mode"]'),
      buttons: [NEXT_BUTTON],
    },
    {
      id: 're-smart-edit',
      title: 'Smart edit',
      text: 'Describe changes in plain English — <strong>"avoid the highway"</strong> or <strong>"add more climbing"</strong> — and our AI will rework the route for you.',
      attachTo: { element: '[data-tour="rb-smart-edit"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-smart-edit"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 're-gradient',
      title: 'Slope gradient',
      text: 'Color-code the route by elevation grade. Green is flat, yellow is rolling, red is steep \u2014 so you can see the hard parts at a glance.',
      attachTo: { element: '[data-tour="rb-gradient"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-gradient"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 're-surface',
      title: 'Surface types',
      text: 'See whether each section is paved, gravel, or unpaved. Especially useful for gravel and mixed-terrain routes.',
      attachTo: { element: '[data-tour="rb-surface"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-surface"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 're-bike-lanes',
      title: 'Bike lanes',
      text: 'Toggle the bike infrastructure overlay to see dedicated bike paths, painted lanes, and shared lanes along your route.',
      attachTo: { element: '[data-tour="rb-bike-lanes"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-bike-lanes"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 're-pois',
      title: 'Points of interest',
      text: 'Find water stops, cafes, restrooms, and bike shops along the route. Handy for planning longer rides.',
      attachTo: { element: '[data-tour="rb-pois"]', on: 'bottom' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-pois"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 're-elevation',
      title: 'Elevation profile',
      text: 'The elevation chart at the bottom shows every climb and descent. Hover over it to highlight that point on the map.',
      attachTo: { element: '[data-tour="rb-elevation"]', on: 'top' },
      beforeShowPromise: () => waitForSelector('[data-tour="rb-elevation"]'),
      buttons: [BACK_BUTTON, DONE_BUTTON],
    },
  ];
}
