/**
 * Timezone Utilities
 * Handles user timezone preferences and date conversions
 */

// Common timezones organized by region (flat array for Mantine Select)
export const TIMEZONE_OPTIONS = [
  // US Timezones
  { value: 'America/New_York', label: 'US - Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'US - Central Time (CT)' },
  { value: 'America/Denver', label: 'US - Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'US - Arizona (MST)' },
  { value: 'America/Los_Angeles', label: 'US - Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'US - Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'US - Hawaii Time (HST)' },

  // Canada
  { value: 'America/Toronto', label: 'Canada - Toronto (ET)' },
  { value: 'America/Vancouver', label: 'Canada - Vancouver (PT)' },
  { value: 'America/Edmonton', label: 'Canada - Edmonton (MT)' },

  // Europe
  { value: 'Europe/London', label: 'UK - London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe - Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Europe - Berlin (CET)' },
  { value: 'Europe/Amsterdam', label: 'Europe - Amsterdam (CET)' },
  { value: 'Europe/Madrid', label: 'Europe - Madrid (CET)' },
  { value: 'Europe/Rome', label: 'Europe - Rome (CET)' },
  { value: 'Europe/Zurich', label: 'Europe - Zurich (CET)' },
  { value: 'Europe/Brussels', label: 'Europe - Brussels (CET)' },
  { value: 'Europe/Vienna', label: 'Europe - Vienna (CET)' },
  { value: 'Europe/Stockholm', label: 'Europe - Stockholm (CET)' },
  { value: 'Europe/Copenhagen', label: 'Europe - Copenhagen (CET)' },
  { value: 'Europe/Oslo', label: 'Europe - Oslo (CET)' },
  { value: 'Europe/Helsinki', label: 'Europe - Helsinki (EET)' },
  { value: 'Europe/Athens', label: 'Europe - Athens (EET)' },
  { value: 'Europe/Moscow', label: 'Europe - Moscow (MSK)' },

  // Asia Pacific
  { value: 'Asia/Tokyo', label: 'Asia - Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Asia - Seoul (KST)' },
  { value: 'Asia/Shanghai', label: 'Asia - Shanghai (CST)' },
  { value: 'Asia/Hong_Kong', label: 'Asia - Hong Kong (HKT)' },
  { value: 'Asia/Singapore', label: 'Asia - Singapore (SGT)' },
  { value: 'Asia/Dubai', label: 'Asia - Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'Asia - Mumbai (IST)' },
  { value: 'Asia/Bangkok', label: 'Asia - Bangkok (ICT)' },

  // Australia & New Zealand
  { value: 'Australia/Sydney', label: 'Australia - Sydney (AEST)' },
  { value: 'Australia/Melbourne', label: 'Australia - Melbourne (AEST)' },
  { value: 'Australia/Brisbane', label: 'Australia - Brisbane (AEST)' },
  { value: 'Australia/Perth', label: 'Australia - Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Australia - Adelaide (ACST)' },
  { value: 'Pacific/Auckland', label: 'New Zealand - Auckland (NZST)' },

  // South America
  { value: 'America/Sao_Paulo', label: 'Brazil - Sao Paulo (BRT)' },
  { value: 'America/Buenos_Aires', label: 'Argentina - Buenos Aires (ART)' },
  { value: 'America/Santiago', label: 'Chile - Santiago (CLT)' },
  { value: 'America/Lima', label: 'Peru - Lima (PET)' },
  { value: 'America/Bogota', label: 'Colombia - Bogota (COT)' },

  // Africa & Middle East
  { value: 'Africa/Johannesburg', label: 'South Africa - Johannesburg (SAST)' },
  { value: 'Africa/Cairo', label: 'Egypt - Cairo (EET)' },
  { value: 'Africa/Nairobi', label: 'Kenya - Nairobi (EAT)' },
  { value: 'Asia/Jerusalem', label: 'Israel - Jerusalem (IST)' },
];

/**
 * Get the browser's detected timezone
 */
export function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (e) {
    return 'America/New_York'; // Fallback
  }
}

/**
 * Get a friendly display name for a timezone
 */
export function getTimezoneDisplayName(timezone) {
  const option = TIMEZONE_OPTIONS.find(tz => tz.value === timezone);
  if (option) {
    return option.label;
  }
  // Try to generate a readable name from the timezone string
  return timezone.replace(/_/g, ' ').replace(/\//g, ' - ');
}

/**
 * Get the current UTC offset for a timezone (e.g., "-05:00")
 */
export function getTimezoneOffset(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    return offsetPart?.value || '';
  } catch (e) {
    return '';
  }
}

/**
 * Format a date in a specific timezone
 * @param {Date|string} date - The date to format
 * @param {string} timezone - The IANA timezone (e.g., 'America/New_York')
 * @param {object} options - Intl.DateTimeFormat options
 */
export function formatDateInTimezone(date, timezone, options = {}) {
  const dateObj = date instanceof Date ? date : new Date(date);

  const defaultOptions = {
    timeZone: timezone,
    ...options,
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
}

/**
 * Format a date as YYYY-MM-DD in a specific timezone
 * This is the key function for storing dates correctly
 */
export function formatLocalDateInTimezone(date, timezone) {
  const dateObj = date instanceof Date ? date : new Date(date);

  // Get the date parts in the user's timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(dateObj);
}

/**
 * Create a Date object representing midnight in a specific timezone
 * @param {number} year
 * @param {number} month - 0-indexed (0 = January)
 * @param {number} day
 * @param {string} timezone
 */
export function createDateInTimezone(year, month, day, timezone) {
  // Create a date string and parse it in the target timezone
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;

  // Get the offset for this timezone at this date
  const tempDate = new Date(dateStr + 'Z');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse to get local time components
  const parts = formatter.formatToParts(tempDate);
  const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

  return new Date(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    0, 0, 0, 0
  );
}

/**
 * Get today's date in a specific timezone
 */
export function getTodayInTimezone(timezone) {
  const now = new Date();
  const dateStr = formatLocalDateInTimezone(now, timezone);
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Check if a date is today in a specific timezone
 */
export function isDateTodayInTimezone(date, timezone) {
  const dateStr = formatLocalDateInTimezone(date, timezone);
  const todayStr = formatLocalDateInTimezone(new Date(), timezone);
  return dateStr === todayStr;
}

/**
 * Store a date at noon UTC for timezone-safe database storage
 * This ensures the date doesn't shift when interpreted in different timezones
 */
export function toNoonUTCFromTimezone(date, timezone) {
  // Get the date components in the user's timezone
  const dateStr = formatLocalDateInTimezone(date, timezone);
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create a UTC date at noon on that calendar day
  const noonUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return noonUTC.toISOString();
}

/**
 * Parse a stored date (at noon UTC) back to a local Date in the user's timezone
 */
export function parseStoredDateInTimezone(timestampStr, timezone) {
  if (!timestampStr) return null;

  const date = new Date(timestampStr);

  // Get the date parts in UTC (since we stored at noon UTC)
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  // Return a local date representing that calendar day
  return new Date(year, month, day, 0, 0, 0, 0);
}

export default {
  TIMEZONE_OPTIONS,
  getBrowserTimezone,
  getTimezoneDisplayName,
  getTimezoneOffset,
  formatDateInTimezone,
  formatLocalDateInTimezone,
  createDateInTimezone,
  getTodayInTimezone,
  isDateTodayInTimezone,
  toNoonUTCFromTimezone,
  parseStoredDateInTimezone,
};
