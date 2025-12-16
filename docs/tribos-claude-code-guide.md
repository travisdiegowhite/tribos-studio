# Tribos: Claude Code Implementation Guide

## Overview

This guide is for using Claude Code to build Tribos, an AI accountability coach for busy cyclists. Work through phases sequentially—each builds on the previous.

## Project Setup

Before starting, ensure your existing Tribos repo is ready:

```bash
# Navigate to your project
cd /path/to/tribos

# Create a new branch for this work
git checkout -b feature/accountability-coach
```

---

## Phase 1: Foundation

### Prompt 1.1: Database Schema

```
Create a Supabase migration for the Tribos accountability coach. I need these tables:

1. training_plans
   - id (uuid, primary key)
   - user_id (uuid, FK to auth.users)
   - source (text: 'garmin', 'screenshot', 'manual')
   - plan_data (jsonb)
   - screenshot_url (text, nullable)
   - created_at, updated_at

2. scheduled_workouts
   - id (uuid, primary key)
   - user_id (uuid, FK to auth.users)
   - training_plan_id (uuid, FK to training_plans, nullable)
   - scheduled_date (date)
   - workout_type (text: 'endurance', 'tempo', 'threshold', 'intervals', 'recovery')
   - target_duration_mins (integer)
   - description (text)
   - status (text: 'planned', 'completed', 'skipped', 'rescheduled')
   - created_at, updated_at

3. ride_history
   - id (uuid, primary key)
   - user_id (uuid, FK)
   - strava_id (text, nullable)
   - garmin_id (text, nullable)
   - ride_date (timestamp)
   - duration_mins (integer)
   - route_id (uuid, FK to routes, nullable)
   - scheduled_workout_id (uuid, FK, nullable)
   - created_at

4. route_context_history
   - id, user_id, route_id (uuids)
   - ride_date (timestamp)
   - day_of_week (integer 0-6)
   - time_of_day (text: 'morning', 'midday', 'afternoon', 'evening')
   - workout_type (text)
   - weather_temp (float)
   - weather_wind_speed (float)
   - weather_wind_direction (text)
   - weather_conditions (text)
   - was_suggested (boolean)
   - was_completed (boolean)

5. user_route_preferences
   - id, user_id (uuids)
   - preference_type (text: 'time_pattern', 'weather_pattern', 'workout_match')
   - rule (jsonb)
   - confidence (float)
   - last_updated (timestamp)

6. coach_memory
   - id, user_id (uuids)
   - memory_type (text: 'short', 'medium', 'long')
   - category (text: 'goal', 'context', 'obstacle', 'pattern', 'win', 'excuse')
   - content (text)
   - source_conversation_id (uuid, nullable)
   - created_at (timestamp)
   - expires_at (timestamp, nullable)

7. coach_conversations
   - id, user_id (uuids)
   - timestamp (timestamp)
   - role (text: 'user', 'coach')
   - message (text)
   - context_snapshot (jsonb)

8. user_settings (extend if exists)
   - user_id (uuid, primary key)
   - work_hours_start (time)
   - work_hours_end (time)
   - work_days (integer[] - days of week)
   - notification_style (text: 'gentle', 'firm', 'aggressive')
   - accountability_level (text: 'low', 'medium', 'high')
   - evening_cutoff_time (time)
   - phone_number (text, for SMS)

Include RLS policies for user data isolation.
```

### Prompt 1.2: Google Calendar Integration

```
Add Google Calendar integration to Tribos:

1. Set up OAuth flow for Google Calendar
   - Add to existing auth if using Supabase Auth
   - Store refresh tokens securely
   - Request calendar.readonly scope

2. Create a function to fetch calendar events for a date range:
   - Input: user_id, start_date, end_date
   - Output: Array of busy time blocks
   - Filter out all-day events (optional based on setting)

3. Create a function that calculates available time windows:
   - Input: user_id, date
   - Combines: Google Calendar events + user's work hours setting
   - Output: Array of { start_time, end_time, duration_mins }

Store the calendar connection status in user_settings.
```

---

## Phase 2: Training Plan Import

### Prompt 2.1: Screenshot Upload & Parsing

