/**
 * Sequencer — Daily Rollover Cron
 *
 * Runs daily at 03:00 UTC. For every user with the event_anchored_planner
 * feature flag enabled, this job:
 *
 *   1. Marks any block_instances whose end_date < today as 'completed'
 *   2. For users with no active block today, auto-inits a fresh maintenance
 *      block (open-horizon mode per spec §6)
 *   3. Pre-generates the next 7 days of session_prescriptions for each
 *      active block so the TODAY screen never has to generate inline
 *
 * Triggered via Vercel cron (vercel.json) — auth via verifyCronAuth.
 */

import { verifyCronAuth } from './utils/verifyCronAuth.js';
import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import {
  generateSessionsForBlock,
  coefficientsForMode,
} from './utils/sequencerBlockOps.js';
import {
  buildSequencerContext,
  defaultRecoveryMode,
} from './utils/sequencerContext.js';
import {
  ensureEventAnchoredPlan,
  projectPrescriptionsToCalendar,
} from './utils/eventAnchoredCalendarBridge.js';
import { proposeProgression } from './utils/sequencerProgression.js';

const PRELOAD_DAYS = 7;
const MAINTENANCE_DURATION_DAYS = 21;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const auth = verifyCronAuth(req);
  if (!auth.authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stats = {
    blocks_completed: 0,
    blocks_initialized: 0,
    prescriptions_inserted: 0,
    projection_rows_upserted: 0,
    users_processed: 0,
    errors: [],
  };

  try {
    const supabase = getSupabaseAdmin();
    const today = todayUtc();

    // 1. Find users with the flag enabled
    const { data: flaggedUsers, error: usersErr } = await supabase
      .from('user_profiles')
      .select('id, recovery_mode, masters_factor, date_of_birth, feature_flags')
      .filter('feature_flags->>event_anchored_planner', 'eq', 'true');

    if (usersErr) throw usersErr;

    if (!flaggedUsers || flaggedUsers.length === 0) {
      return res.status(200).json({ ok: true, message: 'No flagged users.', stats });
    }

    for (const user of flaggedUsers) {
      stats.users_processed += 1;
      try {
        // 2. Mark expired blocks completed
        const { data: expired } = await supabase
          .from('block_instances')
          .select('id')
          .eq('user_id', user.id)
          .in('status', ['active', 'planned'])
          .lt('end_date', today);

        if (expired && expired.length > 0) {
          await supabase
            .from('block_instances')
            .update({ status: 'completed', modified_at: new Date().toISOString() })
            .in('id', expired.map((e) => e.id));
          stats.blocks_completed += expired.length;
        }

        // 3. Promote any 'planned' block whose window starts on/before today.
        await supabase
          .from('block_instances')
          .update({ status: 'active', modified_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('status', 'planned')
          .lte('start_date', today)
          .gte('end_date', today);

        // 4. Find active block covering today (for maintenance fallback)
        const { data: activeBlock } = await supabase
          .from('block_instances')
          .select('id, block_type, start_date, end_date')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .lte('start_date', today)
          .gte('end_date', today)
          .order('start_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 5. If no active block, auto-init maintenance
        if (!activeBlock) {
          let age = null;
          if (user.date_of_birth) {
            const dob = new Date(user.date_of_birth);
            age = Math.floor(
              (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
            );
          }
          const mode = user.recovery_mode ?? defaultRecoveryMode(age);
          const coefficients =
            user.masters_factor && typeof user.masters_factor === 'object'
              ? user.masters_factor
              : coefficientsForMode(mode);

          const start = today;
          const end = addDays(today, MAINTENANCE_DURATION_DAYS - 1);

          // Best-effort sequence row (doesn't block on error)
          const { data: seq } = await supabase
            .from('sequences')
            .insert({
              user_id: user.id,
              horizon_event_id: null,
              validation_status: 'valid',
              validation_messages: [],
              is_active: true,
            })
            .select('id')
            .single();

          const { data: newBlock, error: newBlockErr } = await supabase
            .from('block_instances')
            .insert({
              user_id: user.id,
              block_type: 'maintenance',
              start_date: start,
              end_date: end,
              status: 'active',
              source: 'sequencer',
              coefficients_snapshot: coefficients,
              sequence_id: seq?.id ?? null,
              modified_by: 'system',
            })
            .select('id, end_date, block_type')
            .single();

          if (newBlockErr) {
            stats.errors.push({ user_id: user.id, step: 'init_maintenance', detail: newBlockErr.message });
            continue;
          }

          stats.blocks_initialized += 1;
        }

        // 6. Pre-generate next 7 days of prescriptions across whichever blocks
        //    cover that horizon (Phase 2 supports the full block library).
        const horizonEnd = addDays(today, PRELOAD_DAYS - 1);
        const { data: windowBlocks } = await supabase
          .from('block_instances')
          .select('id, block_type, start_date, end_date, parent_event_id, parent_event_tier, coefficients_snapshot')
          .eq('user_id', user.id)
          .in('status', ['active', 'planned'])
          .lte('start_date', horizonEnd)
          .gte('end_date', today)
          .order('start_date', { ascending: true });

        if (!windowBlocks || windowBlocks.length === 0) continue;

        // Build context once per user. Generators that consult upcoming_events
        // (taper, race_specific) need the anchor race injected when present.
        let userCtx;
        try {
          userCtx = await buildSequencerContext(user.id, today);
        } catch (ctxErr) {
          stats.errors.push({ user_id: user.id, step: 'build_context', detail: ctxErr?.message ?? String(ctxErr) });
          continue;
        }

        const allRows = [];
        for (const block of windowBlocks) {
          const generatorEnd =
            horizonEnd < block.end_date ? horizonEnd : block.end_date;
          const generatorStart =
            today > block.start_date ? today : block.start_date;
          let blockCtx = userCtx;
          if (block.parent_event_id && block.parent_event_tier) {
            const anchor = userCtx.upcoming_events.find(
              (e) => e.id === block.parent_event_id
            );
            if (anchor) {
              blockCtx = {
                ...userCtx,
                upcoming_events: [
                  anchor,
                  ...userCtx.upcoming_events.filter((e) => e.id !== anchor.id),
                ],
                coefficients: block.coefficients_snapshot ?? userCtx.coefficients,
              };
            }
          }
          const sessions = generateSessionsForBlock(
            block.block_type,
            block.start_date,
            block.end_date,
            blockCtx
          );
          for (const s of sessions) {
            if (s.date >= generatorStart && s.date <= generatorEnd) {
              allRows.push({
                user_id: user.id,
                block_id: block.id,
                date: s.date,
                session_type: s.session_type,
                target_rss: s.target_rss,
                target_duration_min: s.target_duration_min,
                prescribed_intervals: s.prescribed_intervals,
                long_ride_flag: s.long_ride_flag,
                notes: s.notes,
              });
            }
          }
        }

        if (allRows.length === 0) continue;

        // P0 durability: never regenerate days the athlete locked by applying a
        // proposal (rebalance or progression) — the base generator would clobber
        // the confirmed change.
        const { data: lockedRows } = await supabase
          .from('session_prescriptions')
          .select('date')
          .eq('user_id', user.id)
          .eq('locked', true)
          .gte('date', today)
          .lte('date', horizonEnd);
        const lockedDates = new Set((lockedRows ?? []).map((r) => r.date));
        const rowsToWrite = allRows.filter((r) => !lockedDates.has(r.date));
        if (rowsToWrite.length === 0) continue;

        const { error: presErr } = await supabase
          .from('session_prescriptions')
          .upsert(rowsToWrite, { onConflict: 'user_id,date', ignoreDuplicates: false });

        if (presErr) {
          stats.errors.push({ user_id: user.id, step: 'preload_prescriptions', detail: presErr.message });
        } else {
          stats.prescriptions_inserted += rowsToWrite.length;
        }

        // Calendar projection: mirror prescriptions for race-anchored blocks
        // onto planned_workouts so /planner shows them. Best-effort; logs only.
        try {
          const anchoredRows = rowsToWrite.filter((r) => {
            const blk = windowBlocks.find((b) => b.id === r.block_id);
            return blk?.parent_event_id;
          });
          if (anchoredRows.length > 0) {
            const raceIds = [...new Set(
              anchoredRows
                .map((r) => windowBlocks.find((b) => b.id === r.block_id)?.parent_event_id)
                .filter(Boolean)
            )];

            const { data: races } = await supabase
              .from('race_goals')
              .select('id, name, race_date')
              .in('id', raceIds);

            // Pick the soonest active race as the phantom plan's display
            // anchor (one phantom plan per user, regardless of how many
            // races have rows in the horizon).
            const primaryRace = (races ?? []).sort(
              (a, b) => (a.race_date || '').localeCompare(b.race_date || '')
            )[0];

            if (primaryRace) {
              const phantomPlanId = await ensureEventAnchoredPlan(
                supabase,
                user.id,
                primaryRace
              );
              const { data: phantomPlan } = await supabase
                .from('training_plans')
                .select('started_at')
                .eq('id', phantomPlanId)
                .maybeSingle();

              const blockTypeById = new Map(
                windowBlocks.map((b) => [b.id, b.block_type])
              );
              const items = anchoredRows.map((r) => ({
                prescription: r,
                blockType: blockTypeById.get(r.block_id) ?? null,
              }));

              const { inserted } = await projectPrescriptionsToCalendar(
                supabase,
                {
                  planId: phantomPlanId,
                  userId: user.id,
                  planStartedAt: phantomPlan?.started_at ?? today,
                  items,
                }
              );
              stats.projection_rows_upserted += inserted;
            }
          }
        } catch (projErr) {
          stats.errors.push({
            user_id: user.id,
            step: 'calendar_projection',
            detail: projErr?.message ?? String(projErr),
          });
        }

        // Phase 2: proactively propose a "push harder" adjustment when the
        // athlete is fresh / fitter than plan. Best-effort, suggest-and-confirm
        // (writes only a block_modifications proposal, never a prescription).
        try {
          const prog = await proposeProgression({
            supabase,
            user_id: user.id,
            fromDate: today,
            ctx: userCtx,
          });
          if (prog?.proposed) stats.progression_proposed = (stats.progression_proposed ?? 0) + 1;
        } catch (progErr) {
          stats.errors.push({
            user_id: user.id,
            step: 'progression',
            detail: progErr?.message ?? String(progErr),
          });
        }
      } catch (perUserErr) {
        stats.errors.push({ user_id: user.id, step: 'unhandled', detail: perUserErr?.message ?? String(perUserErr) });
      }
    }

    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    console.error('[sequencer-daily-rollover] error:', err);
    return res.status(500).json({
      error: 'Daily rollover failed',
      detail: err?.message ?? String(err),
      stats,
    });
  }
}
