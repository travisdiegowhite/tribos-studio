/**
 * Route Builder Tour — 7-step guided walkthrough of the route generator.
 *
 * Selectors use `[data-tour="..."]` attributes added to RouteBuilder.jsx.
 * The same data-tour value is applied to both the desktop sidebar and the
 * mobile bottom-sheet versions of each control, so whichever is visible at
 * the time will be picked up by Shepherd automatically.
 */

import type { StepOptions } from 'shepherd.js';

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

export function getRouteBuilderSteps(): StepOptions[] {
  return [
    {
      id: 'rb-start-point',
      title: 'Set your start point',
      text: 'Search for an address or click anywhere on the map to drop your starting location. Every route begins here.',
      attachTo: { element: '[data-tour="rb-start-point"]', on: 'bottom' },
      buttons: [NEXT_BUTTON],
    },
    {
      id: 'rb-route-profile',
      title: 'Choose your ride type',
      text: 'Road, gravel, or mountain — this shapes which surfaces and roads the router prefers when building your route.',
      attachTo: { element: '[data-tour="rb-route-profile"]', on: 'right' },
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'rb-duration',
      title: 'Set your duration',
      text: 'Tell us how long you want to ride in <strong>minutes</strong>. We plan around time, not distance, so the route matches your effort.',
      attachTo: { element: '[data-tour="rb-duration"]', on: 'right' },
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'rb-route-type',
      title: 'Loop or out-and-back?',
      text: 'Pick a loop for variety, or an out-and-back if you want a predictable return. Point-to-point works when you have a specific destination.',
      attachTo: { element: '[data-tour="rb-route-type"]', on: 'right' },
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'rb-generate',
      title: 'Generate routes',
      text: 'Hit generate and our AI will plan three route options tuned to your ride type, duration, and loop preference.',
      attachTo: { element: '[data-tour="rb-generate"]', on: 'right' },
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'rb-suggestions',
      title: 'Pick a route',
      text: 'Click through the options to preview each one on the map. You can swap between them freely until you find the one you want.',
      attachTo: { element: '[data-tour="rb-suggestions"]', on: 'right' },
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'rb-save',
      title: 'Save or export',
      text: 'Save the route to your library, or push it straight to your head unit. That\u2019s it — you\u2019re ready to ride.',
      attachTo: { element: '[data-tour="rb-save"]', on: 'top' },
      buttons: [BACK_BUTTON, DONE_BUTTON],
    },
  ];
}
