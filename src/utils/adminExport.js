/**
 * Admin Analytics Export Utilities
 * Client-side CSV generation for admin dashboard data
 */

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

/**
 * Export users list to CSV
 */
export function exportUsersCSV(users) {
  const headers = ['Email', 'Signed Up', 'Last Sign In', 'Email Confirmed', 'Activity Count', 'Integrations'];
  const rows = users.map(u => [
    escapeCSV(u.email),
    escapeCSV(formatDate(u.created_at)),
    escapeCSV(formatDate(u.last_sign_in_at)),
    escapeCSV(u.email_confirmed_at ? 'Yes' : 'No'),
    escapeCSV(u.activity_count ?? 0),
    escapeCSV(Array.isArray(u.integrations) ? u.integrations.join('; ') : ''),
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Export activity summaries to CSV
 */
export function exportActivityCSV(summaries) {
  const headers = [
    'User Email', 'Total Events', 'Page Views', 'Sync Events',
    'Upload Events', 'Feature Uses', 'Interactions', 'Last Activity',
    'Events (24h)', 'Events (7d)'
  ];
  const rows = summaries.map(s => [
    escapeCSV(s.user_email || s.email),
    escapeCSV(s.total_events ?? 0),
    escapeCSV(s.page_views ?? 0),
    escapeCSV(s.sync_events ?? 0),
    escapeCSV(s.upload_events ?? 0),
    escapeCSV(s.feature_uses ?? 0),
    escapeCSV(s.interactions ?? 0),
    escapeCSV(formatDate(s.last_activity)),
    escapeCSV(s.events_24h ?? 0),
    escapeCSV(s.events_7d ?? 0),
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Export insights data to CSV (multi-section)
 */
export function exportInsightsCSV(insights) {
  const sections = [];

  // Activation Funnel
  if (insights.funnel) {
    sections.push('=== ACTIVATION FUNNEL ===');
    sections.push('Stage,Count,Percentage');
    const total = insights.total_users || 1;
    const funnelOrder = ['signed_up', 'profile_completed', 'integration_connected', 'first_activity', 'route_created', 'training_plan', 'coach_used'];
    const funnelLabels = {
      signed_up: 'Signed Up',
      profile_completed: 'Profile Completed',
      integration_connected: 'Integration Connected',
      first_activity: 'First Activity Synced',
      route_created: 'Route Created',
      training_plan: 'Training Plan',
      coach_used: 'Coach Used',
    };
    for (const key of funnelOrder) {
      const count = insights.funnel[key] ?? 0;
      sections.push(`${escapeCSV(funnelLabels[key] || key)},${count},${Math.round((count / total) * 100)}%`);
    }
    sections.push('');
  }

  // Feature Adoption
  if (insights.feature_adoption) {
    sections.push('=== FEATURE ADOPTION ===');
    sections.push('Feature,Users,Percentage');
    const total = insights.total_users || 1;
    for (const [feature, count] of Object.entries(insights.feature_adoption)) {
      sections.push(`${escapeCSV(feature)},${count},${Math.round((count / total) * 100)}%`);
    }
    sections.push('');
  }

  // Retention Cohorts
  if (insights.retention_cohorts && insights.retention_cohorts.length > 0) {
    sections.push('=== RETENTION COHORTS ===');
    sections.push('Signup Week,Signed Up,Active 7d,Active 30d,Activated');
    for (const c of insights.retention_cohorts) {
      sections.push([
        escapeCSV(c.signup_week),
        escapeCSV(c.signed_up ?? 0),
        escapeCSV(c.active_7d ?? 0),
        escapeCSV(c.active_30d ?? 0),
        escapeCSV(c.activated ?? 0),
      ].join(','));
    }
    sections.push('');
  }

  // Summary
  if (insights.summary) {
    sections.push('=== ENGAGEMENT SUMMARY ===');
    sections.push('Metric,Value');
    const s = insights.summary;
    const metrics = [
      ['Total Users', insights.total_users],
      ['Active (7d)', s.active_7d],
      ['Active (30d)', s.active_30d],
      ['Engaged (7d)', s.engaged_7d],
      ['Engaged (30d)', s.engaged_30d],
      ['Never Activated', s.never_activated],
      ['Churned', s.churned],
      ['At Risk', s.at_risk],
    ];
    for (const [label, val] of metrics) {
      sections.push(`${escapeCSV(label)},${escapeCSV(val ?? 0)}`);
    }
    sections.push('');
  }

  // Stale Users
  if (insights.stale_users && insights.stale_users.length > 0) {
    sections.push('=== STALE USERS ===');
    sections.push('Email,Status,Days Inactive,Has Profile,Has Integration,Has Activity');
    for (const u of insights.stale_users) {
      sections.push([
        escapeCSV(u.email),
        escapeCSV(u.status),
        escapeCSV(u.days_inactive ?? ''),
        escapeCSV(u.has_profile ? 'Yes' : 'No'),
        escapeCSV(u.has_integration ? 'Yes' : 'No'),
        escapeCSV(u.has_activity ? 'Yes' : 'No'),
      ].join(','));
    }
    sections.push('');
  }

  // Plan Adherence
  if (insights.plan_adherence?.users?.length > 0) {
    sections.push('=== PLAN ADHERENCE ===');
    sections.push('Email,Plan Status,Adherence %,Workouts Due,Workouts Completed');
    for (const u of insights.plan_adherence.users) {
      sections.push([
        escapeCSV(u.email),
        escapeCSV(u.plan_status),
        escapeCSV(u.adherence_pct != null ? `${Math.round(u.adherence_pct)}%` : ''),
        escapeCSV(u.workouts_due ?? 0),
        escapeCSV(u.workouts_completed ?? 0),
      ].join(','));
    }
  }

  return sections.join('\n');
}

/**
 * Trigger CSV file download in the browser
 */
export function downloadCSV(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
