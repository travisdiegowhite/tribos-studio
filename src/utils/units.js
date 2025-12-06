// Unit conversion utilities and preferences
import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';

// Unit conversion functions
export const convertDistance = {
  kmToMiles: (km) => km * 0.621371,
  milesToKm: (miles) => miles * 1.60934,
  mToFt: (meters) => meters * 3.28084,
  ftToM: (feet) => feet * 0.3048
};

export const convertSpeed = {
  kmhToMph: (kmh) => kmh * 0.621371,
  mphToKmh: (mph) => mph * 1.60934
};

// Format distance based on unit preference
export function formatDistance(kilometers, useImperial = true, precision = 1) {
  if (kilometers == null || isNaN(kilometers)) return useImperial ? '0 mi' : '0 km';
  if (useImperial) {
    const miles = convertDistance.kmToMiles(kilometers);
    return `${miles.toFixed(precision)} mi`;
  }
  return `${kilometers.toFixed(precision)} km`;
}

// Format elevation based on unit preference
export function formatElevation(meters, useImperial = true, precision = 0) {
  if (meters == null || isNaN(meters)) return useImperial ? '0 ft' : '0 m';
  if (useImperial) {
    const feet = convertDistance.mToFt(meters);
    return `${feet.toFixed(precision)} ft`;
  }
  return `${meters.toFixed(precision)} m`;
}

// Format speed based on unit preference
export function formatSpeed(kmh, useImperial = true, precision = 1) {
  if (kmh == null || isNaN(kmh)) return useImperial ? '0 mph' : '0 km/h';
  if (useImperial) {
    const mph = convertSpeed.kmhToMph(kmh);
    return `${mph.toFixed(precision)} mph`;
  }
  return `${kmh.toFixed(precision)} km/h`;
}

// Unit preferences context
const UnitPreferencesContext = createContext();

export function UnitPreferencesProvider({ children }) {
  const [useImperial, setUseImperial] = useState(() => {
    const saved = localStorage.getItem('useImperial');
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('useImperial', JSON.stringify(useImperial));
  }, [useImperial]);

  const formatDistanceWithPrefs = useCallback((kilometers, precision = 1) =>
    formatDistance(kilometers, useImperial, precision),
    [useImperial]
  );

  const formatElevationWithPrefs = useCallback((meters, precision = 0) =>
    formatElevation(meters, useImperial, precision),
    [useImperial]
  );

  const formatSpeedWithPrefs = useCallback((kmh, precision = 1) =>
    formatSpeed(kmh, useImperial, precision),
    [useImperial]
  );

  const value = useMemo(() => ({
    useImperial,
    setUseImperial,
    formatDistance: formatDistanceWithPrefs,
    formatElevation: formatElevationWithPrefs,
    formatSpeed: formatSpeedWithPrefs,
    distanceUnit: useImperial ? 'mi' : 'km',
    elevationUnit: useImperial ? 'ft' : 'm',
    speedUnit: useImperial ? 'mph' : 'km/h',
  }), [useImperial, formatDistanceWithPrefs, formatElevationWithPrefs, formatSpeedWithPrefs]);

  return (
    <UnitPreferencesContext.Provider value={value}>
      {children}
    </UnitPreferencesContext.Provider>
  );
}

export function useUnits() {
  const context = useContext(UnitPreferencesContext);
  if (!context) {
    // Return default functions if not in provider
    return {
      useImperial: true,
      formatDistance: (km, p = 1) => formatDistance(km, true, p),
      formatElevation: (m, p = 0) => formatElevation(m, true, p),
      formatSpeed: (kmh, p = 1) => formatSpeed(kmh, true, p),
      distanceUnit: 'mi',
      elevationUnit: 'ft',
      speedUnit: 'mph',
    };
  }
  return context;
}
