/**
 * Timezone Utilities
 * Handles user timezone preferences and date conversions
 */

// Common timezones organized by region
export const TIMEZONE_OPTIONS = [
  // US Timezones
  { value: 'America/New_York', label: 'Eastern Time (ET)', group: 'United States' },
  { value: 'America/Chicago', label: 'Central Time (CT)', group: 'United States' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', group: 'United States' },
  { value: 'America/Phoenix', label: 'Arizona (MST)', group: 'United States' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', group: 'United States' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)', group: 'United States' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)', group: 'United States' },

  // Canada
  { value: 'America/Toronto', label: 'Toronto (ET)', group: 'Canada' },
  { value: 'America/Vancouver', label: 'Vancouver (PT)', group: 'Canada' },
  { value: 'America/Edmonton', label: 'Edmonton (MT)', group: 'Canada' },

  // Europe
  { value: 'Europe/London', label: 'London (GMT/BST)', group: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris (CET)', group: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)', group: 'Europe' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)', group: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)', group: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome (CET)', group: 'Europe' },
  { value: 'Europe/Zurich', label: 'Zurich (CET)', group: 'Europe' },
  { value: 'Europe/Brussels', label: 'Brussels (CET)', group: 'Europe' },
  { value: 'Europe/Vienna', label: 'Vienna (CET)', group: 'Europe' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET)', group: 'Europe' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen (CET)', group: 'Europe' },
  { value: 'Europe/Oslo', label: 'Oslo (CET)', group: 'Europe' },
  { value: 'Europe/Helsinki', label: 'Helsinki (EET)', group: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens (EET)', group: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)', group: 'Europe' },

  // Asia Pacific
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', group: 'Asia Pacific' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', group: 'Asia Pacific' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)', group: 'Asia Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', group: 'Asia Pacific' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', group: 'Asia Pacific' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', group: 'Asia Pacific' },
  { value: 'Asia/Kolkata', label: 'Mumbai (IST)', group: 'Asia Pacific' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)', group: 'Asia Pacific' },

  // Australia & New Zealand
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', group: 'Australia' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)', group: 'Australia' },
  { value: 'Australia/Brisbane', label: 'Brisbane (AEST)', group: 'Australia' },
  { value: 'Australia/Perth', label: 'Perth (AWST)', group: 'Australia' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST)', group: 'Australia' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)', group: 'Australia' },

  // South America
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (BRT)', group: 'South America' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART)', group: 'South America' },
  { value: 'America/Santiago', label: 'Santiago (CLT)', group: 'South America' },
  { value: 'America/Lima', label: 'Lima (PET)', group: 'South America' },
  { value: 'America/Bogota', label: 'Bogota (COT)', group: 'South America' },

  // Africa & Middle East
  { value: 'Africa/Johannesburg', label: 'Johannesburg (SAST)', group: 'Africa' },
  { value: 'Africa/Cairo', label: 'Cairo (EET)', group: 'Africa' },
  { value: 'Africa/Nairobi', label: 'Nairobi (EAT)', group: 'Africa' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem (IST)', group: 'Middle East' },
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
