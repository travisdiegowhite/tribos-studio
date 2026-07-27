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
  // Explicit even though modern defaults bundles imply it: guests stay
  // anonymous (no person rows) until posthog.identify() on auth.
  person_profiles: 'identified_only',
  // Local dev must not pollute production analytics. Opting out (rather than
  // skipping init) keeps usePostHog() and direct posthog-js imports working
  // without per-call "not initialized" warnings. The opt-out flag persists in
  // localhost storage, so a prod build previewed on localhost also stays quiet.
  ...(import.meta.env.DEV ? { opt_out_capturing_by_default: true } : {}),
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
