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

// Training Plan Creation Tool - enables AI coach to create full multi-week plans
export const CREATE_PLAN_TOOL = {
  name: "create_training_plan",
  description: `Create a complete multi-week training plan for the athlete. Use this tool when the athlete asks for:
- A training plan for an upcoming race or event
- A structured training block (base building, race prep, etc.)
- "Create a plan", "build me a plan", "set up my training"
- Help preparing for specific events on their calendar

This tool generates a FULL periodized plan with all workouts scheduled. The athlete will see a preview and can activate it with one click.

IMPORTANT: Use this instead of multiple recommend_workout calls when the athlete wants a complete training program.`,
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name for the training plan (e.g., 'Spring Century Prep', 'Base Building Block')"
      },
      duration_weeks: {
        type: "integer",
        description: "Length of the plan in weeks (4-20 weeks typical)"
      },
      methodology: {
        type: "string",
        enum: ["polarized", "sweet_spot", "threshold", "pyramidal", "endurance"],
        description: "Training methodology: polarized (80/20 low/high), sweet_spot (focus on 88-94% FTP), threshold (FTP-focused), pyramidal (balanced), endurance (aerobic base)"
      },
      goal: {
        type: "string",
        enum: ["general_fitness", "century", "gran_fondo", "climbing", "racing", "time_trial"],
        description: "Primary goal for the plan"
      },
      start_date: {
        type: "string",
        description: "When to start the plan. Use 'next_monday' for the upcoming Monday, or 'YYYY-MM-DD' for a specific date"
      },
      target_event_date: {
        type: "string",
        description: "Optional: The date of the target race/event (YYYY-MM-DD). Plan will periodize to peak for this date."
      },
      weekly_hours: {
        type: "integer",
        description: "Target training hours per week (6-15 typical)"
      },
      include_rest_weeks: {
        type: "boolean",
        description: "Whether to include recovery weeks every 3-4 weeks (recommended: true)"
      },
      notes: {
        type: "string",
        description: "Any special considerations (e.g., 'focus on climbing', 'limited weekday time', 'recovering from injury')"
      }
    },
    required: ["name", "duration_weeks", "methodology", "goal", "start_date"]
  }
};

// Fitness History Tool - enables AI coach to query historical fitness data
export const FITNESS_HISTORY_TOOL = {
  name: "query_fitness_history",
  description: `Query the athlete's historical fitness data to understand training patterns and trends over time. Use this tool when the athlete asks about:
- How their current fitness compares to the past ("How am I doing vs last year?")
- Their peak fitness periods ("When was I strongest?")
- Training trends ("Am I building or losing fitness?")
- Year-over-year comparisons ("What was my fitness like this time last year?")
- Seasonal patterns ("What months am I typically fittest?")
- How their body responds to training load changes

IMPORTANT: Always use this tool when discussing historical fitness. Do not guess or make assumptions about past performance.`,
  input_schema: {
    type: "object",
    properties: {
      query_type: {
        type: "string",
        enum: [
          "recent_trend",
          "peak_fitness",
          "compare_periods",
          "year_over_year",
          "seasonal_pattern",
          "training_response"
        ],
        description: `Type of historical analysis:
- recent_trend: Analyze last 4-8 weeks of fitness direction
- peak_fitness: Find when athlete was at highest CTL
- compare_periods: Compare current period to 'last_year' or 'peak'
- year_over_year: Compare same time period across multiple years
- seasonal_pattern: Identify monthly fitness patterns
- training_response: Analyze how CTL responds to load changes`
      },
      weeks_back: {
        type: "integer",
        description: "How many weeks of history to analyze (default: 12, max: 104 for 2 years)"
      },
      compare_to: {
        type: "string",
        enum: ["last_year", "same_time_last_year", "peak"],
        description: "For compare_periods: what to compare current fitness against"
      },
      metrics: {
        type: "array",
        items: { type: "string" },
        description: "Which metrics to focus on: ctl, atl, tsb, weekly_tss, weekly_hours, ftp"
      }
    },
    required: ["query_type"]
  }
};

// Fuel Plan Tool - enables AI coach to generate fueling recommendations
export const FUEL_PLAN_TOOL = {
  name: "generate_fuel_plan",
  description: `Generate fueling recommendations for a ride or race. Use this tool when the athlete asks about:
- Nutrition for an upcoming ride or race
- How to fuel for a long ride or race
- Carbohydrate/hydration needs for specific durations or intensities
- Pre-ride nutrition timing
- What to pack for fueling

This tool calculates personalized fueling recommendations based on ride duration, intensity, and weather conditions.`,
  input_schema: {
    type: "object",
    properties: {
      duration_minutes: {
        type: "integer",
        description: "Duration of the ride in minutes"
      },
      intensity: {
        type: "string",
        enum: ["recovery", "easy", "moderate", "tempo", "threshold", "race"],
        description: "Intensity level of the ride"
      },
      temperature_fahrenheit: {
        type: "integer",
        description: "Expected temperature during the ride (optional, for hydration adjustments)"
      },
      elevation_gain_feet: {
        type: "integer",
        description: "Total elevation gain in feet (optional, for calorie adjustments)"
      },
      is_race_day: {
        type: "boolean",
        description: "Whether this is a race or key event (adjusts pre-ride nutrition)"
      },
      ride_name: {
        type: "string",
        description: "Name of the ride or event (for display purposes)"
      }
    },
    required: ["duration_minutes", "intensity"]
  }
};

// Combined tools for AI coach (includes workout, fitness history, plan creation, and fueling)
export const ALL_COACH_TOOLS = [
  ...WORKOUT_TOOLS,
  FITNESS_HISTORY_TOOL,
  CREATE_PLAN_TOOL,
  FUEL_PLAN_TOOL
];
