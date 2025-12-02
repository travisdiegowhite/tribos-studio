/**
 * Coach History Service
 * Manages conversation history with AI coach
 */

import { supabase } from '../supabase';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  // Always use relative URLs - works with both Vercel dev and production
  // In development, run with: vercel dev
  // Or set REACT_APP_API_URL environment variable for custom API server
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  return ''; // Relative URLs (same origin)
};

// Get authorization headers with Supabase session token
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * Fetch conversation history for a user
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @param {boolean} options.includeArchived - Include messages older than 14 days
 * @param {string} options.topic - Filter by topic (workouts, recovery, metrics, planning, general)
 * @param {number} options.limit - Max number of messages to fetch (default: 100)
 * @param {number} options.offset - Pagination offset (default: 0)
 * @returns {Promise<{data: Array, count: number, hasMore: boolean, error: string|null}>}
 */
export async function fetchConversationHistory(userId, options = {}) {
  const {
    includeArchived = false,
    topic = null,
    limit = 100,
    offset = 0
  } = options;

  try {
    // Build query params
    const params = new URLSearchParams({
      user_id: userId,
      include_archived: includeArchived.toString(),
      limit: limit.toString(),
      offset: offset.toString()
    });

    if (topic) {
      params.append('topic', topic);
    }

    const headers = await getAuthHeaders();
    const response = await fetch(`${getApiBaseUrl()}/api/coach-history?${params}`, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to fetch conversation history');
    }

    return {
      data: result.data || [],
      count: result.count || 0,
      hasMore: result.hasMore || false,
      error: null
    };

  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return {
      data: [],
      count: 0,
      hasMore: false,
      error: error.message
    };
  }
}

/**
 * Save a message to conversation history
 * @param {Object} message - Message object
 * @param {string} message.userId - User ID
 * @param {string} message.role - Message role (user, assistant, system)
 * @param {string} message.content - Message content
 * @param {Array} message.workoutRecommendations - Optional workout recommendations
 * @param {Array} message.actions - Optional action buttons
 * @param {Object} message.trainingContext - Optional training context snapshot
 * @param {string} message.topic - Optional topic (will be auto-classified if not provided)
 * @returns {Promise<{data: Object|null, error: string|null}>}
 */
export async function saveMessage(message) {
  const {
    userId,
    role,
    content,
    workoutRecommendations = null,
    actions = null,
    trainingContext = null,
    topic = null
  } = message;

  // Validate required fields
  if (!userId || !role || !content) {
    return {
      data: null,
      error: 'userId, role, and content are required'
    };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${getApiBaseUrl()}/api/coach-history`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        user_id: userId,
        role,
        content,
        workout_recommendations: workoutRecommendations,
        actions,
        training_context: trainingContext,
        topic
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to save message');
    }

    return {
      data: result.data,
      error: null
    };

  } catch (error) {
    console.error('Error saving message:', error);
    return {
      data: null,
      error: error.message
    };
  }
}

/**
 * Soft-delete a message from conversation history
 * @param {string} userId - User ID
 * @param {string} messageId - Message ID to delete
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
export async function deleteMessage(userId, messageId) {
  if (!userId || !messageId) {
    return {
      success: false,
      error: 'userId and messageId are required'
    };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${getApiBaseUrl()}/api/coach-history`, {
      method: 'DELETE',
      credentials: 'include',
      headers,
      body: JSON.stringify({
        user_id: userId,
        message_id: messageId
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to delete message');
    }

    return {
      success: true,
      error: null
    };

  } catch (error) {
    console.error('Error deleting message:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch only active (non-archived) messages for current context
 * This is what should be loaded when the chat opens
 * @param {string} userId - User ID
 * @returns {Promise<{data: Array, error: string|null}>}
 */
export async function fetchActiveMessages(userId) {
  return await fetchConversationHistory(userId, {
    includeArchived: false,
    limit: 50 // Last 50 active messages should be plenty for context
  });
}

/**
 * Group messages by date for display
 * @param {Array} messages - Array of message objects
 * @returns {Object} - Messages grouped by date keys (Today, Yesterday, Last Week, etc.)
 */
export function groupMessagesByDate(messages) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups = {
    'Today': [],
    'Yesterday': [],
    'Last 7 Days': [],
    'Last 14 Days': [],
    'Older': []
  };

  messages.forEach(message => {
    const messageDate = new Date(message.created_at);
    const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

    if (messageDateOnly.getTime() === today.getTime()) {
      groups['Today'].push(message);
    } else if (messageDateOnly.getTime() === yesterday.getTime()) {
      groups['Yesterday'].push(message);
    } else if (messageDate >= lastWeek) {
      groups['Last 7 Days'].push(message);
    } else if (messageDate >= new Date(lastWeek.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      groups['Last 14 Days'].push(message);
    } else {
      groups['Older'].push(message);
    }
  });

  // Remove empty groups
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  });

  return groups;
}

/**
 * Search messages by content
 * Client-side filter for already-fetched messages
 * @param {Array} messages - Array of message objects
 * @param {string} searchTerm - Search term
 * @returns {Array} - Filtered messages
 */
export function searchMessages(messages, searchTerm) {
  if (!searchTerm || searchTerm.trim() === '') {
    return messages;
  }

  const term = searchTerm.toLowerCase();
  return messages.filter(message =>
    message.content.toLowerCase().includes(term) ||
    message.topic?.toLowerCase().includes(term)
  );
}

/**
 * Filter messages by topic
 * @param {Array} messages - Array of message objects
 * @param {string} topic - Topic to filter by
 * @returns {Array} - Filtered messages
 */
export function filterMessagesByTopic(messages, topic) {
  if (!topic || topic === 'all') {
    return messages;
  }

  return messages.filter(message => message.topic === topic);
}

export default {
  fetchConversationHistory,
  fetchActiveMessages,
  saveMessage,
  deleteMessage,
  groupMessagesByDate,
  searchMessages,
  filterMessagesByTopic
};
