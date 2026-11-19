/**
 * fitness_load — TFI / AFI / Form Score and daily RSS over the coach's date
 * range, read from training_load_daily (the server-computed series every
 * other surface plots). Clicking a day selects it to ask about.
 */

import { useEffect, useState } from 'react';
import TrainingLoadChart from '../../../components/TrainingLoadChart.jsx';
import { supabase } from '../../../lib/supabase';
import type { CoachFocus } from '../coachApi';
import type { FitnessLoadVisual as Spec } from './types';
import { useAthleteBasics } from './useAthleteBasics';
import { shortDate } from './visualData';
import { VisualFrame, VisualLoading, VisualMissing } from './VisualFrame';

interface LoadRow {
  date: string;
  rss: number | null;
  tfi: number | null;
  afi: number | null;
  form_score: number | null;
}

export default function FitnessLoadVisual({ spec, onFocus }: { spec: Spec; onFocus: (f: CoachFocus) => void }) {
  const { userId } = useAthleteBasics();
  const [rows, setRows] = useState<LoadRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    // training_load_daily is canonical-only (migration 071 dropped tss/ctl/atl/tsb).
    supabase
      .from('training_load_daily')
      .select('date, rss, tfi, afi, form_score')
      .eq('user_id', userId)
      .gte('date', spec.from)
      .lte('date', spec.to)
      .order('date', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setFailed(true);
        else setRows((data as LoadRow[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, spec.from, spec.to]);

  const title = `Fitness · ${shortDate(spec.from)} – ${shortDate(spec.to)}`;
  if (failed) return <VisualMissing title={title} reason="Couldn’t load your training load." />;

  return (
    <VisualFrame title={title} caption={spec.caption} openHref="/train?tab=progress" openLabel="Progress">
      {rows === null ? (
        <VisualLoading height={340} />
      ) : (
        <TrainingLoadChart
          fixedRange
          data={rows.map((r) => ({
            date: r.date,
            tss: Math.round(r.rss ?? 0),
            ctl: r.tfi,
            atl: r.afi,
            tsb: r.form_score,
          }))}
          onDayClick={(date: string) =>
            onFocus({ kind: 'fitness_day', date, label: `Fitness on ${shortDate(date)}` })
          }
        />
      )}
    </VisualFrame>
  );
}
