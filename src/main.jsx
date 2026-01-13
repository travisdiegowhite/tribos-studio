import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
