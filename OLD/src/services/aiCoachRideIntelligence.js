/**
 * AI Coach Ride Intelligence Enhancement
 *
 * Extends AI Coach with Phase 2.5 Ride Intelligence features:
 * - Performance trends
 * - Route difficulty insights
 * - Zone distribution analysis
 * - Peak power tracking
 * - Efficiency metrics
 */

import { getActiveTrends, getTrendDescriptionsForAI } from './performanceTrends';
import { getRecentRideAnalyses } from './rideAnalysis';
import { getCurrentFTP, getTrainingZones } from './ftp';
import { getProgressionLevels } from './progressionLevels';

/**
 * Gathers ride intelligence context for AI Coach
 * Call this from getTrainingContext() in aiCoach.js
 */
export async function getRideIntelligenceContext(userId) {
  try {
    const [trends, recentAnalyses, ftp, zones, progression] = await Promise.all([
      getActiveTrends(userId),
      getRecentRideAnalyses(userId, 5),
      getCurrentFTP(userId),
      getTrainingZones(userId),
      getProgressionLevels(userId)
    ]);

    return {
      performanceTrends: {
        active: trends || [],
        count: trends?.length || 0,
        descriptions: getTrendDescriptionsForAI(trends || [])
      },
      recentRideAnalyses: (recentAnalyses || []).map(analysis => ({
        rideName: analysis.routes?.route_name,
        rideDate: analysis.routes?.activity_date,
        vi: analysis.variability_index,
        if: analysis.intensity_factor,
        performanceRatio: analysis.performance_ratio,
        dominantZone: getDominantZone(analysis.zone_time_distribution)
      })),
      ftp: {
        current: ftp?.ftp,
        lthr: ftp?.lthr,
        testDate: ftp?.test_date,
        testType: ftp?.test_type
      },
      zones: zones || [],
      progression: (progression || []).map(p => ({
        zone: p.zone,
        level: p.level,
        lastChange: p.last_level_change,
        workoutsCompleted: p.workouts_completed
      }))
    };
  } catch (error) {
    console.error('Error gathering ride intelligence context:', error);
    return null;
  }
}

/**
 * Formats ride intelligence context for AI prompt
 */
export function formatRideIntelligenceForPrompt(rideIntelligence) {
  if (!rideIntelligence) return '';

  let prompt = '\n\n## Ride Intelligence & Performance Insights\n\n';

  // FTP & Zones
  if (rideIntelligence.ftp?.current) {
    prompt += `**Current FTP:** ${rideIntelligence.ftp.current}W`;
    if (rideIntelligence.ftp.testType) {
      prompt += ` (${rideIntelligence.ftp.testType} test`;
      if (rideIntelligence.ftp.testDate) {
        const daysSince = Math.floor(
          (new Date() - new Date(rideIntelligence.ftp.testDate)) / (1000 * 60 * 60 * 24)
        );
        prompt += `, ${daysSince} days ago`;
      }
      prompt += ')';
    }
    prompt += '\n';
  }

  // Progression Levels
  if (rideIntelligence.progression && rideIntelligence.progression.length > 0) {
    prompt += '\n**Progression Levels (Fitness by Zone):**\n';
    rideIntelligence.progression
      .sort((a, b) => b.level - a.level)
      .forEach(p => {
        const changeIndicator = p.lastChange > 0 ? '↑' : p.lastChange < 0 ? '↓' : '→';
        prompt += `- ${capitalizeZone(p.zone)}: ${p.level.toFixed(1)}/10 ${changeIndicator}`;
        if (p.workoutsCompleted > 0) {
          prompt += ` (${p.workoutsCompleted} workouts)`;
        }
        prompt += '\n';
      });
  }

  // Performance Trends
  if (rideIntelligence.performanceTrends?.count > 0) {
    prompt += `\n**Performance Trends (${rideIntelligence.performanceTrends.count} active):**\n`;
    prompt += rideIntelligence.performanceTrends.descriptions + '\n';
  }

  // Recent Ride Analysis
  if (rideIntelligence.recentRideAnalyses && rideIntelligence.recentRideAnalyses.length > 0) {
    prompt += '\n**Recent Ride Insights:**\n';
    rideIntelligence.recentRideAnalyses.slice(0, 3).forEach(ride => {
      if (!ride.rideName) return;

      prompt += `- ${ride.rideName} (${formatDate(ride.rideDate)}): `;

      const insights = [];
      if (ride.if) {
        const intensity = ride.if < 0.75 ? 'Easy' : ride.if < 0.88 ? 'Moderate' : ride.if < 1.05 ? 'Hard' : 'Very Hard';
        insights.push(`${intensity} (IF ${ride.if.toFixed(2)})`);
      }
      if (ride.vi) {
        const pacing = ride.vi < 1.05 ? 'Steady' : ride.vi < 1.10 ? 'Variable' : 'Very Variable';
        insights.push(`${pacing} pacing (VI ${ride.vi.toFixed(2)})`);
      }
      if (ride.performanceRatio) {
        if (ride.performanceRatio > 1.05) {
          insights.push('Strong performance');
        } else if (ride.performanceRatio < 0.95) {
          insights.push('Below expected');
        }
      }
      if (ride.dominantZone) {
        insights.push(`Mostly ${ride.dominantZone}`);
      }

      prompt += insights.join(', ') || 'Completed';
      prompt += '\n';
    });
  }

  return prompt;
}

