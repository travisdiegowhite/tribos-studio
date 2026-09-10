/**
 * useGear Hook
 * Manages gear items, components, alerts, and activity-gear assignments.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { trackGear } from '../utils/gearTelemetry';

// ── Types ────────────────────────────────────────────────────

export type BikeCategory = 'road' | 'gravel' | 'mtb' | 'tt' | 'commuter' | 'trainer' | 'other';
export type ComponentSource = 'manual' | 'vision' | 'coach' | 'check_in';
export type PhotoShotId = 'whole_bike' | 'drivetrain' | 'front_wheel';

export interface GearItem {
  id: string;
  user_id: string;
  sport_type: 'cycling' | 'running';
  gear_type: 'bike' | 'shoes';
  name: string;
  brand: string | null;
  model: string | null;
  /** Migration 123. Null for shoes and for bikes added before it. */
  category?: BikeCategory | null;
  is_trainer_bike?: boolean;
  /** Storage object paths in the gear-photos bucket, keyed by shot. */
  photo_paths?: Partial<Record<PhotoShotId, string>>;
  vision_extraction?: VisionExtraction | null;
  catalogued_at?: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  notes: string | null;
  total_distance_logged: number; // meters
  status: 'active' | 'retired';
  retirement_date: string | null;
  is_default: boolean;
  strava_gear_id: string | null;
  created_at: string;
  updated_at: string;
  gear_components?: GearComponent[];
}

export interface TireMetadata {
  width_mm: number;
  tubeless: boolean;
  max_pressure_psi?: number;
}

export interface WheelMetadata {
  rim_width_mm: number;
  hookless: boolean;
}

export interface GearComponent {
  id: string;
  gear_item_id: string;
  user_id: string;
  component_type: string;
  brand: string | null;
  model: string | null;
  installed_date: string | null;
  distance_at_install: number;
  warning_threshold_meters: number | null;
  replace_threshold_meters: number | null;
  notes: string | null;
  status: 'active' | 'replaced';
  replaced_date: string | null;
  metadata: Record<string, unknown>;
  /** Migration 123 wear + provenance columns. */
  effective_wear_m?: number;
  wet_distance_m?: number;
  offroad_distance_m?: number;
  indoor_distance_m?: number;
  moving_time_s?: number;
  source?: ComponentSource;
  confidence?: number | null;
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape returned by /api/gear-vision (see api/utils/gearVision.js). */
export interface VisionComponent {
  component_type: string;
  brand: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  confidence: number;
  prefill: boolean;
  evidence: string;
  seen_in: PhotoShotId[];
}

export interface VisionExtraction {
  bike: {
    brand: string | null;
    model: string | null;
    category: BikeCategory | null;
    frame_material: string | null;
    color: string | null;
    brake_type: 'disc' | 'rim' | null;
    confidence: number;
    evidence: string;
  };
  groupset: {
    brand: string | null;
    tier: string | null;
    speeds: number | null;
    electronic: boolean | null;
    confidence: number;
    evidence: string;
  };
  components: VisionComponent[];
  unreadable: { component_type: string; reason: string; better_shot: PhotoShotId | null }[];
}

export type RideSurface = 'road' | 'gravel' | 'mtb' | 'indoor';
/** Who put a ride on a bike. Bulk actions never move manual/check_in/coach rows. */
export type AssignedBy = 'auto' | 'manual' | 'strava' | 'check_in' | 'coach';

/** What a set of rides adds up to (api/utils/gearBackfill.js summarizeRides). */
export interface BackfillSummary {
  rides: number;
  distanceM: number;
  firstDate: string | null;
  lastDate: string | null;
  bySurface: { road: number; offroad: number; indoor: number };
  byType: { road: number; gravel: number; mtb: number; ebike: number; indoor: number };
}

export interface BackfillSkipped {
  alreadyHere: number;
  protected: number;
  otherBike: number;
  byGear: { gearId: string; name: string; protected: number; otherBike: number }[];
}

export interface BackfillPreview {
  summary: BackfillSummary;
  skipped: BackfillSkipped;
  /** Earliest ride in the window that is on no bike at all. */
  oldestUnassigned: string | null;
  unassignedCount: number;
}

export interface PreviousLink {
  activity_id: string;
  gear_item_id: string;
  assigned_by: AssignedBy;
  surface_override: RideSurface | null;
}

export interface BackfillResult {
  linked: number;
  linkedIds: string[];
  distanceM: number;
  /** Rows displaced by the backfill; hand back to undoAssignBatch verbatim. */
  previous: PreviousLink[];
  touchedGearIds: string[];
  summary: BackfillSummary;
  skipped: BackfillSkipped;
}

export interface ProviderGearItem extends BackfillSummary {
  providerGearId: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  frameType: number | null;
  retired: boolean | null;
  suggestedCategory: BikeCategory;
  claimedByGearId: string | null;
  claimedByName: string | null;
  claimedByStatus: 'active' | 'retired' | null;
}

export interface ProviderGearList {
  stravaConnected: boolean;
  enrichmentSkipped: boolean;
  enriched?: number;
  items: ProviderGearItem[];
}

export interface RideGearLink {
  activity_id: string;
  gear_item_id: string;
  assigned_by: AssignedBy;
  surface_override: RideSurface | null;
}

export interface GearAlert {
  type: 'warning' | 'replace';
  level: 'warning' | 'critical' | 'info';
  gearItemId: string;
  gearName: string;
  componentId: string | null;
  componentType: string | null;
  currentDistance: number;
  threshold: number | null;
  timeBased?: boolean;
  installedDate?: string;
  thresholdMonths?: number;
  message?: string;
}

export interface GearActivity {
  id: string;
  name: string;
  distance: number;
  start_date: string;
  sport_type: string;
  type: string;
  assigned_by: string;
}

// ── API helper ───────────────────────────────────────────────

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && import.meta.env?.PROD) return '';
  return 'http://localhost:3000';
};

