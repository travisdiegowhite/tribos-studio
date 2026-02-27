// Vercel API Route: Gear Management
// Handles CRUD for gear items, components, activity-gear links, and alerts

import { createClient } from '@supabase/supabase-js';
import { setupCors } from './utils/cors.js';
import { getDefaultThresholds } from './utils/gearDefaults.js';
import { recalculateGearMileage, reassignActivityGear } from './utils/gearAssignment.js';
import { computeGearAlerts } from './utils/gearAlerts.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getUserFromAuthHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  if (setupCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const authUser = await getUserFromAuthHeader(req);
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (authUser.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    switch (action) {
      case 'list_gear':
        return await listGear(req, res, userId);
      case 'get_gear':
        return await getGear(req, res, userId);
      case 'create_gear':
        return await createGear(req, res, userId);
      case 'update_gear':
        return await updateGear(req, res, userId);
      case 'retire_gear':
        return await retireGear(req, res, userId);
      case 'delete_gear':
        return await deleteGear(req, res, userId);
      case 'create_component':
        return await createComponent(req, res, userId);
      case 'update_component':
        return await updateComponent(req, res, userId);
      case 'replace_component':
        return await replaceComponent(req, res, userId);
      case 'delete_component':
        return await deleteComponent(req, res, userId);
      case 'reassign_activity_gear':
        return await reassignGear(req, res, userId);
      case 'get_alerts':
        return await getAlerts(req, res, userId);
      case 'dismiss_alert':
        return await dismissAlert(req, res, userId);
      case 'recalculate_mileage':
        return await recalcMileage(req, res, userId);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Gear API error:', error);
    return res.status(500).json({
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

// ── List all gear items ──────────────────────────────────────

async function listGear(req, res, userId) {
  const { sportType } = req.body;

  let query = supabase
    .from('gear_items')
    .select('*, gear_components(id, component_type, status)')
    .eq('user_id', userId)
    .order('status', { ascending: true })
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (sportType) {
    query = query.eq('sport_type', sportType);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ gear: data });
}

// ── Get single gear item with components and recent activities ──

async function getGear(req, res, userId) {
  const { gearId } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });

  const { data: gear, error } = await supabase
    .from('gear_items')
    .select('*')
    .eq('id', gearId)
    .eq('user_id', userId)
    .single();

  if (error || !gear) return res.status(404).json({ error: 'Gear not found' });

  // Fetch components
  const { data: components } = await supabase
    .from('gear_components')
    .select('*')
    .eq('gear_item_id', gearId)
    .order('status', { ascending: true })
    .order('installed_date', { ascending: false });

  // Fetch recent activities (last 20)
  const { data: activityLinks } = await supabase
    .from('activity_gear')
    .select('activity_id, assigned_by, activities(id, name, distance, start_date, sport_type, type)')
    .eq('gear_item_id', gearId)
    .order('created_at', { ascending: false })
    .limit(20);

  return res.status(200).json({
    gear,
    components: components || [],
    activities: (activityLinks || []).map(al => ({
      ...al.activities,
      assigned_by: al.assigned_by,
    })),
  });
}

// ── Create gear item ─────────────────────────────────────────

async function createGear(req, res, userId) {
  const { name, sportType, brand, model, purchaseDate, purchasePrice, notes, isDefault, stravaGearId } = req.body;

  if (!name || !sportType) {
    return res.status(400).json({ error: 'name and sportType required' });
  }

  const gearType = sportType === 'cycling' ? 'bike' : 'shoes';

  // If setting as default, clear existing default for this sport_type
  if (isDefault) {
    await supabase
      .from('gear_items')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('sport_type', sportType)
      .eq('is_default', true);
  }

  const { data, error } = await supabase
    .from('gear_items')
    .insert({
      user_id: userId,
      sport_type: sportType,
      gear_type: gearType,
      name,
      brand: brand || null,
      model: model || null,
      purchase_date: purchaseDate || null,
      purchase_price: purchasePrice || null,
      notes: notes || null,
      is_default: isDefault || false,
      strava_gear_id: stravaGearId || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ gear: data });
}

// ── Update gear item ─────────────────────────────────────────

async function updateGear(req, res, userId) {
  const { gearId, name, brand, model, purchaseDate, purchasePrice, notes, isDefault, stravaGearId } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });

  // If setting as default, clear existing defaults for this sport_type
  if (isDefault) {
    const { data: gear } = await supabase
      .from('gear_items')
      .select('sport_type')
      .eq('id', gearId)
      .single();

    if (gear) {
      await supabase
        .from('gear_items')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('sport_type', gear.sport_type)
        .eq('is_default', true)
        .neq('id', gearId);
    }
  }

  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (brand !== undefined) updates.brand = brand;
  if (model !== undefined) updates.model = model;
  if (purchaseDate !== undefined) updates.purchase_date = purchaseDate;
  if (purchasePrice !== undefined) updates.purchase_price = purchasePrice;
  if (notes !== undefined) updates.notes = notes;
  if (isDefault !== undefined) updates.is_default = isDefault;
  if (stravaGearId !== undefined) updates.strava_gear_id = stravaGearId;

  const { data, error } = await supabase
    .from('gear_items')
    .update(updates)
    .eq('id', gearId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ gear: data });
}

