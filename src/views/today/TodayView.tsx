import { useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePostHog } from 'posthog-js/react';
import { useAuth } from '../../contexts/AuthContext';
import { useTodayData } from './hooks/useTodayData';
import { TodaysBrief } from './TodaysBrief';
import { AthleteState } from './AthleteState';
import { PlanExecution } from './PlanExecution';
import { CoachConversation } from './CoachConversation';
import { RecentRides } from './RecentRides';
import { captureToday } from './utils/todayInstrumentation';
import styles from './TodayView.module.css';

const LegacyDashboard = lazy(() => import('../../pages/Dashboard.jsx'));

export default function TodayView() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const posthog = usePostHog();

  const data = useTodayData(user?.id ?? null);

  useEffect(() => {
    if (!user?.id) return;
    captureToday(posthog, 'today_view.opened', {
      persona: data.persona.id,
      has_plan: data.planExecution.plan.phases.length > 0,
      has_today_workout: Boolean(data.brief.workout),
    });
    // Fire once per mount with current user — not on every data update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // QA escape hatch — fall back to the legacy Dashboard when the user
  // hits /today?legacy=1. Removed in a follow-up release.
  if (searchParams.get('legacy') === '1') {
    return (
      <Suspense fallback={null}>
        <LegacyDashboard />
      </Suspense>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.brief}>
        <TodaysBrief data={data} />
      </div>
      <div className={styles.athlete}>
        <AthleteState data={data} />
      </div>
      <div className={styles.plan}>
        <PlanExecution data={data} />
      </div>
      <div className={styles.conversation}>
        <CoachConversation data={data} />
      </div>
      <div className={styles.recent}>
        <RecentRides data={data} />
      </div>
    </div>
  );
}
