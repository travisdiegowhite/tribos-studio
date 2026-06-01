import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { getBrowserTimezone } from '../utils/timezoneUtils';

const UserPreferencesContext = createContext({
  timezone: 'America/New_York',
  unitsPreference: 'imperial',
  loading: true,
  refreshPreferences: () => {},
  updateUnitsPreference: (_next) => {},
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

  // Persist a units-preference change to the user's profile. Optimistically
  // updates local state so the UI flips immediately; the upsert touches only
  // the units_preference column (mirrors Settings.jsx's user_profiles upsert).
  const updateUnitsPreference = async (next) => {
    setUnitsPreference(next);
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({ id: user.id, units_preference: next });
      if (error) console.error('Error saving units preference:', error);
    } catch (error) {
      console.error('Error saving units preference:', error);
    }
  };

  return (
    <UserPreferencesContext.Provider
      value={{
        timezone,
        unitsPreference,
        loading,
        refreshPreferences,
        updateUnitsPreference,
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
