// Workout library in format optimized for AI tool calling
// This is a simplified version of the full workout library for the AI to reference

export const WORKOUT_LIBRARY_FOR_AI = `
AVAILABLE WORKOUTS IN LIBRARY:

=== RECOVERY (Zone 1) ===
- recovery_spin: 30min, 20 TSS - Easy spinning for active recovery
- easy_recovery_ride: 45min, 30 TSS - Extended recovery ride

=== ENDURANCE / BASE (Zone 2) ===
- foundation_miles: 60min, 55 TSS - Classic Z2 endurance ride
- endurance_base_build: 90min, 70 TSS - 90min Zone 2 for aerobic capacity
- long_endurance_ride: 180min, 140 TSS - Classic 3-hour long ride
- endurance_with_bursts: 85min, 70 TSS - Z2 with 15sec neuromuscular bursts
- polarized_long_ride: 180min, 140 TSS - Long low-intensity ride

=== TEMPO (Zone 3) ===
- tempo_ride: 60min, 65 TSS - Sustained Zone 3 tempo effort
- two_by_twenty_tempo: 75min, 82 TSS - 2x20min tempo intervals
- tempo_bursts: 70min, 75 TSS - Tempo with 30sec bursts

=== SWEET SPOT (88-94% FTP) ===
- traditional_sst: 60min, 75 TSS - Traditional sweet spot intervals
- three_by_ten_sst: 60min, 80 TSS - 3x10min sweet spot intervals
- four_by_twelve_sst: 75min, 92 TSS - 4x12min sweet spot intervals
- two_by_twenty_sst: 75min, 90 TSS - 2x20min sweet spot
- sweet_spot_progression: 90min, 100 TSS - Progressive sweet spot
- sweet_spot_base: 90min, 100 TSS - Sweet spot base building

=== THRESHOLD / FTP (95-105% FTP) ===
- two_by_twenty_ftp: 90min, 105 TSS - 2x20min at threshold
- over_under_intervals: 75min, 95 TSS - Over-under threshold intervals
- threshold_pyramid: 75min, 95 TSS - Pyramid threshold workout
- three_by_twelve_threshold: 75min, 100 TSS - 3x12min at threshold
- threshold_focused: 90min, 110 TSS - Threshold-focused training

=== VO2 MAX (106-120% FTP) ===
- thirty_thirty_intervals: 60min, 78 TSS - 30/30s VO2max intervals
- forty_twenty_intervals: 60min, 82 TSS - 40/20s VO2max intervals
- bossi_intervals: 65min, 85 TSS - Bossi VO2max protocol
- polarized_intensity_day: 75min, 90 TSS - High-intensity polarized day

=== CLIMBING / HILLS ===
- hill_repeats: 60min, 80 TSS - 5x4min climbing intervals
- climbing_repeats_long: 75min, 90 TSS - Long climbing repeats

=== HIGH INTENSITY / RACE PREP ===
- sprint_intervals: 60min, 65 TSS - 8x30s max sprints
- race_simulation: 90min, 100 TSS - Race-like efforts
- polarized: 120min, 110 TSS - Polarized training approach
- pyramidal: 90min, 95 TSS - Pyramidal training structure

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
        },
        modifications: {
          type: "object",
          description: "Optional modifications to the standard workout",
          properties: {
            target_tss: {
              type: "number",
              description: "Modified target TSS if different from standard"
            },
            duration: {
              type: "number",
              description: "Modified duration in minutes if different from standard"
            }
          }
        }
      },
      required: ["workout_id", "scheduled_date", "reason"]
    }
  }
];
