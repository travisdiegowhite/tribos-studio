import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Button,
  TextInput,
  NumberInput,
  Select,
  Divider,
  Box,
  Badge,
  Switch,
  Loader,
  Modal,
  Alert,
  List,
  ThemeIcon,
  Collapse,
  UnstyledButton,
  SimpleGrid,
  Tabs,
  Paper,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAlertTriangle, IconUpload, IconCheck, IconInfoCircle, IconSun, IconMoon, IconChevronDown, IconChevronRight, IconUser, IconBarbell, IconBike, IconPlugConnected, IconRoute, IconAdjustments, IconSparkles, IconDownload, IconTrash } from '@tabler/icons-react';
import { useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens, depth } from '../theme';
import AppShell from '../components/AppShell.jsx';
import ImportWizard from '../components/ImportWizard.jsx';
import BulkGpxUploadModal from '../components/BulkGpxUploadModal.jsx';
import { ConnectWithStravaButton, PoweredByStrava, STRAVA_ORANGE } from '../components/StravaBranding';
import { PoweredByGarmin } from '../components/GarminBranding';
import GarminConsentModal from '../components/settings/GarminConsentModal.jsx';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';
import { TIMEZONE_OPTIONS, getBrowserTimezone, getTimezoneOffset } from '../utils/timezoneUtils';
import { formatSpeed } from '../utils/units';
import PageHeader from '../components/PageHeader.jsx';
import RoadPreferencesCard from '../components/settings/RoadPreferencesCard.jsx';
import RunningProfileSettings from '../components/settings/RunningProfileSettings.jsx';
import IntegrationAlert from '../components/IntegrationAlert.jsx';
import { googleCalendarService } from '../utils/googleCalendarService';
import { IconBrandGoogle } from '@tabler/icons-react';
import { trackInteraction, EventType } from '../utils/activityTracking';

// Get the API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.PROD) {
    return ''; // Use relative URLs in production
  }
  return 'http://localhost:3000';
};

