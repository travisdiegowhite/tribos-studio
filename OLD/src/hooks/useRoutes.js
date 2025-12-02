// Custom hook to fetch routes - returns demo data in demo mode
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../contexts/AuthContext';
import { demoRoutes } from '../utils/demoData';

export const useRoutes = () => {
  const { user, isDemoMode } = useAuth();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRoutes = async () => {
      // If in demo mode, return demo data
      if (isDemoMode) {
        console.log('📊 Loading demo routes');
        setRoutes(demoRoutes);
        setLoading(false);
        return;
      }

      // Otherwise fetch real data from Supabase
      if (!user) {
        setRoutes([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('routes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setRoutes(data || []);
      } catch (err) {
        console.error('Error fetching routes:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, [user, isDemoMode]);

  return { routes, loading, error };
};