```
Create a training plan import feature:

1. Screenshot upload component:
   - Drag/drop or file picker
   - Preview before upload
   - Upload to Supabase storage

2. Claude vision API integration:
   - Send screenshot to Claude with this prompt:
   
   "Analyze this training plan screenshot. Extract all scheduled workouts and return as JSON:
   {
     "workouts": [
       {
         "day_of_week": "monday",
         "workout_type": "endurance|tempo|threshold|intervals|recovery",
         "duration_mins": 60,
         "description": "Easy spin, keep HR in zone 2"
       }
     ],
     "notes": "Any relevant context about the plan"
   }
   
   If you can't clearly read certain workouts, include them with a 'confidence': 'low' flag."

3. Review/edit screen:
   - Show extracted workouts
   - Let user correct any mistakes
   - Confirm to save to scheduled_workouts table
```

### Prompt 2.2: Manual Workout Entry

```
Create a manual workout entry form as a fallback:

1. Simple form with:
   - Day selector (or specific date)
   - Workout type dropdown
   - Duration (minutes)
   - Description (optional)
   - Recurring toggle (repeat weekly)

2. Save to scheduled_workouts table

3. Option to add multiple workouts at once (batch entry for a week)
```

---

## Phase 3: Core Coach Conversation

### Prompt 3.1: Chat UI

```
Create the AI coach chat interface:

1. Chat component:
   - Message list (scrollable, newest at bottom)
   - Input field with send button
   - Loading state while AI responds
   - Timestamp on messages

2. Style:
   - Clean, minimal
   - User messages on right (blue)
   - Coach messages on left (gray)
   - Coach has a simple avatar/icon

3. Store messages in coach_conversations table after each exchange
```

### Prompt 3.2: Context Assembly

```
Create a context assembly function for the AI coach:

async function assembleCoachContext(userId: string) {
  // Fetch and return:
  
  1. Today's scheduled workout (if any)
  2. Available time windows for today (from calendar function)
  3. Current weather (cache in Supabase, refresh every hour)
  4. This week's plan vs actual:
     - Workouts scheduled this week
     - Workouts completed this week
  5. Recent performance trend:
     - Last 2 weeks: planned vs completed percentage
  6. Last 3 conversation messages
  7. Relevant memories from coach_memory:
     - All long-term memories
     - Recent medium-term memories
     - This week's short-term memories
  8. User's notification/accountability preferences
  
  Return as structured object for prompt injection.
}
```

### Prompt 3.3: Coach System Prompt

```
Create the AI coach system prompt. Use this as the base:

---
You are an AI cycling coach for {user_name}. Your job is to help them execute their training plan despite a busy life.

PERSONALITY:
- Direct and realistic. No sugarcoating.
- Treat them like an adult who can handle the truth.
- Brief acknowledgment for success ("4 for 4. Solid."), no excessive praise.
- Watch for overtraining—rest matters too.

WHEN THEY'RE SLIPPING:
- Be more direct: "You're 0 for 2 this week. What's going on?"
- After 3+ weeks of <50% completion, have the hard conversation:
  "Let's be real. You've hit X of your last Y planned rides. This isn't a bad week—it's a pattern. Either the plan doesn't fit your life, or cycling isn't the priority you thought it was. Both are fine. But I'm not going to keep pretending next week will be different. What do you actually want?"

WHAT YOU KNOW:
{Insert assembled context here}

CONSTRAINTS:
- Keep responses concise
- Don't ask IF they're riding—ask WHEN (commitment was already made)
- If suggesting routes, pick from their library based on time + workout type
- Remember what they tell you—note important context for memory extraction
---

Create the function that sends messages to Claude with this prompt + context.
```

### Prompt 3.4: Weekly Planning Flow

```
Create the weekly planning conversation flow:

1. Trigger: User opens app Sunday evening or Monday morning (or manually requests)

2. Coach initiates with something like:
   "Let's plan your week. You have [X workouts] scheduled. Looking at your calendar..."
   
   Then lists available windows and proposes a realistic schedule.

3. User can:
   - Confirm the plan
   - Adjust specific days
   - Flag conflicts ("Thursday won't work")

4. Store confirmed schedule:
   - Update scheduled_workouts with specific dates
   - Create commitment records the coach will reference later
```

