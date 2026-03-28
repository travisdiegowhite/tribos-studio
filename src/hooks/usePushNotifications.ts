import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

interface PushNotificationState {
  /** Current browser permission state */
  permission: NotificationPermission;
  /** Whether the user has an active push subscription */
  isSubscribed: boolean;
  /** Whether the browser supports push notifications */
  isSupported: boolean;
  /** Whether push is fully configured (VAPID key set) */
  isConfigured: boolean;
  /** Whether an iOS device needs home screen install first */
  needsHomeScreenInstall: boolean;
  /** Loading state during subscribe/unsubscribe */
  loading: boolean;
  /** Error message from last subscribe/unsubscribe attempt */
  error: string | null;
  /** Subscribe to push notifications (registers SW, requests permission, saves subscription) */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): PushNotificationState {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const isConfigured = !!VAPID_PUBLIC_KEY;

  // iOS Safari requires home screen installation before push works
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    typeof window !== 'undefined' &&
    ((window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches);
  const needsHomeScreenInstall = isIOS && !isStandalone;

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission);
    checkExistingSubscription();
  }, [isSupported]);

  async function checkExistingSubscription() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        setIsSubscribed(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }

  const subscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    if (!isSupported) {
      setError('Push notifications are not supported in this browser. Try Chrome, Edge, or Safari 16+.');
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      setError('Push notifications are not configured yet. VAPID key is missing — contact the admin.');
      return false;
    }

    if (needsHomeScreenInstall) {
      setError('On iOS, push notifications require the app to be installed to your home screen first.');
      return false;
    }

    setLoading(true);
    try {
      // Register service worker (push-only, no precaching)
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError(
          result === 'denied'
            ? 'Notification permission was denied. You\'ll need to re-enable it in your browser settings.'
            : 'Notification permission was dismissed. Click the button to try again.'
        );
        return false;
      }

      // Subscribe to push via PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('Browser returned an incomplete push subscription. Try again or use a different browser.');
        return false;
      }

      // Save to backend via API endpoint
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('You need to be logged in to enable notifications.');
        return false;
      }

      const apiBase = import.meta.env.PROD ? '' : 'http://localhost:3000';
      const response = await fetch(`${apiBase}/api/push-subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Failed to save push subscription:', text);
        setError('Failed to save subscription to server. Please try again.');
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      setError(`Push subscription failed: ${(err as Error).message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, needsHomeScreenInstall]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) return;

      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      // Notify backend
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const apiBase = import.meta.env.PROD ? '' : 'http://localhost:3000';
        await fetch(`${apiBase}/api/push-subscribe`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }

      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      setError(`Failed to unsubscribe: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    isSubscribed,
    isSupported,
    isConfigured,
    needsHomeScreenInstall,
    loading,
    error,
    subscribe,
    unsubscribe,
  };
}
