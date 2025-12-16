// Vercel API Route: Secure Google Calendar Authentication
// Handles OAuth token exchange, refresh, and calendar operations

import { createClient } from '@supabase/supabase-js';
import { rateLimitMiddleware, RATE_LIMITS } from './utils/rateLimit.js';

// Initialize Supabase (server-side)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GOOGLE_OAUTH_BASE = 'https://oauth2.googleapis.com';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    return ['https://www.tribos.studio', 'https://tribos-studio.vercel.app'];
  }
  return ['http://localhost:3000', 'http://localhost:5173'];
};

const corsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
  res.setHeader('Access-Control-Allow-Credentials', corsHeaders['Access-Control-Allow-Credentials']);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const rateLimitResult = await rateLimitMiddleware(
    req,
    res,
    'google_calendar_auth',
    20, // 20 requests
    5   // per 5 minutes
  );

  if (rateLimitResult !== null) {
    return;
  }

  try {
    const { action, ...params } = req.body;

    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth credentials not configured' });
    }

    switch (action) {
      case 'exchange_code':
        return await exchangeCodeForToken(req, res, params);

      case 'get_connection_status':
        return await getConnectionStatus(req, res, params.userId);

      case 'disconnect':
        return await disconnect(req, res, params.userId);

      case 'get_events':
        return await getCalendarEvents(req, res, params);

      case 'get_busy_times':
        return await getBusyTimes(req, res, params);

      case 'get_available_windows':
        return await getAvailableWindows(req, res, params);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

  } catch (error) {
    console.error('Google Calendar auth error:', error);

    return res.status(500).json({
      error: 'Operation failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForToken(req, res, { code, userId, redirectUri }) {
  if (!code || !userId) {
    return res.status(400).json({ error: 'Code and userId required' });
  }

  try {
    console.log('Exchanging Google Calendar code for tokens...');

    // Exchange code with Google
    const response = await fetch(`${GOOGLE_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri || `${process.env.VITE_APP_URL || 'https://www.tribos.studio'}/oauth/google/callback`
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Google token exchange failed:', error);
      throw new Error(`Google token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    console.log('Google Calendar tokens received');

    // Calculate expiration
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Get user info to confirm which calendar account
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    let userEmail = null;
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      userEmail = userInfo.email;
    }

    // Store tokens in user_coach_settings
    const { error: dbError } = await supabase
      .from('user_coach_settings')
      .upsert({
        user_id: userId,
        google_calendar_connected: true,
        google_refresh_token: tokenData.refresh_token,
        google_calendar_id: userEmail || 'primary',
        calendar_sync_enabled: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (dbError) {
      console.error('Database error storing tokens:', JSON.stringify(dbError, null, 2));
      throw new Error(`Failed to store authentication data: ${dbError.message || dbError.code}`);
    }

    // Also store the access token temporarily for immediate use
    // (In production, you might want to store this differently)
    await supabase
      .from('user_coach_settings')
      .update({
        // Store access token hash or encrypted version for immediate use
        // For now, we rely on refresh token for subsequent calls
      })
      .eq('user_id', userId);

    console.log('Google Calendar integration stored successfully');

    return res.status(200).json({
      success: true,
      email: userEmail,
      calendarId: userEmail || 'primary'
    });

  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

/**
 * Check connection status
 */
async function getConnectionStatus(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    const { data: settings, error } = await supabase
      .from('user_coach_settings')
      .select('google_calendar_connected, google_calendar_id, calendar_sync_enabled, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching settings:', error);
      return res.status(500).json({ error: 'Failed to check connection status' });
    }

    if (!settings || !settings.google_calendar_connected) {
      return res.status(200).json({ connected: false });
    }

    return res.status(200).json({
      connected: true,
      calendarId: settings.google_calendar_id,
      syncEnabled: settings.calendar_sync_enabled,
      lastUpdated: settings.updated_at
    });

  } catch (error) {
    console.error('Get connection status error:', error);
    throw error;
  }
}

/**
 * Disconnect Google Calendar
 */
async function disconnect(req, res, userId) {
  if (!userId) {
    return res.status(400).json({ error: 'UserId required' });
  }

  try {
    // Clear Google Calendar settings
    const { error } = await supabase
      .from('user_coach_settings')
      .update({
        google_calendar_connected: false,
        google_refresh_token: null,
        google_calendar_id: null,
        calendar_sync_enabled: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) {
      throw new Error('Failed to disconnect Google Calendar');
    }

    console.log('Google Calendar integration disconnected');

    return res.status(200).json({
      success: true,
      message: 'Google Calendar disconnected'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
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
 * Get access token for a user (refreshes if needed)
 */
async function getAccessTokenForUser(userId) {
  const { data: settings, error } = await supabase
    .from('user_coach_settings')
    .select('google_refresh_token, google_calendar_connected')
    .eq('user_id', userId)
    .single();

  if (error || !settings?.google_calendar_connected || !settings?.google_refresh_token) {
    throw new Error('Google Calendar not connected');
  }

  // Refresh the access token
  return await refreshAccessToken(settings.google_refresh_token);
}

/**
 * Get calendar events for a date range
 */
async function getCalendarEvents(req, res, { userId, startDate, endDate, calendarId }) {
  if (!userId || !startDate || !endDate) {
    return res.status(400).json({ error: 'userId, startDate, and endDate required' });
  }

  try {
    const accessToken = await getAccessTokenForUser(userId);

    // Get calendar ID from settings if not provided
    if (!calendarId) {
      const { data: settings } = await supabase
        .from('user_coach_settings')
        .select('google_calendar_id')
        .eq('user_id', userId)
        .single();
      calendarId = settings?.google_calendar_id || 'primary';
    }

    const params = new URLSearchParams({
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '100'
    });

    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch events: ${error}`);
    }

    const data = await response.json();

    // Filter and format events
    const events = (data.items || []).map(event => ({
      id: event.id,
      title: event.summary || 'Busy',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      isAllDay: !event.start?.dateTime,
      status: event.status
    })).filter(event => event.status !== 'cancelled');

    return res.status(200).json({
      success: true,
      events
    });

  } catch (error) {
    console.error('Get calendar events error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Get busy time blocks using FreeBusy API
 */
async function getBusyTimes(req, res, { userId, startDate, endDate }) {
  if (!userId || !startDate || !endDate) {
    return res.status(400).json({ error: 'userId, startDate, and endDate required' });
  }

  try {
    const accessToken = await getAccessTokenForUser(userId);

    // Get calendar ID
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('google_calendar_id')
      .eq('user_id', userId)
      .single();
    const calendarId = settings?.google_calendar_id || 'primary';

    const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        items: [{ id: calendarId }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch busy times: ${error}`);
    }

    const data = await response.json();
    const busyTimes = data.calendars?.[calendarId]?.busy || [];

    return res.status(200).json({
      success: true,
      busyTimes: busyTimes.map(slot => ({
        start: slot.start,
        end: slot.end
      }))
    });

  } catch (error) {
    console.error('Get busy times error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Calculate available time windows for riding
 */
async function getAvailableWindows(req, res, { userId, date }) {
  if (!userId || !date) {
    return res.status(400).json({ error: 'userId and date required' });
  }

  try {
    const accessToken = await getAccessTokenForUser(userId);

    // Get user's coach settings for work hours
    const { data: settings } = await supabase
      .from('user_coach_settings')
      .select('work_hours_start, work_hours_end, work_days, evening_cutoff_time, google_calendar_id')
      .eq('user_id', userId)
      .single();

    const workStart = settings?.work_hours_start || '09:00';
    const workEnd = settings?.work_hours_end || '17:00';
    const workDays = settings?.work_days || [1, 2, 3, 4, 5]; // Mon-Fri
    const eveningCutoff = settings?.evening_cutoff_time || '20:00';
    const calendarId = settings?.google_calendar_id || 'primary';

    // Parse the date
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay(); // 0=Sunday, 1=Monday, etc.

    // Set up the day boundaries (6am to evening cutoff)
    const dayStart = new Date(targetDate);
    dayStart.setHours(6, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    const [cutoffHour, cutoffMin] = eveningCutoff.split(':').map(Number);
    dayEnd.setHours(cutoffHour, cutoffMin, 0, 0);

    // Get busy times for the day
    const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: calendarId }]
      })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch calendar');
    }

    const data = await response.json();
    const busySlots = data.calendars?.[calendarId]?.busy || [];

    // Add work hours as busy if it's a work day
    const allBusySlots = [...busySlots];
    if (workDays.includes(dayOfWeek)) {
      const workStartDate = new Date(targetDate);
      const [wsHour, wsMin] = workStart.split(':').map(Number);
      workStartDate.setHours(wsHour, wsMin, 0, 0);

      const workEndDate = new Date(targetDate);
      const [weHour, weMin] = workEnd.split(':').map(Number);
      workEndDate.setHours(weHour, weMin, 0, 0);

      allBusySlots.push({
        start: workStartDate.toISOString(),
        end: workEndDate.toISOString()
      });
    }

    // Sort busy slots by start time
    allBusySlots.sort((a, b) => new Date(a.start) - new Date(b.start));

    // Merge overlapping slots
    const mergedSlots = [];
    for (const slot of allBusySlots) {
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);

      if (mergedSlots.length === 0) {
        mergedSlots.push({ start: slotStart, end: slotEnd });
      } else {
        const last = mergedSlots[mergedSlots.length - 1];
        if (slotStart <= last.end) {
          // Overlapping - extend the end
          last.end = new Date(Math.max(last.end.getTime(), slotEnd.getTime()));
        } else {
          mergedSlots.push({ start: slotStart, end: slotEnd });
        }
      }
    }

    // Find available windows between busy slots
    const availableWindows = [];
    let currentTime = dayStart;

    for (const slot of mergedSlots) {
      if (slot.start > currentTime) {
        const durationMins = Math.round((slot.start - currentTime) / 60000);
        if (durationMins >= 30) { // Minimum 30 minutes for a ride
          availableWindows.push({
            start: currentTime.toISOString(),
            end: slot.start.toISOString(),
            durationMins
          });
        }
      }
      currentTime = slot.end > currentTime ? slot.end : currentTime;
    }

    // Check for time after last busy slot
    if (currentTime < dayEnd) {
      const durationMins = Math.round((dayEnd - currentTime) / 60000);
      if (durationMins >= 30) {
        availableWindows.push({
          start: currentTime.toISOString(),
          end: dayEnd.toISOString(),
          durationMins
        });
      }
    }

    return res.status(200).json({
      success: true,
      date: date,
      windows: availableWindows
    });

  } catch (error) {
    console.error('Get available windows error:', error);
    return res.status(500).json({ error: error.message });
  }
}