// ── Retire gear item ─────────────────────────────────────────

async function retireGear(req, res, userId) {
  const { gearId } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });

  const { data, error } = await supabase
    .from('gear_items')
    .update({
      status: 'retired',
      retirement_date: new Date().toISOString().split('T')[0],
      is_default: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gearId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ gear: data });
}

// ── Delete gear item ─────────────────────────────────────────

async function deleteGear(req, res, userId) {
  const { gearId } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });

  const { error } = await supabase
    .from('gear_items')
    .delete()
    .eq('id', gearId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}

// ── Create component ─────────────────────────────────────────

async function createComponent(req, res, userId) {
  const { gearItemId, componentType, brand, model, installedDate, warningThreshold, replaceThreshold, notes } = req.body;

  if (!gearItemId || !componentType) {
    return res.status(400).json({ error: 'gearItemId and componentType required' });
  }

  // Get parent gear's current distance
  const { data: gear } = await supabase
    .from('gear_items')
    .select('total_distance_logged')
    .eq('id', gearItemId)
    .eq('user_id', userId)
    .single();

  if (!gear) return res.status(404).json({ error: 'Gear item not found' });

  // Calculate distance_at_install: if backdated, sum only activities before install date
  let distanceAtInstall = gear.total_distance_logged || 0;
  const effectiveInstallDate = installedDate || new Date().toISOString().split('T')[0];

  if (installedDate) {
    const { data: linkedActivities } = await supabase
      .from('activity_gear')
      .select('activities(distance, start_date)')
      .eq('gear_item_id', gearItemId);

    if (linkedActivities) {
      distanceAtInstall = linkedActivities.reduce((sum, ag) => {
        if (ag.activities?.start_date && ag.activities.start_date < installedDate) {
          return sum + (ag.activities?.distance || 0);
        }
        return sum;
      }, 0);
    }
  }

  // Use custom thresholds or fall back to defaults
  const defaults = getDefaultThresholds(componentType);

  const { data, error } = await supabase
    .from('gear_components')
    .insert({
      gear_item_id: gearItemId,
      user_id: userId,
      component_type: componentType,
      brand: brand || null,
      model: model || null,
      installed_date: effectiveInstallDate,
      distance_at_install: distanceAtInstall,
      warning_threshold_meters: warningThreshold ?? defaults.warning,
      replace_threshold_meters: replaceThreshold ?? defaults.replace,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ component: data });
}

// ── Update component ─────────────────────────────────────────

