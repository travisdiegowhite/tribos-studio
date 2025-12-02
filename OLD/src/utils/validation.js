// Input Validation and Sanitization Utilities
// Provides secure input handling across the application

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>'"&]/g, (match) => {
      const entities = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return entities[match];
    });
}

/**
 * Validate and sanitize email input
 */
export function validateEmail(email) {
  const sanitized = sanitizeString(email, 254);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return {
    isValid: emailRegex.test(sanitized),
    sanitized: sanitized.toLowerCase()
  };
}

/**
 * Validate coordinates
 */
export function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return { isValid: false, sanitized: null };
  }

  const [lng, lat] = coords;

  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return { isValid: false, sanitized: null };
  }

  const isValidLng = lng >= -180 && lng <= 180;
  const isValidLat = lat >= -90 && lat <= 90;

  return {
    isValid: isValidLng && isValidLat,
    sanitized: [parseFloat(lng.toFixed(6)), parseFloat(lat.toFixed(6))]
  };
}

/**
 * Validate distance values
 */
export function validateDistance(distance, min = 0.1, max = 500) {
  const num = parseFloat(distance);

  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, sanitized: 0 };
  }

  const clamped = Math.max(min, Math.min(max, num));

  return {
    isValid: num >= min && num <= max,
    sanitized: parseFloat(clamped.toFixed(2))
  };
}

/**
 * Validate time values (in minutes)
 */
export function validateTime(time, min = 15, max = 600) {
  const num = parseInt(time, 10);

  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, sanitized: min };
  }

  const clamped = Math.max(min, Math.min(max, num));

  return {
    isValid: num >= min && num <= max,
    sanitized: clamped
  };
}

/**
 * Validate training goals
 */
export function validateTrainingGoal(goal) {
  const validGoals = ['recovery', 'endurance', 'intervals', 'hills'];
  const sanitized = sanitizeString(goal, 20).toLowerCase();

  return {
    isValid: validGoals.includes(sanitized),
    sanitized: validGoals.includes(sanitized) ? sanitized : 'endurance'
  };
}

/**
 * Validate route type
 */
export function validateRouteType(type) {
  const validTypes = ['loop', 'out-back', 'point-to-point'];
  const sanitized = sanitizeString(type, 20).toLowerCase();

  return {
    isValid: validTypes.includes(sanitized),
    sanitized: validTypes.includes(sanitized) ? sanitized : 'loop'
  };
}

/**
 * Validate route name
 */
export function validateRouteName(name) {
  if (!name || typeof name !== 'string') {
    return { isValid: false, sanitized: '' };
  }

  const sanitized = sanitizeString(name, 100);
  const isValid = sanitized.length >= 1 && sanitized.length <= 100;

  return {
    isValid,
    sanitized: isValid ? sanitized : ''
  };
}

/**
 * Validate API request rate limiting
 */
export function validateRequestRate(lastRequest, minInterval = 1000) {
  const now = Date.now();
  const timeSinceLastRequest = now - (lastRequest || 0);

  return {
    allowed: timeSinceLastRequest >= minInterval,
    waitTime: Math.max(0, minInterval - timeSinceLastRequest)
  };
}

/**
 * Validate file upload
 */
export function validateFileUpload(file) {
  const errors = [];

  if (!file) {
    errors.push('No file provided');
    return { isValid: false, errors };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push('File size exceeds 10MB limit');
  }

  // Check file type
  const allowedTypes = [
    'application/octet-stream', // .fit files
    'application/gpx+xml',      // .gpx files
    'text/xml',                 // .gpx files
    'application/xml'           // .gpx files
  ];

  const allowedExtensions = ['.fit', '.gpx'];
  const hasValidExtension = allowedExtensions.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  );

  if (!allowedTypes.includes(file.type) && !hasValidExtension) {
    errors.push('Invalid file type. Only .fit and .gpx files are allowed');
  }

  // Check filename
  const sanitizedName = sanitizeString(file.name, 255);
  if (sanitizedName.length === 0) {
    errors.push('Invalid filename');
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedName
  };
}

/**
 * Validate JSON data structure
 */
export function validateRouteData(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid route data structure');
    return { isValid: false, errors };
  }

  // Validate required fields
  const requiredFields = ['name', 'distance', 'coordinates'];
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate coordinates array
  if (data.coordinates && Array.isArray(data.coordinates)) {
    if (data.coordinates.length > 10000) {
      errors.push('Route has too many coordinate points (max 10,000)');
    }

    // Validate first few coordinates
    for (let i = 0; i < Math.min(5, data.coordinates.length); i++) {
      const coordValidation = validateCoordinates(data.coordinates[i]);
      if (!coordValidation.isValid) {
        errors.push(`Invalid coordinate at index ${i}`);
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  isAllowed(key, limit = 60, windowMs = 60000) {
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const requests = this.requests.get(key);

    // Remove old requests outside the window
    const recentRequests = requests.filter(time => time > windowStart);
    this.requests.set(key, recentRequests);

    if (recentRequests.length >= limit) {
      return {
        allowed: false,
        resetTime: recentRequests[0] + windowMs
      };
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return {
      allowed: true,
      remaining: limit - recentRequests.length
    };
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Comprehensive validation for route generation parameters
 */
export function validateRouteParams(params) {
  const errors = [];
  const sanitized = {};

  // Validate start location
  if (params.startLocation) {
    const coordValidation = validateCoordinates(params.startLocation);
    if (!coordValidation.isValid) {
      errors.push('Invalid start location coordinates');
    } else {
      sanitized.startLocation = coordValidation.sanitized;
    }
  } else {
    errors.push('Start location is required');
  }

  // Validate time available
  const timeValidation = validateTime(params.timeAvailable);
  if (!timeValidation.isValid) {
    errors.push('Time available must be between 15 and 600 minutes');
  }
  sanitized.timeAvailable = timeValidation.sanitized;

  // Validate target distance
  const distanceValidation = validateDistance(params.targetDistance);
  if (!distanceValidation.isValid) {
    errors.push('Target distance must be between 0.1 and 500 km');
  }
  sanitized.targetDistance = distanceValidation.sanitized;

  // Validate training goal
  const goalValidation = validateTrainingGoal(params.trainingGoal);
  sanitized.trainingGoal = goalValidation.sanitized;

  // Validate route type
  const typeValidation = validateRouteType(params.routeType);
  sanitized.routeType = typeValidation.sanitized;

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}

export default {
  sanitizeString,
  validateEmail,
  validateCoordinates,
  validateDistance,
  validateTime,
  validateTrainingGoal,
  validateRouteType,
  validateRouteName,
  validateRequestRate,
  validateFileUpload,
  validateRouteData,
  validateRouteParams,
  rateLimiter
};