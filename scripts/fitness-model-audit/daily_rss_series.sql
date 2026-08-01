-- Daily RSS series for the founder under three input regimes, replicating
-- api/utils/fitnessSnapshots.js estimateTSSWithSource() in SQL.
-- READ-ONLY. Run against the Tribos production DB (project xbziuusxagasizxnlwwn).
--
-- Regimes:
--   cur : the ladder exactly as the code runs it (sentinel 6553.5 rows hit
--         Tier 1 'device' and are capped at 500 per activity downstream)
--   cln : sentinel stored values (>=1000, per api/utils/stressScoreSanitizer.js
--         semantics) treated as absent + duplicate twins removed
--   hrx : cln, but cycling rides that would fall to Tier 5 'inferred' and have
--         avg HR use the avg-HR TRIMP estimator from
--         src/lib/training/fatigue-estimation.ts (zoneWeight * minutes * drift
--         * trimp_to_tss 0.85; maxHR observed 190ish/rest 60 defaults since
--         user_profiles.max_hr/resting_hr are NULL)
--
-- Fixed inputs: FTP 270 (user_profiles.ftp), TZ America/Denver.
-- Per-activity cap of 500 is applied in the simulation script, matching
-- trainingLoadRecompute.js PER_ACTIVITY_RSS_CAP (cap sits after the ladder).

