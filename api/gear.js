// Vercel API Route: Gear Management
// Handles CRUD for gear items, components, activity-gear links, and alerts

import { getSupabaseAdmin } from './utils/supabaseAdmin.js';
import { setupCors } from './utils/cors.js';
import { getDefaultThresholds } from './utils/gearDefaults.js';
import { getCatalogPart, BIKE_CATEGORIES } from './utils/gearCatalog.js';
import { recalculateGearMileage, reassignActivityGear, setRideSurface } from './utils/gearAssignment.js';
import { computeGearAlerts } from './utils/gearAlerts.js';
import {
  applyBackfill,
  fetchCandidateRides,
  fetchExistingLinks,
  planBackfill,
  suggestCategory,
  summarizeRides,
  undoBackfill,
} from './utils/gearBackfill.js';
import { getValidAccessToken as getStravaAccessToken } from './strava-activities.js';

const supabase = getSupabaseAdmin();

const COMPONENT_SOURCES = ['manual', 'vision', 'coach', 'check_in'];
// Who a caller may say decided a single-ride assignment. 'auto' and 'strava'
// are reserved for the machine paths so bulk actions can tell them apart.
const RIDER_ASSIGNERS = ['manual', 'check_in', 'coach'];
const STRAVA_GEAR_ENRICH_CAP = 20;
const UNDO_CAP = 20000;
const isDateString = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) && !Number.isNaN(Date.parse(v));
const isBikeCategory = (c) => BIKE_CATEGORIES.some((b) => b.value === c);

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
      case 'preview_assign_range':
        return await previewAssignRange(req, res, userId);
      case 'assign_range':
        return await assignRange(req, res, userId);
      case 'undo_assign_batch':
        return await undoAssignBatch(req, res, userId);
      case 'list_provider_gear':
        return await listProviderGear(req, res, userId);
      case 'link_provider_gear':
        return await linkProviderGear(req, res, userId);
      case 'set_ride_surface':
        return await setSurface(req, res, userId);
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
  const { name, sportType, brand, model, purchaseDate, purchasePrice, notes, isDefault, stravaGearId, category, isTrainerBike } = req.body;

  if (!name || !sportType) {
    return res.status(400).json({ error: 'name and sportType required' });
  }
  if (category !== undefined && category !== null && !isBikeCategory(category)) {
    return res.status(400).json({ error: 'invalid category' });
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
      ...(gearType === 'bike' && category ? { category } : {}),
      ...(gearType === 'bike' && isTrainerBike ? { is_trainer_bike: true } : {}),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Auto-link rides from the purchase date on. Rides already on another bike
  // stay there (includeAuto false): a new bike is a guess about the past,
  // not a claim on it — the rider can take them over from the bike page.
  if (purchaseDate) {
    try {
      const rides = await fetchCandidateRides(supabase, userId, { from: purchaseDate, sport: sportType });
      const existing = await fetchExistingLinks(supabase, rides.map((r) => r.id));
      const plan = planBackfill(rides, existing, data.id, { includeAuto: false, bikeCategory: data.category });
      if (plan.toLink.length > 0) {
        const result = await applyBackfill(supabase, { userId, gearId: data.id, plan, assignedBy: 'auto' });
        data.total_distance_logged = result.distanceM;
        console.log(`🔧 Auto-linked ${result.linked} rides to new gear ${data.id} (${Math.round(result.distanceM)}m)`);
      }
    } catch (linkErr) {
      // Non-fatal: gear was created, just log the linking failure
      console.error('Failed to auto-link activities to new gear:', linkErr.message);
    }
  }

  return res.status(201).json({ gear: data });
}

// ── Update gear item ─────────────────────────────────────────

