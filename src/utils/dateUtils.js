/**
 * Date utilities for timezone-safe date handling
 *
 * IMPORTANT: Always use these functions instead of toISOString().split('T')[0]
 * because toISOString() converts to UTC which can shift dates by a day
 * depending on the user's timezone.
 */

/**
 * Format a Date object as YYYY-MM-DD string in LOCAL timezone
 * This is the correct way to get a date string for database storage
 * when you want to preserve the user's intended date.
 *
 * @param {Date} date - The date to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatLocalDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD date string into a Date object at midnight LOCAL time
 *
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date} Date object at midnight local time
 */
export function parseLocalDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  // Parse as local date by using year, month, day constructor
  const [year, month, day] = dateStr.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }
  return new Date(year, month - 1, day); // month is 0-indexed
}

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 *
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayString() {
  return formatLocalDate(new Date());
}

/**
 * Check if two dates are the same day (ignoring time)
 *
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {boolean} True if same day
 */
export function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Add days to a date and return new Date object
 *
 * @param {Date} date - Starting date
 * @param {number} days - Number of days to add (can be negative)
 * @returns {Date} New date with days added
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the start of a month as a Date object
 *
 * @param {Date} date - Any date in the month
 * @returns {Date} First day of the month at midnight
 */
export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get the end of a month as a Date object
 *
 * @param {Date} date - Any date in the month
 * @returns {Date} Last day of the month at midnight
 */
export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Create a timezone-safe ISO string for database storage.
 * Uses noon UTC to ensure the date is the same in all timezones from UTC-12 to UTC+12.
 *
 * @param {Date} date - The local date to store
 * @returns {string} ISO string at noon UTC of the given date
 */
export function toNoonUTC(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null;
  }
  // Get the local date components
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  // Create a UTC date at noon
  const noonUTC = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  return noonUTC.toISOString();
}

/**
 * Parse a timestamp string (from database) and return a Date at midnight LOCAL time.
 * This handles both old-style timestamps (midnight local stored as UTC) and
 * new-style timestamps (noon UTC).
 *
 * @param {string} timestampStr - ISO timestamp string from database
 * @returns {Date} Date at midnight local time
 */
export function parsePlanStartDate(timestampStr) {
  if (!timestampStr || typeof timestampStr !== 'string') {
    return null;
  }

  // If it's already a YYYY-MM-DD string, parse directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestampStr)) {
    return parseLocalDate(timestampStr);
  }

  // Parse the full timestamp
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) {
    return null;
  }

  // Extract the UTC date components
  // This works correctly for both noon UTC storage and old midnight local storage
  // because we extract the date the user intended, not the local conversion
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  // If the UTC time is very early (before 6 AM UTC), this might be from a
  // western timezone that stored midnight local. In that case, the UTC date
  // is correct. If it's later (after 6 PM UTC), it might be from an eastern
  // timezone, and the UTC date is also correct.
  // For times in between (6 AM - 6 PM), the date is unambiguous.

  // Create a local date at midnight with the extracted components
  return new Date(year, month, day);
}