with params as (
  select 'e17a000f-0662-464c-bddf-d44ced141fa1'::uuid as uid,
         270.0 as ftp, 174.0 as hr_max, 60.0 as hr_rest
),
base as (
  select a.id, a.start_date,
         (a.start_date at time zone 'America/Denver')::date as d,
         a.type, a.sport_type, a.distance, a.moving_time,
         a.total_elevation_gain as elev,
         a.average_watts, a.average_heartrate as ahr,
         a.kilojoules, coalesce(a.effective_power, a.normalized_power) as ep,
         coalesce(a.rss, a.tss) as stored
  from activities a, params p
  where a.user_id = p.uid
    and (a.is_hidden is null or a.is_hidden = false)
    and a.duplicate_of is null
    and a.start_date >= '2024-08-01'
),
-- duplicate twins: same start ±5 min, same distance ±200 m, same moving_time ±120 s.
-- Drop the sentinel-valued member when the twin is clean; otherwise drop the
-- data-poorer member (fewer of watts/kJ/EP present); tie -> larger id.
dup_drop as (
  select distinct (case
           when coalesce(a1.stored,0) >= 1000 and coalesce(a2.stored,0) < 1000 then a1.id
           when coalesce(a2.stored,0) >= 1000 and coalesce(a1.stored,0) < 1000 then a2.id
           when (coalesce((a1.average_watts is not null)::int,0) + coalesce((a1.kilojoules is not null)::int,0) + coalesce((a1.ep is not null)::int,0))
              < (coalesce((a2.average_watts is not null)::int,0) + coalesce((a2.kilojoules is not null)::int,0) + coalesce((a2.ep is not null)::int,0)) then a1.id
           when (coalesce((a2.average_watts is not null)::int,0) + coalesce((a2.kilojoules is not null)::int,0) + coalesce((a2.ep is not null)::int,0))
              < (coalesce((a1.average_watts is not null)::int,0) + coalesce((a1.kilojoules is not null)::int,0) + coalesce((a1.ep is not null)::int,0)) then a2.id
           else greatest(a1.id, a2.id) end) as id
  from base a1 join base a2
    on a1.id < a2.id
   and abs(extract(epoch from a1.start_date - a2.start_date)) < 300
   and abs(coalesce(a1.distance,0) - coalesce(a2.distance,0)) < 200
   and abs(coalesce(a1.moving_time,0) - coalesce(a2.moving_time,0)) < 120
),
calc as (
  select b.*,
    (b.type in ('Run','VirtualRun','TrailRun')) as is_run,
    (b.type = 'MountainBikeRide' or b.sport_type = 'MountainBikeRide') as is_mtb,
    least(1.4,
      (1 + (case when coalesce(b.distance,0) > 0
                 then coalesce(b.elev,0) / b.distance * 100 else 0 end) * 0.015)
      * (case when coalesce(b.moving_time,0) > 0 and coalesce(b.elev,0) > 0
              then 1 + (b.elev / (b.moving_time / 3600.0)) / 10000 else 1 end)
    ) as tmult,
    (b.id in (select id from dup_drop)) as is_dup
  from base b
),
tiered as (
  select c.*, p.ftp, p.hr_max, p.hr_rest,
    case when c.is_mtb then 1.3 else 1.0 end as mtb,
    -- running rTSS (pace intensity with HR override, elev/200*10, trail 1.1)
    case when c.is_run and coalesce(c.moving_time,0) > 0 then
      round((
        (c.moving_time/3600.0)*60 + (coalesce(c.elev,0)/200.0)*10
      ) * greatest(
            case when coalesce(c.distance,0) > 0 then
              case when (c.moving_time/60.0)/(c.distance/1000.0) < 3.5 then 1.6
                   when (c.moving_time/60.0)/(c.distance/1000.0) < 4.0 then 1.4
                   when (c.moving_time/60.0)/(c.distance/1000.0) < 4.5 then 1.2
                   when (c.moving_time/60.0)/(c.distance/1000.0) < 5.0 then 1.05
                   when (c.moving_time/60.0)/(c.distance/1000.0) < 6.0 then 0.85
                   when (c.moving_time/60.0)/(c.distance/1000.0) < 7.0 then 0.7
                   else 0.55 end
            else 1.0 end,
            case when coalesce(c.ahr,0) >= 175 then 1.5
                 when coalesce(c.ahr,0) >= 160 then 1.2
                 when coalesce(c.ahr,0) >= 145 then 1.0
                 when coalesce(c.ahr,0) >= 130 then 0.8
                 else 0 end
      ) * (case when c.type = 'TrailRun' then 1.1 else 1.0 end))
    else null end as run_tss
  from calc c, params p
),
scored as (
  select t.*,
    -- CURRENT regime: ladder with stored value as-is
    case
      when coalesce(t.stored,0) > 0 then t.stored * t.mtb
      when t.is_run then t.run_tss
      when coalesce(t.ep,0) > 0 and coalesce(t.moving_time,0) > 0 then
        round((t.moving_time/3600.0) * power(t.ep/t.ftp, 2) * 100 * t.mtb)
      when coalesce(t.kilojoules,0) > 0 and coalesce(t.moving_time,0) > 0 then
        round((t.moving_time/3600.0) * power((t.kilojoules*1000/t.moving_time)/t.ftp, 2) * 100 * t.tmult * t.mtb)
      else
        round(((coalesce(t.moving_time,0)/3600.0)*50 + (coalesce(t.elev,0)/300.0)*10)
          * (case when coalesce(t.average_watts,0) > 0
                  then least(1.8, greatest(0.5, t.average_watts/150.0)) else 1.0 end)
          * t.tmult * t.mtb)
    end as rss_cur,
    -- CLEAN stored value (sentinel -> null)
    case when coalesce(t.stored,0) >= 1000 then null else t.stored end as stored_cln
  from tiered t
),
scored2 as (
  select s.*,
    case
      when coalesce(s.stored_cln,0) > 0 then s.stored_cln * s.mtb
      when s.is_run then s.run_tss
      when coalesce(s.ep,0) > 0 and coalesce(s.moving_time,0) > 0 then
        round((s.moving_time/3600.0) * power(s.ep/s.ftp, 2) * 100 * s.mtb)
      when coalesce(s.kilojoules,0) > 0 and coalesce(s.moving_time,0) > 0 then
        round((s.moving_time/3600.0) * power((s.kilojoules*1000/s.moving_time)/s.ftp, 2) * 100 * s.tmult * s.mtb)
      else
        round(((coalesce(s.moving_time,0)/3600.0)*50 + (coalesce(s.elev,0)/300.0)*10)
          * (case when coalesce(s.average_watts,0) > 0
                  then least(1.8, greatest(0.5, s.average_watts/150.0)) else 1.0 end)
          * s.tmult * s.mtb)
    end as rss_cln,
    -- HRX: same as cln but Tier-5 cycling rides with HR use avg-HR TRIMP
    case
      when coalesce(s.stored_cln,0) > 0 then s.stored_cln * s.mtb
      when s.is_run then s.run_tss
      when coalesce(s.ep,0) > 0 and coalesce(s.moving_time,0) > 0 then
        round((s.moving_time/3600.0) * power(s.ep/s.ftp, 2) * 100 * s.mtb)
      when coalesce(s.kilojoules,0) > 0 and coalesce(s.moving_time,0) > 0 then
        round((s.moving_time/3600.0) * power((s.kilojoules*1000/s.moving_time)/s.ftp, 2) * 100 * s.tmult * s.mtb)
      when coalesce(s.ahr,0) > 0 and coalesce(s.moving_time,0) > 0 then
        round((s.moving_time/60.0)
          * (case when (s.ahr - s.hr_rest)/(s.hr_max - s.hr_rest) < 0.50 then 1
                  when (s.ahr - s.hr_rest)/(s.hr_max - s.hr_rest) < 0.60 then 2
                  when (s.ahr - s.hr_rest)/(s.hr_max - s.hr_rest) < 0.70 then 3
                  when (s.ahr - s.hr_rest)/(s.hr_max - s.hr_rest) < 0.80 then 4
                  else 5 end)
          * (case when s.moving_time > 5400 then 0.92 else 1.0 end)
          * 0.85 * s.mtb)
      else
        round(((coalesce(s.moving_time,0)/3600.0)*50 + (coalesce(s.elev,0)/300.0)*10)
          * (case when coalesce(s.average_watts,0) > 0
                  then least(1.8, greatest(0.5, s.average_watts/150.0)) else 1.0 end)
          * s.tmult * s.mtb)
    end as rss_hrx
  from scored s
)
select d,
  round(sum(least(coalesce(rss_cur,0), 500)))::int  as cur,
  round(sum(least(coalesce(rss_cln,0), 500)) filter (where not is_dup))::int as cln,
  round(sum(least(coalesce(rss_hrx,0), 500)) filter (where not is_dup))::int as hrx,
  count(*)::int as n
from scored2
group by d
having sum(coalesce(rss_cur,0)) > 0 or sum(coalesce(rss_cln,0)) > 0
order by d;