async function updateComponent(req, res, userId) {
  const { componentId, brand, model, warningThreshold, replaceThreshold, notes } = req.body;
  if (!componentId) return res.status(400).json({ error: 'componentId required' });

  const updates = { updated_at: new Date().toISOString() };
  if (brand !== undefined) updates.brand = brand;
  if (model !== undefined) updates.model = model;
  if (warningThreshold !== undefined) updates.warning_threshold_meters = warningThreshold;
  if (replaceThreshold !== undefined) updates.replace_threshold_meters = replaceThreshold;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabase
    .from('gear_components')
    .update(updates)
    .eq('id', componentId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ component: data });
}

// ── Replace component ────────────────────────────────────────

async function replaceComponent(req, res, userId) {
  const { componentId, newBrand, newModel, newNotes } = req.body;
  if (!componentId) return res.status(400).json({ error: 'componentId required' });

  // Get the old component
  const { data: oldComp } = await supabase
    .from('gear_components')
    .select('*')
    .eq('id', componentId)
    .eq('user_id', userId)
    .single();

  if (!oldComp) return res.status(404).json({ error: 'Component not found' });

  // Get current parent gear distance
  const { data: gear } = await supabase
    .from('gear_items')
    .select('total_distance_logged')
    .eq('id', oldComp.gear_item_id)
    .single();

  // Mark old component as replaced
  await supabase
    .from('gear_components')
    .update({
      status: 'replaced',
      replaced_date: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    })
    .eq('id', componentId);

  // Clear any dismissals for the old component
  await supabase
    .from('gear_alert_dismissals')
    .delete()
    .eq('gear_component_id', componentId);

  // Create new component of the same type
  const { data: newComp, error } = await supabase
    .from('gear_components')
    .insert({
      gear_item_id: oldComp.gear_item_id,
      user_id: userId,
      component_type: oldComp.component_type,
      brand: newBrand || null,
      model: newModel || null,
      installed_date: new Date().toISOString().split('T')[0],
      distance_at_install: gear?.total_distance_logged || 0,
      warning_threshold_meters: oldComp.warning_threshold_meters,
      replace_threshold_meters: oldComp.replace_threshold_meters,
      notes: newNotes || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ component: newComp });
}

// ── Delete component ─────────────────────────────────────────

async function deleteComponent(req, res, userId) {
  const { componentId } = req.body;
  if (!componentId) return res.status(400).json({ error: 'componentId required' });

  const { error } = await supabase
    .from('gear_components')
    .delete()
    .eq('id', componentId)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}

// ── Reassign gear on an activity ─────────────────────────────

async function reassignGear(req, res, userId) {
  const { activityId, gearItemId } = req.body;
  if (!activityId || !gearItemId) {
    return res.status(400).json({ error: 'activityId and gearItemId required' });
  }

  try {
    await reassignActivityGear(supabase, activityId, gearItemId, userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Get alerts ───────────────────────────────────────────────

async function getAlerts(req, res, userId) {
  const alerts = await computeGearAlerts(supabase, userId);
  return res.status(200).json({ alerts });
}

// ── Dismiss alert ────────────────────────────────────────────

async function dismissAlert(req, res, userId) {
  const { gearItemId, componentId, alertType, currentDistance } = req.body;
  if (!alertType) return res.status(400).json({ error: 'alertType required' });

  const { error } = await supabase
    .from('gear_alert_dismissals')
    .upsert({
      user_id: userId,
      gear_item_id: gearItemId || null,
      gear_component_id: componentId || null,
      alert_type: alertType,
      dismissed_at_distance: currentDistance || 0,
    }, {
      onConflict: 'user_id,gear_item_id,gear_component_id,alert_type',
      ignoreDuplicates: false,
    });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}

// ── Recalculate mileage ──────────────────────────────────────

async function recalcMileage(req, res, userId) {
  const { gearId } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });

  // Verify ownership
  const { data: gear } = await supabase
    .from('gear_items')
    .select('id')
    .eq('id', gearId)
    .eq('user_id', userId)
    .single();

  if (!gear) return res.status(404).json({ error: 'Gear not found' });

  try {
    const totalDistance = await recalculateGearMileage(supabase, gearId);
    return res.status(200).json({ totalDistance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
