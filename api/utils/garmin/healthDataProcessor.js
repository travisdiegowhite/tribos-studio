/**
 * Garmin health data processing
 * Handles Push notifications from Garmin Health API (dailies, sleeps, bodyComps, etc.)
 * All functions accept supabase as a parameter.
 */

/**
 * Process a batch of health push data records.
 *
 * @param {string} dataType - Type of health data (dailies, sleeps, etc.)
 * @param {object[]} dataArray - Array of health data records
 * @param {object} supabase - Supabase client instance
 */
export async function processHealthPushData(dataType, dataArray, supabase) {
  console.log(`🏥 Processing ${dataArray.length} ${dataType} records`);

  for (const record of dataArray) {
    try {
      const garminUserId = record.userId;

      const { data: integration, error: integrationError } = await supabase
        .from('bike_computer_integrations')
        .select('user_id')
        .eq('provider', 'garmin')
        .eq('provider_user_id', garminUserId)
        .maybeSingle();

      if (integrationError || !integration) {
        console.warn(`⚠️ No integration found for Garmin user: ${garminUserId}`);
        continue;
      }

      const userId = integration.user_id;

      switch (dataType) {
        case 'dailies':
          await processDailySummary(userId, record, supabase);
          break;
        case 'sleeps':
          await processSleepSummary(userId, record, supabase);
          break;
        case 'bodyComps':
          await processBodyCompSummary(userId, record, supabase);
          break;
        case 'stressDetails':
          await processStressDetails(userId, record, supabase);
          break;
        case 'hrv':
          await processHrvSummary(userId, record, supabase);
          break;
        default:
          console.log(`ℹ️ Unhandled health data type: ${dataType}`);
      }

    } catch (err) {
      console.error(`❌ Error processing ${dataType} record:`, {
        garminUserId: record.userId,
        calendarDate: record.calendarDate,
        error: err.message,
        stack: err.stack
      });
    }
  }
}

/**
 * Extract health metrics from an activity and save to health_metrics table.
 * Used for health/monitoring activities that are filtered from activity import.
 */
export async function extractAndSaveHealthMetrics(userId, activityInfo, supabase) {
  try {
    const activityDate = activityInfo.startTimeInSeconds
      ? new Date(activityInfo.startTimeInSeconds * 1000)
      : new Date();
    const metricDate = activityDate.toISOString().split('T')[0];

    const healthData = {
      user_id: userId,
      metric_date: metricDate,
      source: 'garmin',
      updated_at: new Date().toISOString()
    };

    let hasData = false;

    if (activityInfo.averageHeartRateInBeatsPerMinute || activityInfo.averageHeartRate) {
      const avgHR = activityInfo.averageHeartRateInBeatsPerMinute || activityInfo.averageHeartRate;
      const activityType = (activityInfo.activityType || '').toLowerCase();
      if (['sedentary', 'monitoring', 'all_day_tracking'].includes(activityType) && avgHR < 100) {
        healthData.resting_hr = avgHR;
        hasData = true;
      }
    }

    if (activityInfo.averageStressLevel != null) {
      healthData.stress_level = Math.max(1, Math.min(5, Math.round(activityInfo.averageStressLevel / 20)));
      hasData = true;
    }

    if (activityInfo.bodyBatteryChargedValue != null) {
      healthData.body_battery = activityInfo.bodyBatteryChargedValue;
      hasData = true;
    }

    if (activityInfo.activeKilocalories) {
      console.log(`📊 Health activity calories: ${activityInfo.activeKilocalories} kcal`);
    }

    if (!hasData) {
      console.log('ℹ️ No health metrics to extract from activity');
      return false;
    }

    console.log(`💚 Extracting health metrics for ${metricDate}:`, {
      resting_hr: healthData.resting_hr,
      stress_level: healthData.stress_level,
      body_battery: healthData.body_battery
    });

    const { error } = await supabase
      .from('health_metrics')
      .upsert(healthData, { onConflict: 'user_id,metric_date' });

    if (error) {
      console.error('❌ Error saving health metrics from activity:', error);
      return false;
    }

    console.log(`✅ Health metrics saved to Body Check-in for ${metricDate}`);
    return true;

  } catch (err) {
    console.error('❌ Error extracting health metrics:', err);
    return false;
  }
}

// --- Internal helpers ---