/**
 * Gets AI Coach quick actions based on ride intelligence
 */
export function getIntelligenceQuickActions(rideIntelligence) {
  const actions = [];

  // Suggest FTP test if >90 days old or showing improvement trend
  if (rideIntelligence?.ftp?.testDate) {
    const daysSinceFTP = Math.floor(
      (new Date() - new Date(rideIntelligence.ftp.testDate)) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceFTP > 90) {
      actions.push({
        type: 'ftp_test',
        label: 'Time for FTP Test',
        description: `Last test was ${daysSinceFTP} days ago`,
        priority: 'medium'
      });
    }
  }

  // Check for FTP improvement trend
  const ftpTrend = rideIntelligence?.performanceTrends?.active?.find(
    t => t.trend_type === 'ftp_improvement'
  );
  if (ftpTrend && ftpTrend.confidence > 0.75) {
    actions.push({
      type: 'ftp_update',
      label: 'FTP Breakthrough Detected',
      description: `Consider updating FTP (+${Math.round(ftpTrend.value_change)}W)`,
      priority: 'high'
    });
  }

  // Check for declining zones
  const decliningZones = rideIntelligence?.progression?.filter(
    p => p.lastChange < -0.5
  );
  if (decliningZones && decliningZones.length > 0) {
    actions.push({
      type: 'zone_work',
      label: 'Zone Weakness Detected',
      description: `Focus on ${decliningZones.map(z => z.zone).join(', ')}`,
      priority: 'medium'
    });
  }

  // Check for high volume trend
  const volumeTrend = rideIntelligence?.performanceTrends?.active?.find(
    t => t.trend_type === 'volume_increase' && t.value_change_percent > 30
  );
  if (volumeTrend) {
    actions.push({
      type: 'recovery',
      label: 'High Volume Detected',
      description: 'Consider scheduling a recovery week',
      priority: 'high'
    });
  }

  return actions;
}

/**
 * Analyzes recent rides for coaching insights
 */
export function analyzeRecentRidesForInsights(analyses) {
  if (!analyses || analyses.length === 0) return null;

  const insights = {
    consistentPacing: true,
    highIntensityFrequency: 0,
    recoveryQuality: 'unknown',
    recommendations: []
  };

  // Check pacing consistency (VI analysis)
  const avgVI = analyses
    .filter(a => a.variability_index)
    .reduce((sum, a) => sum + a.variability_index, 0) / analyses.length;

  if (avgVI > 1.10) {
    insights.consistentPacing = false;
    insights.recommendations.push('Work on pacing consistency - your VI is high across recent rides');
  }

  // Check high-intensity frequency
  const highIntensityRides = analyses.filter(a => a.intensity_factor && a.intensity_factor > 0.85);
  insights.highIntensityFrequency = (highIntensityRides.length / analyses.length) * 100;

  if (insights.highIntensityFrequency > 60) {
    insights.recommendations.push('Very high intensity load - ensure adequate recovery between hard sessions');
  }

  // Check recovery ride quality
  const recoveryRides = analyses.filter(a => a.intensity_factor && a.intensity_factor < 0.65);
  if (recoveryRides.length > 0) {
    const avgRecoveryVI = recoveryRides
      .filter(r => r.variability_index)
      .reduce((sum, r) => sum + r.variability_index, 0) / recoveryRides.length;

    insights.recoveryQuality = avgRecoveryVI < 1.05 ? 'good' : 'poor';

    if (insights.recoveryQuality === 'poor') {
      insights.recommendations.push('Recovery rides could be more consistent - aim for steady, easy efforts');
    }
  }

  return insights;
}

// Helper functions

function getDominantZone(zoneDistribution) {
  if (!zoneDistribution) return null;

  let maxTime = 0;
  let dominantZone = null;

  Object.entries(zoneDistribution).forEach(([zone, seconds]) => {
    if (seconds > maxTime) {
      maxTime = seconds;
      dominantZone = zone;
    }
  });

  return dominantZone ? capitalizeZone(dominantZone) : null;
}

function capitalizeZone(zone) {
  if (!zone) return '';
  return zone
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
