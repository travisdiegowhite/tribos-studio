/**
 * useGear Hook
 * Manages gear items, components, alerts, and activity-gear assignments.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ────────────────────────────────────────────────────

export interface GearItem {
  id: string;
  user_id: string;
  sport_type: 'cycling' | 'running';
  gear_type: 'bike' | 'shoes';
  name: string;
  brand: string | null;
  model: string | null;
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
  created_at: string;
  updated_at: string;
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
  if (!response.ok) throw new Error(data.error || 'API request failed');
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
  }) => {
    const data = await gearApi('create_gear', params);
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

  const reassignActivityGear = useCallback(async (activityId: string, gearItemId: string) => {
    await gearApi('reassign_activity_gear', { activityId, gearItemId });
    await fetchGear();
  }, [fetchGear]);

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
    dismissAlert,
    recalculateMileage,
    getGearDetail,
    refresh: fetchGear,
    refreshAlerts: fetchAlerts,
  };
}
