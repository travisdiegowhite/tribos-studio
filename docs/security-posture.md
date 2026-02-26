# Security Posture — tribos.studio

Last updated: February 2026

## 1. Authentication & Authorization

- **Provider**: Supabase Auth (backed by GoTrue)
- **Methods**: Email/password, Google OAuth 2.0
- **Session management**: JWTs issued by Supabase; short-lived access tokens with refresh rotation
- **Row-Level Security (RLS)**: Enabled on all user-facing tables. Policies enforce `auth.uid() = user_id` for reads and writes
- **Service role key**: Used server-side only (Vercel serverless functions); never exposed to the browser
- **Anon key validation**: The frontend Supabase client validates at initialization that the configured key has the `anon` role

## 2. Token Storage

### Supabase Session Tokens
- Stored in browser `localStorage` by the Supabase JS client
- Access tokens are short-lived; refresh tokens are rotated on use

### Third-Party OAuth Tokens
- **Strava**: OAuth 2.0 tokens stored in `user_profiles` table (server-side only via service role)
- **Garmin**: OAuth 2.0 tokens stored encrypted in `user_profiles`; refreshed via `/api/garmin-token-maintenance` cron (every 6 hours)
- **Wahoo**: OAuth 2.0 tokens stored in `user_profiles`
- **Google Calendar**: OAuth 2.0 tokens stored in `user_profiles`

All third-party tokens are accessible only through server-side API routes using the Supabase service role key. RLS prevents any client-side access to token columns.

## 3. Transport Security

- **HTTPS everywhere**: Vercel enforces HTTPS on all endpoints with automatic TLS certificates
- **API routes**: All `/api/*` endpoints are served over HTTPS via Vercel's edge network
- **Supabase**: All database connections use TLS
- **Third-party APIs**: All external API calls (Strava, Garmin, Wahoo, Anthropic, Mapbox, etc.) use HTTPS

## 4. Webhook Security

### Garmin Webhooks
- **Cloudflare Worker proxy**: Garmin webhook events are received by a Cloudflare Worker (`cloudflare-workers/garmin-webhook/`)
- **HMAC verification**: Events are verified using HMAC-SHA256 with the Garmin consumer secret before storage
- **Store-and-respond pattern**: Events are stored in a queue table and processed asynchronously by `/api/garmin-webhook-process` (cron, every minute)
- **Replay protection**: Duplicate event detection prevents reprocessing

### Strava Webhooks
- **Verification token**: Strava webhooks are validated using a shared verification token
- **Event processing**: Events are processed inline with user token validation

### Resend Webhooks
- **Signature verification**: Email delivery webhooks from Resend are verified using webhook signatures

## 5. Database Security

- **Row-Level Security (RLS)**: All tables have RLS policies requiring `auth.uid()` matching
- **Service role separation**: API routes use `SUPABASE_SERVICE_KEY` for admin operations; frontend uses `VITE_SUPABASE_ANON_KEY`
- **Trigger functions**: All `SECURITY DEFINER` functions include `SET search_path = public` and use fully-qualified table names to prevent search path injection
- **Cascading deletes**: Foreign keys configured with `ON DELETE CASCADE` for account deletion compliance

## 6. API Security

- **CORS**: Configured via `api/utils/cors.js` with origin allowlist
- **Rate limiting**: Applied to sensitive endpoints (auth, coach, route generation)
- **Input validation**: Request bodies validated before processing
- **Error handling**: Internal errors are logged server-side; generic messages returned to clients

## 7. Client-Side Security

- **No secrets in frontend**: All API keys exposed to the browser are public/anon-scoped
- **Content Security Policy**: Managed via Vercel deployment headers
- **Dependency management**: Regular updates via `npm audit`

## 8. AI Data Handling

- **Explicit consent**: AI features require user opt-in (stored as `ai_consent_granted_at` in `user_profiles`)
- **Data minimization**: Only activity summaries and fitness profiles are sent to Anthropic's API; raw GPS tracks and PII are not transmitted
- **No training**: Per Anthropic's API terms, data sent via the API is not used to train models
- **Consent withdrawal**: Users can disable AI features at any time via Settings, which sets `ai_consent_withdrawn_at`

## 9. Data Rights & Compliance

- **Data export**: Users can export all their data as JSON via Settings → Export My Data
- **Account deletion**: Users can permanently delete their account and all associated data via Settings → Delete My Account
- **OAuth token revocation**: Account deletion revokes third-party OAuth tokens (Strava API deauth, Garmin/Wahoo token cleanup)
- **Consent tracking**: ToS acceptance, privacy policy acceptance, AI consent, and Garmin data consent are timestamped and versioned

## 10. Monitoring & Incident Response

- **Error tracking**: Sentry for real-time error monitoring and alerting
- **Analytics**: PostHog for product analytics (privacy-respecting, self-hostable)
- **Vercel Analytics**: Performance monitoring and request logging
- **Audit trail**: Key user actions (consent changes, data exports, account deletions) are timestamped in the database
