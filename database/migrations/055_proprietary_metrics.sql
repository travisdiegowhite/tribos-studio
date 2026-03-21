-- 055: Proprietary Metrics Tables (EFI, TWL, TCAS)
--
-- Three tables for Tribos proprietary training metrics.
-- EFI: per-activity execution fidelity (requires matched planned workout)
-- TWL: per-activity terrain-weighted load
-- TCAS: weekly time-constrained adaptation score

-- ─── EFI — Execution Fidelity Index ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_efi (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    workout_id      uuid REFERENCES planned_workouts(id),

    -- Inputs (stored for auditability)
    planned_tss     numeric(8,2),
    actual_tss      numeric(8,2),
    planned_zones   jsonb,   -- { "Z1": 0.50, "Z2": 0.20, ... }
    actual_zones    jsonb,
    rolling_window_sessions jsonb,  -- [{ planned_tss, actual_tss }, ...]

    -- Sub-scores (0.0000 to 1.0000)
    vf              numeric(5,4),
    ifs             numeric(5,4),
    cf              numeric(5,4),

    -- Composite (0.00 to 100.00)
    efi             numeric(5,2),

    -- Rolling 28-day average
    efi_28d         numeric(5,2),

    computed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_efi_user_date ON activity_efi(user_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_efi_activity ON activity_efi(activity_id);

-- ─── TWL — Terrain-Weighted Load ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_twl (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,

    -- Inputs
    base_tss        numeric(8,2) NOT NULL,
    vam             numeric(8,2),
    vam_norm        numeric(6,4),
    gvi             numeric(6,4),
    mean_elevation  numeric(8,2),
    alt_term        numeric(6,4),

    -- Multiplier components
    alpha_component numeric(6,4),
    beta_component  numeric(6,4),
    gamma_component numeric(6,4),
    m_terrain       numeric(6,4),

    -- Result
    twl             numeric(8,2),

    computed_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_activity_twl UNIQUE (activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_twl_user ON activity_twl(user_id, computed_at DESC);

-- ─── TCAS — Time-Constrained Adaptation Score ────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_tcas (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id),
    week_ending     date NOT NULL,

    -- CTL inputs
    ctl_now         numeric(6,2),
    ctl_6w_ago      numeric(6,2),
    avg_weekly_hours numeric(5,2),
    fv              numeric(6,4),

    -- AQ inputs
    ef_now          numeric(8,4),
    ef_6w_ago       numeric(8,4),
    pa_hr_now       numeric(6,4),
    pa_hr_6w_ago    numeric(6,4),
    p20min_now      numeric(8,2),
    p20min_6w_ago   numeric(8,2),

    -- Training age
    years_training  numeric(5,2),

    -- Sub-scores
    he              numeric(6,4),
    eft             numeric(6,4),
    adi             numeric(6,4),
    ppd             numeric(6,4),
    aq              numeric(6,4),
    taa             numeric(6,4),

    -- Composite (0.00 to 100.00)
    tcas            numeric(5,2),

    computed_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_user_week UNIQUE (user_id, week_ending)
);

CREATE INDEX IF NOT EXISTS idx_weekly_tcas_user ON weekly_tcas(user_id, week_ending DESC);

-- ─── RLS Policies ────────────────────────────────────────────────────────────

ALTER TABLE activity_efi ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_twl ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_tcas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own EFI" ON activity_efi
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own TWL" ON activity_twl
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own TCAS" ON weekly_tcas
    FOR SELECT USING (auth.uid() = user_id);

-- Service role (API) can insert/update via supabaseAdmin (bypasses RLS)
