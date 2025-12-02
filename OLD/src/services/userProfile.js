import { supabase } from '../supabase';

/**
 * User Profile Service
 * Manages user profile data in the user_profiles table
 */

/**
 * Get user profile by user ID
 * @param {string} userId - The user's ID from auth.users
 * @returns {Promise<object|null>} User profile object or null if not found
 */
export const getUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data; // Returns null if no row found
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};

/**
 * Create or update user profile
 * First checks if profile exists, then updates or inserts accordingly
 * @param {string} userId - The user's ID from auth.users
 * @param {string} displayName - The user's display name
 * @param {object} additionalData - Optional additional profile data
 * @returns {Promise<object>} The created/updated profile
 */
export const createUserProfile = async (userId, displayName, additionalData = {}) => {
  try {
    // First check if profile already exists
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existing) {
      // Profile exists - update it
      console.log('📝 Updating existing profile for user:', userId);
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          display_name: displayName,
          ...additionalData,
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ User profile updated:', displayName);
      return data;
    } else {
      // Profile doesn't exist - insert it
      console.log('📝 Creating new profile for user:', userId);
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          display_name: displayName,
          ...additionalData,
        })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ User profile created:', displayName);
      return data;
    }
  } catch (error) {
    console.error('Error saving user profile:', error);
    throw error;
  }
};

/**
 * Update user profile
 * @param {string} userId - The user's ID
 * @param {object} updates - Profile fields to update
 * @returns {Promise<object>} The updated profile
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ User profile updated');
    return data;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

/**
 * Check if user has a profile (used for onboarding trigger)
 * @param {string} userId - The user's ID
 * @returns {Promise<boolean>} True if profile exists with display_name
 */
export const hasUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Profile exists if we got data and display_name is not null/empty
    return data && data.display_name && data.display_name.trim() !== '';
  } catch (error) {
    console.error('Error checking user profile:', error);
    return false;
  }
};

/**
 * Get just the display name (lightweight query)
 * @param {string} userId - The user's ID
 * @returns {Promise<string|null>} Display name or null
 */
export const getDisplayName = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.display_name || null;
  } catch (error) {
    console.error('Error fetching display name:', error);
    return null;
  }
};
// Build trigger 1764209168
