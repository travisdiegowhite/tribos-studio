/**
 * Garmin Health API client functions
 * All functions accept accessToken as a parameter (no module-level state)
 */

/**
 * Fetch activity details from Garmin Health API.
 * The webhook only contains minimal data - this fetches full details.
 *
 * @param {string} accessToken - Valid Garmin OAuth access token
 * @param {string} summaryId - Garmin activity summary ID
 * @returns {Promise<object|null>} Activity details or null on failure
 */
export async function fetchGarminActivityDetails(accessToken, summaryId) {
  try {
    console.log('🔍 Fetching activity details from Garmin API for summaryId:', summaryId);

    const apiUrl = `https://apis.garmin.com/wellness-api/rest/activities?summaryId=${summaryId}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Garmin API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Garmin API authentication failed: ${response.status}`);
      }

      console.warn('⚠️ Could not fetch activity details from Garmin API, will use webhook data');
      return null;
    }

    const activities = await response.json();

    if (Array.isArray(activities) && activities.length > 0) {
      const activity = activities[0];
      console.log('✅ Fetched activity details from Garmin API:', {
        activityName: activity.activityName,
        activityType: activity.activityType,
        distance: activity.distanceInMeters ? `${(activity.distanceInMeters / 1000).toFixed(2)} km` : 'N/A',
        duration: activity.durationInSeconds ? `${Math.round(activity.durationInSeconds / 60)} min` : 'N/A',
        avgHR: activity.averageHeartRateInBeatsPerMinute || 'N/A',
        avgPower: activity.averageBikingPowerInWatts || 'N/A',
        elevation: activity.elevationGainInMeters || 'N/A'
      });
      return activity;
    }

    console.warn('⚠️ Garmin API returned empty or unexpected response:', activities);
    return null;

  } catch (error) {
    console.error('❌ Error fetching activity from Garmin API:', error.message);
    return null;
  }
}

/**
 * Request activity backfill from Garmin for a specific time window.
 * Triggers Garmin to send PING notifications with FIT file callbackURLs.
 *
 * IMPORTANT from Garmin API docs (Section 8 - Summary Backfill):
 * - There is NO /backfill/activityFiles endpoint (returns 404)
 * - /backfill/activities handles BOTH activity summaries AND activity files
 * - The callbackURL is valid for 24 hours only
 * - Duplicate downloads are rejected with HTTP 410
 *
 * @param {string} accessToken - Valid Garmin access token
 * @param {number} startTimeInSeconds - Activity start time (epoch seconds)
 * @returns {Promise<boolean>} true if backfill was requested successfully
 */
export async function requestActivityDetailsBackfill(accessToken, startTimeInSeconds) {
  try {
    if (!startTimeInSeconds || !accessToken) {
      console.log('ℹ️ Cannot request backfill: missing startTime or accessToken');
      return false;
    }

    const startTimestamp = startTimeInSeconds - 3600; // 1 hour before
    const endTimestamp = startTimeInSeconds + 7200;   // 2 hours after

    const backfillUrl = `https://apis.garmin.com/wellness-api/rest/backfill/activities?summaryStartTimeInSeconds=${startTimestamp}&summaryEndTimeInSeconds=${endTimestamp}`;

    console.log('📤 Requesting activity backfill (includes FIT files via PING)...');
    console.log(`   Time range: ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`);

    const response = await fetch(backfillUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 202 || response.status === 409 || response.ok) {
      console.log('✅ Activity backfill requested - activityFiles PING will arrive with FIT callbackURL');
      return true;
    }

    const errorText = await response.text();
    console.warn('⚠️ Activity backfill request failed:', response.status, errorText.substring(0, 100));
    return false;

  } catch (error) {
    console.warn('⚠️ Could not request activity backfill:', error.message);
    return false;
  }
}
