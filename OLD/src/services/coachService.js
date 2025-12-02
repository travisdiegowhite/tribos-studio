/**
 * Coach Service
 * Manages coach-athlete relationships, workout assignments, and messaging
 * Integrates with existing tribos.studio infrastructure
 */

import { supabase } from '../supabase';

/**
 * Enable coach account for a user
 * Converts an athlete account to a coach account
 */
export async function enableCoachAccount(userId, coachData) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update({
      account_type: 'coach',
      coach_bio: coachData.bio,
      coach_certifications: coachData.certifications || [],
      coach_specialties: coachData.specialties || [],
      coach_pricing: coachData.pricing || null,
      coach_availability: coachData.availability || null,
      max_athletes: coachData.maxAthletes || 50
    })
    .eq('id', userId)
    .select()
    .single();

  return { data, error };
}

/**
 * Get coach profile
 */
export async function getCoachProfile(coachId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', coachId)
    .eq('account_type', 'coach')
    .single();

  return { data, error };
}

/**
 * Update coach profile
 */
export async function updateCoachProfile(coachId, updates) {
  const allowedFields = [
    'coach_bio',
    'coach_certifications',
    'coach_specialties',
    'coach_pricing',
    'coach_availability',
    'max_athletes'
  ];

  const filteredUpdates = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {});

  const { data, error } = await supabase
    .from('user_profiles')
    .update(filteredUpdates)
    .eq('id', coachId)
    .select()
    .single();

  return { data, error };
}

// =====================================================
// ATHLETE RELATIONSHIP MANAGEMENT
// =====================================================

/**
 * Get all athletes for a coach
 * @param {string} coachId - Coach user ID
 * @param {string} status - Filter by status: 'pending', 'active', 'paused', 'ended'
 */
export async function getAthletes(coachId, status = 'active') {
  let query = supabase
    .from('coach_athlete_relationships')
    .select('*')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: relationships, error } = await query;

  if (error || !relationships) {
    return { data: null, error };
  }

  // Fetch user profiles for each athlete
  const athleteIds = relationships.map(r => r.athlete_id);

  if (athleteIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, location_name')
    .in('id', athleteIds);

  if (profileError) {
    // If profiles fail, return relationships with minimal athlete data
    const enrichedData = relationships.map(rel => ({
      ...rel,
      athlete: null
    }));
    return { data: enrichedData, error: null };
  }

  // Merge profiles into relationships
  const enrichedData = relationships.map(rel => {
    const profile = profiles?.find(p => p.id === rel.athlete_id);
    return {
      ...rel,
      athlete: profile || null // Ensure athlete is explicitly set
    };
  });

  return { data: enrichedData, error: null };
}

/**
 * Get coaches for an athlete
 * @param {string} athleteId - Athlete user ID
 * @param {string} status - Filter by status
 */
export async function getCoaches(athleteId, status = 'active') {
  let query = supabase
    .from('coach_athlete_relationships')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: relationships, error } = await query;

  if (error || !relationships) {
    return { data: null, error };
  }

  // Fetch user profiles for each coach
  const coachIds = relationships.map(r => r.coach_id);

  if (coachIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: profiles, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, coach_bio, coach_certifications, coach_specialties')
    .in('id', coachIds);

  if (profileError) {
    return { data: relationships, error: null }; // Return relationships even if profiles fail
  }

  // Merge profiles into relationships
  const enrichedData = relationships.map(rel => ({
    ...rel,
    coach: profiles?.find(p => p.id === rel.coach_id)
  }));

  return { data: enrichedData, error: null };
}

/**
 * Invite an athlete
 * Creates a pending relationship if user exists, or pending invitation if they don't
 * @returns {object} { data: { type: 'existing_user' | 'pending_signup', ... }, error }
 */
export async function inviteAthlete(coachId, athleteEmail, permissions = {}, coachMessage = null) {
  // Normalize email
  const normalizedEmail = athleteEmail.toLowerCase().trim();

  // Check if user exists
  const { data: athleteId, error: lookupError } = await supabase.rpc('find_user_by_email', {
    p_email: normalizedEmail
  });

  // Handle existing users
  if (!lookupError && athleteId) {
    return await inviteExistingUser(coachId, athleteId, normalizedEmail, permissions);
  }

  // Handle non-existing users (send email invitation)
  return await inviteNewUser(coachId, normalizedEmail, permissions, coachMessage);
}

