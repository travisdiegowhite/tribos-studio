/**
 * useBikeHistory — everything the Garage bike page needs for one bike, read
 * directly under RLS (owner select policies on gear_items, gear_components,
 * activity_gear, activities, activity_conditions, gear_service_log).
 *
 * Fetch only. Every derivation goes through src/lib/gear/wearSeries.ts so it
 * can be tested without Supabase. There is deliberately no row limit on the
 * rides: a wear series needs the whole life of the bike, and even a
 * 2,000-ride bike is a couple of hundred KB.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { assembleBikeHistory, type BikeHistory, type RideInput, type ComponentInput, type BikeInput } from '../lib/gear/wearSeries';
import type { GearItem, GearComponent } from './useGear';

export interface ServiceLogRow {
  id: string;
  gear_item_id: string;
  component_id: string | null;
  kind: 'service' | 'replace' | 'issue' | 'resolved' | 'note';
  summary: string;
  occurred_on: string;
  distance_at_m: number | null;
  source: string;
  resolved_by_id: string | null;
  created_at: string;
}

interface RideRow {
  surface_override: string | null;
  assigned_by: string;
  activities: {
    id: string;
    name: string | null;
    start_date: string | null;
    start_date_local: string | null;
    distance: number | null;
    moving_time: number | null;
    type: string | null;
    sport_type: string | null;
    trainer: boolean | null;
    total_elevation_gain: number | null;
  } | null;
}

export interface UseBikeHistoryResult {
  bike: GearItem | null;
  components: GearComponent[];
  rides: RideInput[];
  serviceLog: ServiceLogRow[];
  history: BikeHistory | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const CHUNK = 200;

export function useBikeHistory(gearId: string | null | undefined, useImperial: boolean): UseBikeHistoryResult {
  const [bike, setBike] = useState<GearItem | null>(null);
  const [components, setComponents] = useState<GearComponent[]>([]);
  const [rides, setRides] = useState<RideInput[]>([]);
  const [serviceLog, setServiceLog] = useState<ServiceLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gearId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [bikeRes, compRes, rideRes, logRes] = await Promise.all([
        supabase.from('gear_items').select('*').eq('id', gearId).single(),
        supabase.from('gear_components').select('*').eq('gear_item_id', gearId).order('installed_date', { ascending: true }),
        supabase
          .from('activity_gear')
          .select('surface_override, assigned_by, activities(id, name, start_date, start_date_local, distance, moving_time, type, sport_type, trainer, total_elevation_gain)')
          .eq('gear_item_id', gearId),
        supabase.from('gear_service_log').select('*').eq('gear_item_id', gearId).order('occurred_on', { ascending: false }),
      ]);
      if (bikeRes.error) throw bikeRes.error;
      if (compRes.error) throw compRes.error;
      if (rideRes.error) throw rideRes.error;
      // The service log table is new; a missing-table error must not take the page down.
      const log = logRes.error ? [] : ((logRes.data || []) as ServiceLogRow[]);

      const rows = (rideRes.data || []) as unknown as RideRow[];
      const rideIds = rows.map((r) => r.activities?.id).filter((id): id is string => Boolean(id));

      // Wet/dry per ride. Empty today; the stamping cron fills it in.
      const wetById = new Map<string, boolean>();
      for (let i = 0; i < rideIds.length; i += CHUNK) {
        const { data } = await supabase
          .from('activity_conditions')
          .select('activity_id, is_wet')
          .in('activity_id', rideIds.slice(i, i + CHUNK));
        for (const c of (data || []) as { activity_id: string; is_wet: boolean | null }[]) {
          if (c.is_wet !== null) wetById.set(c.activity_id, c.is_wet);
        }
      }

      const rideInputs: RideInput[] = rows
        .filter((r) => r.activities)
        .map((r) => ({
          id: r.activities!.id,
          name: r.activities!.name,
          startDate: r.activities!.start_date,
          startDateLocal: r.activities!.start_date_local,
          distanceM: r.activities!.distance || 0,
          movingTimeS: r.activities!.moving_time,
          type: r.activities!.type,
          trainer: Boolean(r.activities!.trainer),
          surfaceOverride: r.surface_override,
          isWet: wetById.has(r.activities!.id) ? (wetById.get(r.activities!.id) as boolean) : null,
        }));

      setBike(bikeRes.data as GearItem);
      setComponents((compRes.data || []) as GearComponent[]);
      setRides(rideInputs);
      setServiceLog(log);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load this bike');
    } finally {
      setLoading(false);
    }
  }, [gearId]);

  useEffect(() => { load(); }, [load]);

  const history = useMemo<BikeHistory | null>(() => {
    if (!bike) return null;
    const bikeInput: BikeInput = {
      id: bike.id,
      name: bike.name,
      category: bike.category ?? null,
      totalDistanceLoggedM: bike.total_distance_logged || 0,
      isTrainerBike: Boolean(bike.is_trainer_bike),
      purchasePrice: bike.purchase_price ?? null,
    };
    const comps: ComponentInput[] = components.map((c) => ({
      id: c.id,
      componentType: c.component_type,
      brand: c.brand,
      model: c.model,
      status: c.status,
      installedDate: c.installed_date,
      replacedDate: c.replaced_date,
      distanceAtInstallM: c.distance_at_install || 0,
      warningThresholdM: c.warning_threshold_meters,
      replaceThresholdM: c.replace_threshold_meters,
      createdAt: c.created_at,
    }));
    return assembleBikeHistory({ bike: bikeInput, components: comps, rides, useImperial });
  }, [bike, components, rides, useImperial]);

  return { bike, components, rides, serviceLog, history, loading, error, refetch: load };
}
