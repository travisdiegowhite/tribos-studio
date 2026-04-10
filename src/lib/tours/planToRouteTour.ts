/**
 * Plan-to-Route Tour — explains how to create a route for a planned workout.
 *
 * The flow spans two pages:
 *   1. PlannerPage → TrainingCalendar shows the "create route" icon on each workout
 *   2. Clicking it navigates to /routes/new with calendar context pre-filled
 *
 * Because the route builder is a separate page load, this tour only covers
 * the Planner side — explaining where the button is and what it does. The
 * Route Builder's own tour handles the rest once the user lands there.
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
  text: 'Got it',
  action(this: { complete: () => void }) {
    this.complete();
  },
} as const;

export function getPlanToRouteSteps(): StepOptions[] {
  return [
    {
      id: 'ptr-calendar',
      title: 'Your training calendar',
      text: 'This is your weekly training calendar. Each cell shows a planned workout — its type, duration, and intensity.',
      attachTo: { element: '[data-tour="tp-calendar"]', on: 'top' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-calendar"]'),
      buttons: [NEXT_BUTTON],
    },
    {
      id: 'ptr-create-route-btn',
      title: 'Create a route for a workout',
      text: 'See the small <strong>route icon</strong> on each upcoming workout? Click it to jump straight to the Route Builder with your workout\u2019s duration and type already filled in.',
      attachTo: { element: '[data-tour="tp-create-route"]', on: 'right' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-create-route"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'ptr-what-happens',
      title: 'What happens next',
      text: 'The Route Builder will pre-fill the ride duration, training goal, and route name from your workout. Just set a start point and hit <strong>Generate</strong> \u2014 we\u2019ll build a route that matches your training for the day.',
      buttons: [BACK_BUTTON, DONE_BUTTON],
    },
  ];
}
