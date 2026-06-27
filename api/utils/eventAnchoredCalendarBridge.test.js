import { describe, it, expect } from 'vitest';
import {
  ensureEventAnchoredPlan,
  projectionRowForPrescription,
} from './eventAnchoredCalendarBridge.js';

// Minimal chainable Supabase stub that records the training_plans insert payload.
function makeSupabase({ existingPlan = null } = {}) {
  const captured = { insert: null };
  const selectChain = {
    eq() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: () => Promise.resolve({ data: existingPlan, error: null }),
  };
  const insertChain = {
    select() { return this; },
    single: () => Promise.resolve({ data: { id: 'phantom-plan-1' }, error: null }),
  };
  return {
    captured,
    from() {
      return {
        select: () => selectChain,
        insert: (payload) => {
          captured.insert = payload;
          return insertChain;
        },
        update() { return { eq: () => Promise.resolve({ error: null }) }; },
      };
    },
  };
}

describe('ensureEventAnchoredPlan', () => {
  it('includes the NOT NULL start_date when creating the phantom plan', async () => {
    // Regression: training_plans.start_date is NOT NULL. Inserting only started_at
    // threw, which the init endpoint swallowed — anchoring created a sequence but
    // never projected any planned_workouts, so the calendar looked empty.
    const supabase = makeSupabase({ existingPlan: null });
    const planId = await ensureEventAnchoredPlan(supabase, 'user-1', {
      name: 'Ned Gravel',
    });

    expect(planId).toBe('phantom-plan-1');
    const payload = supabase.captured.insert;
    expect(payload).toBeTruthy();
    expect(payload.start_date).toBeTruthy();
    expect(payload.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // started_at is also set; the two should agree on the creation day.
    expect(payload.started_at).toBe(payload.start_date);
    expect(payload.template_id).toBe('event_anchored');
    expect(payload.status).toBe('active');
    expect(payload.name).toBe('Race: Ned Gravel');
    // Must be 'secondary' so it doesn't collide with the athlete's real primary
    // plan on idx_training_plans_one_primary_per_sport.
    expect(payload.priority).toBe('secondary');
  });

  it('reuses an existing phantom plan without re-inserting', async () => {
    const supabase = makeSupabase({ existingPlan: { id: 'existing-1', name: 'Race: Ned Gravel' } });
    const planId = await ensureEventAnchoredPlan(supabase, 'user-1', { name: 'Ned Gravel' });
    expect(planId).toBe('existing-1');
    expect(supabase.captured.insert).toBeNull();
  });
});

describe('projectionRowForPrescription', () => {
  it('maps a prescription onto a planned_workouts row with dual-written load', () => {
    const row = projectionRowForPrescription({
      planId: 'p1',
      userId: 'u1',
      prescription: {
        date: '2026-07-01',
        session_type: 'vo2',
        target_rss: 95,
        target_duration_min: 75,
        gating_reason: null,
      },
      blockType: 'vo2',
      planStartedAt: '2026-06-27',
    });
    expect(row.scheduled_date).toBe('2026-07-01');
    expect(row.workout_type).toBe('vo2max');
    expect(row.target_rss).toBe(95);
    expect(row.target_tss).toBe(95); // dual-write
    expect(row.duration_minutes).toBe(75);
    expect(row.plan_id).toBe('p1');
  });
});