---

## Phase 4: SMS Notifications

### Prompt 4.1: Twilio Setup

```
Set up Twilio SMS integration:

1. Create Supabase Edge Function for sending SMS
   - Input: user_id, message
   - Fetch user's phone number
   - Send via Twilio API

2. Environment variables needed:
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - TWILIO_PHONE_NUMBER

3. Test function with a simple "Hello from Tribos" message
```

### Prompt 4.2: Notification Scheduler

```
Create the notification scheduling system:

1. Supabase cron job (or Edge Function triggered by cron):
   - Runs every 30 minutes
   - Checks all users with workouts scheduled today
   
2. Escalation logic:
   
   Morning (around 7am or user-configured):
   - If workout scheduled and not completed
   - Send: "You've got a [workout_type] today. When are you thinking?"
   
   Midday (around 12pm):
   - If still not completed
   - Send: "Still planning to ride? You've got [X hours] before [next calendar event/evening cutoff]."
   
   Late afternoon (around 5pm or user's evening_cutoff_time - 1hr):
   - If STILL not completed
   - Send: "It's [time]. No ride yet. By dinner or tonight—what's the call?"

3. Track notification state:
   - Don't re-send if already sent at that tier
   - Reset daily
   
4. Include deep link to PWA coach chat in each SMS
```

### Prompt 4.3: Deep Link Handling

```
Set up deep linking from SMS to PWA:

1. SMS includes link like: https://tribos.studio/coach?prompt=checkin

2. PWA handles this route:
   - Opens coach chat
   - Pre-populates context about today's workout
   - Coach can immediately continue the conversation

3. If user not logged in, show login then redirect to coach
```

---

## Phase 5: Route Integration

### Prompt 5.1: Route Import

```
Enhance route import for the accountability coach:

1. Strava routes import (if not already done):
   - Fetch user's saved routes
   - Store with metadata: name, distance, elevation, estimated_duration

2. GPX upload:
   - Parse GPX file
   - Extract: coordinates, distance, elevation profile
   - Estimate duration based on distance + elevation

3. Route metadata enhancement:
   - terrain_type: 'flat', 'rolling', 'hilly', 'mountainous'
   - good_for_workouts: ['endurance', 'tempo'] (based on terrain)
   
4. Store all in routes table with user_id
```

### Prompt 5.2: Route Matching

```
Create route matching for workout suggestions:

async function matchRoutes(userId, workoutType, availableMins) {
  // 1. Get user's routes
  // 2. Filter by duration (within 10% of available time)
  // 3. Score by workout fit:
  //    - Intervals/threshold: prefer hilly or routes with good climb sections
  //    - Tempo: prefer rolling, consistent terrain
  //    - Endurance: any, but prefer scenic/enjoyable
  //    - Recovery: prefer flat, easy
  // 4. Check user_route_preferences for learned patterns
  // 5. Return top 2-3 matches with reasoning
}

Coach should use this when user confirms they're riding:
"You've got 55 minutes. Based on your routes, [Route A] fits for tempo work. Or [Route B] if you want something different."
```

### Prompt 5.3: Route Context Tracking

```
Track route selection context for preference learning:

1. When user completes a ride:
   - Match to a route in their library (by GPS if available)
   - Record in route_context_history:
     - Which route
     - Day/time
     - Weather conditions (fetch from weather API)
     - What workout type was scheduled
     - Was this route suggested by AI?

2. This data feeds the preference learning in Phase 6
```

---

## Phase 6: Learning & Memory

### Prompt 6.1: Memory Extraction Job

```
Create background job to extract memories from conversations:

1. Runs nightly (or weekly)

2. For each user, analyze recent conversations using Claude:
   
   "Review these conversation messages. Extract any facts worth remembering about the user.
   
   Categories:
   - goal: Training goals, events they're preparing for
   - context: Life circumstances (kids, job, travel)
   - obstacle: Recurring challenges mentioned
   - pattern: Behavioral patterns you notice
   - win: Achievements or breakthroughs
   
   Return as JSON array:
   [{ category, content, memory_type (short/medium/long) }]
   
   Short = this week only, Medium = next month, Long = indefinitely"

3. Insert into coach_memory table
4. Clear expired memories (where expires_at < now())
```

