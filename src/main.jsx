import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { PostHogProvider } from 'posthog-js/react';
import { registerSW } from 'virtual:pwa-register';
import { initSentry } from './lib/sentry';
import App from './App.jsx';

// Initialize Sentry error tracking
initSentry();

// Register service worker with auto-update
// Network First strategy means users always get latest when online
registerSW({
  immediate: true,
  onRegistered(registration) {
    if (registration) {
      // Check for updates every 5 minutes
      setInterval(() => {
        registration.update().catch((error) => {
          // Silently handle update errors (network issues, etc.)
          console.debug('SW update check failed:', error.message);
        });
      }, 5 * 60 * 1000);
    }
  },
  onRegisterError(error) {
    console.error('SW registration failed:', error);
  },
});

const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: '2025-11-30',
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={posthogOptions}
    >
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </PostHogProvider>
  </StrictMode>
);
