/**
 * Training Plan Setup Tour — 5-step guided walkthrough of plan activation.
 *
 * The setup flow is modal-driven:
 *   1. "Browse Plans" button in PlannerPage header     (always visible)
 *   2. Plan catalog grid                                (inside Browse modal)
 *   3. Plan preview modal                               (opens when user clicks a plan card)
 *   4. Start-date modal                                 (opens from "Start Plan" in preview)
 *   5. Activate button                                  (same modal as #4)
 *
 * Because steps 2-5 depend on modals/content that only mount after user
 * clicks, we use Shepherd's `beforeShowPromise` to poll the DOM for the
 * anchor element. The user drives the clicks; the tour narrates passively.
 *
 * The "Set your FTP" step from the original spec was dropped — FTP is
 * collected during onboarding and stored in `user_profiles`, it does not
 * appear in the plan setup UI.
 */

import type { StepOptions } from 'shepherd.js';

/**
 * Poll for a selector to appear in the DOM. Resolves when found or after
 * the timeout (so the tour always advances even if the user doesn't open
 * the expected modal).
 */
function waitForSelector(selector: string, timeoutMs = 10_000): Promise<void> {
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

export function getTrainingPlanSteps(): StepOptions[] {
  return [
    {
      id: 'tp-browse',
      title: 'Start by browsing plans',
      text: 'Click <strong>Browse Plans</strong> to open the plan catalog. We\u2019ll walk you through activating one from here.',
      attachTo: { element: '[data-tour="tp-browse"]', on: 'bottom' },
      buttons: [NEXT_BUTTON],
    },
    {
      id: 'tp-plan-grid',
      title: 'Choose a plan',
      text: 'Each plan targets a different goal — base building, gran fondo, crit racing, and more. Click a plan to see a detailed preview.',
      attachTo: { element: '[data-tour="tp-plan-grid"]', on: 'top' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-plan-grid"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'tp-plan-preview',
      title: 'Review the plan preview',
      text: 'The preview shows weekly structure, phase breakdown, and total hours. Use this to confirm the plan fits your schedule before committing.',
      attachTo: { element: '[data-tour="tp-plan-preview"]', on: 'auto' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-plan-preview"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'tp-plan-start-date',
      title: 'Set your start date',
      text: 'Pick the Monday you want your plan to start on. We\u2019ll schedule every workout forward from that date.',
      attachTo: { element: '[data-tour="tp-plan-start-date"]', on: 'auto' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-plan-start-date"]'),
      buttons: [BACK_BUTTON, NEXT_BUTTON],
    },
    {
      id: 'tp-activate',
      title: 'Activate the plan',
      text: 'Hit <strong>Start Training</strong> to activate. Your workouts will appear on the calendar and sync to your connected devices.',
      attachTo: { element: '[data-tour="tp-activate"]', on: 'auto' },
      beforeShowPromise: () => waitForSelector('[data-tour="tp-activate"]'),
      buttons: [BACK_BUTTON, DONE_BUTTON],
    },
  ];
}
