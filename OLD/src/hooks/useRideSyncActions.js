import { useState, useCallback } from 'react';
import { handleRideSynced, getRidesNeedingFeedback } from '../services/rideSyncHandler';

/**
 * Hook for handling post-ride-sync actions
 * Use this in components that sync or display rides
 */
export const useRideSyncActions = (userId) => {
  const [processingRide, setProcessingRide] = useState(null);
  const [rideToSurvey, setRideToSurvey] = useState(null);
  const [linkedWorkout, setLinkedWorkout] = useState(null);

  /**
   * Process a newly synced ride
   */
  const processNewRide = useCallback(async (ride) => {
    if (!userId || !ride) return null;

    try {
      setProcessingRide(ride.id);

      const result = await handleRideSynced(ride, userId);

      if (result.success) {
        // Store linked workout info
        if (result.linkedWorkout) {
          setLinkedWorkout(result.linkedWorkout);
        }

        // Prompt for RPE survey if needed
        if (result.shouldPromptRPE) {
          setRideToSurvey(ride);
        }

        return result;
      }

      return null;
    } catch (err) {
      console.error('Error processing ride:', err);
      return null;
    } finally {
      setProcessingRide(null);
    }
  }, [userId]);

  /**
   * Check for rides needing feedback
   */
  const checkPendingFeedback = useCallback(async () => {
    if (!userId) return [];

    try {
      const rides = await getRidesNeedingFeedback(userId, 7);
      return rides;
    } catch (err) {
      console.error('Error checking pending feedback:', err);
      return [];
    }
  }, [userId]);

  /**
   * Clear the current survey prompt
   */
  const clearSurveyPrompt = useCallback(() => {
    setRideToSurvey(null);
    setLinkedWorkout(null);
  }, []);

  /**
   * Manually trigger survey for a ride
   */
  const promptSurveyForRide = useCallback((ride, workout = null) => {
    setRideToSurvey(ride);
    setLinkedWorkout(workout);
  }, []);

  return {
    // State
    processingRide,
    rideToSurvey,
    linkedWorkout,

    // Actions
    processNewRide,
    checkPendingFeedback,
    clearSurveyPrompt,
    promptSurveyForRide,
  };
};

export default useRideSyncActions;
