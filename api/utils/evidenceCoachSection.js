/**
 * Coach prompt section for the Performance Evidence Engine.
 *
 * buildEvidenceSection(rows) — pure, testable. Input: fitness_evidence_weekly
 * rows for one athlete, newest first (the coach fetches the last 9). Output:
 * a system-prompt block, or '' when there is nothing safe to say.
 *
 * The two Phase 2 approved coach rules live here, enforced in code rather
 * than left to the model:
 *
 * 1. DIVERGENCE FLOOR (Decision 2): the `disagrees` flag may drive
 *    model-softening language only at confidence >= 0.4. Below that,
 *    receipts may surface if independently interesting; no verdict language.
 * 2. CADENCE THROTTLE (Decision 1): speak on transitions and milestones,
 *    not states — first week of a new `ahead` run, a material confidence
 *    jump (>= 0.2), a new all-time receipt, or ~monthly (every 4th week)
 *    during a sustained run. Otherwise the verdict stays silent context.
 *
 * The §8 hard guards from docs/EVIDENCE_ENGINE_CALIBRATION.md are emitted
 * verbatim in every non-empty section.
 */

export const DIVERGENCE_CONFIDENCE_FLOOR = 0.4;
const CONFIDENCE_JUMP = 0.2;
const MONTHLY_RUN_WEEKS = 4;

/**
 * Deterministic speaking cue from the verdict history (newest first).
 * Returns 'transition' | 'milestone' | 'monthly_update' | 'silent'.
 */
export function deriveSpeakingCue(rows) {
  if (!rows || rows.length === 0) return 'silent';
  const [latest, ...prior] = rows;
  if (latest.verdict === 'insufficient_data') return 'silent';

  // Transition: verdict differs from the most recent EMITTED verdict
  // (insufficient_data weeks don't break a run), or it's the first verdict.
  const prevEmitted = prior.find((r) => r.verdict !== 'insufficient_data');
  if (!prevEmitted || prevEmitted.verdict !== latest.verdict) return 'transition';

  // Milestone: material confidence jump, or a new all-time receipt.
  if ((latest.confidence ?? 0) - (prevEmitted.confidence ?? 0) >= CONFIDENCE_JUMP - 1e-9) return 'milestone';
  const factsText = JSON.stringify(latest.narrative_facts || []);
  if (/all-time|top \d+%|up \d+(\.\d+)?% on your previous/.test(factsText) &&
      latest.signals?.efficiency_factor?.allTimeHigh) return 'milestone';

  // Monthly update: sustained run at 4-week marks (run length counted over
  // emitted weeks, newest first).
  let runLen = 1;
  for (const r of prior) {
    if (r.verdict === 'insufficient_data') continue;
    if (r.verdict !== latest.verdict) break;
    runLen++;
  }
  if (runLen % MONTHLY_RUN_WEEKS === 0) return 'monthly_update';

  return 'silent';
}

/** May the coach use the verdict to soften the load model's narrative? */
export function divergenceMaySoftenModel(row) {
  return !!(
    row &&
    row.verdict === 'ahead' &&
    row.model_divergence?.disagrees &&
    (row.confidence ?? 0) >= DIVERGENCE_CONFIDENCE_FLOOR
  );
}

const HARD_GUARDS = `Hard guards (always, regardless of verdict):
- NEVER override fatigue language when Form Score is at or below -30 — the
  model may be wrong about fitness, but a huge acute load spike is real.
- NEVER scold or alarm on a "behind" verdict. The load model stays primary;
  react only to 3+ consecutive behind weeks, and show receipts only if the
  athlete asks why.
- "consistent" says nothing special — evidence and model agree.
- "insufficient_data" is silent, except at most once a month you may gently
  note that a steady 40-minute ride with heart rate helps read fitness.
- No metric jargon (RSS/TFI/FS/EF) unless the athlete uses it first — speak
  in watts, heart rate, and plain language.
- An "ahead" verdict validates and invites ("if you're feeling good, we
  could..."); it NEVER prescribes extra load.`;

export function buildEvidenceSection(rows) {
  if (!rows || rows.length === 0) return '';
  const latest = rows[0];
  if (!latest || !latest.verdict) return '';

  const cue = deriveSpeakingCue(rows);
  const maySoften = divergenceMaySoftenModel(latest);
  const conf = latest.confidence ?? 0;
  const facts = Array.isArray(latest.narrative_facts) ? latest.narrative_facts : [];

  const lines = [];
  lines.push('=== PERFORMANCE EVIDENCE (weekly verdict) ===');
  lines.push(`Latest week (${latest.week}): verdict "${latest.verdict}" at confidence ${conf}.`);
  if (latest.model_divergence) {
    const m = latest.model_divergence;
    lines.push(`Load model that week: TFI ${m.tfi}, Form Score ${m.fs} (model narrative: ${m.modelNarrative}${m.disagrees ? ' — the evidence DISAGREES with this narrative' : ''}).`);
  }
  if (facts.length > 0) {
    lines.push('Receipts (real numbers you may quote in plain language):');
    for (const f of facts) lines.push(`- ${f}`);
  }
  const recent = rows.slice(0, 8).map((r) => `${r.week}:${r.verdict}`).join(', ');
  lines.push(`Recent weeks (newest first): ${recent}`);
  lines.push('');

  if (cue === 'silent') {
    lines.push('SPEAKING RULE THIS WEEK: silent. Do NOT proactively mention this verdict — it continues an already-acknowledged state. Use the receipts only if the athlete asks about their fitness or they are directly relevant to a question. Never volunteer verdict language.');
  } else {
    const cueText = {
      transition: 'this is the first week of a new verdict state — you may proactively mention it once, briefly',
      milestone: 'a milestone receipt or confidence jump occurred — you may proactively mention it once, briefly',
      monthly_update: 'a sustained run reached a monthly check-in mark — a one-line acknowledgement is appropriate',
    }[cue];
    lines.push(`SPEAKING RULE THIS WEEK: ${cue} — ${cueText}. One mention, then let it rest.`);
  }
  lines.push('');

  if (maySoften) {
    lines.push(`MODEL-SOFTENING PERMISSION: granted (verdict "ahead", diverges from the model, confidence ${conf} >= ${DIVERGENCE_CONFIDENCE_FLOOR}). You may tell the athlete the evidence says they are absorbing this load better than the fitness numbers suggest, and you may support their own read when they report feeling strong.`);
  } else {
    lines.push('MODEL-SOFTENING PERMISSION: not granted this week. Do not use this verdict to contradict or soften the load model\'s fatigue/fitness narrative. Receipts may still be shared if independently interesting.');
  }
  lines.push('');
  lines.push(HARD_GUARDS);

  return lines.join('\n');
}
