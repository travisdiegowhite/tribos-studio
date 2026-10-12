/**
 * /train tabs and the redirects from the old ones.
 *
 * Five tabs since the 2026-10 training cleanup (docs/season-planner-build-plan.md,
 * "Training section cleanup"), plus Find an event (?tab=events, the event catalog, docs/event-catalog.md).
 * Old ?tab= values keep working through
 * LEGACY_TABS, so bookmarks and links from Today, onboarding and the ride modal
 * still land on the right place.
 */

export const TRAIN_TABS = ['calendar', 'season', 'coach', 'progress', 'rides', 'events'] as const;
export type TrainTab = (typeof TRAIN_TABS)[number];

/** Sub-views inside a tab: Season's race details, Rides' repeats. */
export type TrainView = 'race' | 'repeats' | null;

export const TRAIN_TAB_LABELS: Record<TrainTab, string> = {
  calendar: 'Calendar',
  season: 'Season',
  coach: 'Coach',
  progress: 'Progress',
  rides: 'Rides',
  events: 'Find an event',
};

const LEGACY_TABS: Record<string, { tab: TrainTab; view?: TrainView; browse?: boolean }> = {
  race: { tab: 'season', view: 'race' },
  trends: { tab: 'progress' },
  power: { tab: 'progress' },
  insights: { tab: 'progress' },
  history: { tab: 'rides' },
  repeats: { tab: 'rides', view: 'repeats' },
  browse: { tab: 'calendar', browse: true },
};

export interface ResolvedTrainTab {
  tab: TrainTab;
  view: TrainView;
  /** Open the plan browser drawer on the calendar. */
  browse: boolean;
}

const isTab = (v: string | null): v is TrainTab => v !== null && (TRAIN_TABS as readonly string[]).includes(v);

/** Read ?tab=, ?view= and ?browse= (old tab names included). Other params (ride, segment) are left to the caller. */
export function resolveTrainTab(params: URLSearchParams): ResolvedTrainTab {
  const raw = params.get('tab');
  const view = params.get('view');
  const browse = params.get('browse') === '1' || params.get('browse') === 'true';
  if (isTab(raw)) {
    return {
      tab: raw,
      view: (raw === 'season' && view === 'race') || (raw === 'rides' && view === 'repeats') ? view : null,
      browse: raw === 'calendar' && browse,
    };
  }
  const legacy = raw ? LEGACY_TABS[raw] : undefined;
  if (legacy) return { tab: legacy.tab, view: legacy.view ?? null, browse: Boolean(legacy.browse) };
  return { tab: 'calendar', view: null, browse: false };
}

/** A /train link for a tab (and view), keeping extra params like ride= or segment=. */
export function trainHref(tab: TrainTab, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ tab, ...extra });
  return `/train?${q.toString()}`;
}