### Prompt 6.2: Route Preference Learning

```
Create preference learning from route_context_history:

1. Analyze patterns:
   - "User rides Route X on Tuesday mornings 80% of the time"
   - "User avoids Route Y when wind > 15mph"
   - "User prefers Route Z for interval workouts"

2. Store in user_route_preferences:
   {
     preference_type: "time_pattern",
     rule: { day_of_week: 2, time_of_day: "morning", route_id: "xxx" },
     confidence: 0.8
   }

3. Update weekly based on new data

4. Modify matchRoutes() to check these preferences first
```

### Prompt 6.3: Memory UI

```
Create the "What I Remember" screen:

1. Display memories grouped by category:
   - Your Goals
   - Your Context  
   - Patterns I've Noticed
   - This Week

2. Each memory shows:
   - Content
   - When learned/noticed
   - [Edit] [Delete] buttons

3. "Add a Note" button:
   - Free text input
   - "Is this something I should remember long-term?"
   - Saves to coach_memory

4. Edit opens inline editor, saves update

5. Delete removes with confirmation
```

---

## Phase 7: Polish & Dogfooding

### Prompt 7.1: PWA Enhancement

```
Optimize the PWA experience:

1. Service worker for offline capability:
   - Cache static assets
   - Queue messages if offline, send when back online
   - Show cached data when offline

2. Install prompt:
   - Show "Add to Home Screen" prompt after 2nd visit
   - Explain benefits (notifications, quick access)

3. App manifest:
   - Proper icons for home screen
   - Splash screen
   - Theme color matching brand
```

### Prompt 7.2: Onboarding Flow

```
Create onboarding for new users:

1. Welcome screen explaining the concept
   "I'm your cycling accountability coach. I'll help you execute your training plan, not create it."

2. Connect accounts:
   - Google Calendar (required)
   - Strava (optional)
   - Phone number for SMS (recommended)

3. Set preferences:
   - Work hours
   - Evening cutoff time
   - Notification aggressiveness

4. Import training plan:
   - Screenshot upload
   - Or "I don't have a plan yet" (defer)

5. First weekly planning session:
   - Coach proposes realistic week
   - User confirms

6. Completion: "You're set. I'll check in on [first workout day]."
```

### Prompt 7.3: Dogfooding Checklist

```
Before beta launch, test these scenarios yourself:

□ Complete full onboarding flow
□ Import a real training plan screenshot
□ Go through a full week of notifications
□ Actually respond to coach check-ins
□ Complete some workouts, skip others
□ See how coach responds to underperformance
□ Edit/add memories
□ Test route suggestions work with your routes
□ Verify SMS arrives at right times
□ Test the hard conversation after 2+ weeks of poor compliance

Document what feels wrong and iterate.
```

---

## Tips for Working with Claude Code

1. **One phase at a time.** Don't try to build everything at once.

2. **Test each piece before moving on.** Especially database schemas and API integrations.

3. **Keep the existing Tribos code.** This builds on what you have—routing, maps, existing Strava integration.

4. **Use specific file paths.** When asking Claude Code to edit existing files, be explicit about which file and where.

5. **Review generated code.** Especially for API keys, environment variables, and security-sensitive operations.

6. **Commit frequently.** After each working feature, commit so you can roll back if needed.

---

## Estimated Timeline

Working 5-10 hours/week on this:

- **Phase 1:** 1-2 weeks
- **Phase 2:** 1 week  
- **Phase 3:** 2-3 weeks (core of the product)
- **Phase 4:** 1-2 weeks
- **Phase 5:** 1-2 weeks
- **Phase 6:** 2 weeks
- **Phase 7:** 2-3 weeks (lots of iteration)

**Total: 3-4 months to dogfooding-ready MVP**

This aligns with your side project timeline. You'll have something usable for yourself within 2 months, polished for beta testers in 3-4 months.