function removeNullValues(obj) {
  Object.keys(obj).forEach(key => {
    if (obj[key] === null && key !== 'user_id' && key !== 'metric_date' && key !== 'source') {
      delete obj[key];
    }
  });
}

async function processDailySummary(userId, data, supabase) {
  const metricDate = data.calendarDate;
  if (!metricDate) {
    console.warn('Daily summary missing calendarDate');
    return;
  }

  console.log(`📊 Processing daily summary for ${metricDate}:`, {
    restingHR: data.restingHeartRateInBeatsPerMinute,
    avgStress: data.averageStressLevel,
    steps: data.steps
  });

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    resting_hr: data.restingHeartRateInBeatsPerMinute || null,
    stress_level: data.averageStressLevel != null
      ? Math.max(1, Math.min(5, Math.round(data.averageStressLevel / 20)))
      : null,
    body_battery: data.bodyBatteryChargedValue || null,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  removeNullValues(healthData);

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving daily summary:', error);
  } else {
    console.log(`✅ Daily summary saved for ${metricDate}`);
  }
}

async function processSleepSummary(userId, data, supabase) {
  const metricDate = data.calendarDate;
  if (!metricDate) {
    console.warn('Sleep summary missing calendarDate');
    return;
  }

  const sleepHours = data.durationInSeconds
    ? Math.round((data.durationInSeconds / 3600) * 10) / 10
    : null;

  let sleepQuality = null;
  if (data.overallSleepScore?.value != null) {
    sleepQuality = Math.max(1, Math.min(5, Math.round(data.overallSleepScore.value / 20)));
  }

  console.log(`😴 Processing sleep summary for ${metricDate}:`, {
    duration: sleepHours,
    score: data.overallSleepScore?.value,
    quality: sleepQuality
  });

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    sleep_hours: sleepHours,
    sleep_quality: sleepQuality,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  removeNullValues(healthData);

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving sleep summary:', error);
  } else {
    console.log(`✅ Sleep summary saved for ${metricDate}`);
  }
}

async function processBodyCompSummary(userId, data, supabase) {
  const measurementTime = data.measurementTimeInSeconds
    ? new Date(data.measurementTimeInSeconds * 1000)
    : new Date();
  const metricDate = measurementTime.toISOString().split('T')[0];

  const weightKg = data.weightInGrams
    ? Math.round((data.weightInGrams / 1000) * 10) / 10
    : null;

  const bodyFatPercent = data.bodyFatInPercent || null;

  console.log(`⚖️ Processing body comp for ${metricDate}:`, {
    weight: weightKg,
    bodyFat: bodyFatPercent
  });

  if (!weightKg && !bodyFatPercent) {
    console.log('No useful body comp data to save');
    return;
  }

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    weight_kg: weightKg,
    body_fat_percent: bodyFatPercent,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  removeNullValues(healthData);

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving body comp:', error);
  } else {
    console.log(`✅ Body comp saved for ${metricDate}`);
  }
}

async function processStressDetails(userId, data, supabase) {
  const metricDate = data.calendarDate;
  if (!metricDate) return;

  const bodyBatteryValues = data.timeOffsetBodyBatteryValues;
  let latestBodyBattery = null;

  if (bodyBatteryValues && Object.keys(bodyBatteryValues).length > 0) {
    const sortedOffsets = Object.keys(bodyBatteryValues).map(Number).sort((a, b) => b - a);
    latestBodyBattery = bodyBatteryValues[sortedOffsets[0]];
  }

  console.log(`😰 Processing stress details for ${metricDate}:`, {
    bodyBattery: latestBodyBattery
  });

  if (latestBodyBattery == null) return;

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    body_battery: latestBodyBattery,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving stress details:', error);
  } else {
    console.log(`✅ Stress details saved for ${metricDate}`);
  }
}

async function processHrvSummary(userId, data, supabase) {
  const metricDate = data.calendarDate;
  if (!metricDate) return;

  const hrvMs = data.lastNightAvg || null;

  console.log(`💓 Processing HRV summary for ${metricDate}:`, {
    hrv: hrvMs
  });

  if (hrvMs == null) return;

  const healthData = {
    user_id: userId,
    metric_date: metricDate,
    hrv_ms: hrvMs,
    source: 'garmin',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('health_metrics')
    .upsert(healthData, { onConflict: 'user_id,metric_date' });

  if (error) {
    console.error('❌ Error saving HRV summary:', error);
  } else {
    console.log(`✅ HRV summary saved for ${metricDate}`);
  }
}
