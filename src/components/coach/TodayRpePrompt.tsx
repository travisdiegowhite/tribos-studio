/**
 * TodayRpePrompt — surfaces the post-ride RPE capture on the Today dashboard.
 *
 * Self-contained (like BlockExtensionStrip): finds the athlete's most recent
 * ride that lacks power data and hasn't been rated yet, shows the existing
 * RPEPrompt, and persists the rating via /api/activity-rpe. The RPE feeds the
 * "high-compliance + low-RPE" progression signal and improves load confidence.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import RPEPrompt from './RPEPrompt';

interface Candidate {
  id: string;
  name: string | null;
  tssSource: string;
}

export default function TodayRpePrompt() {
  const { user } = useAuth() as { user: { id: string } | null };
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  const fetchCandidate = useCallback(async () => {
    if (!user?.id) return;
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data } = await supabase
      .from('activities')
      .select('id, name, average_heartrate, device_watts, rpe_score, start_date')
      .eq('user_id', user.id)
      .is('rpe_score', null)
      .or('device_watts.is.null,device_watts.eq.false')
      .is('duplicate_of', null)
      .gte('start_date', threeDaysAgo.toISOString())
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setCandidate({
        id: data.id,
        name: data.name,
        tssSource: data.average_heartrate ? 'hr' : 'inferred',
      });
    } else {
      setCandidate(null);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCandidate();
  }, [fetchCandidate]);

  const handleSubmit = useCallback(
    async (rpe: number) => {
      if (!candidate) return;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/activity-rpe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ activity_id: candidate.id, rpe }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCandidate(null);
    },
    [candidate],
  );

  if (!candidate) return null;

  return (
    <RPEPrompt
      activityName={candidate.name ?? undefined}
      tssSource={candidate.tssSource}
      onSubmit={handleSubmit}
    />
  );
}