async function gearApi(action: string, params: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${getApiBaseUrl()}/api/gear`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, userId: session.user.id, ...params }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || 'API request failed') as Error & { status?: number; data?: unknown };
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Hook ─────────────────────────────────────────────────────

interface UseGearOptions {
  userId?: string;
  alertsOnly?: boolean;
}

export function useGear({ userId, alertsOnly = false }: UseGearOptions = {}) {
  const [gearItems, setGearItems] = useState<GearItem[]>([]);
  const [alerts, setAlerts] = useState<GearAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch gear items
  const fetchGear = useCallback(async () => {
    if (!userId || alertsOnly) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('gear_items')
        .select('*, gear_components(id, component_type, status)')
        .eq('user_id', userId)
        .order('status', { ascending: true })
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      setGearItems(data || []);
      setError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch gear';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId, alertsOnly]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    if (!userId) return;
    setAlertsLoading(true);
    try {
      const data = await gearApi('get_alerts');
      setAlerts(data.alerts || []);
    } catch {
      // Non-critical: don't set error for alerts
    } finally {
      setAlertsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchGear();
      fetchAlerts();
    }
  }, [userId, fetchGear, fetchAlerts]);

  // ── CRUD operations ──────────────────────────────────────

  const createGear = useCallback(async (params: {
    name: string;
    sportType: string;
    brand?: string;
    model?: string;
    purchaseDate?: string;
    purchasePrice?: number;
    notes?: string;
    isDefault?: boolean;
    stravaGearId?: string;
    category?: BikeCategory;
    isTrainerBike?: boolean;
  }) => {
    const data = await gearApi('create_gear', params);
    trackGear('gear_bike_added', {
      sportType: params.sportType,
      category: params.category ?? null,
      hasPurchaseDate: Boolean(params.purchaseDate),
    });
    await fetchGear();
    await fetchAlerts();
    return data.gear as GearItem;
  }, [fetchGear, fetchAlerts]);

  const updateGear = useCallback(async (gearId: string, params: Record<string, unknown>) => {
    await gearApi('update_gear', { gearId, ...params });
    await fetchGear();
  }, [fetchGear]);

  const retireGear = useCallback(async (gearId: string) => {
    await gearApi('retire_gear', { gearId });
    await fetchGear();
    await fetchAlerts();
  }, [fetchGear, fetchAlerts]);

  const deleteGear = useCallback(async (gearId: string) => {
    await gearApi('delete_gear', { gearId });
    await fetchGear();
    await fetchAlerts();
  }, [fetchGear, fetchAlerts]);

  // ── Component operations ─────────────────────────────────

  const createComponent = useCallback(async (params: {
    gearItemId: string;
    componentType: string;
    brand?: string;
    model?: string;
    installedDate?: string;
    warningThreshold?: number;
    replaceThreshold?: number;
    notes?: string;
    metadata?: Record<string, unknown>;
    /** Who put this row here. Defaults to 'manual' server-side. */
    source?: ComponentSource;
    /** Vision confidence 0–1; only stored when source is 'vision'. */
    confidence?: number;
  }) => {
    const data = await gearApi('create_component', params);
    await fetchAlerts();
    return data.component as GearComponent;
  }, [fetchAlerts]);

  const replaceComponent = useCallback(async (componentId: string, newBrand?: string, newModel?: string) => {
    const data = await gearApi('replace_component', { componentId, newBrand, newModel });
    await fetchAlerts();
    return data.component as GearComponent;
  }, [fetchAlerts]);

  const deleteComponent = useCallback(async (componentId: string) => {
    await gearApi('delete_component', { componentId });
    await fetchAlerts();
  }, [fetchAlerts]);

  // ── Activity gear ────────────────────────────────────────

  const reassignActivityGear = useCallback(async (
    activityId: string,
    gearItemId: string,
    assignedBy: 'manual' | 'check_in' | 'coach' = 'manual',
  ): Promise<{ previousGearItemId: string | null }> => {
    const data = await gearApi('reassign_activity_gear', { activityId, gearItemId, assignedBy });
    await fetchGear();
    return { previousGearItemId: data.previousGearItemId ?? null };
  }, [fetchGear]);

  const setRideSurface = useCallback(async (activityId: string, surface: RideSurface | null) => {
    await gearApi('set_ride_surface', { activityId, surface });
    trackGear('gear_ride_surface_set', { surface });
  }, []);

  // ── Backload rides onto a bike ───────────────────────────

  const previewAssignRange = useCallback(async (
    gearId: string,
    opts: { from?: string | null; until?: string | null; includeAuto?: boolean } = {},
  ): Promise<BackfillPreview> => {
    const data = await gearApi('preview_assign_range', { gearId, ...opts });
    trackGear('gear_backfill_previewed', { gearId, rides: data.summary?.rides, distanceM: data.summary?.distanceM });
    return data;
  }, []);

  const assignRange = useCallback(async (
    gearId: string,
    opts: { from: string; until?: string | null; includeAuto?: boolean },
  ): Promise<BackfillResult> => {
    const data = await gearApi('assign_range', { gearId, ...opts });
    trackGear('gear_backfill_applied', { mode: 'date', gearId, rides: data.linked, distanceM: data.distanceM, includeAuto: opts.includeAuto ?? true });
    await fetchGear();
    return data;
  }, [fetchGear]);

  const undoAssignBatch = useCallback(async (
    gearId: string,
    linkedIds: string[],
    previous: PreviousLink[],
  ): Promise<{ restored: number; unlinked: number; touchedGearIds: string[] }> => {
    const data = await gearApi('undo_assign_batch', { gearId, linkedIds, previous });
    trackGear('gear_backfill_undone', { gearId, restored: data.restored, unlinked: data.unlinked });
    await fetchGear();
    return data;
  }, [fetchGear]);

  const listProviderGear = useCallback(async (): Promise<ProviderGearList> => {
    const data = await gearApi('list_provider_gear');
    trackGear('gear_provider_gear_listed', {
      count: data.items?.length ?? 0,
      unclaimed: (data.items || []).filter((i: ProviderGearItem) => !i.claimedByGearId).length,
      enriched: data.enriched ?? 0,
      stravaConnected: data.stravaConnected,
    });
    return data;
  }, []);

  const linkProviderGear = useCallback(async (
    gearId: string,
    providerGearId: string,
    includeAuto = true,
  ): Promise<BackfillResult> => {
    const data = await gearApi('link_provider_gear', { gearId, providerGearId, includeAuto });
    trackGear('gear_provider_gear_linked', { gearId, rides: data.linked, distanceM: data.distanceM });
    trackGear('gear_backfill_applied', { mode: 'strava', gearId, rides: data.linked, distanceM: data.distanceM, includeAuto });
    await fetchGear();
    return data;
  }, [fetchGear]);

  // ── Photo catalogue ──────────────────────────────────────

  /**
   * Ask /api/gear-vision to read the bike from photos already uploaded to
   * the gear-photos bucket. Returns a proposal; nothing is written until the
   * rider confirms and createComponent is called per part.
   */
  const catalogueFromPhotos = useCallback(async (
    gearItemId: string,
    photoPaths: Partial<Record<PhotoShotId, string>>,
  ): Promise<{ extraction: VisionExtraction; model: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${getApiBaseUrl()}/api/gear-vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ gearItemId, photoPaths }),
    });
    // A non-JSON body means the route was not reached (the SPA rewrite or a
    // 404 page answered) — say so instead of surfacing a JSON parse error.
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(
        response.status === 404 || contentType.includes('text/html')
          ? 'The vision endpoint is not deployed on this server yet (/api/gear-vision)'
          : `Vision request failed (${response.status})`
      );
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not read the photos');
    return { extraction: data.extraction as VisionExtraction, model: data.model as string };
  }, []);

  // ── Alerts ───────────────────────────────────────────────

  const dismissAlert = useCallback(async (alert: GearAlert) => {
    await gearApi('dismiss_alert', {
      gearItemId: alert.gearItemId,
      componentId: alert.componentId,
      alertType: alert.type,
      currentDistance: alert.currentDistance,
    });
    setAlerts(prev => prev.filter(a =>
      !(a.gearItemId === alert.gearItemId &&
        a.componentId === alert.componentId &&
        a.type === alert.type)
    ));
  }, []);

  // ── Utility ──────────────────────────────────────────────

  const recalculateMileage = useCallback(async (gearId: string) => {
    const data = await gearApi('recalculate_mileage', { gearId });
    await fetchGear();
    return data.totalDistance as number;
  }, [fetchGear]);

  const getGearDetail = useCallback(async (gearId: string) => {
    const data = await gearApi('get_gear', { gearId });
    return {
      gear: data.gear as GearItem,
      components: data.components as GearComponent[],
      activities: data.activities as GearActivity[],
    };
  }, []);

  // ── Tire/Wheel convenience methods ────────────────────────

  const getActiveTiresForBike = useCallback(async (bikeId: string): Promise<GearComponent | null> => {
    const detail = await getGearDetail(bikeId);
    return detail.components.find(
      (c) => c.status === 'active' && (c.component_type === 'tires_road' || c.component_type === 'tires_gravel')
    ) || null;
  }, [getGearDetail]);

  const getActiveWheelsForBike = useCallback(async (bikeId: string): Promise<GearComponent | null> => {
    const detail = await getGearDetail(bikeId);
    return detail.components.find(
      (c) => c.status === 'active' && (c.component_type === 'wheels_road' || c.component_type === 'wheels_gravel')
    ) || null;
  }, [getGearDetail]);

  const getDefaultBikeSetup = useCallback(async (): Promise<{
    bike: GearItem;
    tires: GearComponent | null;
    wheels: GearComponent | null;
    components: GearComponent[];
  } | null> => {
    const defaultBike = gearItems.find(
      (g) => g.sport_type === 'cycling' && g.status === 'active' && g.is_default
    );
    if (!defaultBike) return null;

    const detail = await getGearDetail(defaultBike.id);
    const tires = detail.components.find(
      (c) => c.status === 'active' && (c.component_type === 'tires_road' || c.component_type === 'tires_gravel')
    ) || null;
    const wheels = detail.components.find(
      (c) => c.status === 'active' && (c.component_type === 'wheels_road' || c.component_type === 'wheels_gravel')
    ) || null;

    return { bike: defaultBike, tires, wheels, components: detail.components };
  }, [gearItems, getGearDetail]);

  return {
    gearItems,
    alerts,
    loading,
    alertsLoading,
    error,
    createGear,
    updateGear,
    retireGear,
    deleteGear,
    createComponent,
    replaceComponent,
    deleteComponent,
    reassignActivityGear,
    setRideSurface,
    previewAssignRange,
    assignRange,
    undoAssignBatch,
    listProviderGear,
    linkProviderGear,
    catalogueFromPhotos,
    dismissAlert,
    recalculateMileage,
    getGearDetail,
    getActiveTiresForBike,
    getActiveWheelsForBike,
    getDefaultBikeSetup,
    refresh: fetchGear,
    refreshAlerts: fetchAlerts,
  };
}
