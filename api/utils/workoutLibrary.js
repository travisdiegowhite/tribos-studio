// Workout library in format optimized for AI tool calling

export const WORKOUT_LIBRARY_FOR_AI = `
AVAILABLE WORKOUTS IN LIBRARY:

=== RECOVERY (Zone 1) ===
- recovery_spin: 30min, 20 TSS - Easy spinning for active recovery
- easy_recovery_ride: 45min, 30 TSS - Extended recovery ride

=== ENDURANCE / BASE (Zone 2) ===
- foundation_miles: 60min, 55 TSS - Classic Z2 endurance ride
- endurance_base_build: 90min, 70 TSS - 90min Zone 2 for aerobic capacity
- long_endurance_ride: 180min, 140 TSS - Classic 3-hour long ride
- polarized_long_ride: 240min, 180 TSS - 4-hour polarized endurance

=== TEMPO (Zone 3) ===
- tempo_ride: 60min, 65 TSS - Sustained Zone 3 tempo effort
- two_by_twenty_tempo: 75min, 80 TSS - 2x20min tempo intervals

=== SWEET SPOT (88-94% FTP) ===
- traditional_sst: 65min, 85 TSS - 45min sustained Sweet Spot
- three_by_ten_sst: 60min, 80 TSS - 3x10min sweet spot intervals
- four_by_twelve_sst: 80min, 95 TSS - 4x12min sweet spot intervals
- sweet_spot_progression: 90min, 105 TSS - Progressive sweet spot

=== THRESHOLD / FTP (95-105% FTP) ===
- two_by_twenty_ftp: 70min, 90 TSS - Classic 2x20min at FTP
- over_under_intervals: 75min, 100 TSS - Over-under threshold intervals
- three_by_twelve_threshold: 75min, 95 TSS - 3x12min at threshold

=== VO2 MAX (106-120% FTP) ===
- thirty_thirty_intervals: 60min, 85 TSS - 30/30s VO2max intervals
- five_by_four_vo2: 65min, 95 TSS - 5x4min VO2max
- four_by_eight_vo2: 75min, 105 TSS - 4x8min VO2max (research-proven)
- bossi_intervals: 65min, 100 TSS - Surging VO2max protocol
- polarized_intensity_day: 90min, 110 TSS - High-intensity polarized day

=== CLIMBING / HILLS ===
- hill_repeats: 70min, 80 TSS - 6x3min climbing intervals

=== HIGH INTENSITY / RACE PREP ===
- sprint_intervals: 75min, 70 TSS - 10x30s max sprints
- race_simulation: 90min, 105 TSS - Race-like efforts with surges

Use workout IDs (like "three_by_ten_sst") when recommending workouts.
`;

// Tool definitions for Claude
export const WORKOUT_TOOLS = [
  {
    name: "recommend_workout",
    description: "Recommend a workout from the library for the athlete to complete. Use this when you want to suggest a specific workout that can be added to their training calendar.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: {
          type: "string",
          description: "The ID of the workout from the library (e.g., 'three_by_ten_sst', 'recovery_spin')"
        },
        scheduled_date: {
          type: "string",
          description: "When to schedule this workout. Use format: 'today', 'tomorrow', 'this_monday', 'next_tuesday', or specific date 'YYYY-MM-DD'"
        },
        reason: {
          type: "string",
          description: "Brief explanation (1-2 sentences) of why this workout is recommended for the athlete right now"
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Priority level for this workout"
        }
      },
      required: ["workout_id", "scheduled_date", "reason"]
    }
  }
];
