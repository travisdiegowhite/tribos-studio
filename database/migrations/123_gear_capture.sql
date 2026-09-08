-- Migration 123: Gear capture — bike category, photo catalogue, service log,
-- effective wear, and the private photo bucket.
--
-- Additive only. Existing columns and the increment_gear_distance RPC are
-- untouched. New distance columns are suffixed _m per the T1.1 unit contract.
--
-- APPLY BY HAND and confirm with `npm run audit:schema`. The storage bucket is
-- created here in SQL rather than by hand in the dashboard — migration 099
-- described a bucket nobody created and FIT retention was silently off for
-- three months (see CLAUDE.md).

-- ============================================================
-- 1. gear_items — what kind of bike, the photo, the catalogue
-- ============================================================

ALTER TABLE public.gear_items
  ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN ('road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer', 'other')),
  ADD COLUMN IF NOT EXISTS is_trainer_bike boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_paths jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vision_extraction jsonb,
  ADD COLUMN IF NOT EXISTS catalogued_at timestamptz;

COMMENT ON COLUMN public.gear_items.category IS 'Bike category; decides which catalogue parts apply and the default surface for untyped rides';
COMMENT ON COLUMN public.gear_items.is_trainer_bike IS 'This bike lives on the trainer: indoor rides default to it and tires/pads accrue no wear';
COMMENT ON COLUMN public.gear_items.photo_paths IS 'Storage object paths in the gear-photos bucket keyed by shot id: {whole_bike, drivetrain, front_wheel}';
COMMENT ON COLUMN public.gear_items.vision_extraction IS 'Last raw extraction from /api/gear-vision, kept so the catalogue can be redone without re-shooting';
COMMENT ON COLUMN public.gear_items.catalogued_at IS 'When the rider last confirmed a photo catalogue';

-- ============================================================
-- 2. gear_components — effective wear and provenance
-- ============================================================

ALTER TABLE public.gear_components
  ADD COLUMN IF NOT EXISTS effective_wear_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wet_distance_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offroad_distance_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indoor_distance_m numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moving_time_s bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'vision', 'coach', 'check_in')),
  ADD COLUMN IF NOT EXISTS confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wear_computed_at timestamptz;

COMMENT ON COLUMN public.gear_components.effective_wear_m IS 'Weighted meters since install: Σ distance × surface × wet factors (api/utils/gearCatalog.js)';
COMMENT ON COLUMN public.gear_components.wet_distance_m IS 'Raw meters ridden in the wet since install';
COMMENT ON COLUMN public.gear_components.offroad_distance_m IS 'Raw meters ridden on gravel/MTB since install';
COMMENT ON COLUMN public.gear_components.indoor_distance_m IS 'Raw meters ridden on the trainer since install';
COMMENT ON COLUMN public.gear_components.moving_time_s IS 'Seconds of moving time since install, for hours-based parts (suspension, dropper)';
COMMENT ON COLUMN public.gear_components.source IS 'Who created the row: manual form, vision catalogue, coach tool, or check-in';
COMMENT ON COLUMN public.gear_components.confidence IS 'Vision confidence 0–1 at extraction; NULL for rider-entered parts';
COMMENT ON COLUMN public.gear_components.confirmed_at IS 'When the rider confirmed a vision-proposed part. Unconfirmed parts never raise alerts.';

-- ============================================================
-- 3. gear_service_log — things that happened to a bike
-- ============================================================

CREATE TABLE IF NOT EXISTS public.gear_service_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gear_item_id   uuid NOT NULL REFERENCES public.gear_items(id) ON DELETE CASCADE,
  component_id   uuid REFERENCES public.gear_components(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('service', 'replace', 'issue', 'resolved', 'note')),
  summary        text NOT NULL,
  occurred_on    date NOT NULL DEFAULT CURRENT_DATE,
  distance_at_m  numeric,
  source         text NOT NULL CHECK (source IN ('rider', 'coach', 'check_in', 'vision')),
  resolved_by_id uuid REFERENCES public.gear_service_log(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gear_service_log IS 'Service, replacements, and open issues per bike — the coach''s gear_change tool writes here';
COMMENT ON COLUMN public.gear_service_log.distance_at_m IS 'Bike odometer (gear_items.total_distance_logged, meters) when it happened';
COMMENT ON COLUMN public.gear_service_log.resolved_by_id IS 'For kind=issue: the resolved row that closed it';

CREATE INDEX IF NOT EXISTS idx_gear_service_log_gear
  ON public.gear_service_log(gear_item_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_gear_service_log_open_issues
  ON public.gear_service_log(user_id) WHERE kind = 'issue' AND resolved_by_id IS NULL;

ALTER TABLE public.gear_service_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gear service log"
  ON public.gear_service_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gear service log"
  ON public.gear_service_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gear service log"
  ON public.gear_service_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gear service log"
  ON public.gear_service_log FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access to gear service log"
  ON public.gear_service_log FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. activity_gear — rider surface override, new assignment sources
-- ============================================================

ALTER TABLE public.activity_gear
  ADD COLUMN IF NOT EXISTS surface_override text
    CHECK (surface_override IS NULL OR surface_override IN ('road', 'gravel', 'mtb', 'indoor'));

COMMENT ON COLUMN public.activity_gear.surface_override IS 'Rider said what the ride was on; wins over activity type and bike category in the wear model';

-- Widen assigned_by to the two new rider-sourced paths.
ALTER TABLE public.activity_gear DROP CONSTRAINT IF EXISTS activity_gear_assigned_by_check;
ALTER TABLE public.activity_gear
  ADD CONSTRAINT activity_gear_assigned_by_check
  CHECK (assigned_by IN ('auto', 'manual', 'strava', 'check_in', 'coach'));

-- ============================================================
-- 5. Private photo bucket + owner-scoped object policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gear-photos', 'gear-photos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Object keys are `{user_id}/{gear_item_id}/{shot}-{ts}.jpg`; the first path
-- segment is the owner.
CREATE POLICY "gear-photos owner select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'gear-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gear-photos owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gear-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gear-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'gear-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "gear-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'gear-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Confirm with:
--   select id, public, file_size_limit from storage.buckets where id = 'gear-photos';
--   select column_name from information_schema.columns where table_name = 'gear_service_log';
