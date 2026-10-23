/**
 * Garmin registration notifications (OAuth2 PKCE spec §7 and §9).
 *
 * - deregistrations[]: the user disconnected tribos in Garmin Connect, or we
 *   called DELETE /user/registration. Drop the integration row (tokens go
 *   with it). Activities and health rows already imported stay; they are
 *   removed only by account deletion.
 * - userPermissionsChange[]: the user changed what tribos may access. Store
 *   the new list in provider_user_data.permissions and pause sync while
 *   ACTIVITY_EXPORT is off.
 *
 * These are small and idempotent, so both webhook receivers apply them
 * inline instead of queueing them for the processor. The Cloudflare worker
 * (cloudflare-workers/garmin-webhook/src/index.js) carries a mirror of this
 * logic because it cannot import from api/ — keep the two in sync.
 *
 * Functions take the Supabase client as a parameter (no module-level state).
 */

/**
 * @param {object} supabase - Supabase service-role client
 * @param {object[]} items - deregistrations[] items ({ userId })
 * @returns {Promise<{removed: number, failed: number}>}
 */
export async function applyDeregistrations(supabase, items) {
  let removed = 0;
  let failed = 0;
  for (const item of items || []) {
    const garminUserId = item?.userId ? String(item.userId) : null;
    if (!garminUserId) continue;

    const { data, error } = await supabase
      .from('bike_computer_integrations')
      .delete()
      .eq('provider', 'garmin')
      .eq('provider_user_id', garminUserId)
      .select('id');

    if (error) {
      console.error('Garmin deregistration: delete failed for', garminUserId, error.message);
      failed++;
    } else {
      removed += data?.length || 0;
      console.log(`🔌 Garmin deregistration for ${garminUserId}: removed ${data?.length || 0} integration(s)`);
    }
  }
  return { removed, failed };
}

/**
 * @param {object} supabase - Supabase service-role client
 * @param {object[]} items - userPermissionsChange[] items
 *   ({ userId, permissions: string[], changeTimeInSeconds })
 * @returns {Promise<{updated: number, failed: number}>}
 */
export async function applyPermissionChanges(supabase, items) {
  let updated = 0;
  let failed = 0;
  for (const item of items || []) {
    const garminUserId = item?.userId ? String(item.userId) : null;
    if (!garminUserId || !Array.isArray(item.permissions)) continue;

    const { data: integration, error: readError } = await supabase
      .from('bike_computer_integrations')
      .select('id, provider_user_data')
      .eq('provider', 'garmin')
      .eq('provider_user_id', garminUserId)
      .maybeSingle();

    if (readError) {
      console.error('Garmin permission change: lookup failed for', garminUserId, readError.message);
      failed++;
      continue;
    }
    if (!integration) continue;

    // Notifications can arrive out of order; never let an older change
    // overwrite a newer one.
    const previous = integration.provider_user_data || {};
    const changeTime = Number(item.changeTimeInSeconds) || null;
    if (changeTime && previous.permissions_change_time && previous.permissions_change_time > changeTime) {
      continue;
    }

    const { error: updateError } = await supabase
      .from('bike_computer_integrations')
      .update({
        provider_user_data: {
          ...previous,
          permissions: item.permissions,
          permissions_change_time: changeTime,
          permissions_updated_at: new Date().toISOString(),
        },
        sync_enabled: item.permissions.includes('ACTIVITY_EXPORT'),
        updated_at: new Date().toISOString(),
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('Garmin permission change: update failed for', garminUserId, updateError.message);
      failed++;
    } else {
      updated++;
      console.log(`🔐 Garmin permissions for ${garminUserId}: ${item.permissions.join(', ') || '(none)'}`);
    }
  }
  return { updated, failed };
}
