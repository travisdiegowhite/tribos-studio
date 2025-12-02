/**
 * Training Recommendations Utility
 * Provides smart route suggestions based on TSB, FTP, and health metrics
 */

/**
 * Get route recommendation based on Training Stress Balance (TSB) and health metrics
 * @param {number} tsb - Training Stress Balance (CTL - ATL)
 * @param {Array} healthMetrics - Recent health metrics (HRV, sleep, etc.)
 * @returns {Object} Recommendation object with intensity, message, and adjustments
 */
export function getRouteRecommendation(tsb, healthMetrics = null) {
  // Calculate health factor if metrics available
  let healthFactor = 0; // -1 (poor health) to +1 (excellent health)

  if (healthMetrics && healthMetrics.length > 0) {
    // Calculate 7-day averages
    const recentMetrics = healthMetrics.slice(0, 7);

    // HRV check
    const hrvData = recentMetrics.filter(m => m.hrv);
    if (hrvData.length >= 3) {
      const avgHrv = hrvData.reduce((sum, m) => sum + m.hrv, 0) / hrvData.length;
      const latestHrv = hrvData[0].hrv;
      // If current HRV is significantly below average, adjust health factor down
      if (latestHrv < avgHrv * 0.9) {
        healthFactor -= 0.5;
      } else if (latestHrv > avgHrv * 1.1) {
        healthFactor += 0.3;
      }
    }

    // Sleep check
    const sleepData = recentMetrics.filter(m => m.sleep_hours);
    if (sleepData.length >= 3) {
      const avgSleep = sleepData.reduce((sum, m) => sum + m.sleep_hours, 0) / sleepData.length;
      if (avgSleep < 6) {
        healthFactor -= 0.5;
      } else if (avgSleep >= 8) {
        healthFactor += 0.2;
      }
    }
  }

  // Adjust TSB threshold based on health
  const effectiveTSB = tsb + (healthFactor * 10);

  // Determine recommendation based on effective TSB
  let recommendation;

  if (effectiveTSB < -30) {
    // Very fatigued - strongly recommend recovery
    recommendation = {
      recommendedIntensity: 'recovery',
      message: "You're significantly fatigued. We strongly recommend easy recovery rides to avoid overtraining.",
      color: 'red',
      shouldWarn: true,
      adjustedTSS: (baseTSS) => Math.min(baseTSS, 40),
      suggestedDuration: (baseDuration) => Math.min(baseDuration, 60),
      suggestedTrainingGoal: 'recovery',
      formStatus: 'overreached',
      icon: '🛑'
    };
  } else if (effectiveTSB < -10) {
    // Moderately fatigued - suggest easy rides
    recommendation = {
      recommendedIntensity: 'easy',
      message: "You're carrying some fatigue. Consider easier rides to maintain fitness while recovering.",
      color: 'yellow',
      shouldWarn: true,
      adjustedTSS: (baseTSS) => Math.min(baseTSS, 65),
      suggestedDuration: (baseDuration) => baseDuration * 0.9,
      suggestedTrainingGoal: 'endurance',
      formStatus: 'tired',
      icon: '⚠️'
    };
  } else if (effectiveTSB <= 5) {
    // Neutral - any workout is fine
    recommendation = {
      recommendedIntensity: 'moderate',
      message: "Your training load is balanced. You can tackle any type of workout.",
      color: 'green',
      shouldWarn: false,
      adjustedTSS: (baseTSS) => baseTSS,
      suggestedDuration: (baseDuration) => baseDuration,
      suggestedTrainingGoal: null, // No specific suggestion
      formStatus: 'balanced',
      icon: '✅'
    };
  } else {
    // Fresh - recommend hard workouts
    recommendation = {
      recommendedIntensity: 'hard',
      message: "You're well-rested and ready for challenging workouts. Great time for intervals or long rides!",
      color: 'blue',
      shouldWarn: false,
      adjustedTSS: (baseTSS) => baseTSS,
      suggestedDuration: (baseDuration) => baseDuration,
      suggestedTrainingGoal: 'intervals',
      formStatus: 'fresh',
      icon: '💪'
    };
  }

  // Add health factor details if relevant
  if (healthFactor < -0.5) {
    recommendation.healthNote = "Your recent HRV or sleep metrics suggest you need extra recovery.";
  } else if (healthFactor > 0.5) {
    recommendation.healthNote = "Your health metrics look great!";
  }

  return {
    ...recommendation,
    tsb,
    effectiveTSB,
    healthFactor
  };
}

/**
 * Get suggested training goal based on recommendation
 * Maps recommendation to route generator training goals
 */
export function getSuggestedTrainingGoal(recommendation) {
  const goalMap = {
    'recovery': 'recovery',
    'easy': 'endurance',
    'moderate': 'endurance',
    'hard': 'intervals'
  };

  return goalMap[recommendation.recommendedIntensity] || 'endurance';
}

/**
 * Interpret TSB/Form status for display
 * Reused logic from aiCoach.js for consistency
 */
export function interpretFormStatus(tsb) {
  if (tsb < -30) {
    return {
      status: 'overreached',
      color: 'red',
      message: 'Your body needs recovery. Focus on easy rides and rest.'
    };
  } else if (tsb < -10) {
    return {
      status: 'tired',
      color: 'yellow',
      message: 'You are carrying fatigue. Consider lighter training loads.'
    };
  } else if (tsb <= 5) {
    return {
      status: 'balanced',
      color: 'green',
      message: 'You are in a balanced training state. Good time for structured workouts.'
    };
  } else if (tsb <= 15) {
    return {
      status: 'fresh',
      color: 'blue',
      message: 'You are well-rested. Great opportunity for hard training or racing.'
    };
  } else {
    return {
      status: 'very fresh',
      color: 'cyan',
      message: 'You are highly rested. Perfect for peak performance.'
    };
  }
}
