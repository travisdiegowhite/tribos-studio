# Training Dashboard & AI Coach Implementation

**Date:** December 3, 2025
**Commit:** `c5defe0`

## Overview

This update restores and modernizes the AI Training Coach, Workout Library, and Training Plans features from the old version of Tribos Studio. These features provide cyclists with intelligent training guidance, a comprehensive workout library, and structured training plan templates.

## What Was Built

### 1. AI Training Coach (`src/components/AICoach.jsx` & `api/coach.js`)

**Why:** The AI Coach provides personalized training advice using Claude, Anthropic's AI model. It understands the athlete's current fitness state (FTP, recent rides, weekly stats) and can recommend specific workouts from our library.

**Features:**
- Chat interface for natural conversation with the AI coach
- Receives training context (FTP, weekly distance/time, recent activities, speed profile)
- Uses Claude's tool calling to recommend specific workouts as clickable cards
- Workout recommendations include scheduled date, priority, and reasoning
- One-click "add to calendar" functionality for recommended workouts

**Technical Details:**
- API endpoint at `/api/coach.js` handles Claude API communication
- Uses model `claude-sonnet-4-5-20250929` for fast, high-quality responses
- Rate limited to 10 requests per 5 minutes per user
- CORS configured for production (tribos.studio) and development (localhost)

### 2. Workout Library (`src/data/workoutLibrary.js` & `api/utils/workoutLibrary.js`)

**Why:** A structured library of cycling workouts enables consistent training prescription. Each workout is scientifically designed with specific targets for duration, TSS (Training Stress Score), and intensity.

**Workout Categories (30+ workouts):**
- **Recovery** - Active recovery rides (20-30 TSS)
- **Endurance** - Zone 2 base building (55-180 TSS)
- **Tempo** - Zone 3 sustained efforts (65-80 TSS)
- **Sweet Spot** - 88-94% FTP intervals (80-105 TSS)
- **Threshold** - FTP-focused intervals (90-100 TSS)
- **VO2max** - 106-120% FTP intervals (85-110 TSS)
- **Climbing** - Hill-specific training (80 TSS)
- **Anaerobic** - Sprint intervals (70 TSS)
- **Racing** - Race simulation workouts (105 TSS)

**Each Workout Includes:**
- Unique ID for reference
- Duration in minutes
- Target TSS
- Intensity Factor (IF)
- Detailed structure (warmup, intervals, recovery, cooldown)
- Coach notes explaining the purpose

### 3. Training Plan Templates (`src/data/trainingPlanTemplates.js`)

**Why:** Pre-built training plans give athletes structured, periodized training without needing a personal coach. These plans follow evidence-based methodologies.

**Available Plans:**
| Plan | Duration | Methodology | Target Audience |
|------|----------|-------------|-----------------|
| 8-Week Polarized FTP Builder | 8 weeks | Polarized (80/20) | Intermediate cyclists |
| 12-Week Sweet Spot Base | 12 weeks | Sweet Spot | Time-constrained athletes |
| 16-Week Century Preparation | 16 weeks | Pyramidal | Gran fondo/century riders |
| 8-Week Climbing Performance | 8 weeks | Threshold | Climbers |
| 12-Week Road Race Prep | 12 weeks | Threshold | Competitive racers |
| 6-Week Beginner Foundation | 6 weeks | Endurance | New cyclists |

**Each Plan Includes:**
- Duration and weekly hour/TSS targets
- Phase breakdown (Base → Build → Peak → Taper)
- Weekly workout templates (where applicable)
- Expected gains (FTP %, VO2max improvement, etc.)
- Target audience description

### 4. Training Dashboard Updates (`src/pages/TrainingDashboard.jsx`)

**Why:** The Training Dashboard is the central hub for training-related features. Adding tabs for AI Coach, Workout Library, and Training Plans creates a unified training experience.

**New Tabs:**
1. **AI Coach** - Chat interface with Claude-powered coaching
2. **Workout Library** - Browse all workouts with category filtering
3. **Training Plans** - Browse structured plans with goal filtering

**UI Components Added:**
- `WorkoutLibraryPanel` - Filterable workout browser
- `TrainingPlansPanel` - Filterable training plan browser
- Category/goal filter buttons with visual feedback
- Workout/plan cards with detailed metadata badges

## File Changes Summary

| File | Type | Lines Added |
|------|------|-------------|
| `api/coach.js` | New | 229 |
| `api/utils/workoutLibrary.js` | New | 78 |
| `src/components/AICoach.jsx` | New | 339 |
| `src/data/workoutLibrary.js` | New | 600+ |
| `src/data/trainingPlanTemplates.js` | New | 250+ |
| `src/pages/TrainingDashboard.jsx` | Modified | +366 |

## Architecture Decisions

### Why Claude for AI Coaching?
- Natural language understanding for conversational coaching
- Tool calling enables structured workout recommendations
- Training context injection provides personalized advice
- Fast response times with Sonnet model

### Why Tool Calling for Workout Recommendations?
- Ensures workouts come from our validated library
- Creates actionable UI elements (clickable cards)
- Separates conversational response from structured data
- Enables one-click calendar integration

### Why Client-Side Workout/Plan Data?
- Instant filtering without API calls
- Works offline after initial load
- Easy to extend with new workouts/plans
- Reduces server load

## Future Enhancements

1. **Calendar Integration** - Save recommended workouts to a training calendar
2. **Plan Activation** - Start a training plan with automatic workout scheduling
3. **Progress Tracking** - Compare actual vs. planned TSS/hours
4. **Custom Workouts** - Allow users to create/save custom workouts
5. **AI Plan Generation** - Have Claude create custom training plans based on goals

## Testing the Features

1. Navigate to `/training` in the app
2. Scroll down to the "Training Tools" card
3. **AI Coach Tab:**
   - Type a message like "What should I ride today?"
   - The coach will respond with advice and workout recommendations
   - Click the + button on a workout card to "add" it
4. **Workout Library Tab:**
   - Click category buttons to filter workouts
   - Browse workout details (duration, TSS, structure)
5. **Training Plans Tab:**
   - Click goal buttons to filter plans
   - View plan phases, expected gains, and requirements

## Dependencies

- `@anthropic-ai/sdk` - Claude API client (already installed)
- `@mantine/core` - UI components (already installed)
- `@tabler/icons-react` - Icons (already installed)

No new dependencies were added.
