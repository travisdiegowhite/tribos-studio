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
  /** Whether an iOS device needs home screen install first */
  needsHomeScreenInstall: boolean;
  /** Loading state during subscribe/unsubscribe */
  loading: boolean;
  /** Subscribe to push notifications (registers SW, requests permission, saves subscription) */
  subscribe: () => Promise<boolean>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): PushNotificationState {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

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
    if (!isSupported || !VAPID_PUBLIC_KEY) return false;
    if (needsHomeScreenInstall) return false;

    setLoading(true);
    try {
      // Register service worker (push-only, no precaching)
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return false;

      // Subscribe to push via PushManager
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        console.error('Push subscription missing required keys');
        return false;
      }

      // Save to backend via API endpoint
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('No auth session for push subscription');
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
        console.error('Failed to save push subscription:', await response.text());
        return false;
      }

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, needsHomeScreenInstall]);

  const unsubscribe = useCallback(async () => {
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
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    isSubscribed,
    isSupported,
    needsHomeScreenInstall,
    loading,
    subscribe,
    unsubscribe,
  };
}
