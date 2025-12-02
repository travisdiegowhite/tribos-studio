# Phase 2: Adaptive Intelligence - Installation Summary

## ✅ Successfully Installed

### Part 1: FTP Management & Training Zones
**Tables:**
- `user_ftp_history` - Tracks FTP test results over time
- `training_zones` - 7 training zones calculated from FTP

**Functions:**
- `get_current_ftp(user_id)` - Get user's current FTP
- `get_current_lthr(user_id)` - Get user's current LTHR
- `set_current_ftp(...)` - Update FTP and auto-create zones
- `initialize_training_zones(...)` - Create 7 training zones
- `get_ftp_history(...)` - View FTP test history
- `get_user_training_zones(...)` - Get all zones for user
- `get_zone_for_power(...)` - Determine zone from power output

**Triggers:**
- Auto-creates training zones when FTP is updated

---

### Part 2: FTP Functions & Triggers
All FTP-related functions and triggers installed successfully.

---

### Part 3: Progression Levels System
**Tables:**
- `progression_levels` - User fitness level (1.0-10.0) in each zone
- `progression_level_history` - Audit log of all level changes

**Columns Added to `planned_workouts`:**
- `workout_level` - Difficulty level of workout (1.0-10.0)
- `target_zone` - Primary training zone for workout
- `was_adapted` - Whether workout was auto-adjusted
- `adaptation_reason` - Why it was adapted
- `workout_date` - Date of workout

**Functions:**
- `initialize_progression_levels(user_id)` - Create initial levels (all 3.0)
- `get_progression_levels(user_id)` - View all levels
- `get_progression_level_for_zone(user_id, zone)` - Get level for specific zone
- `update_progression_level(...)` - Manually adjust level
- `increment_zone_workout_count(...)` - Track workouts completed
- `calculate_level_adjustment(...)` - Algorithm for level changes
- `apply_workout_to_progression(...)` - Apply workout result to progression
- `get_progression_history(...)` - View progression changes
- `seed_progression_from_rpe_data(user_id)` - Initialize from existing RPE data

---

### Part 4: Adaptive Training Engine
**Tables:**
- `adaptation_history` - Log of all workout adaptations
- `adaptation_settings` - User preferences for adaptive training

**Features:**
- Tracks adaptation recommendations
- Stores user acceptance/rejection of adaptations
- Configurable sensitivity and thresholds

---

## 🎯 Next Steps

### 1. Test the Database Functions

You can test the installation by running:

```sql
-- Test FTP setup
SELECT * FROM set_current_ftp(
  auth.uid(),  -- your user ID
  250,         -- FTP in watts
  165,         -- LTHR in bpm (optional)
  CURRENT_DATE,
  'manual'
);

-- View your training zones
SELECT * FROM get_user_training_zones(auth.uid());

-- Initialize progression levels
SELECT * FROM initialize_progression_levels(auth.uid());

-- View progression levels
SELECT * FROM get_progression_levels(auth.uid());
```

### 2. UI Components Ready

The following UI components are already created and ready to integrate:

**FTP Management:**
- `/src/components/FTPSettingsModal.js` - Manage FTP & view zones
- `/src/components/FTPUpdatePrompt.js` - Prompt for FTP updates

**Progression Levels:**
- `/src/components/ProgressionLevelsCard.js` - Display fitness levels

**Adaptive Training:**
- `/src/components/AdaptiveTrainingCard.js` - Show workout adaptations

**Services:**
- `/src/services/ftp.js` - FTP management API
- `/src/services/progressionLevels.js` - Progression API
- `/src/services/adaptiveTraining.js` - Adaptive training API
- `/src/services/ftpDetection.js` - Auto-detect FTP from rides

### 3. Integration Points

**Training Dashboard:**
- Add FTPSettingsModal for FTP management
- Add ProgressionLevelsCard to show fitness levels
- Add AdaptiveTrainingCard for workout recommendations

**Post-Workout Flow:**
- Call `apply_workout_to_progression()` after workout completion
- Use RPE data to automatically adjust progression levels

**AI Coach:**
- Access `get_progression_levels()` for personalized recommendations
- Use `get_user_training_zones()` for zone-based training advice
- Check current FTP with `get_current_ftp()` for power targets

### 4. Important Note: User ID Mapping

⚠️ **The `planned_workouts` table uses `plan_id` instead of `user_id`.**

When querying workouts for adaptive training, you'll need to:
1. Get the user's training plan ID first
2. Use that to filter planned_workouts

Example:
```sql
SELECT pw.* 
FROM planned_workouts pw
JOIN training_plans tp ON pw.plan_id = tp.id
WHERE tp.user_id = auth.uid();
```

---

## 📚 Documentation

Full implementation guide available at:
`/docs/PHASE_2_IMPLEMENTATION_GUIDE.md`

---

## ✨ Features Enabled

1. **FTP Tracking** - Store and track FTP tests over time
2. **7 Training Zones** - Auto-calculated from FTP/LTHR
3. **Progression Levels** - Track fitness in each zone (1-10 scale)
4. **Automatic Level Adjustment** - Based on workout completion & RPE
5. **Adaptive Training** - Foundation for auto-adjusting workouts
6. **Historical Tracking** - Full audit trail of all changes

---

## 🐛 Known Issues & Solutions

### Issue: "column 'user_id' does not exist"
**Solution:** This was caused by:
1. DO blocks in large SQL files (Supabase SQL editor issue)
2. Trying to create index on `planned_workouts(user_id)` which doesn't exist

**Resolution:** Split installation into 4 parts with no DO blocks.

### Future Consideration
The adaptive training functions (like `evaluate_workout_adaptation()` and `run_adaptive_training()`) from the original design are NOT included yet because they would need to be adapted to work with the `plan_id`-based `planned_workouts` table structure. These can be added in a future update if needed.

---

**Installation Date:** November 15, 2025
**Status:** ✅ Complete
