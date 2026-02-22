/**
 * Gear Alert Utilities
 * Computes maintenance alerts for gear items and components.
 */

import { DEFAULT_COMPONENT_THRESHOLDS, RUNNING_SHOE_THRESHOLDS } from './gearDefaults.js';

/**
 * Compute all active gear alerts for a user.
 * Returns alerts that have not been dismissed.
 *
 * @param {object} supabase - Supabase client
 * @param {string} userId - UUID of the user
 * @returns {Promise<Array>} Array of alert objects
 */
export async function computeGearAlerts(supabase, userId) {
  const alerts = [];

  // Fetch active gear items
  const { data: gearItems, error: gearError } = await supabase
    .from('gear_items')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (gearError || !gearItems) return alerts;

  // Fetch active components with parent gear distance
  const { data: components } = await supabase
    .from('gear_components')
    .select('*, gear_items!inner(id, total_distance_logged, name)')
    .eq('user_id', userId)
    .eq('status', 'active');

  // Fetch dismissals
  const { data: dismissals } = await supabase
    .from('gear_alert_dismissals')
    .select('*')
    .eq('user_id', userId);

  // Check running shoes
  for (const gear of gearItems.filter(g => g.gear_type === 'shoes')) {
    const distance = gear.total_distance_logged || 0;

    if (distance >= RUNNING_SHOE_THRESHOLDS.replace) {
      if (!isDismissed(dismissals, gear.id, null, 'replace')) {
        alerts.push({
          type: 'replace',
          level: 'critical',
          gearItemId: gear.id,
          gearName: gear.name,
          componentId: null,
          componentType: null,
          currentDistance: distance,
          threshold: RUNNING_SHOE_THRESHOLDS.replace,
        });
      }
    } else if (distance >= RUNNING_SHOE_THRESHOLDS.warning) {
      if (!isDismissed(dismissals, gear.id, null, 'warning')) {
        alerts.push({
          type: 'warning',
          level: 'warning',
          gearItemId: gear.id,
          gearName: gear.name,
          componentId: null,
          componentType: null,
          currentDistance: distance,
          threshold: RUNNING_SHOE_THRESHOLDS.warning,
        });
      }
    }
  }

  // Check cycling components
  for (const comp of (components || [])) {
    const parentDistance = comp.gear_items?.total_distance_logged || 0;
    const componentDistance = parentDistance - (comp.distance_at_install || 0);

    // Use custom thresholds if set, otherwise fall back to defaults
    const defaults = DEFAULT_COMPONENT_THRESHOLDS[comp.component_type] || {};
    const replaceThreshold = comp.replace_threshold_meters || defaults.replace;
    const warningThreshold = comp.warning_threshold_meters || defaults.warning;

    // Check time-based alerts (bar tape)
    if (defaults.time_based_months && comp.installed_date) {
      const installDate = new Date(comp.installed_date);
      const thresholdDate = new Date(installDate);
      thresholdDate.setMonth(thresholdDate.getMonth() + defaults.time_based_months);

      if (new Date() >= thresholdDate) {
        if (!isDismissed(dismissals, comp.gear_item_id, comp.id, 'replace')) {
          alerts.push({
            type: 'replace',
            level: 'critical',
            gearItemId: comp.gear_item_id,
            gearName: comp.gear_items?.name || 'Unknown',
            componentId: comp.id,
            componentType: comp.component_type,
            currentDistance: componentDistance,
            threshold: null,
            timeBased: true,
            installedDate: comp.installed_date,
            thresholdMonths: defaults.time_based_months,
          });
        }
        continue; // Skip mileage check for time-based components
      }
    }

    // Mileage-based alerts
    if (replaceThreshold && componentDistance >= replaceThreshold) {
      if (!isDismissed(dismissals, comp.gear_item_id, comp.id, 'replace')) {
        alerts.push({
          type: 'replace',
          level: 'critical',
          gearItemId: comp.gear_item_id,
          gearName: comp.gear_items?.name || 'Unknown',
          componentId: comp.id,
          componentType: comp.component_type,
          currentDistance: componentDistance,
          threshold: replaceThreshold,
        });
      }
    } else if (warningThreshold && componentDistance >= warningThreshold) {
      if (!isDismissed(dismissals, comp.gear_item_id, comp.id, 'warning')) {
        alerts.push({
          type: 'warning',
          level: 'warning',
          gearItemId: comp.gear_item_id,
          gearName: comp.gear_items?.name || 'Unknown',
          componentId: comp.id,
          componentType: comp.component_type,
          currentDistance: componentDistance,
          threshold: warningThreshold,
        });
      }
    }
  }

  // Check bikes with no components logged
  for (const gear of gearItems.filter(g => g.gear_type === 'bike')) {
    const hasComponents = (components || []).some(c => c.gear_item_id === gear.id);
    if (!hasComponents) {
      if (!isDismissed(dismissals, gear.id, null, 'warning')) {
        alerts.push({
          type: 'warning',
          level: 'info',
          gearItemId: gear.id,
          gearName: gear.name,
          componentId: null,
          componentType: null,
          currentDistance: 0,
          threshold: 0,
          message: 'No components tracked. Add components to get maintenance alerts.',
        });
      }
    }
  }

  return alerts;
}

/**
 * Check if an alert has been dismissed.
 */
function isDismissed(dismissals, gearItemId, componentId, alertType) {
  if (!dismissals) return false;
  return dismissals.some(d =>
    d.alert_type === alertType &&
    d.gear_item_id === gearItemId &&
    (componentId ? d.gear_component_id === componentId : !d.gear_component_id)
  );
}