/**
 * Invite an existing user (creates relationship directly)
 */
async function inviteExistingUser(coachId, athleteId, email, permissions) {
  // Check if relationship already exists
  const { data: existing } = await supabase
    .from('coach_athlete_relationships')
    .select('id, status')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .single();

  if (existing) {
    return {
      data: null,
      error: new Error(`Relationship already exists (status: ${existing.status})`)
    };
  }

  // Create pending relationship
  const { data, error } = await supabase
    .from('coach_athlete_relationships')
    .insert({
      coach_id: coachId,
      athlete_id: athleteId,
      status: 'pending',
      can_view_rides: permissions.canViewRides ?? true,
      can_view_health_metrics: permissions.canViewHealthMetrics ?? false,
      can_assign_workouts: permissions.canAssignWorkouts ?? true,
      can_view_performance_data: permissions.canViewPerformanceData ?? true
    })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  // Fetch athlete profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url')
    .eq('id', athleteId)
    .single();

  // Send in-app + email notification
  await sendInvitationEmail({
    type: 'existing_user',
    athleteEmail: email,
    coachId,
    relationshipId: data.id
  });

  return {
    data: {
      type: 'existing_user',
      ...data,
      athlete: profile
    },
    error: null
  };
}

/**
 * Invite a new user who doesn't have an account yet
 */
