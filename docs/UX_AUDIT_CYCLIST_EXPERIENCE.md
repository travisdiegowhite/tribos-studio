# Tribos Studio UX Audit: Cyclist Experience

> **Audit Date:** January 2026
> **Auditor:** Claude Code
> **Target Users:** Cyclists of all abilities (beginners to Cat 1-2 racers)
> **Competitors Analyzed:** TrainingPeaks, TrainerRoad, Strava, Wahoo SYSTM

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [User Personas](#user-personas)
3. [Current Feature Inventory](#current-feature-inventory)
4. [Gap Analysis by Priority](#gap-analysis-by-priority)
5. [Detailed Task Breakdown](#detailed-task-breakdown)
6. [Competitive Feature Matrix](#competitive-feature-matrix)
7. [UX Polish Items](#ux-polish-items)
8. [Unique Advantages to Leverage](#unique-advantages-to-leverage)

---

## Executive Summary

Tribos Studio has a strong foundation with comprehensive training metrics (CTL/ATL/TSB), 100+ workouts, 15+ training plans, excellent integrations (Strava/Garmin/Wahoo), and unique AI-powered route building.

**Key Gaps:**
- Missing workout compliance analysis (planned vs actual)
- No annual training plan / season periodization
- Limited onboarding for users new to training metrics
- No support for users without power meters (HR/RPE modes)
- Interval-level analysis missing for advanced users

**Biggest Opportunities:**
- AI Coach could be proactive rather than reactive
- AI Route Builder is unique - integrate with training plans
- "The Cafe" community has potential for differentiation

---

## User Personas

### Persona 1: New Cyclist ("Learning Lucy")

**Profile:**
- Just bought first road/gravel bike
- May not have power meter (using HR or feel)
- Heard about "TSS" and "FTP" but doesn't understand them
- Wants to get faster but doesn't know how
- Intimidated by complex training software

**Goals:**
- Understand what metrics mean and why they matter
- Follow a simple plan without feeling overwhelmed
- See tangible progress
- Not get injured from overtraining

**Pain Points with Current App:**
- Onboarding assumes FTP knowledge
- No way to estimate FTP without formal test
- Metrics displayed without explanation
- Most features require power meter data

---

### Persona 2: Intermediate Cyclist ("Building Brian")

**Profile:**
- 2-3 years of cycling experience
- Has power meter or smart trainer
- Trains 6-12 hours per week
- Participates in gran fondos, charity rides, maybe local races
- Knows basics but wants structured improvement

**Goals:**
- Follow a training plan consistently
- Know if workouts are "working"
- Improve FTP and endurance
- Balance training with life/work

**Pain Points with Current App:**
- Can't see if completed rides match planned workouts
- No feedback on whether training is progressing
- Hard to adjust plans when life gets busy
- No proactive suggestions for recovery

---

### Persona 3: Advanced Racer ("Racing Rachel")

**Profile:**
- Cat 1-2 or elite-level competitor
- Trains 12-20+ hours per week
- Uses TrainingPeaks or similar, looking to switch
- May work with a coach
- Needs detailed analytics for marginal gains

**Goals:**
- Plan entire race season with periodization
- Peak for specific events
- Analyze every aspect of training and racing
- Compare performance across time periods

**Pain Points with Current App:**
- No annual training plan builder
- Can't plan season periodization
- Missing interval-by-interval analysis
- No coach sharing features
- W' balance not visualized
- Power curve comparisons limited

---

## Current Feature Inventory

### What's Working Well

| Category | Features |
|----------|----------|
| **Training Metrics** | TSS, CTL, ATL, TSB, FTP tracking, power zones (7-zone), IF, VI, aerobic decoupling, EF |
| **Workout Library** | 100+ workouts across all categories (recovery to VO2max) |
| **Training Plans** | 15+ plans (polarized, sweet spot, masters, time-crunched, sport-specific) |
| **Route Building** | AI-powered route generation, manual builder, multiple basemaps, elevation profiles |
| **Integrations** | Strava, Garmin, Wahoo sync with auto-import |
| **Calendar** | Drag-drop scheduling, color-coded activities, weekly TSS totals |
| **Analytics** | PMC chart, power duration curve, zone distribution, personal records |
| **Community** | "The Cafe" with check-ins, discussions, local cafes |
| **AI Features** | AI Coach, AI Route Builder, coach memories |

---

## Gap Analysis by Priority

### Priority Levels

- **P0 - Critical:** Blocking competitive parity, users will leave without this
- **P1 - High:** Important for retention, significant UX improvement
- **P2 - Medium:** Nice to have, improves experience
- **P3 - Low:** Polish items, future considerations

---

## Detailed Task Breakdown

### P0 - Critical Items

#### P0-1: Workout Compliance Analysis

**Problem:** Users complete rides but have no way to know if they hit their targets. Did they actually do the intervals at the right power? TrainingPeaks and TrainerRoad both show planned vs actual.

**User Impact:** All personas, but especially intermediate and advanced

**Requirements:**
- [ ] Match completed activities to planned workouts (auto-detect or manual link)
- [ ] Compare actual power to target power for each interval
- [ ] Calculate compliance score (0-100%)
- [ ] Show visual overlay of planned vs actual power
- [ ] Identify which intervals were missed/failed
- [ ] Store compliance history for trend analysis

**Technical Notes:**
- Activity data already synced from Strava/Garmin
- Planned workouts have interval structure defined
- Need algorithm to align time-series data
- Consider tolerance ranges (±5% of target = pass)

**Files to Modify:**
- `src/components/training/` - Add compliance visualization
- `src/services/` - Create compliance calculation service
- `src/pages/TrainingDashboard.tsx` - Add compliance trends

**Acceptance Criteria:**
- User can see compliance score for any matched workout
- Visual chart shows planned power zones vs actual
- Weekly/monthly compliance trends visible
- Intervals highlighted as hit/missed

---

#### P0-2: FTP Estimation for New Users

**Problem:** New users don't know their FTP and can't use power-based features. Current onboarding asks for FTP but offers no help if unknown.

**User Impact:** Critical for new cyclist persona

**Requirements:**
- [ ] Option to skip FTP in onboarding with "Estimate later"
- [ ] Auto-detect FTP from existing ride data (20-min power × 0.95 or ramp test detection)
- [ ] Provide guided FTP test protocols (20-min test, ramp test)
- [ ] Allow estimation from "I can hold X watts for 20 minutes"
- [ ] Suggest FTP based on similar athletes (age, weight, experience)
- [ ] Prompt for FTP update when data suggests improvement

**Technical Notes:**
- Critical Power model already exists in codebase
- Can use power duration curve to estimate
- TrainerRoad uses ML model on ride data

**Files to Modify:**
- `src/components/onboarding/` - Add FTP estimation flow
- `src/services/ftpService.ts` - Add estimation algorithms
- `src/components/modals/` - Add FTP test guide modal

**Acceptance Criteria:**
- User can complete onboarding without knowing FTP
- System estimates FTP from first few rides
- Clear explanation of what FTP means and why it matters
- Guided test protocols available

---

#### P0-3: Heart Rate / RPE Training Mode

**Problem:** Users without power meters cannot effectively use most training features. Plans and workouts assume power data.

**User Impact:** Critical for new cyclists, many intermediate cyclists

**Requirements:**
- [ ] User preference: Power / Heart Rate / RPE mode
- [ ] HR zone calculation from max HR or LTHR
- [ ] All workouts displayable in HR zones or RPE
- [ ] TSS estimation from HR (hrTSS) when no power
- [ ] RPE-based workout descriptions ("Zone 2 = conversational pace")
- [ ] Metrics dashboard adapts to available data

**Technical Notes:**
- Heart rate data already imported from devices
- Need HR zone configuration in settings
- TSS from HR uses training impulse (TRIMP) methodology

**Files to Modify:**
- `src/services/ftpService.ts` - Add HR zone calculations
- `src/utils/workoutLibrary.ts` - Add HR/RPE targets to workouts
- `src/components/settings/` - Add HR zone configuration
- `src/pages/TrainingDashboard.tsx` - Support HR-based metrics

**Acceptance Criteria:**
- User can configure HR zones
- Workouts show HR and RPE targets alongside power
- Training load calculated from HR when no power
- Dashboard shows relevant metrics for user's data type

---

#### P0-4: Annual Training Plan (ATP) Builder

**Problem:** Serious racers need to plan entire seasons, not just 8-12 week blocks. TrainingPeaks' ATP is a primary reason users pay for it.

**User Impact:** Critical for advanced racers

**Requirements:**
- [ ] Season-level view (3-12 months)
- [ ] Add A/B/C priority races to calendar
- [ ] Auto-generate periodization phases (Base → Build → Peak → Taper → Recovery)
- [ ] Customize phase durations
- [ ] Set weekly volume targets per phase
- [ ] Visual periodization chart showing planned CTL progression
- [ ] Auto-populate with training plan blocks
- [ ] Adjust plan when races are added/moved

**Technical Notes:**
- Race goals table already exists
- Training plans exist but aren't chainable
- Need phase concept and volume progression logic

**Files to Modify:**
- `src/pages/PlannerPage.tsx` - Add season view
- `src/components/planner/` - Create ATP components
- `src/services/` - Create periodization service
- Database: Extend `training_plans` or create `annual_plans` table

**Acceptance Criteria:**
- User can create season plan with multiple race targets
- System suggests periodization based on race dates
- Visual chart shows planned training load through season
- Can drill down from season → month → week → day

---

### P1 - High Priority Items

#### P1-1: Interval-Level Analysis

**Problem:** Advanced users need to analyze individual intervals within a workout. Did power fade on interval 5? How did recovery affect each effort?

**User Impact:** Advanced racers, serious intermediates

**Requirements:**
- [ ] Detect intervals in completed activities
- [ ] Show each interval with avg/max power, HR, duration
- [ ] Compare intervals to each other (power fade analysis)
- [ ] Compare intervals to target
- [ ] Show W' depletion per interval
- [ ] Lap data for races (if available from device)

**Files to Modify:**
- `src/components/training/RideAnalysisModal.tsx` - Add interval breakdown
- `src/services/` - Create interval detection service

**Acceptance Criteria:**
- Intervals auto-detected from power data
- Each interval shown with key metrics
- Clear visualization of power fade or consistency

---

#### P1-2: W' Balance Visualization

**Problem:** W' (anaerobic capacity) model exists in code but isn't surfaced to users. Critical for race analysis and pacing.

**User Impact:** Advanced racers

**Requirements:**
- [ ] Real-time W' balance chart in ride analysis
- [ ] Show W' depletion events ("match burning")
- [ ] Overlay W' on power chart
- [ ] Highlight when W' went to zero (failure point)
- [ ] Calculate recovery between efforts

**Files to Modify:**
- `src/components/training/RideAnalysisModal.tsx` - Add W' chart
- `src/components/training/WPrimeBalanceChart.tsx` - Create new component

**Acceptance Criteria:**
- W' balance visible for any ride with power data
- Clear indication of when matches were burned
- Integration with interval analysis

---

#### P1-3: In-Context Metric Education

**Problem:** Metrics like CTL, TSB, IF are displayed but never explained. New users don't understand what they're looking at.

**User Impact:** All personas, especially new cyclists

**Requirements:**
- [ ] Tooltip on every metric abbreviation with definition
- [ ] "What does this mean for me?" contextual explanations
- [ ] CTL value + interpretation ("65 is moderate fitness for recreational cyclist")
- [ ] TSB interpretation ("You're fatigued, consider rest")
- [ ] First-time explanatory modals for major features
- [ ] Link to detailed help for those who want to learn more

**Files to Modify:**
- `src/components/common/` - Create MetricTooltip component
- `src/utils/metricEducation.ts` - Create content for each metric
- Various dashboard components - Add tooltips

**Acceptance Criteria:**
- Every abbreviation has hover tooltip
- Metrics include interpretation, not just numbers
- New users can understand dashboard without prior knowledge

---

#### P1-4: Beginner Training Plan ("First 8 Weeks")

**Problem:** Existing plans assume cycling knowledge. Need a plan that teaches concepts while building base fitness.

**User Impact:** New cyclists

**Requirements:**
- [ ] 8-week introductory plan
- [ ] Weeks 1-2: Focus on consistency, introduce RPE
- [ ] Weeks 3-4: Introduce heart rate zones
- [ ] Weeks 5-6: Introduce power concepts (if applicable)
- [ ] Weeks 7-8: First structured intervals
- [ ] Educational content tied to each week
- [ ] Low volume option (4-6 hrs/week)

**Files to Modify:**
- `src/utils/trainingPlans.ts` - Add beginner plan
- `src/utils/workoutLibrary.ts` - Add beginner-friendly workouts
- `src/components/planner/` - Educational content integration

**Acceptance Criteria:**
- Plan suitable for someone new to structured training
- Progressive introduction of concepts
- Low enough volume to not overwhelm
- Clear explanations throughout

---

#### P1-5: Progressive Overload Tracking

**Problem:** Users can't see if they're getting better at specific workout types. Are my threshold intervals improving over time?

**User Impact:** Intermediate and advanced cyclists

**Requirements:**
- [ ] Track performance by workout type over time
- [ ] "Threshold Progression" showing avg power in threshold workouts over 3 months
- [ ] "Endurance Progression" showing efficiency factor trends
- [ ] "VO2max Progression" showing peak power in hard intervals
- [ ] TrainerRoad-style "progression levels" concept
- [ ] Visual charts showing improvement

**Files to Modify:**
- `src/services/` - Create progression tracking service
- `src/components/training/` - Add progression charts
- `src/pages/TrainingDashboard.tsx` - Add progression panel

**Acceptance Criteria:**
- User can see improvement in each workout category
- Clear visualization of trends
- Celebration/notification when new level achieved

---

#### P1-6: Proactive AI Coach Suggestions

**Problem:** AI Coach is reactive (responds to questions). Could be proactive ("Based on your fatigue, consider an easy day").

**User Impact:** All personas

**Requirements:**
- [ ] Daily training suggestion based on TSB, recent training, plan
- [ ] Warning when ramp rate too high
- [ ] Suggestion when workout was missed
- [ ] Recovery recommendations after hard block
- [ ] "You've been consistent, time to test FTP?" prompts
- [ ] Weather-aware suggestions (hot day = reduce targets)

**Files to Modify:**
- `src/components/ai/` - Add proactive suggestion system
- `src/services/` - Create suggestion engine
- `src/pages/Dashboard.tsx` - Display daily suggestions

**Acceptance Criteria:**
- User sees relevant suggestion on dashboard each day
- Suggestions based on actual training data
- Not annoying or repetitive

---

#### P1-7: Workout Alternatives/Swaps

**Problem:** When user can't do planned workout (time crunch, fatigue), no easy way to find suitable replacement.

**User Impact:** Intermediate cyclists especially

**Requirements:**
- [ ] "Find alternative" button on planned workouts
- [ ] Filter by duration (shorter/longer)
- [ ] Match by training zone focus
- [ ] Match by TSS range
- [ ] Show indoor/outdoor options
- [ ] One-click swap on calendar

**Files to Modify:**
- `src/components/planner/` - Add alternative workout UI
- `src/utils/workoutLibrary.ts` - Add matching/filtering logic

**Acceptance Criteria:**
- User can quickly find similar workout
- Alternatives maintain training intent
- Easy to swap on calendar

---

### P2 - Medium Priority Items

#### P2-1: Power Curve Time Comparisons

**Problem:** Power curve exists but can't compare to previous periods easily. "Am I faster than 3 months ago?"

**Requirements:**
- [ ] Compare curve to last 30/60/90 days
- [ ] Compare to same period last year
- [ ] Compare to "peak form" (best curve ever)
- [ ] Highlight improvements/declines by duration
- [ ] Overlay multiple curves on same chart

---

#### P2-2: Recovery Time Recommendations

**Problem:** After hard workouts, users don't know how long to recover. Advanced users want to optimize.

**Requirements:**
- [ ] Post-workout recovery estimate
- [ ] Based on training load and historical recovery patterns
- [ ] Show optimal next hard session timing
- [ ] Integrate with calendar suggestions

---

#### P2-3: Weekly/Monthly Summary Emails

**Problem:** Users who don't log in regularly miss insights. Email summaries keep them engaged.

**Requirements:**
- [ ] Weekly email with key stats
- [ ] Monthly email with trends and achievements
- [ ] Configurable in settings
- [ ] Mobile-friendly email design

---

#### P2-4: Coach Sharing / Athlete Portal

**Problem:** Some racers work with coaches who need to see their data. TrainingPeaks supports this.

**Requirements:**
- [ ] Invite coach to view data
- [ ] Coach can add comments to workouts
- [ ] Coach can assign workouts
- [ ] Different permission levels

---

#### P2-5: Race Simulation Workouts

**Problem:** Advanced users want to simulate target races in training.

**Requirements:**
- [ ] Create workout from route profile
- [ ] Import race course and generate intervals
- [ ] Match power targets to expected race demands

---

#### P2-6: Multi-Sport Support

**Problem:** Many cyclists also run, swim, or do strength training. Limited support currently.

**Requirements:**
- [ ] Running TSS (rTSS) calculation
- [ ] Swim TSS calculation
- [ ] Strength training logging
- [ ] Combined training load across sports

---

#### P2-7: Segment/Leaderboard Integration

**Problem:** Strava segments are motivating. No equivalent in Tribos.

**Requirements:**
- [ ] Import Strava segments for routes
- [ ] Show personal bests on segments
- [ ] Segment prediction based on current fitness

---

### P3 - Low Priority / Future Items

#### P3-1: Mobile App (PWA)

**Requirements:**
- [ ] Progressive Web App with offline support
- [ ] Today's workout accessible offline
- [ ] Route viewing offline
- [ ] Push notifications

---

#### P3-2: Live Tracking

**Requirements:**
- [ ] Real-time location sharing during rides
- [ ] Safety feature for family
- [ ] Live power/HR display for coaches

---

#### P3-3: Nutrition/Fueling Integration

**Requirements:**
- [ ] Carb requirements per workout
- [ ] Integration with apps like MyFitnessPal
- [ ] Race day fueling plans

---

#### P3-4: Equipment Tracking

**Requirements:**
- [ ] Track bikes and components
- [ ] Maintenance reminders
- [ ] Component lifespan tracking

---

#### P3-5: Sleep/Recovery Data Integration

**Requirements:**
- [ ] Import from Garmin, Oura, Whoop
- [ ] Factor into training readiness
- [ ] HRV tracking and trends

---

## Competitive Feature Matrix

| Feature | Tribos | TrainingPeaks | TrainerRoad | Strava | Priority |
|---------|:------:|:-------------:|:-----------:|:------:|:--------:|
| PMC (CTL/ATL/TSB) | ✅ | ✅ | ✅ | ⚠️ | - |
| Structured Workouts | ✅ | ✅ | ✅ | ❌ | - |
| Training Plans | ✅ | ✅ | ✅ | ❌ | - |
| AI Route Planning | ✅ | ❌ | ❌ | ❌ | Advantage |
| Workout Compliance | ❌ | ✅ | ✅ | ❌ | P0 |
| Annual Training Plan | ❌ | ✅ | ⚠️ | ❌ | P0 |
| Adaptive Training | ❌ | ❌ | ✅ | ❌ | P1 |
| FTP Auto-Detection | ❌ | ❌ | ✅ | ❌ | P0 |
| HR/RPE Mode | ⚠️ | ✅ | ✅ | ✅ | P0 |
| Interval Analysis | ❌ | ✅ | ✅ | ❌ | P1 |
| W' Balance | ⚠️ | ✅ | ❌ | ❌ | P1 |
| Progression Tracking | ❌ | ⚠️ | ✅ | ❌ | P1 |
| Coach Sharing | ❌ | ✅ | ❌ | ❌ | P2 |
| Social/Community | ✅ | ⚠️ | ⚠️ | ✅✅ | Advantage |
| Segments | ❌ | ❌ | ❌ | ✅ | P2 |
| Mobile App | ❌ | ✅ | ✅ | ✅ | P3 |
| Live Tracking | ❌ | ❌ | ❌ | ✅ | P3 |

Legend: ✅ Full support | ⚠️ Partial | ❌ Missing

---

## UX Polish Items

### Dashboard & Navigation

- [ ] **Dashboard density:** Consider customizable dashboard or progressive disclosure
- [ ] **Quick actions:** Prominent "Start Workout" and "Log Ride" buttons
- [ ] **Recent activity:** Show last 5 rides prominently
- [ ] **Today's focus:** Clear "What should I do today?" guidance

### Visual Design

- [ ] **Consistent iconography:** Standardize icons for workout types
- [ ] **Color coding:** Consistent zone colors throughout app
- [ ] **Loading states:** Skeleton screens for data-heavy pages
- [ ] **Empty states:** Helpful prompts when no data yet

### Interaction

- [ ] **Keyboard shortcuts:** Power users want quick navigation
- [ ] **Bulk actions:** Select multiple workouts, bulk reschedule
- [ ] **Undo support:** Undo accidental deletions/moves
- [ ] **Autosave:** Never lose work in progress

### Notifications

- [ ] **Workout reminders:** "You have intervals planned for today"
- [ ] **Missed workout:** "You missed yesterday's workout, want to reschedule?"
- [ ] **Achievement alerts:** "New power PR at 5 minutes!"
- [ ] **Fatigue warnings:** "High ramp rate detected, consider rest"

---

## Unique Advantages to Leverage

### 1. AI Route Building

**Current State:** Unique feature, no competitor has AI route generation.

**Opportunities:**
- [ ] Integrate with workouts: "Create route for my intervals" with appropriate terrain
- [ ] Training-aware routes: "Route with 20 min climb for threshold work"
- [ ] Race simulation: Import race course, generate training route with similar profile
- [ ] Local knowledge: Learn from user's popular routes and preferences

### 2. "The Cafe" Community

**Current State:** Community hub concept is differentiated from Strava's mass feed.

**Opportunities:**
- [ ] Local riding groups and meetups
- [ ] Training partner matching by FTP range
- [ ] Group challenges and competitions
- [ ] Local cafe partnerships (real cafes)

### 3. AI Coach

**Current State:** Conversational AI coach available.

**Opportunities:**
- [ ] Proactive daily suggestions
- [ ] Training plan adjustments based on compliance
- [ ] Natural language plan building ("Make me faster for a July century")
- [ ] Post-ride analysis and insights

---

## Implementation Roadmap Suggestion

### Phase 1: Foundation (Weeks 1-4)
- P0-2: FTP Estimation
- P0-3: Heart Rate / RPE Mode
- P1-3: In-Context Education
- P1-4: Beginner Training Plan

**Goal:** Make app accessible to new cyclists

### Phase 2: Training Intelligence (Weeks 5-8)
- P0-1: Workout Compliance Analysis
- P1-5: Progressive Overload Tracking
- P1-6: Proactive AI Coach
- P1-7: Workout Alternatives

**Goal:** Provide training feedback and intelligence

### Phase 3: Advanced Features (Weeks 9-12)
- P0-4: Annual Training Plan Builder
- P1-1: Interval-Level Analysis
- P1-2: W' Balance Visualization
- P2-1: Power Curve Comparisons

**Goal:** Compete with TrainingPeaks for advanced users

### Phase 4: Polish & Expand (Ongoing)
- P2+ items based on user feedback
- Mobile PWA development
- Additional integrations

---

## Metrics to Track

### Engagement
- Daily/weekly active users
- Session duration
- Features used per session

### Training
- Workout compliance rates
- Plan completion rates
- FTP improvements

### Retention
- 7-day, 30-day, 90-day retention
- Churn by user segment
- Feature usage before churn

### Growth
- Beta signups
- Activation rate (complete onboarding)
- Referral rate

---

## Appendix: Research References

### Training Methodology
- Polarized training: Seiler, S. (2010)
- Sweet Spot training: Coggan, Allen (Training and Racing with a Power Meter)
- Critical Power model: Monod & Scherrer (1965)

### Competitors
- TrainingPeaks: https://www.trainingpeaks.com
- TrainerRoad: https://www.trainerroad.com
- Strava: https://www.strava.com
- Wahoo SYSTM: https://wahoofitness.com/systm

---

*Last updated: January 2026*
