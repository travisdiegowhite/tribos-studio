-- 092: performance-advisor remediation — covering indexes for unindexed FKs + drop duplicate indexes
--
-- From the Supabase performance advisors (BETA_AUDIT_FINDINGS.md):
--   * unindexed_foreign_keys (INFO) — 32 FK columns with no covering index. Adds
--     write overhead-free read/ join speedups and avoids slow cascade checks.
--   * duplicate_index (WARN) — 2 confirmed identical pairs (the `activities`
--     cols=0 group the advisor heuristic suggested is a FALSE POSITIVE: those are
--     three distinct partial/expression indexes, left intact).
--
-- All CREATE INDEX use IF NOT EXISTS and all DROP use IF EXISTS, so the migration
-- is idempotent. Indexes are single-column b-tree on the FK column. Built
-- non-concurrently (small tables; sub-second) — if any of these tables grows
-- large before this runs, switch the relevant statement to CREATE INDEX
-- CONCURRENTLY outside a transaction.

BEGIN;

-- ---- Covering indexes for unindexed foreign keys ----
CREATE INDEX IF NOT EXISTS idx_activities_matched_planned_workout_id        ON public.activities(matched_planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_activity_efi_workout_id                      ON public.activity_efi(workout_id);
CREATE INDEX IF NOT EXISTS idx_block_instances_sequence_id                  ON public.block_instances(sequence_id);
CREATE INDEX IF NOT EXISTS idx_cafe_discussion_replies_parent_reply_id      ON public.cafe_discussion_replies(parent_reply_id);
CREATE INDEX IF NOT EXISTS idx_cafe_discussions_last_reply_by               ON public.cafe_discussions(last_reply_by);
CREATE INDEX IF NOT EXISTS idx_cafe_invites_accepted_by                     ON public.cafe_invites(accepted_by);
CREATE INDEX IF NOT EXISTS idx_cafe_invites_inviter_id                      ON public.cafe_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_coach_check_in_decisions_check_in_id         ON public.coach_check_in_decisions(check_in_id);
CREATE INDEX IF NOT EXISTS idx_coach_check_ins_activity_id                  ON public.coach_check_ins(activity_id);
CREATE INDEX IF NOT EXISTS idx_coach_correction_trigger_log_proposal_id     ON public.coach_correction_trigger_log(proposal_id);
CREATE INDEX IF NOT EXISTS idx_coros_webhook_events_activity_imported_id    ON public.coros_webhook_events(activity_imported_id);
CREATE INDEX IF NOT EXISTS idx_coros_webhook_events_integration_id          ON public.coros_webhook_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_fuel_feedback_planned_workout_id             ON public.fuel_feedback(planned_workout_id);
CREATE INDEX IF NOT EXISTS idx_fuel_feedback_route_id                       ON public.fuel_feedback(route_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_activity_imported_id   ON public.garmin_webhook_events(activity_imported_id);
CREATE INDEX IF NOT EXISTS idx_garmin_webhook_events_integration_id         ON public.garmin_webhook_events(integration_id);
CREATE INDEX IF NOT EXISTS idx_gear_alert_dismissals_gear_component_id      ON public.gear_alert_dismissals(gear_component_id);
CREATE INDEX IF NOT EXISTS idx_gear_alert_dismissals_gear_item_id           ON public.gear_alert_dismissals(gear_item_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_scheduled_workout_id        ON public.notification_log(scheduled_workout_id);
CREATE INDEX IF NOT EXISTS idx_planned_workouts_template_id                 ON public.planned_workouts(template_id);
CREATE INDEX IF NOT EXISTS idx_proactive_insights_activity_id              ON public.proactive_insights(activity_id);
CREATE INDEX IF NOT EXISTS idx_progression_levels_assessment_workout_id     ON public.progression_levels(assessment_workout_id);
CREATE INDEX IF NOT EXISTS idx_race_goals_training_plan_id                  ON public.race_goals(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_route_context_history_activity_id            ON public.route_context_history(activity_id);
CREATE INDEX IF NOT EXISTS idx_route_context_history_scheduled_workout_id   ON public.route_context_history(scheduled_workout_id);
CREATE INDEX IF NOT EXISTS idx_running_race_prs_activity_id                 ON public.running_race_prs(activity_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_activity_id               ON public.scheduled_workouts(activity_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_training_plan_id          ON public.scheduled_workouts(training_plan_id);
CREATE INDEX IF NOT EXISTS idx_sequences_horizon_event_id                   ON public.sequences(horizon_event_id);
CREATE INDEX IF NOT EXISTS idx_strava_webhook_events_activity_id            ON public.strava_webhook_events(activity_id);
CREATE INDEX IF NOT EXISTS idx_training_segments_parent_loop_id             ON public.training_segments(parent_loop_id);
CREATE INDEX IF NOT EXISTS idx_workout_segment_matches_segment_id           ON public.workout_segment_matches(segment_id);

-- ---- Drop confirmed duplicate indexes (keep the convention-named twin) ----
DROP INDEX IF EXISTS public.idx_integrations_user;   -- dup of idx_bike_computer_integrations_user_id (user_id)
DROP INDEX IF EXISTS public.idx_plans_user_status;   -- dup of idx_training_plans_user_status (user_id, status)

COMMIT;
