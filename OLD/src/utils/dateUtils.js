import dayjs from 'dayjs';

/**
 * Extract the actual ride date from various sources
 * Priority: recorded_at -> date from route name -> created_at
 */
export function getRouteDate(route) {
  // First try recorded_at (preferred)
  if (route.recorded_at) {
    const date = dayjs(route.recorded_at);
    if (date.isValid()) return date;
  }
  
  // Then try to parse date from route name (common patterns)
  if (route.name) {
    const datePatterns = [
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // MM/DD/YYYY like "02/17/2013"
      /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
      /(\d{1,2})-(\d{1,2})-(\d{4})/, // MM-DD-YYYY
      /(\d{4})\/(\d{1,2})\/(\d{1,2})/, // YYYY/MM/DD
    ];
    
    for (let i = 0; i < datePatterns.length; i++) {
      const pattern = datePatterns[i];
      const match = route.name.match(pattern);
      if (match) {
        let dateStr;
        if (i === 0) { // MM/DD/YYYY
          dateStr = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
        } else if (i === 1) { // YYYY-MM-DD
          dateStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else if (i === 2) { // MM-DD-YYYY
          dateStr = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
        } else if (i === 3) { // YYYY/MM/DD
          dateStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        }
        
        const parsedDate = dayjs(dateStr);
        if (parsedDate.isValid()) {
          return parsedDate;
        }
      }
    }
  }
  
  // Fallback to created_at
  return dayjs(route.created_at);
}

/**
 * Format route date consistently
 */
export function formatRouteDate(route, format = 'MMM D, YYYY') {
  return getRouteDate(route).format(format);
}