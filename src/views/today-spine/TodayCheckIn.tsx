/**
 * TodayCheckIn — the morning readiness survey, on the page people open.
 *
 * The check-in has existed since migration 058 and has three rows to show for
 * it, because it lived only on the Coach tab. Every readiness rule, and the
 * clearance call at the top of this page, is inert without it — so the ask
 * belongs where the athlete already is.
 *
 * Deliberately renders the SAME FatigueCheckinCard as the Coach tab rather
 * than a second, tidier copy. Two check-in forms means two field lists, and
 * the one that drifts is the one that stops feeding the rules.
 */

import FatigueCheckinCard from '../../components/coach/FatigueCheckinCard';
import type { TodayCheckIn as TodayCheckInRow } from './ReadinessCall';

interface TodayCheckInProps {
  /** Today's row, or null when it has not been filled in. */
  checkin: TodayCheckInRow | null;
  /** True until the first fetch lands — renders nothing, to avoid a flash. */
  loading: boolean;
  /** Re-fetch the readiness verdict so the call appears without a reload. */
  onComplete: () => void;
}

export function TodayCheckIn({ checkin, loading, onComplete }: TodayCheckInProps) {
  // Nothing before the answer is known: flashing a survey at someone who has
  // already done it is worse than showing it a beat late.
  if (loading) return null;
  // Already answered today. The card is not a permanent fixture — once the
  // question is answered the page goes back to being about training.
  if (checkin) return null;

  return <FatigueCheckinCard onComplete={onComplete} />;
}