function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Tab state with URL parameter support
  const urlTab = searchParams.get('tab');
  const validTabs = ['profile', 'training', 'gear', 'integrations', 'routes', 'preferences'];
  const initialTab = validTabs.includes(urlTab) ? urlTab : 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [stravaStatus, setStravaStatus] = useState({ connected: false, loading: true });
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [speedProfile, setSpeedProfile] = useState(null);
  const [garminStatus, setGarminStatus] = useState({ connected: false, loading: true });
  const [garminWebhookStatus, setGarminWebhookStatus] = useState(null);
  const [garminSyncing, setGarminSyncing] = useState(false);
  const [garminRepairing, setGarminRepairing] = useState(false);
  const [garminRecovering, setGarminRecovering] = useState(false);
  const [garminDiagnosis, setGarminDiagnosis] = useState(null);
  const [garminBackfillingGps, setGarminBackfillingGps] = useState(false);
  const [garminBackfillingHistory, setGarminBackfillingHistory] = useState(false);
  const [garminBackfillStatus, setGarminBackfillStatus] = useState(null);
  const [wahooStatus, setWahooStatus] = useState({ connected: false, loading: true });
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState({ connected: false, loading: true, email: null });
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showStravaDisconnectModal, setShowStravaDisconnectModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showGarminReconnectModal, setShowGarminReconnectModal] = useState(false);
  const [showGarminConsentModal, setShowGarminConsentModal] = useState(false);
  const [aiConsentEnabled, setAiConsentEnabled] = useState(false);
  const [aiConsentLoading, setAiConsentLoading] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  // Activity maintenance state
  const [fullHistorySyncing, setFullHistorySyncing] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [duplicatePreview, setDuplicatePreview] = useState(null);
  const [findingDuplicates, setFindingDuplicates] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [timezone, setTimezone] = useState(() => getBrowserTimezone());
  const [ftp, setFtp] = useState(null);
  const [weightKg, setWeightKg] = useState(null);
  const [powerZones, setPowerZones] = useState(null);

  // Load profile data directly from Supabase
  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading profile:', error);
        } else if (data) {
          setDisplayName(data.display_name || '');
          setLocation(data.location || '');
          setBio(data.bio || '');
          setUnitsPreference(data.units_preference || 'imperial');
          setTimezone(data.timezone || getBrowserTimezone());
          setFtp(data.ftp || null);
          setWeightKg(data.weight_kg || null);
          setPowerZones(data.power_zones || null);
          setAiConsentEnabled(!!data.ai_consent_granted_at && !data.ai_consent_withdrawn_at);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  // Load Strava connection status and speed profile
  useEffect(() => {
    const loadStravaStatus = async () => {
      try {
        const status = await stravaService.getConnectionStatus();
        setStravaStatus({ ...status, loading: false });

        // Load speed profile if connected
        if (status.connected) {
          const profile = await stravaService.getSpeedProfile();
          setSpeedProfile(profile);
        }
      } catch (error) {
        console.error('Error loading Strava status:', error);
        setStravaStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadStravaStatus();
    }
  }, [user]);

  // Load Garmin connection status
  useEffect(() => {
    const loadGarminStatus = async () => {
      try {
        const status = await garminService.getConnectionStatus();
        setGarminStatus({ ...status, loading: false });

        // Also load backfill status if connected
        if (status.connected) {
          try {
            const backfillResult = await garminService.getBackfillStatus();
            setGarminBackfillStatus(backfillResult);
          } catch (err) {
            console.error('Error loading backfill status:', err);
          }
        }
      } catch (error) {
        console.error('Error loading Garmin status:', error);
        setGarminStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadGarminStatus();
    }
  }, [user]);

  // Load Wahoo connection status
  useEffect(() => {
    const loadWahooStatus = async () => {
      try {
        const status = await wahooService.getConnectionStatus();
        setWahooStatus({ ...status, loading: false });
      } catch (error) {
        console.error('Error loading Wahoo status:', error);
        setWahooStatus({ connected: false, loading: false });
      }
    };

    if (user) {
      loadWahooStatus();
    }
  }, [user]);

  // Load Google Calendar connection status
  useEffect(() => {
    const loadGoogleCalendarStatus = async () => {
      if (!googleCalendarService.isConfigured()) {
        setGoogleCalendarStatus({ connected: false, loading: false, email: null });
        return;
      }
      try {
        const status = await googleCalendarService.getConnectionStatus();
        setGoogleCalendarStatus({ connected: status.connected, loading: false, email: status.email || null });
      } catch (error) {
        console.error('Error loading Google Calendar status:', error);
        setGoogleCalendarStatus({ connected: false, loading: false, email: null });
      }
    };

    if (user) {
      loadGoogleCalendarStatus();
    }
  }, [user]);

  // Handle Google Calendar callback success
  useEffect(() => {
    if (searchParams.get('connected') === 'google-calendar') {
      setGoogleCalendarStatus({ connected: true, loading: false, email: null });
      notifications.show({
        title: 'Google Calendar Connected',
        message: 'Your Google Calendar is now linked. Busy times can be imported in Training Availability settings.',
        color: 'terracotta',
      });
      searchParams.delete('connected');
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Handle reconnect query parameter (from IntegrationAlert)
  useEffect(() => {
    if (searchParams.get('reconnect') === 'garmin') {
      setShowGarminReconnectModal(true);
      // Clear the query parameter
      searchParams.delete('reconnect');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          display_name: displayName,
          location: location,
          bio: bio,
          units_preference: unitsPreference,
          timezone: timezone,
          ftp: ftp || null,
          weight_kg: weightKg || null,
        })
        .select()
        .single();

      // Update local power zones from saved data (calculated by DB trigger)
      if (data?.power_zones) {
        setPowerZones(data.power_zones);
      }

      if (error) {
        console.error('Supabase error:', error);
        notifications.show({
          title: 'Error',
          message: error.message || 'Failed to update profile',
          color: 'red',
        });
      } else {
        trackInteraction(EventType.PROFILE_UPDATE, {
          hasDisplayName: !!displayName,
          hasLocation: !!location,
          unitsPreference: unitsPreference,
          ftpUpdated: !!ftp,
          weightUpdated: !!weightKg
        });

        notifications.show({
          title: 'Success',
          message: 'Profile updated successfully',
          color: 'sage',
        });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update profile',
        color: 'red',
      });
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // AI consent toggle
  const handleAiConsentToggle = async (enabled) => {
    setAiConsentLoading(true);
    try {
      const update = enabled
        ? { ai_consent_granted_at: new Date().toISOString(), ai_consent_withdrawn_at: null }
        : { ai_consent_withdrawn_at: new Date().toISOString() };

      const { error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', user.id);

      if (error) throw error;
      setAiConsentEnabled(enabled);
      notifications.show({
        title: enabled ? 'AI Features Enabled' : 'AI Features Disabled',
        message: enabled
          ? 'AI Coach and insights are now active.'
          : 'AI features have been turned off.',
        color: enabled ? 'sage' : 'gray',
      });
    } catch (err) {
      console.error('Error updating AI consent:', err);
      notifications.show({ title: 'Error', message: 'Failed to update AI preferences.', color: 'red' });
    } finally {
      setAiConsentLoading(false);
    }
  };

  // Data export
  const handleDataExport = async () => {
    setExportingData(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${getApiBaseUrl()}/api/data-export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }

      const exportData = await res.json();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tribos-data-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      notifications.show({ title: 'Export Complete', message: 'Your data has been downloaded.', color: 'sage' });
    } catch (err) {
      console.error('Error exporting data:', err);
      notifications.show({ title: 'Export Failed', message: err.message, color: 'red' });
    } finally {
      setExportingData(false);
    }
  };

  // Account deletion
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${getApiBaseUrl()}/api/account-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Deletion failed');
      }

      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Error deleting account:', err);
      notifications.show({ title: 'Deletion Failed', message: err.message, color: 'red' });
      setDeletingAccount(false);
    }
  };

  // OAuth handlers
  const connectStrava = () => {
    try {
      const authUrl = stravaService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Strava:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Strava',
        color: 'red',
      });
    }
  };

  const handleStravaDisconnectClick = () => {
    setShowStravaDisconnectModal(true);
  };

  const confirmStravaDisconnect = async () => {
    setShowStravaDisconnectModal(false);
    try {
      await stravaService.disconnect();
      setStravaStatus({ connected: false, loading: false });
      setSpeedProfile(null);
      trackInteraction(EventType.INTEGRATION_DISCONNECT, { provider: 'strava' });
      notifications.show({
        title: 'Disconnected',
        message: 'Strava has been disconnected and all Strava-synced activities have been removed',
        color: 'sage',
      });
    } catch (error) {
      console.error('Error disconnecting Strava:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Strava',
        color: 'red',
      });
    }
  };

  const syncStravaActivities = async () => {
    setStravaSyncing(true);
    try {
      notifications.show({
        id: 'strava-sync',
        title: 'Syncing Activities',
        message: 'Fetching your recent rides from Strava...',
        loading: true,
        autoClose: false
      });

      const result = await stravaService.syncAllActivities((progress) => {
        notifications.update({
          id: 'strava-sync',
          title: 'Syncing Activities',
          message: `Page ${progress.page}... ${progress.totalSynced} activities synced`,
          loading: true,
          autoClose: false
        });
      });

      // Reload speed profile
      const profile = await stravaService.getSpeedProfile();
      setSpeedProfile(profile);

      notifications.update({
        id: 'strava-sync',
        title: 'Sync Complete!',
        message: `Synced ${result.totalSynced} activities. Speed profile ${profile ? 'updated' : 'needs more data'}.`,
        color: 'terracotta',
        loading: false,
        autoClose: 5000
      });
    } catch (error) {
      console.error('Error syncing Strava:', error);
      notifications.update({
        id: 'strava-sync',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setStravaSyncing(false);
    }
  };

  // Full history sync from Strava (all pages, chunked to avoid timeout)
  const syncFullStravaHistory = async () => {
    setFullHistorySyncing(true);
    let totalFetched = 0;
    let totalStored = 0;
    let totalPages = 0;
    let startPage = 1;
    let reachedEnd = false;

    try {
      notifications.show({
        id: 'strava-full-sync',
        title: 'Full History Sync',
        message: 'Starting sync of your complete Strava history...',
        loading: true,
        autoClose: false
      });

      const headers = {};
      const session = await supabase.auth.getSession();
      if (session?.data?.session?.access_token) {
        headers.Authorization = `Bearer ${session.data.session.access_token}`;
      }

      // Process in chunks until we reach the end
      while (!reachedEnd) {
        notifications.update({
          id: 'strava-full-sync',
          title: 'Full History Sync',
          message: `Syncing pages ${startPage}-${startPage + 4}... (${totalFetched} activities so far)`,
          loading: true,
          autoClose: false
        });

        const response = await fetch(`${getApiBaseUrl()}/api/strava-activities`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          credentials: 'include',
          body: JSON.stringify({
            action: 'sync_all_activities',
            userId: user.id,
            startPage,
            pagesPerChunk: 5,
            importSource: 'strava_settings_sync'
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Sync failed');
        }

        totalFetched += result.totalFetched;
        totalStored += result.totalStored;
        totalPages += result.pagesProcessed;
        reachedEnd = result.reachedEnd;

        if (!reachedEnd && result.nextPage) {
          startPage = result.nextPage;
          // Small delay between chunks
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Handle rate limiting
        if (result.rateLimited) {
          notifications.update({
            id: 'strava-full-sync',
            title: 'Rate Limited',
            message: `Synced ${totalFetched} activities. Strava rate limit reached - try again in a few minutes.`,
            color: 'gold',
            loading: false,
            autoClose: 8000
          });
          setFullHistorySyncing(false);
          return;
        }
      }

      // Reload speed profile
      const profile = await stravaService.getSpeedProfile();
      setSpeedProfile(profile);

      notifications.update({
        id: 'strava-full-sync',
        title: 'Full Sync Complete!',
        message: `Imported ${totalFetched} activities (${totalStored} new/updated). ${totalPages} pages processed.`,
        color: 'terracotta',
        loading: false,
        autoClose: 8000
      });
    } catch (error) {
      console.error('Full sync error:', error);
      notifications.update({
        id: 'strava-full-sync',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync full history',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setFullHistorySyncing(false);
    }
  };

  // Find duplicate activities
  const findDuplicateActivities = async () => {
    setFindingDuplicates(true);
    try {
      const headers = {};
      const session = await supabase.auth.getSession();
      if (session?.data?.session?.access_token) {
        headers.Authorization = `Bearer ${session.data.session.access_token}`;
      }

      const response = await fetch(`${getApiBaseUrl()}/api/activity-cleanup?action=find-duplicates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to find duplicates');
      }

      setDuplicatePreview(result);

      if (result.duplicateGroups === 0) {
        notifications.show({
          title: 'No Duplicates Found',
          message: 'Your activity library is clean!',
          color: 'terracotta'
        });
      }
    } catch (error) {
      console.error('Find duplicates error:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to scan for duplicates',
        color: 'red'
      });
    } finally {
      setFindingDuplicates(false);
    }
  };

  // Clean up duplicate activities
  const cleanupDuplicateActivities = async () => {
    setCleaningDuplicates(true);
    try {
      notifications.show({
        id: 'cleanup-duplicates',
        title: 'Cleaning Up Duplicates',
        message: 'Merging data and removing duplicates...',
        loading: true,
        autoClose: false
      });

      const headers = {};
      const session = await supabase.auth.getSession();
      if (session?.data?.session?.access_token) {
        headers.Authorization = `Bearer ${session.data.session.access_token}`;
      }

      const response = await fetch(`${getApiBaseUrl()}/api/activity-cleanup?action=auto-cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Cleanup failed');
      }

      setDuplicatePreview(null);

      notifications.update({
        id: 'cleanup-duplicates',
        title: 'Cleanup Complete!',
        message: `Merged ${result.groupsMerged} duplicate groups. Removed ${result.activitiesDeleted} duplicate activities.`,
        color: 'terracotta',
        loading: false,
        autoClose: 8000
      });
    } catch (error) {
      console.error('Cleanup error:', error);
      notifications.update({
        id: 'cleanup-duplicates',
        title: 'Cleanup Failed',
        message: error.message || 'Failed to clean up duplicates',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const connectGarmin = async () => {
    if (!garminService.isConfigured()) {
      notifications.show({
        title: 'Not Configured',
        message: 'Garmin integration is not yet configured. Contact support.',
        color: 'gold',
      });
      return;
    }
    // Show consent modal before proceeding with OAuth
    setShowGarminConsentModal(true);
  };

  const handleGarminConsentConfirmed = async () => {
    setShowGarminConsentModal(false);
    try {
      // Record consent timestamp
      if (user?.id) {
        await supabase.from('user_profiles').update({
          garmin_data_consent_at: new Date().toISOString(),
        }).eq('id', user.id);
      }
      const authUrl = await garminService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Garmin:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Garmin',
        color: 'red',
      });
    }
  };

  const disconnectGarmin = async () => {
    try {
      await garminService.disconnect();
      setGarminStatus({ connected: false, loading: false });
      setGarminWebhookStatus(null);
      trackInteraction(EventType.INTEGRATION_DISCONNECT, { provider: 'garmin' });
      notifications.show({
        title: 'Disconnected',
        message: 'Garmin has been disconnected',
        color: 'sage',
      });
    } catch (error) {
      console.error('Error disconnecting Garmin:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Garmin',
        color: 'red',
      });
    }
  };

  const checkGarminWebhookStatus = async () => {
    try {
      const status = await garminService.getWebhookStatus();
      setGarminWebhookStatus(status.stats);
      console.log('Garmin Webhook Status:', status.stats);
    } catch (error) {
      console.error('Error checking Garmin webhook status:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to check webhook status',
        color: 'red',
      });
    }
  };

  const repairGarminConnection = async () => {
    setGarminRepairing(true);
    try {
      notifications.show({
        id: 'garmin-repair',
        title: 'Repairing Connection',
        message: 'Refreshing token and fetching Garmin User ID...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.repairConnection();

      if (result.success) {
        notifications.update({
          id: 'garmin-repair',
          title: 'Connection Repaired!',
          message: 'Token refreshed and User ID fetched successfully.',
          color: 'terracotta',
          loading: false,
          autoClose: 5000
        });
        // Refresh status
        await checkGarminWebhookStatus();
        const status = await garminService.getConnectionStatus();
        setGarminStatus({ ...status, loading: false });
      } else {
        notifications.update({
          id: 'garmin-repair',
          title: 'Repair Failed',
          message: result.error || 'Please try disconnecting and reconnecting.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error repairing Garmin connection:', error);
      notifications.update({
        id: 'garmin-repair',
        title: 'Repair Failed',
        message: error.message || 'Please try disconnecting and reconnecting.',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminRepairing(false);
    }
  };

  const recoverGarminActivities = async () => {
    setGarminRecovering(true);
    try {
      notifications.show({
        id: 'garmin-recover',
        title: 'Recovering Activities',
        message: 'Reprocessing failed webhook events...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.reprocessFailedEvents();

      if (result.success) {
        const reprocessed = result.reprocessed || 0;
        const skipped = result.skipped || 0;
        const message = reprocessed > 0
          ? `Recovered ${reprocessed} ${reprocessed === 1 ? 'activity' : 'activities'}.${skipped > 0 ? ` (${skipped} skipped)` : ''}`
          : result.message || 'No failed events to recover.';

        notifications.update({
          id: 'garmin-recover',
          title: reprocessed > 0 ? 'Recovery Complete!' : 'Up to Date',
          message,
          color: reprocessed > 0 ? 'terracotta' : 'teal',
          loading: false,
          autoClose: 5000
        });

        // Refresh webhook status
        await checkGarminWebhookStatus();
      } else {
        notifications.update({
          id: 'garmin-recover',
          title: 'Recovery Failed',
          message: result.error || 'Could not recover activities.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error recovering Garmin activities:', error);
      notifications.update({
        id: 'garmin-recover',
        title: 'Recovery Failed',
        message: error.message || 'Failed to recover activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminRecovering(false);
    }
  };

  const diagnoseGarmin = async () => {
    try {
      notifications.show({
        id: 'garmin-diagnose',
        title: 'Diagnosing',
        message: 'Checking database for activities and webhooks...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.diagnose();
      setGarminDiagnosis(result);

      notifications.update({
        id: 'garmin-diagnose',
        title: 'Diagnosis Complete',
        message: `Found ${result.activities?.count || 0} activities, ${result.webhookEvents?.count || 0} webhook events`,
        color: 'cyan',
        loading: false,
        autoClose: 3000
      });
    } catch (error) {
      console.error('Error diagnosing Garmin:', error);
      notifications.update({
        id: 'garmin-diagnose',
        title: 'Diagnosis Failed',
        message: error.message,
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    }
  };

  const syncGarminActivities = async () => {
    setGarminSyncing(true);
    try {
      notifications.show({
        id: 'garmin-sync',
        title: 'Syncing Garmin Activities',
        message: 'Fetching your recent activities from Garmin...',
        loading: true,
        autoClose: false
      });

      // Use direct API fetch to sync activities (more reliable than webhook backfill)
      // syncRecentActivities directly calls Garmin API instead of waiting for webhooks
      const result = await garminService.syncRecentActivities(30);

      if (result.success) {
        // Show detailed results from direct API fetch
        const storedCount = result.stored || 0;
        const cyclingCount = result.cyclingActivities || 0;
        const message = storedCount > 0
          ? `Synced ${storedCount} cycling ${storedCount === 1 ? 'activity' : 'activities'} from Garmin.`
          : cyclingCount === 0
            ? 'No new cycling activities found in the last 30 days.'
            : 'All activities already synced.';

        notifications.update({
          id: 'garmin-sync',
          title: storedCount > 0 ? 'Sync Complete!' : 'Up to Date',
          message,
          color: storedCount > 0 ? 'terracotta' : 'teal',
          loading: false,
          autoClose: 5000
        });
      } else {
        // API call failed
        notifications.update({
          id: 'garmin-sync',
          title: 'Sync Failed',
          message: result.error || 'Could not fetch activities from Garmin.',
          color: 'red',
          loading: false,
          autoClose: 8000
        });
      }

      // Refresh webhook status
      await checkGarminWebhookStatus();

    } catch (error) {
      console.error('Error syncing Garmin:', error);
      notifications.update({
        id: 'garmin-sync',
        title: 'Sync Failed',
        message: error.message || 'Failed to sync activities',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminSyncing(false);
    }
  };

  const backfillGarminGps = async () => {
    setGarminBackfillingGps(true);
    try {
      notifications.show({
        id: 'garmin-gps',
        title: 'Backfilling GPS Data',
        message: 'Downloading GPS tracks from Garmin FIT files...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.backfillGps(50);

      if (result.success) {
        const { stats } = result;
        let message = '';

        if (stats.success > 0) {
          message = `Updated ${stats.success} ${stats.success === 1 ? 'activity' : 'activities'} with GPS data.`;
        } else if (stats.total === 0) {
          message = 'All outdoor activities already have GPS data!';
        } else if (stats.triggeredBackfill > 0) {
          message = `Requested fresh GPS data from Garmin for ${stats.triggeredBackfill} activities. Run again in 2-3 minutes.`;
        } else {
          message = result.note || 'No GPS data could be extracted.';
        }

        notifications.update({
          id: 'garmin-gps',
          title: stats.success > 0 ? 'GPS Backfill Complete!' : 'GPS Backfill',
          message,
          color: stats.success > 0 ? 'terracotta' : stats.triggeredBackfill > 0 ? 'teal' : 'gold',
          loading: false,
          autoClose: 8000
        });
      } else {
        notifications.update({
          id: 'garmin-gps',
          title: 'GPS Backfill Failed',
          message: result.error || 'Could not backfill GPS data.',
          color: 'red',
          loading: false,
          autoClose: 5000
        });
      }
    } catch (error) {
      console.error('Error backfilling GPS:', error);
      notifications.update({
        id: 'garmin-gps',
        title: 'GPS Backfill Failed',
        message: error.message || 'Failed to backfill GPS data',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminBackfillingGps(false);
    }
  };

  const backfillGarminHistory = async () => {
    setGarminBackfillingHistory(true);
    try {
      notifications.show({
        id: 'garmin-history',
        title: 'Starting Historical Backfill',
        message: 'Requesting 2 years of activity history from Garmin in 2-month chunks...',
        loading: true,
        autoClose: false
      });

      const result = await garminService.backfillHistorical(2);

      if (result.success) {
        const { summary } = result;
        const message = summary.requested > 0
          ? `Queued ${summary.requested} chunks. Activities will arrive via webhooks over the next few minutes to hours.`
          : summary.alreadyProcessed > 0
            ? `All ${summary.alreadyProcessed} chunks already processed. Historical data should be available.`
            : result.message;

        notifications.update({
          id: 'garmin-history',
          title: 'Historical Backfill Started',
          message,
          color: 'terracotta',
          loading: false,
          autoClose: 10000
        });

        // Refresh backfill status
        await checkGarminBackfillStatus();
      } else {
        notifications.update({
          id: 'garmin-history',
          title: 'Backfill In Progress',
          message: result.message || 'A backfill is already in progress. Check status for details.',
          color: 'gold',
          loading: false,
          autoClose: 8000
        });

        // Refresh backfill status
        await checkGarminBackfillStatus();
      }
    } catch (error) {
      console.error('Error starting historical backfill:', error);
      notifications.update({
        id: 'garmin-history',
        title: 'Backfill Failed',
        message: error.message || 'Failed to start historical backfill',
        color: 'red',
        loading: false,
        autoClose: 5000
      });
    } finally {
      setGarminBackfillingHistory(false);
    }
  };

  const checkGarminBackfillStatus = async () => {
    try {
      const result = await garminService.getBackfillStatus();
      setGarminBackfillStatus(result);
      return result;
    } catch (error) {
      console.error('Error checking backfill status:', error);
      return null;
    }
  };

  const connectWahoo = () => {
    try {
      if (!wahooService.isConfigured()) {
        notifications.show({
          title: 'Not Configured',
          message: 'Wahoo integration is not yet configured. Contact support.',
          color: 'gold',
        });
        return;
      }
      const authUrl = wahooService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Wahoo:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Wahoo',
        color: 'red',
      });
    }
  };

  const disconnectWahoo = async () => {
    try {
      await wahooService.disconnect();
      setWahooStatus({ connected: false, loading: false });
      trackInteraction(EventType.INTEGRATION_DISCONNECT, { provider: 'wahoo' });
      notifications.show({
        title: 'Disconnected',
        message: 'Wahoo has been disconnected',
        color: 'sage',
      });
    } catch (error) {
      console.error('Error disconnecting Wahoo:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Wahoo',
        color: 'red',
      });
    }
  };

  const connectGoogleCalendar = () => {
    try {
      if (!googleCalendarService.isConfigured()) {
        notifications.show({
          title: 'Not Configured',
          message: 'Google Calendar integration requires a Google Client ID to be configured.',
          color: 'gold',
        });
        return;
      }
      const authUrl = googleCalendarService.getAuthorizationUrl();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error connecting to Google Calendar:', error);
      notifications.show({
        title: 'Error',
        message: error.message || 'Failed to connect to Google Calendar',
        color: 'red',
      });
    }
  };

  const disconnectGoogleCalendar = async () => {
    try {
      await googleCalendarService.disconnect();
      setGoogleCalendarStatus({ connected: false, loading: false, email: null });
      notifications.show({
        title: 'Disconnected',
        message: 'Google Calendar has been disconnected',
        color: 'sage',
      });
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to disconnect Google Calendar',
        color: 'red',
      });
    }
  };

  return (
    <AppShell>
      <ImportWizard opened={showImportWizard} onClose={() => setShowImportWizard(false)} />
      <BulkGpxUploadModal
        opened={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onUploadComplete={(results) => {
          if (results.success?.length > 0) {
            notifications.show({
              title: 'Import Complete',
              message: `Successfully imported ${results.success.length} activities`,
              color: 'sage',
            });
          }
        }}
      />

      {/* Strava Disconnect Confirmation Modal */}
      <Modal
        opened={showStravaDisconnectModal}
        onClose={() => setShowStravaDisconnectModal(false)}
        title={
          <Group gap="sm">
            <IconAlertTriangle size={24} color="terracotta" />
            <Text fw={600}>Disconnect Strava?</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <Alert color="terracotta" variant="light" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm" fw={500}>
              This action will permanently delete all your Strava-synced activities and speed profile data.
            </Text>
          </Alert>

          <Text size="sm">
            Due to Strava's API agreement, we are required to delete your Strava data when you disconnect.
            This includes all activities, route data, and calculated metrics.
          </Text>

          <Box
            style={{
              padding: tokens.spacing.md,
              backgroundColor: 'var(--tribos-bg-tertiary)',
              borderRadius: tokens.radius.md,
            }}
          >
            <Group gap="sm" mb="xs">
              <IconUpload size={18} color={'var(--tribos-terracotta-500)'} />
              <Text size="sm" fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                Want to keep your data?
              </Text>
            </Group>
            <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
              Before disconnecting, export your data from Strava and import it using the{' '}
              <Text
                component="span"
                style={{ color: 'var(--tribos-terracotta-500)', cursor: 'pointer' }}
                onClick={() => {
                  setShowStravaDisconnectModal(false);
                  setShowBulkUploadModal(true);
                }}
              >
                Bulk Import
              </Text>
              . This way your activities will remain available even after disconnecting Strava.
            </Text>
          </Box>

          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setShowStravaDisconnectModal(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={confirmStravaDisconnect}
            >
              Disconnect & Delete Data
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        opened={showDeleteAccountModal}
        onClose={() => { setShowDeleteAccountModal(false); setDeleteConfirmText(''); }}
        title="Delete Your Account"
        centered
        size="md"
      >
        <Stack gap="md">
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm" fw={500}>This action is permanent and cannot be undone.</Text>
          </Alert>
          <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
            Deleting your account will permanently remove:
          </Text>
          <List size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
            <List.Item>Your profile and preferences</List.Item>
            <List.Item>All activities and routes</List.Item>
            <List.Item>Training plans and workout history</List.Item>
            <List.Item>AI coach conversations</List.Item>
            <List.Item>Gear and component data</List.Item>
            <List.Item>Connected service tokens (Strava, Garmin, Wahoo)</List.Item>
          </List>
          <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
            Type <strong>DELETE</strong> below to confirm:
          </Text>
          <TextInput
            placeholder="Type DELETE to confirm"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => { setShowDeleteAccountModal(false); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={deleteConfirmText !== 'DELETE'}
              loading={deletingAccount}
              onClick={handleDeleteAccount}
            >
              Delete My Account
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Garmin Data Transfer Consent Modal */}
      <GarminConsentModal
        opened={showGarminConsentModal}
        onClose={() => setShowGarminConsentModal(false)}
        onConsent={handleGarminConsentConfirmed}
      />

      {/* Garmin Reconnect Modal */}
      <Modal
        opened={showGarminReconnectModal}
        onClose={() => setShowGarminReconnectModal(false)}
        title={
          <Group gap="sm">
            <IconAlertTriangle size={24} color="terracotta" />
            <Text fw={600}>Reconnect Garmin</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack gap="md">
          <Alert color="terracotta" variant="light" icon={<IconAlertTriangle size={18} />}>
            <Text size="sm" fw={500}>
              Your Garmin connection has expired or become invalid. Activities are not syncing.
            </Text>
          </Alert>

          <Text size="sm">
            This can happen when:
          </Text>
          <List size="sm" spacing="xs">
            <List.Item>Your Garmin refresh token expired (after ~90 days of inactivity)</List.Item>
            <List.Item>You changed your Garmin password</List.Item>
            <List.Item>You revoked app access in Garmin Connect settings</List.Item>
          </List>

          <Text size="sm" fw={500}>
            To fix this, you need to disconnect and reconnect your Garmin account.
            Your existing activities will not be affected.
          </Text>

          <Group justify="flex-end" gap="sm" mt="md">
            <Button
              variant="subtle"
              color="gray"
              onClick={() => setShowGarminReconnectModal(false)}
            >
              Later
            </Button>
            {garminStatus.connected ? (
              <Button
                color="terracotta"
                onClick={async () => {
                  setShowGarminReconnectModal(false);
                  await disconnectGarmin();
                  // Small delay then start connection
                  setTimeout(() => connectGarmin(), 500);
                }}
              >
                Reconnect Now
              </Button>
            ) : (
              <Button
                color="sage"
                onClick={() => {
                  setShowGarminReconnectModal(false);
                  connectGarmin();
                }}
              >
                Connect Garmin
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>

      <Container size="md" py="lg">
        <Stack gap="xl">
          <PageHeader
            title="Settings"
            subtitle="Manage your profile and connected services"
            actions={
              <Button
                variant="gradient"
                gradient={{ from: 'terracotta', to: 'teal', deg: 90 }}
                onClick={() => setShowImportWizard(true)}
              >
                Import Wizard
              </Button>
            }
          />

          <Tabs value={activeTab} onChange={setActiveTab} color="terracotta" variant="pills">
            <Paper
              withBorder
              radius="xl"
              p="xs"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: depth.panel.background,
                boxShadow: depth.panel.boxShadow,
                border: '1px solid var(--tribos-border-default)',
              }}
            >
              <Tabs.List grow={!isMobile} justify={isMobile ? 'center' : undefined}>
                <Tabs.Tab value="profile" leftSection={<IconUser size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Profile'}
                </Tabs.Tab>
                <Tabs.Tab value="training" leftSection={<IconBarbell size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Training'}
                </Tabs.Tab>
                <Tabs.Tab value="gear" leftSection={<IconBike size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Gear'}
                </Tabs.Tab>
                <Tabs.Tab value="integrations" leftSection={<IconPlugConnected size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Integrations'}
                </Tabs.Tab>
                <Tabs.Tab value="routes" leftSection={<IconRoute size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Routes'}
                </Tabs.Tab>
                <Tabs.Tab value="preferences" leftSection={<IconAdjustments size={isMobile ? 20 : 18} />}>
                  {!isMobile && 'Preferences'}
                </Tabs.Tab>
              </Tabs.List>
            </Paper>

            <Box mt="md">
              {/* Profile Tab */}
              <Tabs.Panel value="profile">
                <Stack gap="md">

          {/* Profile Settings */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Profile
              </Title>

              <TextInput
                label="Display Name"
                placeholder="Your display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />

              <TextInput
                label="Email"
                value={user?.email || ''}
                disabled
                description="Email cannot be changed"
              />

              <TextInput
                label="Location"
                placeholder="City, State"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />

              <TextInput
                label="Bio"
                placeholder="Tell us about yourself"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />

              <Select
                label="Units Preference"
                value={unitsPreference}
                onChange={setUnitsPreference}
                data={[
                  { value: 'metric', label: 'Metric (km, kg)' },
                  { value: 'imperial', label: 'Imperial (mi, lbs)' },
                ]}
              />

              <Select
                label="Timezone"
                description="Used for training calendar and workout scheduling"
                placeholder="Select your timezone"
                value={timezone}
                onChange={setTimezone}
                data={TIMEZONE_OPTIONS}
                searchable
                nothingFoundMessage="No timezone found"
                maxDropdownHeight={300}
              />
              {timezone && (
                <Text size="xs" c="dimmed" mt="-xs">
                  Current offset: {getTimezoneOffset(timezone)}
                </Text>
              )}

              <Button color="terracotta" onClick={handleSaveProfile} loading={loading}>
                Save Changes
              </Button>
            </Stack>
          </Card>

                </Stack>
              </Tabs.Panel>

              {/* Training Tab */}
              <Tabs.Panel value="training">
                <Stack gap="md">

          {/* Training & Power */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Training & Power
              </Title>
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                Set your FTP to calculate personalized power zones
              </Text>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <NumberInput
                  label="FTP (Functional Threshold Power)"
                  description="Your 1-hour max sustainable power in watts"
                  placeholder="e.g., 250"
                  value={ftp || ''}
                  onChange={(val) => setFtp(val || null)}
                  min={50}
                  max={600}
                  suffix=" W"
                />
                <NumberInput
                  label="Weight"
                  description="For W/kg calculations"
                  placeholder={unitsPreference === 'imperial' ? 'e.g., 165' : 'e.g., 75'}
                  value={unitsPreference === 'imperial' && weightKg ? Math.round(weightKg * 2.20462) : (weightKg || '')}
                  onChange={(val) => {
                    if (val) {
                      setWeightKg(unitsPreference === 'imperial' ? val / 2.20462 : val);
                    } else {
                      setWeightKg(null);
                    }
                  }}
                  min={30}
                  max={200}
                  suffix={unitsPreference === 'imperial' ? ' lbs' : ' kg'}
                  decimalScale={1}
                />
              </SimpleGrid>

              {ftp && weightKg && (
                <Box
                  style={{
                    padding: tokens.spacing.sm,
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                    borderRadius: tokens.radius.sm,
                  }}
                >
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Your W/kg: <Text component="span" fw={700} style={{ color: 'var(--tribos-terracotta-500)' }}>
                      {(ftp / weightKg).toFixed(2)} W/kg
                    </Text>
                  </Text>
                </Box>
              )}

              {powerZones && (
                <Box>
                  <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }} mb="xs">
                    Your Power Zones
                  </Text>
                  <Stack gap="xs">
                    {['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'].map((zoneKey, index) => {
                      const zone = powerZones[zoneKey];
                      if (!zone) return null;
                      const zoneColors = [
                        tokens.colors.zone1,
                        tokens.colors.zone2,
                        tokens.colors.zone3,
                        tokens.colors.zone4,
                        tokens.colors.zone5,
                        tokens.colors.zone6,
                        tokens.colors.zone7,
                      ];
                      return (
                        <Group key={zoneKey} gap="sm" wrap="nowrap">
                          <Badge
                            size="sm"
                            style={{ backgroundColor: zoneColors[index], minWidth: 35 }}
                          >
                            Z{index + 1}
                          </Badge>
                          <Text size="sm" style={{ color: 'var(--tribos-text-primary)', minWidth: 100 }}>
                            {zone.name}
                          </Text>
                          <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                            {zone.min}{zone.max ? `-${zone.max}` : '+'} W
                          </Text>
                        </Group>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {!ftp && (
                <Box
                  style={{
                    padding: tokens.spacing.md,
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                    borderRadius: tokens.radius.md,
                    textAlign: 'center',
                  }}
                >
                  <Text size="sm" style={{ color: 'var(--tribos-text-muted)' }}>
                    Enter your FTP above to see your personalized power zones.
                    Not sure of your FTP? Try a 20-minute all-out effort and multiply by 0.95.
                  </Text>
                </Box>
              )}

              <Button color="terracotta" onClick={handleSaveProfile} loading={loading}>
                Save Training Settings
              </Button>
            </Stack>
          </Card>

          {/* Running Profile */}
          <RunningProfileSettings />

                </Stack>
              </Tabs.Panel>

              {/* Gear Tab */}
              <Tabs.Panel value="gear">
                <Stack gap="md">

          {/* Gear Management */}
          <Card>
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  Gear
                </Title>
                <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                  Track mileage and maintenance for your bikes and running shoes
                </Text>
              </Stack>
              <Button
                component={Link}
                to="/gear"
                variant="light"
              >
                Manage Gear
              </Button>
            </Group>
          </Card>

                </Stack>
              </Tabs.Panel>

              {/* Integrations Tab */}
              <Tabs.Panel value="integrations">
                <Stack gap="md">

          {/* Connected Services */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Connected Services
              </Title>
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                Connect your cycling platforms to sync activities automatically
              </Text>

              {/* Integration Alert - shows if Garmin needs reconnection */}
              <IntegrationAlert />

              <Divider />

              {/* Strava Info Box */}
              <Alert
                icon={<IconInfoCircle size={18} />}
                title="About Strava Integration"
                color="teal"
                variant="light"
              >
                <Stack gap="xs">
                  <Text size="sm">
                    You can connect Strava to sync your ride history. However, due to Strava's API terms,
                    <strong> disconnecting will permanently delete all Strava-synced activities</strong>.
                  </Text>
                  <Text size="sm" fw={500}>
                    Recommended: Export your data from Strava and use bulk import instead:
                  </Text>
                  <List size="sm" spacing="xs">
                    <List.Item icon={<ThemeIcon color="sage" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Your data stays even if you disconnect Strava later
                    </List.Item>
                    <List.Item icon={<ThemeIcon color="sage" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Full historical data with GPS tracks and power data
                    </List.Item>
                    <List.Item icon={<ThemeIcon color="sage" size={20} radius="xl"><IconCheck size={12} /></ThemeIcon>}>
                      Not subject to Strava's API restrictions
                    </List.Item>
                  </List>
                  <Text size="xs" c="dimmed">
                    To export: Go to Strava.com → Settings → My Account → Download or Delete Your Account → Request Your Archive
                  </Text>
                  <Button
                    variant="light"
                    color="terracotta"
                    size="sm"
                    leftSection={<IconUpload size={16} />}
                    onClick={() => setShowBulkUploadModal(true)}
                    mt="xs"
                  >
                    Bulk Import from Strava Export
                  </Button>
                </Stack>
              </Alert>

              <ServiceConnection
                name="Strava"
                icon="🟠"
                connected={stravaStatus.connected}
                username={stravaStatus.username}
                loading={stravaStatus.loading}
                onConnect={connectStrava}
                onDisconnect={handleStravaDisconnectClick}
                onSync={syncStravaActivities}
                syncing={stravaSyncing}
                speedProfile={speedProfile}
                unitsPreference={unitsPreference}
              />

              <Divider />

              <ServiceConnection
                name="Garmin Connect"
                icon="🔵"
                connected={garminStatus.connected}
                username={garminStatus.username}
                loading={garminStatus.loading}
                onConnect={connectGarmin}
                onDisconnect={disconnectGarmin}
                onSync={syncGarminActivities}
                syncing={garminSyncing}
                onCheckWebhook={checkGarminWebhookStatus}
                webhookStatus={garminWebhookStatus}
                onRepair={repairGarminConnection}
                repairing={garminRepairing}
                onRecover={recoverGarminActivities}
                recovering={garminRecovering}
                onDiagnose={diagnoseGarmin}
                diagnosis={garminDiagnosis}
                onBackfillGps={backfillGarminGps}
                backfillingGps={garminBackfillingGps}
                onBackfillHistory={backfillGarminHistory}
                backfillingHistory={garminBackfillingHistory}
                backfillStatus={garminBackfillStatus}
                unitsPreference={unitsPreference}
              />

              <Divider />

              <ServiceConnection
                name="Wahoo"
                icon="🔷"
                connected={wahooStatus.connected}
                username={wahooStatus.username}
                loading={wahooStatus.loading}
                onConnect={connectWahoo}
                onDisconnect={disconnectWahoo}
                unitsPreference={unitsPreference}
              />

              <Divider />

              {/* Google Calendar */}
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group>
                    <Text size="xl">📅</Text>
                    <Box>
                      <Text style={{ color: 'var(--tribos-text-primary)' }}>Google Calendar</Text>
                      {googleCalendarStatus.connected && googleCalendarStatus.email && (
                        <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                          Connected as {googleCalendarStatus.email}
                        </Text>
                      )}
                    </Box>
                  </Group>
                  <Group>
                    <Badge color="gold" variant="light">
                      Coming Soon
                    </Badge>
                  </Group>
                </Group>
                <Box style={{ marginLeft: '2.5rem' }}>
                  <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                    Google Calendar integration is coming soon. Connect your calendar to automatically detect busy days for schedule-aware training plans.
                  </Text>
                </Box>
              </Stack>

              {/* Activity Maintenance - Merged into Connected Services */}
              <Divider label="Activity Maintenance" labelPosition="center" />

              {/* Full History Sync */}
              {stravaStatus.connected && (
                <Box
                  style={{
                    backgroundColor: 'var(--tribos-bg-tertiary)',
                    padding: tokens.spacing.md,
                    borderRadius: tokens.radius.sm
                  }}
                >
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Group gap="xs" mb={4}>
                        <Text size="xl">📚</Text>
                        <Text fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                          Full Strava History Sync
                        </Text>
                      </Group>
                      <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                        Import your complete Strava history (all years). Regular sync imports ~2000 max.
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      color="terracotta"
                      variant="light"
                      onClick={syncFullStravaHistory}
                      loading={fullHistorySyncing}
                      disabled={fullHistorySyncing}
                    >
                      {fullHistorySyncing ? 'Syncing...' : 'Sync Full History'}
                    </Button>
                  </Group>
                </Box>
              )}

              {/* Duplicate Cleanup */}
              <Box
                style={{
                  backgroundColor: 'var(--tribos-bg-tertiary)',
                  padding: tokens.spacing.md,
                  borderRadius: tokens.radius.sm
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Box>
                      <Group gap="xs" mb={4}>
                        <Text size="xl">🔍</Text>
                        <Text fw={500} style={{ color: 'var(--tribos-text-primary)' }}>
                          Duplicate Activity Cleanup
                        </Text>
                      </Group>
                      <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                        Find and merge duplicate activities (e.g., same ride from Garmin and Strava).
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      color="teal"
                      variant="light"
                      onClick={findDuplicateActivities}
                      loading={findingDuplicates}
                      disabled={findingDuplicates || cleaningDuplicates}
                    >
                      {findingDuplicates ? 'Scanning...' : 'Scan for Duplicates'}
                    </Button>
                  </Group>

                  {/* Duplicate Preview */}
                  {duplicatePreview && duplicatePreview.duplicateGroups > 0 && (
                    <Alert color="gold" variant="light" mt="sm">
                      <Stack gap="xs">
                        <Text size="sm" fw={500}>
                          Found {duplicatePreview.duplicateGroups} duplicate groups ({duplicatePreview.totalDuplicates} extra activities)
                        </Text>
                        <Text size="xs" c="dimmed">
                          {duplicatePreview.totalActivities} total activities in your library
                        </Text>
                        <Button
                          size="sm"
                          color="red"
                          variant="light"
                          onClick={cleanupDuplicateActivities}
                          loading={cleaningDuplicates}
                          disabled={cleaningDuplicates}
                          mt="xs"
                        >
                          {cleaningDuplicates ? 'Cleaning...' : 'Clean Up Duplicates'}
                        </Button>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Card>

                </Stack>
              </Tabs.Panel>

              {/* Routes Tab */}
              <Tabs.Panel value="routes">
                <Stack gap="md">

          {/* Route Learning */}
          <RoadPreferencesCard />

                </Stack>
              </Tabs.Panel>

              {/* Preferences Tab */}
              <Tabs.Panel value="preferences">
                <Stack gap="md">

          {/* Preferences */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Preferences
              </Title>

              {/* Theme Toggle */}
              <Group justify="space-between">
                <Box>
                  <Text style={{ color: 'var(--tribos-text-primary)' }}>Appearance</Text>
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Choose your preferred color theme
                  </Text>
                </Box>
                <Group gap="xs">
                  <Button
                    variant={colorScheme === 'dark' ? 'filled' : 'light'}
                    color={colorScheme === 'dark' ? 'terracotta' : 'gray'}
                    size="sm"
                    leftSection={<IconMoon size={16} />}
                    onClick={() => setColorScheme('dark')}
                  >
                    Dark
                  </Button>
                  <Button
                    variant={colorScheme === 'light' ? 'filled' : 'light'}
                    color={colorScheme === 'light' ? 'terracotta' : 'gray'}
                    size="sm"
                    leftSection={<IconSun size={16} />}
                    onClick={() => setColorScheme('light')}
                  >
                    Light
                  </Button>
                </Group>
              </Group>

              <Divider />

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: 'var(--tribos-text-primary)' }}>Email Notifications</Text>
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Receive weekly training summaries
                  </Text>
                </Box>
                <Switch color="gray" />
              </Group>

              <Divider />

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: 'var(--tribos-text-primary)' }}>Auto-sync Activities</Text>
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Automatically import new activities
                  </Text>
                </Box>
                <Switch color="gray" defaultChecked />
              </Group>
            </Stack>
          </Card>

          {/* AI Features */}
          <Card>
            <Stack gap="md">
              <Group gap="xs">
                <IconSparkles size={20} color="var(--tribos-terracotta-500)" />
                <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                  AI Features
                </Title>
              </Group>

              <Group justify="space-between">
                <Box style={{ flex: 1 }}>
                  <Text style={{ color: 'var(--tribos-text-primary)' }}>AI Coach & Insights</Text>
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Enable AI-powered coaching, training insights, and route suggestions.
                    Your data is processed by Anthropic's Claude AI.{' '}
                    <Link to="/privacy#ai" style={{ color: 'var(--tribos-terracotta-500)' }}>
                      Learn more
                    </Link>
                  </Text>
                </Box>
                <Switch
                  color="terracotta"
                  checked={aiConsentEnabled}
                  disabled={aiConsentLoading}
                  onChange={(e) => handleAiConsentToggle(e.currentTarget.checked)}
                />
              </Group>
            </Stack>
          </Card>

          {/* Account Actions */}
          <Card>
            <Stack gap="md">
              <Title order={3} style={{ color: 'var(--tribos-text-primary)' }}>
                Account
              </Title>

              <Group justify="space-between">
                <Box>
                  <Text style={{ color: 'var(--tribos-text-primary)' }}>Export My Data</Text>
                  <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Download all your data as JSON
                  </Text>
                </Box>
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<IconDownload size={16} />}
                  loading={exportingData}
                  onClick={handleDataExport}
                >
                  Export
                </Button>
              </Group>

              <Divider />

              <Button variant="outline" color="gray" onClick={handleSignOut}>
                Sign Out
              </Button>

              <Button
                variant="outline"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() => setShowDeleteAccountModal(true)}
              >
                Delete My Account
              </Button>
            </Stack>
          </Card>

                </Stack>
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Stack>
      </Container>
    </AppShell>
  );
}

function ServiceConnection({ name, icon, connected, username, loading, onConnect, onDisconnect, onSync, syncing, speedProfile, onCheckWebhook, webhookStatus, onRepair, repairing, onRecover, recovering, onDiagnose, diagnosis, onBackfillGps, backfillingGps, onBackfillHistory, backfillingHistory, backfillStatus, unitsPreference }) {
  const isStrava = name === 'Strava';
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  if (loading) {
    return (
      <Group justify="space-between">
        <Group>
          <Text size="xl">{icon}</Text>
          <Text style={{ color: 'var(--tribos-text-primary)' }}>{name}</Text>
        </Group>
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Group>
          <Text size="xl">{icon}</Text>
          <Box>
            <Text style={{ color: 'var(--tribos-text-primary)' }}>{name}</Text>
            {connected && username && (
              <Text size="sm" style={{ color: 'var(--tribos-text-secondary)' }}>
                Connected as {username}
              </Text>
            )}
          </Box>
        </Group>
        <Group>
          {connected ? (
            <>
              <Badge color="sage" variant="light">
                Connected
              </Badge>
              <Button variant="subtle" color="red" size="sm" onClick={onDisconnect}>
                Disconnect
              </Button>
            </>
          ) : isStrava ? (
            <ConnectWithStravaButton onClick={onConnect} />
          ) : (
            <Button variant="outline" color="terracotta" size="sm" onClick={onConnect}>
              Connect
            </Button>
          )}
        </Group>
      </Group>

      {/* Sync Activities Button */}
      {connected && onSync && (
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                Activity Sync
              </Text>
              {speedProfile ? (
                <Stack gap={4}>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    {speedProfile.rides_analyzed} rides analyzed • Avg: {formatSpeed(speedProfile.average_speed, unitsPreference === 'imperial')}
                  </Text>
                  {isStrava && <PoweredByStrava variant="light" size="sm" />}
                  {name === 'Garmin Connect' && <PoweredByGarmin variant="light" size="sm" />}
                </Stack>
              ) : (
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  {onCheckWebhook ? 'Sync last 90 days of activities' : 'Sync recent activities (for full history, see Activity Maintenance below)'}
                </Text>
              )}
            </Box>
            <Button
              size="xs"
              color="terracotta"
              variant="light"
              onClick={onSync}
              loading={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Activities'}
            </Button>
          </Group>
        </Box>
      )}

      {/* GPS Backfill (for Garmin when connected) */}
      {connected && onBackfillGps && (
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Group justify="space-between" align="flex-start">
            <Box>
              <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                GPS Data
              </Text>
              <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                Download GPS tracks for activities missing map data
              </Text>
            </Box>
            <Button
              size="xs"
              color="cyan"
              variant="light"
              onClick={onBackfillGps}
              loading={backfillingGps}
            >
              {backfillingGps ? 'Downloading...' : 'Backfill GPS'}
            </Button>
          </Group>
        </Box>
      )}

      {/* Historical Backfill (for Garmin when connected) */}
      {connected && onBackfillHistory && (
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  Historical Data (2 Years)
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  Import all activities from the past 2 years in small chunks
                </Text>
              </Box>
              <Button
                size="xs"
                color="mauve"
                variant="light"
                onClick={onBackfillHistory}
                loading={backfillingHistory}
              >
                {backfillingHistory ? 'Starting...' : 'Import History'}
              </Button>
            </Group>
            {backfillStatus?.initialized && (
              <Box
                style={{
                  backgroundColor: 'var(--tribos-bg-secondary)',
                  padding: tokens.spacing.xs,
                  borderRadius: tokens.radius.xs,
                  fontSize: '12px'
                }}
              >
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Progress:</Text>
                    <Text size="xs" style={{ color: backfillStatus.progress?.percentComplete === 100 ? 'var(--tribos-terracotta-500)' : 'var(--tribos-text-primary)' }}>
                      {backfillStatus.progress?.percentComplete || 0}% ({backfillStatus.progress?.received + backfillStatus.progress?.alreadyProcessed || 0}/{backfillStatus.progress?.total || 0} chunks)
                    </Text>
                  </Group>
                  {backfillStatus.progress?.requested > 0 && (
                    <Group gap="xs">
                      <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Waiting:</Text>
                      <Text size="xs" style={{ color: '#9E5A3C' }}>
                        {backfillStatus.progress.requested} chunks pending from Garmin
                      </Text>
                    </Group>
                  )}
                  {backfillStatus.progress?.activitiesReceived > 0 && (
                    <Group gap="xs">
                      <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Activities:</Text>
                      <Text size="xs" style={{ color: 'var(--tribos-terracotta-500)' }}>
                        {backfillStatus.progress.activitiesReceived} received
                      </Text>
                    </Group>
                  )}
                  {backfillStatus.progress?.failed > 0 && (
                    <Text size="xs" style={{ color: 'red' }}>
                      {backfillStatus.progress.failed} chunks failed - retry by clicking Import History again
                    </Text>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {/* Webhook Status (for Garmin when connected) */}
      {connected && onCheckWebhook && (
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  Webhook Status
                </Text>
                <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                  Auto-sync when you complete rides
                </Text>
              </Box>
              <Button
                size="xs"
                color="cyan"
                variant="light"
                onClick={onCheckWebhook}
              >
                Check Status
              </Button>
            </Group>
            {webhookStatus && (
              <Box
                style={{
                  backgroundColor: 'var(--tribos-bg-secondary)',
                  padding: tokens.spacing.xs,
                  borderRadius: tokens.radius.xs,
                  fontSize: '12px'
                }}
              >
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Garmin User ID:</Text>
                    <Text size="xs" style={{ color: webhookStatus.integration?.hasGarminUserId ? 'var(--tribos-terracotta-500)' : 'red' }}>
                      {webhookStatus.integration?.hasGarminUserId ? '✓ Set' : '✗ Missing'}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Token Valid:</Text>
                    <Text size="xs" style={{ color: webhookStatus.integration?.tokenValid ? 'var(--tribos-terracotta-500)' : 'red' }}>
                      {webhookStatus.integration?.tokenValid ? '✓ Yes' : '✗ Expired'}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>Webhooks Received:</Text>
                    <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                      {webhookStatus.webhookStats?.totalEvents || 0}
                    </Text>
                  </Group>
                  {webhookStatus.troubleshooting?.length > 0 && (
                    <Box style={{ marginTop: 4 }}>
                      {webhookStatus.troubleshooting.map((tip, i) => (
                        <Text key={i} size="xs" style={{ color: '#9E5A3C' }}>
                          {tip}
                        </Text>
                      ))}
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </Box>
      )}

      {/* Collapsible Advanced Diagnostics (for Garmin when connected) */}
      {connected && (onRepair || onRecover || onDiagnose) && (
        <Box
          style={{
            backgroundColor: 'var(--tribos-bg-tertiary)',
            padding: tokens.spacing.sm,
            borderRadius: tokens.radius.sm,
            marginLeft: '2.5rem'
          }}
        >
          <UnstyledButton
            onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
            }}
          >
            {diagnosticsOpen ? (
              <IconChevronDown size={16} color="var(--tribos-text-secondary)" />
            ) : (
              <IconChevronRight size={16} color="var(--tribos-text-secondary)" />
            )}
            <Text size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
              Advanced Diagnostics
            </Text>
          </UnstyledButton>
          <Collapse in={diagnosticsOpen}>
            <Stack gap="xs" mt="sm">
              {onRepair && (
                <Button
                  size="xs"
                  variant="outline"
                  color="gold"
                  onClick={onRepair}
                  loading={repairing}
                >
                  🔧 Repair Connection
                </Button>
              )}
              {onRecover && (
                <Button
                  size="xs"
                  variant="outline"
                  color="terracotta"
                  onClick={onRecover}
                  loading={recovering}
                >
                  🔄 Recover Failed Events
                </Button>
              )}
              {onDiagnose && (
                <Button
                  size="xs"
                  variant="outline"
                  color="mauve"
                  onClick={onDiagnose}
                >
                  🔍 Diagnose Sync Issues
                </Button>
              )}
              {diagnosis && (
                <Box
                  style={{
                    backgroundColor: 'var(--tribos-bg-secondary)',
                    padding: tokens.spacing.sm,
                    borderRadius: tokens.radius.sm,
                    fontSize: '11px',
                    maxHeight: '300px',
                    overflow: 'auto'
                  }}
                >
                  <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)', marginBottom: 4 }}>
                    Diagnosis Results:
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-terracotta-500)' }}>
                    Activities in DB: {diagnosis.activities?.count || 0}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    Webhook Events: {diagnosis.summary?.totalWebhooks || 0}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    • PUSH events: {diagnosis.summary?.pushEvents || 0}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    • PING events: {diagnosis.summary?.pingEvents || 0}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    • With errors: {diagnosis.summary?.withErrors || 0}
                  </Text>
                  <Text size="xs" style={{ color: 'var(--tribos-text-secondary)' }}>
                    • Imported: {diagnosis.summary?.imported || 0}
                  </Text>
                  {diagnosis.webhookEvents?.analysis?.length > 0 && (
                    <>
                      <Text size="xs" fw={600} style={{ color: 'var(--tribos-text-primary)', marginTop: 8 }}>
                        Recent Events:
                      </Text>
                      {diagnosis.webhookEvents.analysis.slice(0, 5).map((event, i) => (
                        <Box key={i} style={{ marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${event.error ? 'red' : 'var(--tribos-terracotta-500)'}` }}>
                          <Text size="xs" style={{ color: 'var(--tribos-text-primary)' }}>
                            {event.activityName || event.activity_id || 'Unknown'} - {event.activityType || 'N/A'}
                          </Text>
                          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                            {event.dataSource} | {event.distance || 'No distance'}
                          </Text>
                          {event.error && (
                            <Text size="xs" style={{ color: 'red' }}>
                              Error: {event.error}
                            </Text>
                          )}
                        </Box>
                      ))}
                    </>
                  )}
                </Box>
              )}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}

export default Settings;
