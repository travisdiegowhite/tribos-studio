/**
 * usePageTracking Hook
 * Automatically tracks page views when location changes
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/activityTracking';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook to track page views automatically
 */
export function usePageTracking() {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const lastPathRef = useRef(null);

  useEffect(() => {
    // Only track for authenticated users
    if (!isAuthenticated || !user) {
      return;
    }

    // Don't track the same path twice in a row
    if (lastPathRef.current === location.pathname) {
      return;
    }

    lastPathRef.current = location.pathname;

    // Track the page view
    trackPageView(location.pathname, document.title);
  }, [location.pathname, isAuthenticated, user]);
}

export default usePageTracking;
