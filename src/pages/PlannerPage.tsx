/**
 * PlannerPage - now redirects into the Training Dashboard's Calendar tab.
 * The drag-and-drop planner is no longer a separate page; planning lives in the
 * unified monthly calendar so workouts (including coach-added rides) all surface
 * in one place. Old bookmarks/links to /planner and /train/planner land here and
 * forward on.
 */

import { Navigate } from 'react-router-dom';

export default function PlannerPage() {
  return <Navigate to="/train?tab=calendar" replace />;
}