async function updateGear(req, res, userId) {
  const { gearId, name, brand, model, purchaseDate, purchasePrice, notes, isDefault, stravaGearId, category, isTrainerBike, cataloguedAt } = req.body;
  if (!gearId) return res.status(400).json({ error: 'gearId required' });
  if (category !== undefined && category !== null && !isBikeCategory(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }

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
  if (category !== undefined) updates.category = category;
  if (isTrainerBike !== undefined) updates.is_trainer_bike = Boolean(isTrainerBike);
  if (cataloguedAt !== undefined) updates.catalogued_at = cataloguedAt;

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
  const { gearItemId, componentType, brand, model, installedDate, warningThreshold, replaceThreshold, notes, metadata, source, confidence } = req.body;

  if (!gearItemId || !componentType) {
    return res.status(400).json({ error: 'gearItemId and componentType required' });
  }
  if (!getCatalogPart(componentType)) {
    return res.status(400).json({ error: `unknown componentType ${componentType}` });
  }
  const componentSource = COMPONENT_SOURCES.includes(source) ? source : 'manual';
  const componentConfidence = Number.isFinite(Number(confidence))
    ? Math.max(0, Math.min(1, Number(confidence)))
    : null;

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
      ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
      source: componentSource,
      confidence: componentSource === 'vision' ? componentConfidence : null,
      // Everything created through this endpoint was put here by the rider
      // (the confirm screen included), so it is confirmed on arrival.
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json({ component: data });
}

// ── Update component ─────────────────────────────────────────

async function updateComponent(req, res, userId) {
  const { componentId, brand, model, warningThreshold, replaceThreshold, notes, metadata } = req.body;
  if (!componentId) return res.status(400).json({ error: 'componentId required' });

  const updates = { updated_at: new Date().toISOString() };
  if (brand !== undefined) updates.brand = brand;
  if (model !== undefined) updates.model = model;
  if (warningThreshold !== undefined) updates.warning_threshold_meters = warningThreshold;
  if (replaceThreshold !== undefined) updates.replace_threshold_meters = replaceThreshold;
  if (notes !== undefined) updates.notes = notes;
  if (metadata !== undefined && typeof metadata === 'object') updates.metadata = metadata;

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
      // A like-for-like replacement keeps the specs (tire width, rim width)
      // unless the rider says otherwise on the next catalogue.
      metadata: oldComp.metadata || {},
      source: 'manual',
      confirmed_at: new Date().toISOString(),
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
  const { activityId, gearItemId, assignedBy } = req.body;
  if (!activityId || !gearItemId) {
    return res.status(400).json({ error: 'activityId and gearItemId required' });
  }
  if (assignedBy !== undefined && !RIDER_ASSIGNERS.includes(assignedBy)) {
    return res.status(400).json({ error: 'invalid assignedBy' });
  }

  try {
    const { previousGearItemId } = await reassignActivityGear(supabase, activityId, gearItemId, userId, { assignedBy: assignedBy || 'manual' });
    return res.status(200).json({ success: true, previousGearItemId });
  } catch (err) {
    const notFound = /not found/i.test(err.message);
    return res.status(notFound ? 404 : 500).json({ error: err.message });
  }
}

// ── Surface override on one ride ─────────────────────────────

async function setSurface(req, res, userId) {
  const { activityId, surface } = req.body;
  if (!activityId) return res.status(400).json({ error: 'activityId required' });
  try {
    await setRideSurface(supabase, activityId, userId, surface ?? null);
    return res.status(200).json({ success: true });
  } catch (err) {
    const bad = /invalid|first/i.test(err.message);
    return res.status(bad ? 400 : 500).json({ error: err.message });
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

// ── Backload: rides from a date ──────────────────────────────

async function ownedBike(userId, gearId) {
  const { data } = await supabase
    .from('gear_items')
    .select('id, name, gear_type, sport_type, status, category, purchase_date, strava_gear_id')
    .eq('id', gearId)
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

async function namesForGear(userId, gearIds) {
  if (!gearIds.length) return {};
  const { data } = await supabase
    .from('gear_items')
    .select('id, name')
    .eq('user_id', userId)
    .in('id', gearIds);
  return Object.fromEntries((data || []).map((g) => [g.id, g.name]));
}

async function describeSkipped(userId, plan) {
  const ids = Object.keys(plan.skippedByGear);
  const names = await namesForGear(userId, ids);
  return {
    ...plan.skipped,
    byGear: ids.map((id) => ({ gearId: id, name: names[id] || 'another bike', ...plan.skippedByGear[id] })),
  };
}

/**
 * Plan a date-range backfill. Without `from`, every cycling ride is a
 * candidate — used on first open to tell the rider how far back the
 * unassigned rides go.
 */
async function planRange(userId, bike, { from, until, includeAuto }) {
  const rides = await fetchCandidateRides(supabase, userId, { from: from || undefined, until: until || undefined });
  const existing = await fetchExistingLinks(supabase, rides.map((r) => r.id));
  const plan = planBackfill(rides, existing, bike.id, { includeAuto, bikeCategory: bike.category });
  const unassigned = rides.filter((r) => !existing.has(r.id));
  const oldestUnassigned = unassigned.reduce((min, r) => {
    const day = String(r.start_date).slice(0, 10);
    return !min || day < min ? day : min;
  }, null);
  return { rides, existing, plan, oldestUnassigned, unassignedCount: unassigned.length };
}

function validateRange(body) {
  const { gearId, from, until } = body;
  if (!gearId) return 'gearId required';
  if (from !== undefined && from !== null && !isDateString(from)) return 'from must be a date';
  if (until !== undefined && until !== null && !isDateString(until)) return 'until must be a date';
  if (from && until && until < from) return 'until is before from';
  return null;
}

async function previewAssignRange(req, res, userId) {
  const problem = validateRange(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const { gearId, from, until, includeAuto = true } = req.body;

  const bike = await ownedBike(userId, gearId);
  if (!bike) return res.status(404).json({ error: 'Gear not found' });
  if (bike.gear_type !== 'bike') return res.status(400).json({ error: 'Only bikes take rides' });

  const { plan, oldestUnassigned, unassignedCount } = await planRange(userId, bike, { from, until, includeAuto: Boolean(includeAuto) });
  return res.status(200).json({
    summary: plan.summary,
    skipped: await describeSkipped(userId, plan),
    oldestUnassigned,
    unassignedCount,
  });
}

async function assignRange(req, res, userId) {
  const problem = validateRange(req.body);
  if (problem) return res.status(400).json({ error: problem });
  const { gearId, from, until, includeAuto = true } = req.body;
  if (!from) return res.status(400).json({ error: 'from required' });

  const bike = await ownedBike(userId, gearId);
  if (!bike) return res.status(404).json({ error: 'Gear not found' });
  if (bike.gear_type !== 'bike') return res.status(400).json({ error: 'Only bikes take rides' });
  if (bike.status !== 'active') return res.status(400).json({ error: 'That bike is retired' });

  const { plan } = await planRange(userId, bike, { from, until, includeAuto: Boolean(includeAuto) });
  const result = plan.toLink.length
    ? await applyBackfill(supabase, { userId, gearId: bike.id, plan, assignedBy: 'auto' })
    : { linked: 0, linkedIds: [], distanceM: 0, previous: [], touchedGearIds: [] };

  console.log(`🔧 Backfill by date: ${result.linked} rides → gear ${bike.id} (${Math.round(result.distanceM)}m)`);
  return res.status(200).json({ ...result, summary: plan.summary, skipped: await describeSkipped(userId, plan) });
}

async function undoAssignBatch(req, res, userId) {
  const { gearId, linkedIds, previous } = req.body;
  if (!gearId || !Array.isArray(linkedIds)) return res.status(400).json({ error: 'gearId and linkedIds required' });
  if (linkedIds.length > UNDO_CAP) return res.status(400).json({ error: 'too many rides to undo in one go' });
  const prev = Array.isArray(previous) ? previous.filter((p) => p && p.activity_id && p.gear_item_id) : [];

  const bike = await ownedBike(userId, gearId);
  if (!bike) return res.status(404).json({ error: 'Gear not found' });

  try {
    const result = await undoBackfill(supabase, { userId, gearId: bike.id, linkedIds, previous: prev });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Backload: bikes Strava knows about ───────────────────────

async function fetchStravaGear(token, gearId) {
  const response = await fetch(`https://www.strava.com/api/v3/gear/${encodeURIComponent(gearId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const err = new Error(`Strava gear lookup failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

/**
 * Every Strava gear id seen on this rider's rides, with what those rides add
 * up to and which bike (if any) already claims the id. Garmin, Wahoo and FIT
 * rows carry no bike identity, so this is Strava-only by construction.
 */
async function listProviderGear(req, res, userId) {
  const { data: integration } = await supabase
    .from('bike_computer_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .maybeSingle();
  const stravaConnected = Boolean(integration);

  // All rides that carry a gear id, paged.
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('activities')
      .select('gear_id, distance, type, sport_type, trainer, start_date, gear_name:raw_data->gear->>name')
      .eq('user_id', userId)
      .is('duplicate_of', null)
      .not('gear_id', 'is', null)
      .order('start_date', { ascending: true })
      .range(offset, offset + 999);
    if (error) return res.status(500).json({ error: error.message });
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.gear_id)) byId.set(r.gear_id, { rides: [], name: null });
    const g = byId.get(r.gear_id);
    g.rides.push(r);
    if (!g.name && r.gear_name) g.name = r.gear_name;
  }
  const ids = Array.from(byId.keys());
  if (ids.length === 0) {
    return res.status(200).json({ stravaConnected, enrichmentSkipped: false, items: [] });
  }

  // Which bikes already carry these ids.
  const { data: claims } = await supabase
    .from('gear_items')
    .select('id, name, strava_gear_id, status')
    .eq('user_id', userId)
    .in('strava_gear_id', ids);
  const claimedBy = new Map();
  for (const c of claims || []) {
    // An active claim wins over a retired one.
    if (!claimedBy.has(c.strava_gear_id) || c.status === 'active') claimedBy.set(c.strava_gear_id, c);
  }

  // Names: webhook payload → cache → Strava (capped) → cache write.
  const { data: cached } = await supabase
    .from('provider_gear')
    .select('provider_gear_id, name, brand, model, frame_type, retired')
    .eq('user_id', userId)
    .eq('provider', 'strava')
    .in('provider_gear_id', ids);
  const cache = new Map((cached || []).map((c) => [c.provider_gear_id, c]));

  let enrichmentSkipped = false;
  let enriched = 0;
  const missing = ids.filter((id) => !cache.has(id));
  if (missing.length && stravaConnected) {
    try {
      const token = await getStravaAccessToken(userId);
      const writes = [];
      for (const id of missing.slice(0, STRAVA_GEAR_ENRICH_CAP)) {
        try {
          const g = await fetchStravaGear(token, id);
          const row = {
            user_id: userId,
            provider: 'strava',
            provider_gear_id: id,
            name: g.name || null,
            brand: g.brand_name || null,
            model: g.model_name || null,
            frame_type: Number.isInteger(g.frame_type) ? g.frame_type : null,
            retired: typeof g.retired === 'boolean' ? g.retired : null,
            fetched_at: new Date().toISOString(),
          };
          cache.set(id, row);
          writes.push(row);
          enriched += 1;
        } catch (err) {
          // Stop on auth or rate-limit; a single 404 (gear deleted on Strava) just moves on.
          if (err.status === 401 || err.status === 403 || err.status === 429) { enrichmentSkipped = true; break; }
        }
      }
      if (missing.length > STRAVA_GEAR_ENRICH_CAP) enrichmentSkipped = true;
      if (writes.length) {
        const { error } = await supabase.from('provider_gear').upsert(writes, { onConflict: 'user_id,provider,provider_gear_id' });
        if (error) console.error('provider_gear cache write failed:', error.message);
      }
    } catch (err) {
      console.error('Strava gear enrichment skipped:', err.message);
      enrichmentSkipped = true;
    }
  } else if (missing.length) {
    enrichmentSkipped = true;
  }

  const items = ids.map((id) => {
    const g = byId.get(id);
    const c = cache.get(id);
    const claim = claimedBy.get(id);
    const summary = summarizeRides(g.rides, null);
    return {
      providerGearId: id,
      name: g.name || c?.name || null,
      brand: c?.brand || null,
      model: c?.model || null,
      frameType: c?.frame_type ?? null,
      retired: c?.retired ?? null,
      ...summary,
      suggestedCategory: suggestCategory(summary.byType),
      claimedByGearId: claim?.id || null,
      claimedByName: claim?.name || null,
      claimedByStatus: claim?.status || null,
    };
  }).sort((a, b) => b.rides - a.rides);

  return res.status(200).json({ stravaConnected, enrichmentSkipped, enriched, items });
}

/**
 * "This is my Tarmac": put a Strava gear id on an existing bike and pull
 * every ride Strava tagged with it onto that bike. Match only — never
 * creates a bike.
 */
async function linkProviderGear(req, res, userId) {
  const { gearId, providerGearId, includeAuto = true } = req.body;
  if (!gearId || !providerGearId || typeof providerGearId !== 'string') {
    return res.status(400).json({ error: 'gearId and providerGearId required' });
  }

  const bike = await ownedBike(userId, gearId);
  if (!bike) return res.status(404).json({ error: 'Gear not found' });
  if (bike.gear_type !== 'bike') return res.status(400).json({ error: 'Only bikes take rides' });
  if (bike.status !== 'active') return res.status(400).json({ error: 'That bike is retired' });

  const { data: other } = await supabase
    .from('gear_items')
    .select('id, name')
    .eq('user_id', userId)
    .eq('strava_gear_id', providerGearId)
    .eq('status', 'active')
    .neq('id', bike.id)
    .maybeSingle();
  if (other) {
    return res.status(409).json({ error: `That Strava bike is already ${other.name}`, conflictGearId: other.id, conflictName: other.name });
  }

  if (bike.strava_gear_id !== providerGearId) {
    const { error } = await supabase
      .from('gear_items')
      .update({ strava_gear_id: providerGearId, updated_at: new Date().toISOString() })
      .eq('id', bike.id)
      .eq('user_id', userId);
    if (error) return res.status(500).json({ error: error.message });
  }

  const rides = await fetchCandidateRides(supabase, userId, { stravaGearId: providerGearId });
  const existing = await fetchExistingLinks(supabase, rides.map((r) => r.id));
  const plan = planBackfill(rides, existing, bike.id, { includeAuto: Boolean(includeAuto), includeStrava: true, bikeCategory: bike.category });
  const result = plan.toLink.length
    ? await applyBackfill(supabase, { userId, gearId: bike.id, plan, assignedBy: 'strava' })
    : { linked: 0, linkedIds: [], distanceM: 0, previous: [], touchedGearIds: [] };

  console.log(`🔧 Backfill by Strava gear ${providerGearId}: ${result.linked} rides → gear ${bike.id}`);
  return res.status(200).json({ ...result, summary: plan.summary, skipped: await describeSkipped(userId, plan) });
}
