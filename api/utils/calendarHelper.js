// Shared Google Calendar utilities for coach and calendar API endpoints
// Extracts token management and busy-time fetching so the coach can use them directly

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GOOGLE_OAUTH_BASE = 'https://oauth2.googleapis.com';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const response = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

/**
 * Get access token for a user (refreshes automatically)
 */
export async function getAccessTokenForUser(userId) {
  const { data: settings, error } = await supabase
    .from('user_coach_settings')
    .select('google_refresh_token, google_calendar_connected')
    .eq('user_id', userId)
    .single();

  if (error || !settings?.google_calendar_connected || !settings?.google_refresh_token) {
    return null; // Not connected — not an error for the coach
  }

  return await refreshAccessToken(settings.google_refresh_token);
}

/**
 * Fetch calendar context for the AI coach.
 * Returns a formatted string with busy times and available windows for today + tomorrow,
 * or null if Google Calendar is not connected.
 */
export async function fetchCalendarContext(userId) {
  if (!userId) return null;

  // Check if Google Calendar is connected and get settings
  const { data: settings, error } = await supabase
    .from('user_coach_settings')
    .select('google_refresh_token, google_calendar_connected, google_calendar_id, work_hours_start, work_hours_end, work_days, evening_cutoff_time')
    .eq('user_id', userId)
    .single();

  if (error || !settings?.google_calendar_connected || !settings?.google_refresh_token) {
    return null;
  }

  let accessToken;
  try {
    accessToken = await refreshAccessToken(settings.google_refresh_token);
  } catch (err) {
    console.error('Calendar context: failed to refresh token:', err.message);
    return null;
  }

  const calendarId = settings.google_calendar_id || 'primary';
  const workStart = settings.work_hours_start || '09:00';
  const workEnd = settings.work_hours_end || '17:00';
  const workDays = settings.work_days || [1, 2, 3, 4, 5];
  const eveningCutoff = settings.evening_cutoff_time || '20:00';

  // Fetch events for today and the next 2 days
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(todayStart);
  rangeEnd.setDate(rangeEnd.getDate() + 3); // today + 2 more days

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  try {
    // Fetch actual calendar events (with titles) for richer context
    const params = new URLSearchParams({
      timeMin: todayStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    });

    const eventsResponse = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!eventsResponse.ok) {
      console.error('Calendar context: failed to fetch events');
      return null;
    }

    const eventsData = await eventsResponse.json();
    const events = (eventsData.items || [])
      .filter(e => e.status !== 'cancelled')
      .map(e => ({
        title: e.summary || 'Busy',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        isAllDay: !e.start?.dateTime,
      }));

    // Group events by day and build context string
    const lines = [];

    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const day = new Date(todayStart);
      day.setDate(day.getDate() + dayOffset);
      const dayStr = day.toISOString().split('T')[0]; // YYYY-MM-DD
      const dayOfWeek = day.getDay();
      const label = dayOffset === 0 ? 'TODAY' : dayOffset === 1 ? 'TOMORROW' : dayNames[dayOfWeek];

      const dayEvents = events.filter(e => {
        const eventDate = e.start.substring(0, 10);
        return eventDate === dayStr;
      });

      const isWorkDay = workDays.includes(dayOfWeek);

      lines.push(`${label} (${dayNames[dayOfWeek]}, ${dayStr}):`);

      if (isWorkDay) {
        lines.push(`  Work hours: ${workStart} - ${workEnd}`);
      }

      if (dayEvents.length === 0) {
        lines.push(`  No calendar events${isWorkDay ? ' (outside work)' : ''}`);
      } else {
        for (const ev of dayEvents) {
          if (ev.isAllDay) {
            lines.push(`  All day: ${ev.title}`);
          } else {
            const startTime = new Date(ev.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const endTime = new Date(ev.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            lines.push(`  ${startTime} - ${endTime}: ${ev.title}`);
          }
        }
      }

      // Calculate available riding windows for this day
      const windows = calculateAvailableWindows(day, dayEvents, isWorkDay, workStart, workEnd, eveningCutoff);
      if (windows.length > 0) {
        const windowStrs = windows.map(w => {
          const s = new Date(w.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          const e = new Date(w.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          return `${s}-${e} (${w.durationMins} min)`;
        });
        lines.push(`  Available for riding: ${windowStrs.join(', ')}`);
      } else {
        lines.push(`  No available riding windows`);
      }

      lines.push('');
    }

    return lines.join('\n');
  } catch (err) {
    console.error('Calendar context: error building context:', err.message);
    return null;
  }
}

/**
 * Calculate available riding windows for a given day,
 * accounting for calendar events, work hours, and evening cutoff.
 */
function calculateAvailableWindows(day, events, isWorkDay, workStart, workEnd, eveningCutoff) {
  const dayStart = new Date(day);
  dayStart.setHours(6, 0, 0, 0);

  const dayEnd = new Date(day);
  const [cutoffHour, cutoffMin] = eveningCutoff.split(':').map(Number);
  dayEnd.setHours(cutoffHour, cutoffMin, 0, 0);

  // Build busy slots from events (skip all-day events for window calculation)
  const busySlots = events
    .filter(e => !e.isAllDay)
    .map(e => ({
      start: new Date(e.start),
      end: new Date(e.end),
    }));

  // Add work hours as busy if it's a work day
  if (isWorkDay) {
    const [wsHour, wsMin] = workStart.split(':').map(Number);
    const [weHour, weMin] = workEnd.split(':').map(Number);

    const workStartDate = new Date(day);
    workStartDate.setHours(wsHour, wsMin, 0, 0);
    const workEndDate = new Date(day);
    workEndDate.setHours(weHour, weMin, 0, 0);

    busySlots.push({ start: workStartDate, end: workEndDate });
  }

  // Sort and merge overlapping slots
  busySlots.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const slot of busySlots) {
    if (merged.length === 0) {
      merged.push({ start: new Date(slot.start), end: new Date(slot.end) });
    } else {
      const last = merged[merged.length - 1];
      if (slot.start <= last.end) {
        last.end = new Date(Math.max(last.end.getTime(), slot.end.getTime()));
      } else {
        merged.push({ start: new Date(slot.start), end: new Date(slot.end) });
      }
    }
  }

  // Find gaps >= 30 minutes
  const windows = [];
  let current = dayStart;

  for (const slot of merged) {
    if (slot.start > current) {
      const durationMins = Math.round((slot.start - current) / 60000);
      if (durationMins >= 30) {
        windows.push({ start: current.toISOString(), end: slot.start.toISOString(), durationMins });
      }
    }
    current = slot.end > current ? slot.end : current;
  }

  if (current < dayEnd) {
    const durationMins = Math.round((dayEnd - current) / 60000);
    if (durationMins >= 30) {
      windows.push({ start: current.toISOString(), end: dayEnd.toISOString(), durationMins });
    }
  }

  return windows;
}
