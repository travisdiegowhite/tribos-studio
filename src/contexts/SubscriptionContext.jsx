import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const SubscriptionContext = createContext({});

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

// Default free tier values
const FREE_TIER = {
  tier: 'free',
  tierName: 'Free',
  status: 'active',
  features: {
    training_plans: true,
    routes: true,
    activity_sync: true,
    basic_analytics: true,
    advanced_analytics: false,
    ai_coach: false,
    realtime_sync: false,
    priority_support: false
  },
  limits: {
    max_active_plans: 1,
    max_routes_per_month: 5,
    activity_history_days: 30,
    ai_coach_sessions: 0
  },
  usage: {},
  subscription: null
};

export function SubscriptionProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [subscription, setSubscription] = useState(FREE_TIER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch subscription status from API
  const fetchSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setSubscription(FREE_TIER);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setSubscription(FREE_TIER);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/subscription/status', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }

      const data = await response.json();
      setSubscription(data);
    } catch (err) {
      console.error('Error fetching subscription:', err);
      setError(err.message);
      // Fall back to free tier on error
      setSubscription(FREE_TIER);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Fetch subscription on mount and when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Check if user has access to a specific feature
  const hasFeature = useCallback((featureName) => {
    return subscription.features?.[featureName] === true;
  }, [subscription.features]);

  // Check if user is within a specific limit
  const checkLimit = useCallback((limitName) => {
    const limit = subscription.limits?.[limitName];
    const usage = subscription.usage?.[limitName] || 0;

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, current: usage, max: -1, remaining: -1 };
    }

    return {
      allowed: usage < limit,
      current: usage,
      max: limit,
      remaining: Math.max(0, limit - usage)
    };
  }, [subscription.limits, subscription.usage]);

  // Check if user is on a paid plan
  const isPro = subscription.tier === 'pro';
  const isFree = subscription.tier === 'free';

  // Create checkout session
  const createCheckoutSession = useCallback(async (priceId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ priceId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error creating checkout session:', err);
      throw err;
    }
  }, []);

  // Open customer portal
  const openCustomerPortal = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to open customer portal');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error opening customer portal:', err);
      throw err;
    }
  }, []);

  const value = {
    // Subscription data
    ...subscription,
    loading,
    error,

    // Computed values
    isPro,
    isFree,

    // Methods
    hasFeature,
    checkLimit,
    refresh: fetchSubscription,
    createCheckoutSession,
    openCustomerPortal
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
