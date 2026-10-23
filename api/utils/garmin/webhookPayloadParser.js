/**
 * Garmin webhook payload parsing
 * Pure functions - no external dependencies
 *
 * Handles the various payload structures Garmin sends:
 * - CONNECT_ACTIVITY: activities[] array (PUSH - data in payload)
 * - ACTIVITY_DETAIL: activityDetails[] array (PUSH - data in payload)
 * - ACTIVITY_FILE_DATA: activityFiles[] array (PING - needs callback URL)
 * - Health: dailies[], sleeps[], bodyComps[], stressDetails[], hrv[], etc.
 * - DEREGISTRATION: deregistrations[] (user disconnected; OAuth2 PKCE spec §7)
 * - USER_PERMISSIONS: userPermissionsChange[] (sharing changed; spec §9)
 */

const HEALTH_DATA_TYPES = ['dailies', 'epochs', 'sleeps', 'bodyComps', 'stressDetails', 'userMetrics', 'hrv',
  'respirations', 'pulseOx', 'allDayRespiration', 'bloodPressures'];

/**
 * Parse a Garmin webhook payload and return structured result.
 * Returns ALL items in the batch (not just [0]).
 *
 * @param {object} webhookData - Raw webhook payload from Garmin
 * @returns {{ type: string, items: object[], isPush?: boolean, healthType?: string }}
 */
export function parseWebhookPayload(webhookData) {
  if (!webhookData || typeof webhookData !== 'object') {
    return { type: 'UNKNOWN', items: [] };
  }

  // Registration notifications (applied inline by the receivers, never queued)
  if (webhookData.deregistrations?.length > 0) {
    return { type: 'DEREGISTRATION', items: webhookData.deregistrations };
  }
  if (webhookData.userPermissionsChange?.length > 0) {
    return { type: 'USER_PERMISSIONS', items: webhookData.userPermissionsChange };
  }

  // Check for health data types first
  for (const healthType of HEALTH_DATA_TYPES) {
    if (webhookData[healthType]?.length > 0) {
      return { type: 'HEALTH', healthType, items: webhookData[healthType] };
    }
  }

  // Activity data types
  if (webhookData.activities?.length > 0) {
    return { type: 'CONNECT_ACTIVITY', items: webhookData.activities, isPush: true };
  }
  if (webhookData.activityDetails?.length > 0) {
    return { type: 'ACTIVITY_DETAIL', items: webhookData.activityDetails, isPush: true };
  }
  if (webhookData.activityFiles?.length > 0) {
    return { type: 'ACTIVITY_FILE_DATA', items: webhookData.activityFiles, isPush: false };
  }

  return { type: 'UNKNOWN', items: [] };
}

/**
 * Extract userId, activityId, and fileUrl from a single activity item.
 *
 * @param {object} item - Single activity item from webhook payload
 * @param {object} webhookData - Full webhook payload (for top-level fallbacks)
 * @returns {{ userId: string|null, activityId: string|null, fileUrl: string|null }}
 */
export function extractActivityFields(item, webhookData = {}) {
  const userId = item.userId || webhookData.userId || null;
  const activityId = (item.activityId?.toString() || item.summaryId?.toString() || webhookData.activityId?.toString()) || null;

  let fileUrl = webhookData.fileUrl || webhookData.activityFileUrl || null;
  if (!fileUrl) {
    fileUrl = item.callbackURL || item.fileUrl || null;
  }

  return { userId, activityId, fileUrl };
}
