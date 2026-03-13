import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from '@dr.pogodin/react-helmet';
import { PostHogProvider } from 'posthog-js/react';
import { initSentry } from './lib/sentry';
import App from './App.jsx';

// Initialize Sentry error tracking
initSentry();

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
