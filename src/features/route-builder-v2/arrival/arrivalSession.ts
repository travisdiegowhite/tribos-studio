/**
 * arrivalSession — sessionStorage persistence for the calendar-arrival flow.
 *
 * Picking a saved route navigates `/ride/new` → `/ride/:routeId`, which are
 * separate route entries, so RouteBuilder2 fully remounts and loses both its
 * state and the calendar query params. The arrival context (which workout the
 * rider came to plan) lives here instead, so the "how do you want to ride
 * it?" card can come back as a pill until the rider either saves a route or
 * explicitly dismisses it.
 *
 * Per-tab by design (sessionStorage): a second tab or tomorrow's session
 * starts clean. A max age guards the same tab left open across days.
 */

export interface ArrivalContext {
  workoutId: string | null;
  workoutName: string | null;
  /** Raw `planned_workouts.workout_type` from the calendar URL. */
  goal: string | null;
  durationMinutes: number | null;
  distanceKm: number | null;
  scheduledDate: string | null;
  /** Capture time (ms epoch) for staleness expiry. */
  savedAt: number;
}

export type ArrivalStatus = 'open' | 'minimized' | 'done';

/** Extra one-shot state carried across the /ride/:id → /ride/new hop. */
export interface ArrivalExtras {
  startLocation?: string;
  /** Consume-once: expand the generate form on the next mount. */
  pendingNew?: boolean;
}

export interface ArrivalInit {
  context: ArrivalContext | null;
  status: ArrivalStatus;
  startLocation: string;
  pendingNew: boolean;
}

const STORAGE_KEY = 'rb2-workout-arrival';
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h — same-tab, same training day

function positiveNumber(raw: string | null): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function captureArrivalFromParams(params: URLSearchParams): ArrivalContext {
  return {
    workoutId: params.get('workoutId'),
    workoutName: params.get('workoutName'),
    goal: params.get('goal'),
    durationMinutes: positiveNumber(params.get('duration')),
    distanceKm: positiveNumber(params.get('distance')),
    scheduledDate: params.get('scheduledDate'),
    savedAt: Date.now(),
  };
}

export function saveArrivalSession(
  context: ArrivalContext,
  status: Exclude<ArrivalStatus, 'done'>,
  extras: ArrivalExtras = {},
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ context, status, ...extras }));
  } catch {
    /* storage unavailable (private mode quota etc.) — the flow degrades to
       single-mount behavior, same as before persistence existed */
  }
}

export function clearArrivalSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function loadStored(): (ArrivalExtras & { context: ArrivalContext; status: ArrivalStatus }) | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArrivalExtras & {
      context?: ArrivalContext;
      status?: ArrivalStatus;
    };
    if (!parsed?.context || typeof parsed.context.savedAt !== 'number') return null;
    if (Date.now() - parsed.context.savedAt > MAX_AGE_MS) {
      clearArrivalSession();
      return null;
    }
    const status = parsed.status === 'open' || parsed.status === 'minimized' ? parsed.status : 'minimized';
    return { ...parsed, context: parsed.context, status };
  } catch {
    return null;
  }
}

/**
 * Resolve the arrival state for a fresh RouteBuilder2 mount.
 *
 * A `?from=calendar` landing captures a new context from the URL (replacing
 * any stale stored session) and opens the card. Otherwise a stored session is
 * restored — consuming the one-shot `pendingNew` flag ("build something new"
 * chosen while editing a saved route, which re-lands on /ride/new).
 */
export function initArrivalSession(params: URLSearchParams): ArrivalInit {
  if (params.get('from') === 'calendar') {
    const context = captureArrivalFromParams(params);
    saveArrivalSession(context, 'open');
    return { context, status: 'open', startLocation: '', pendingNew: false };
  }
  const stored = loadStored();
  if (!stored) return { context: null, status: 'done', startLocation: '', pendingNew: false };
  const pendingNew = !!stored.pendingNew;
  const startLocation = stored.startLocation ?? '';
  if (pendingNew) {
    // Consume the flag so a reload doesn't re-expand the form.
    saveArrivalSession(stored.context, 'minimized', { startLocation });
  }
  return { context: stored.context, status: stored.status, startLocation, pendingNew };
}