async function inviteNewUser(coachId, athleteEmail, permissions, coachMessage) {
  // Check if pending invitation already exists
  const { data: existingInvitation } = await supabase
    .from('coach_invitations_pending')
    .select('id, status, expires_at')
    .eq('coach_id', coachId)
    .eq('athlete_email', athleteEmail)
    .eq('status', 'pending')
    .single();

  if (existingInvitation) {
    // Check if expired
    if (new Date(existingInvitation.expires_at) < new Date()) {
      // Cancel expired and create new one
      await supabase
        .from('coach_invitations_pending')
        .update({ status: 'cancelled' })
        .eq('id', existingInvitation.id);
    } else {
      return {
        data: null,
        error: new Error('Invitation already sent to this email. It expires on ' +
          new Date(existingInvitation.expires_at).toLocaleDateString())
      };
    }
  }

  // Generate invitation token
  const { data: token } = await supabase.rpc('generate_invitation_token');

  if (!token) {
    return {
      data: null,
      error: new Error('Failed to generate invitation token')
    };
  }

  // Create pending invitation
  const { data, error } = await supabase
    .from('coach_invitations_pending')
    .insert({
      coach_id: coachId,
      athlete_email: athleteEmail,
      invitation_token: token,
      permissions: {
        can_view_rides: permissions.canViewRides ?? true,
        can_view_health_metrics: permissions.canViewHealthMetrics ?? false,
        can_assign_workouts: permissions.canAssignWorkouts ?? true,
        can_view_performance_data: permissions.canViewPerformanceData ?? true
      },
      coach_message: coachMessage,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  // Send email invitation
  const emailSent = await sendInvitationEmail({
    type: 'new_user',
    athleteEmail,
    coachId,
    invitationToken: token,
    coachMessage
  });

  return {
    data: {
      type: 'pending_signup',
      ...data,
      email_sent: emailSent
    },
    error: null
  };
}

/**
 * Send invitation email via Edge Function
 */
async function sendInvitationEmail(invitationData) {
  try {
    const { data, error } = await supabase.functions.invoke('send-invitation-email', {
      body: invitationData
    });

    if (error) {
      console.error('Failed to send invitation email:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error calling email function:', err);
    return false;
  }
}

/**
 * Get pending invitations (for athletes without accounts)
 */
export async function getPendingInvitations(coachId) {
  const { data, error } = await supabase
    .from('coach_invitations_pending')
    .select('*')
    .eq('coach_id', coachId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return { data, error };
}

/**
 * Cancel a pending invitation
 */
export async function cancelPendingInvitation(invitationId, coachId) {
  const { data, error } = await supabase
    .from('coach_invitations_pending')
    .update({ status: 'cancelled' })
    .eq('id', invitationId)
    .eq('coach_id', coachId)
    .select()
    .single();

  return { data, error };
}

/**
 * Resend a pending invitation (generates new token, extends expiration)
 */
export async function resendPendingInvitation(invitationId, coachId) {
  // Get invitation
  const { data: invitation, error: fetchError } = await supabase
    .from('coach_invitations_pending')
    .select('*')
    .eq('id', invitationId)
    .eq('coach_id', coachId)
    .single();

  if (fetchError || !invitation) {
    return { data: null, error: fetchError || new Error('Invitation not found') };
  }

  // Generate new token
  const { data: newToken } = await supabase.rpc('generate_invitation_token');

  if (!newToken) {
    return { data: null, error: new Error('Failed to generate invitation token') };
  }

  // Update invitation with new token and extended expiration
  const { data, error } = await supabase
    .from('coach_invitations_pending')
    .update({
      invitation_token: newToken,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending'
    })
    .eq('id', invitationId)
    .eq('coach_id', coachId)
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  // Resend email
  await sendInvitationEmail({
    type: 'new_user',
    athleteEmail: data.athlete_email,
    coachId: coachId,
    invitationToken: newToken,
    coachMessage: data.coach_message
  });

  return { data, error: null };
}

/**
 * Get invitation details by token (public - for signup page)
 */
export async function getInvitationByToken(token) {
  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    p_token: token
  });

  if (error || !data || data.length === 0) {
    return { data: null, error: error || new Error('Invalid or expired invitation') };
  }

  return { data: data[0], error: null };
}

/**
 * Accept pending invitation after signup
 */
export async function acceptPendingInvitation(token, athleteId) {
  const { data: relationshipId, error } = await supabase.rpc('accept_pending_invitation', {
    p_token: token,
    p_athlete_id: athleteId
  });

  return { data: relationshipId, error };
}

/**
 * Accept coach invitation (athlete action)
 */
export async function acceptInvitation(relationshipId, athleteId) {
  const { data, error } = await supabase
    .from('coach_athlete_relationships')
    .update({
      status: 'active',
      activated_at: new Date().toISOString()
    })
    .eq('id', relationshipId)
    .eq('athlete_id', athleteId)
    .eq('status', 'pending')
    .select()
    .single();

  return { data, error };
}

/**
 * Decline coach invitation (athlete action)
 */
export async function declineInvitation(relationshipId, athleteId) {
  const { data, error } = await supabase
    .from('coach_athlete_relationships')
    .delete()
    .eq('id', relationshipId)
    .eq('athlete_id', athleteId)
    .eq('status', 'pending');

  return { data, error };
}

/**
 * Update relationship permissions
 */
export async function updateRelationshipPermissions(relationshipId, coachId, permissions) {
  const { data, error } = await supabase
    .from('coach_athlete_relationships')
    .update({
      can_view_rides: permissions.canViewRides,
      can_view_health_metrics: permissions.canViewHealthMetrics,
      can_assign_workouts: permissions.canAssignWorkouts,
      can_view_performance_data: permissions.canViewPerformanceData
    })
    .eq('id', relationshipId)
    .eq('coach_id', coachId)
    .select()
    .single();

  return { data, error };
}

/**
 * Pause or end relationship
 */
export async function updateRelationshipStatus(relationshipId, coachId, status) {
  const validStatuses = ['active', 'paused', 'ended'];
  if (!validStatuses.includes(status)) {
    return { data: null, error: new Error('Invalid status') };
  }

  const updates = { status };
  if (status === 'ended') {
    updates.ended_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('coach_athlete_relationships')
    .update(updates)
    .eq('id', relationshipId)
    .eq('coach_id', coachId)
    .select()
    .single();

  return { data, error };
}

// =====================================================
// WORKOUT ASSIGNMENT
// =====================================================

/**
 * Assign a workout to an athlete
 * Uses existing planned_workouts table with coach metadata
 */
export async function assignWorkout(coachId, athleteId, workoutData) {
  // Verify active relationship with workout assignment permission
  const { data: relationship, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('can_assign_workouts')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (relError || !relationship?.can_assign_workouts) {
    return {
      data: null,
      error: new Error('Cannot assign workouts to this athlete')
    };
  }

  // Get or create a training plan for the athlete
  let planId = workoutData.planId;

  if (!planId) {
    // Create a "Coach Assigned" plan if one doesn't exist
    const { data: existingPlan } = await supabase
      .from('training_plans')
      .select('id')
      .eq('user_id', athleteId)
      .eq('name', 'Coach Assigned Workouts')
      .single();

    if (existingPlan) {
      planId = existingPlan.id;
    } else {
      const { data: newPlan, error: planError } = await supabase
        .from('training_plans')
        .insert({
          user_id: athleteId,
          name: 'Coach Assigned Workouts',
          goal_type: 'general_fitness',
          fitness_level: 'intermediate',
          hours_per_week: 10,
          duration_weeks: 52,
          current_phase: 'base',
          status: 'active'
        })
        .select()
        .single();

      if (planError) {
        return { data: null, error: planError };
      }

      planId = newPlan.id;
    }
  }

  // Create the planned workout
  const { data: workout, error } = await supabase
    .from('planned_workouts')
    .insert({
      plan_id: planId,
      athlete_id: athleteId,
      assigned_by_coach_id: coachId,
      week_number: workoutData.weekNumber || 1,
      day_of_week: workoutData.dayOfWeek || 1,
      workout_type: workoutData.workoutType,
      target_tss: workoutData.targetTss,
      target_duration: workoutData.targetDuration,
      route_id: workoutData.routeId || null,
      coach_notes: workoutData.coachNotes || null,
      template_id: workoutData.templateId || null // Link to workout template (library or custom)
    })
    .select()
    .single();

  if (error) {
    return { data: null, error };
  }

  // Fetch route data if route_id exists
  let routeData = null;
  if (workout.route_id) {
    const { data: route } = await supabase
      .from('routes')
      .select('id, name, distance_km, elevation_gain, terrain_type')
      .eq('id', workout.route_id)
      .single();
    routeData = route;
  }

  return {
    data: {
      ...workout,
      route: routeData
    },
    error: null
  };
}

/**
 * Get workouts assigned by a coach
 */
export async function getAssignedWorkouts(coachId, athleteId = null, filters = {}) {
  let query = supabase
    .from('planned_workouts')
    .select('*')
    .eq('assigned_by_coach_id', coachId)
    .order('week_number', { ascending: false })
    .order('day_of_week', { ascending: false });

  if (athleteId) {
    query = query.eq('athlete_id', athleteId);
  }

  if (filters.completed !== undefined) {
    query = query.eq('completed', filters.completed);
  }

  if (filters.weekNumber) {
    query = query.eq('week_number', filters.weekNumber);
  }

  const { data: workouts, error } = await query;

  if (error || !workouts || workouts.length === 0) {
    return { data: workouts || [], error };
  }

  // Get unique athlete IDs and route IDs
  const athleteIds = [...new Set(workouts.map(w => w.athlete_id).filter(Boolean))];
  const routeIds = [...new Set(workouts.map(w => w.route_id).filter(Boolean))];

  // Fetch athlete profiles
  let athleteProfiles = [];
  if (athleteIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name, avatar_url')
      .in('id', athleteIds);
    athleteProfiles = profiles || [];
  }

  // Fetch route data
  let routes = [];
  if (routeIds.length > 0) {
    const { data: routeData } = await supabase
      .from('routes')
      .select('id, name, distance_km, elevation_gain, terrain_type')
      .in('id', routeIds);
    routes = routeData || [];
  }

  // Enrich workouts with athlete and route data
  const enrichedWorkouts = workouts.map(workout => ({
    ...workout,
    athlete: athleteProfiles.find(p => p.id === workout.athlete_id) || null,
    route: routes.find(r => r.id === workout.route_id) || null
  }));

  return { data: enrichedWorkouts, error: null };
}

/**
 * Update assigned workout
 */
export async function updateAssignedWorkout(workoutId, coachId, updates) {
  const allowedFields = ['coach_notes', 'target_tss', 'target_duration', 'route_id', 'week_number', 'day_of_week'];

  const filteredUpdates = Object.keys(updates)
    .filter(key => allowedFields.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {});

  const { data, error } = await supabase
    .from('planned_workouts')
    .update(filteredUpdates)
    .eq('id', workoutId)
    .eq('assigned_by_coach_id', coachId)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete assigned workout
 */
export async function deleteAssignedWorkout(workoutId, coachId) {
  const { data, error } = await supabase
    .from('planned_workouts')
    .delete()
    .eq('id', workoutId)
    .eq('assigned_by_coach_id', coachId);

  return { data, error };
}

// =====================================================
// ATHLETE DATA & INSIGHTS
// =====================================================

/**
 * Get comprehensive athlete summary
 * Uses the database function for efficient data gathering
 */
export async function getAthleteSummary(coachId, athleteId) {
  const { data, error } = await supabase.rpc('get_athlete_summary', {
    p_coach_id: coachId,
    p_athlete_id: athleteId
  });

  return { data, error };
}

/**
 * Get athlete's recent rides
 */
export async function getAthleteRides(coachId, athleteId, limit = 10) {
  // Verify access permission
  const { data: relationship, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('can_view_rides')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (relError || !relationship?.can_view_rides) {
    return { data: null, error: new Error('Cannot view athlete rides') };
  }

  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('user_id', athleteId)
    .eq('is_activity', true)
    .order('ride_date', { ascending: false })
    .limit(limit);

  return { data, error };
}

/**
 * Get athlete's training metrics
 */
export async function getAthleteMetrics(coachId, athleteId) {
  // Verify access permission
  const { data: relationship, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('can_view_performance_data')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (relError || !relationship?.can_view_performance_data) {
    return { data: null, error: new Error('Cannot view athlete metrics') };
  }

  const { data, error } = await supabase
    .from('training_metrics')
    .select('*')
    .eq('user_id', athleteId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  return { data, error };
}

/**
 * Get athlete's health metrics
 */
export async function getAthleteHealthMetrics(coachId, athleteId, days = 7) {
  // Verify access permission
  const { data: relationship, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('can_view_health_metrics')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (relError || !relationship?.can_view_health_metrics) {
    return { data: null, error: new Error('Cannot view athlete health metrics') };
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('health_metrics')
    .select('*')
    .eq('user_id', athleteId)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false });

  return { data, error };
}

/**
 * Get athlete's workout feedback
 */
export async function getAthleteWorkoutFeedback(coachId, athleteId, limit = 10) {
  // Verify active relationship
  const { data: relationship, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('id')
    .eq('coach_id', coachId)
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .single();

  if (relError || !relationship) {
    return { data: null, error: new Error('Cannot view athlete feedback') };
  }

  const { data: feedback, error } = await supabase
    .from('workout_feedback')
    .select('*')
    .eq('user_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !feedback || feedback.length === 0) {
    return { data: feedback || [], error };
  }

  // Get unique route and workout IDs
  const routeIds = [...new Set(feedback.map(f => f.route_id).filter(Boolean))];
  const workoutIds = [...new Set(feedback.map(f => f.planned_workout_id).filter(Boolean))];

  // Fetch route data
  let routes = [];
  if (routeIds.length > 0) {
    const { data: routeData } = await supabase
      .from('routes')
      .select('id, name, distance_km')
      .in('id', routeIds);
    routes = routeData || [];
  }

  // Fetch workout data
  let workouts = [];
  if (workoutIds.length > 0) {
    const { data: workoutData } = await supabase
      .from('planned_workouts')
      .select('id, workout_type, target_tss')
      .in('id', workoutIds);
    workouts = workoutData || [];
  }

  // Enrich feedback with route and workout data
  const enrichedFeedback = feedback.map(f => ({
    ...f,
    route: routes.find(r => r.id === f.route_id) || null,
    planned_workout: workouts.find(w => w.id === f.planned_workout_id) || null
  }));

  return { data: enrichedFeedback, error: null };
}

// =====================================================
// MESSAGING
// =====================================================

/**
 * Send a message to an athlete
 */
export async function sendMessage(relationshipId, senderId, messageText, workoutId = null) {
  if (!messageText || messageText.trim().length === 0) {
    return { data: null, error: new Error('Message cannot be empty') };
  }

  if (messageText.length > 2000) {
    return { data: null, error: new Error('Message too long (max 2000 characters)') };
  }

  const { data, error } = await supabase
    .from('coach_messages')
    .insert({
      relationship_id: relationshipId,
      sender_id: senderId,
      message_text: messageText.trim(),
      workout_id: workoutId
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Get messages for a relationship
 */
export async function getMessages(relationshipId, limit = 50) {
  const { data: messages, error } = await supabase
    .from('coach_messages')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !messages || messages.length === 0) {
    return { data: messages || [], error };
  }

  // Get unique sender IDs
  const senderIds = [...new Set(messages.map(m => m.sender_id))];

  // Fetch sender profiles
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url')
    .in('id', senderIds);

  // Enrich messages with sender data
  const enrichedMessages = messages.map(msg => ({
    ...msg,
    sender: profiles?.find(p => p.id === msg.sender_id) || null
  }));

  return { data: enrichedMessages, error: null };
}

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId) {
  const { data, error } = await supabase
    .from('coach_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null)
    .select()
    .single();

  return { data, error };
}

/**
 * Get unread message count
 */
export async function getUnreadCount(relationshipId, userId) {
  const { count, error } = await supabase
    .from('coach_messages')
    .select('id', { count: 'exact', head: true })
    .eq('relationship_id', relationshipId)
    .neq('sender_id', userId)
    .is('read_at', null);

  return { data: count, error };
}

/**
 * Get unread message counts for all relationships (optimized aggregate query)
 * Returns a map of relationship IDs to unread counts
 */
export async function getAllUnreadCounts(userId, relationshipIds) {
  if (!relationshipIds || relationshipIds.length === 0) {
    return { data: {}, error: null };
  }

  // Fetch all unread messages for the given relationships in a single query
  const { data, error } = await supabase
    .from('coach_messages')
    .select('relationship_id')
    .in('relationship_id', relationshipIds)
    .neq('sender_id', userId)
    .is('read_at', null);

  if (error) {
    return { data: null, error };
  }

  // Count messages per relationship
  const counts = {};
  relationshipIds.forEach(id => counts[id] = 0); // Initialize all to 0
  data.forEach(msg => {
    counts[msg.relationship_id] = (counts[msg.relationship_id] || 0) + 1;
  });

  return { data: counts, error: null };
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Check if user is a coach
 */
export async function isCoach(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('account_type')
    .eq('id', userId)
    .single();

  if (error) return false;
  return data?.account_type === 'coach';
}

/**
 * Get coach statistics
 */
export async function getCoachStats(coachId) {
  const { data: relationships, error: relError } = await supabase
    .from('coach_athlete_relationships')
    .select('status')
    .eq('coach_id', coachId);

  if (relError) {
    return { data: null, error: relError };
  }

  const { data: workouts, error: workoutError } = await supabase
    .from('planned_workouts')
    .select('completed')
    .eq('assigned_by_coach_id', coachId);

  if (workoutError) {
    return { data: null, error: workoutError };
  }

  const stats = {
    total_athletes: relationships.length,
    active_athletes: relationships.filter(r => r.status === 'active').length,
    pending_invitations: relationships.filter(r => r.status === 'pending').length,
    total_workouts_assigned: workouts.length,
    completed_workouts: workouts.filter(w => w.completed).length,
    upcoming_workouts: workouts.filter(w => !w.completed).length
  };

  return { data: stats, error: null };
}

export default {
  // Coach account management
  enableCoachAccount,
  getCoachProfile,
  updateCoachProfile,
  isCoach,
  getCoachStats,

  // Athlete relationships
  getAthletes,
  getCoaches,
  inviteAthlete,
  acceptInvitation,
  declineInvitation,
  updateRelationshipPermissions,
  updateRelationshipStatus,

  // Pending invitations (for users without accounts)
  getPendingInvitations,
  cancelPendingInvitation,
  resendPendingInvitation,
  getInvitationByToken,
  acceptPendingInvitation,

  // Workout assignments
  assignWorkout,
  getAssignedWorkouts,
  updateAssignedWorkout,
  deleteAssignedWorkout,

  // Athlete data
  getAthleteSummary,
  getAthleteRides,
  getAthleteMetrics,
  getAthleteHealthMetrics,
  getAthleteWorkoutFeedback,

  // Messaging
  sendMessage,
  getMessages,
  markMessageAsRead,
  getUnreadCount
};
