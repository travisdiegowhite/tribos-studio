import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { getBrowserTimezone } from '../utils/timezoneUtils';

const UserPreferencesContext = createContext({
  timezone: 'America/New_York',
  unitsPreference: 'imperial',
  loading: true,
  refreshPreferences: () => {},
});

export function UserPreferencesProvider({ children }) {
  const { user } = useAuth();
  const [timezone, setTimezone] = useState(() => getBrowserTimezone());
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [loading, setLoading] = useState(true);

  const loadPreferences = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('timezone, units_preference')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading user preferences:', error);
      } else if (data) {
        setTimezone(data.timezone || getBrowserTimezone());
        setUnitsPreference(data.units_preference || 'imperial');
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, [user?.id]);

  const refreshPreferences = () => {
    setLoading(true);
    loadPreferences();
  };

  return (
    <UserPreferencesContext.Provider
      value={{
        timezone,
        unitsPreference,
        loading,
        refreshPreferences,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext);
  if (!context) {
    throw new Error('useUserPreferences must be used within a UserPreferencesProvider');
  }
  return context;
}

export default UserPreferencesContext;
