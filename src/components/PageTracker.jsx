/**
 * PageTracker Component
 * Silently tracks page views for analytics
 */

import { usePageTracking } from '../hooks/usePageTracking';

export default function PageTracker() {
  usePageTracking();
  return null; // This component renders nothing
}
