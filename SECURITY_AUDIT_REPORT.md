# Security Audit Report - Tribos Studio

**Date:** February 1, 2026
**Auditor:** Claude Code Security Audit
**Scope:** Full codebase security review and unused code analysis

---

## Executive Summary

This security audit identified **23 security issues** across various severity levels and **15+ unused code items** that should be cleaned up. The codebase demonstrates many good security practices, but several critical and high-severity issues require immediate attention.

| Severity | Count |
|----------|-------|
| Critical | 7 |
| High | 9 |
| Medium | 7 |
| Low | 3 |

---

## Table of Contents

1. [Critical Security Issues](#critical-security-issues)
2. [High Severity Issues](#high-severity-issues)
3. [Medium Severity Issues](#medium-severity-issues)
4. [Low Severity Issues](#low-severity-issues)
5. [Dependency Vulnerabilities](#dependency-vulnerabilities)
6. [Unused Code and Cleanup](#unused-code-and-cleanup)
7. [Positive Security Findings](#positive-security-findings)
8. [Recommended Action Plan](#recommended-action-plan)

---

## Critical Security Issues

### 1. Missing Authentication in Coach API Endpoint
**File:** `api/coach.js` (Lines 181-250+)
**Risk:** Any client can specify any userId and access/interact with another user's coaching data

**Issue:** The AI coach endpoint does NOT validate user identity. While it accepts a `userId` parameter, it never validates that the authenticated user matches the requested userId.

**Fix:**
```javascript
// Add at the start of the handler
const authUser = await getUserFromAuthHeader(req);
if (!authUser) {
  return res.status(401).json({ error: 'Authentication required' });
}
if (userId && userId !== authUser.id) {
  return res.status(403).json({ error: 'Access denied' });
}
```

---

### 2. Optional Authentication in Routes Endpoint
**File:** `api/routes.js` (Lines 42-45)
**Risk:** Unauthenticated clients can view/modify any user's routes if they know the userId

**Issue:** The routes endpoint has a TODO indicating auth is optional for "backwards compatibility", allowing unauthenticated access.

**Fix:** Remove the backwards compatibility bypass and require authentication:
```javascript
if (!authUser) {
  return res.status(401).json({ error: 'Authentication required' });
}
```

---

### 3. Missing Webhook Signature Verification - Strava
**File:** `api/strava-webhook.js`
**Risk:** Attackers can send fake webhook events to manipulate user data

**Issue:** Strava webhook has NO signature verification implemented. Strava supports signature verification but it's not implemented.

**Fix:** Implement signature verification using Strava's webhook secret:
```javascript
const crypto = require('crypto');
const signature = req.headers['x-hub-signature'];
const expectedSignature = 'sha256=' + crypto
  .createHmac('sha256', process.env.STRAVA_WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

---

### 4. Incomplete Webhook Signature Verification - Garmin
**File:** `api/garmin-webhook.js` (Lines 78-91)
**Risk:** Webhook can be spoofed if signature header is absent

**Issue:** Signature verification is optional and silently skipped if the signature header doesn't exist.

**Fix:** Require signature when WEBHOOK_SECRET is configured:
```javascript
if (WEBHOOK_SECRET) {
  const signature = req.headers['x-garmin-signature'] || req.headers['x-webhook-signature'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature header' });
  }
  // Verify signature...
}
```

---

### 5. Unprotected Wahoo Webhook
**File:** `api/wahoo-webhook.js` (Lines 68-85)
**Risk:** Webhook endpoint is unprotected if token not configured

**Issue:** Logs warning but continues processing without token validation when WAHOO_WEBHOOK_TOKEN is not set.

**Fix:** Reject requests if token is not configured in production:
```javascript
if (!WEBHOOK_TOKEN) {
  console.error('WAHOO_WEBHOOK_TOKEN not configured');
  return res.status(500).json({ error: 'Webhook not configured' });
}
```

---

### 6. XSS in Beta Feedback Email Template
**File:** `api/submit-beta-feedback.js` (Lines 75-117)
**Risk:** User input is directly interpolated into HTML without escaping

**Issue:** Template literals directly inject user input (email, URL, message) into HTML without proper escaping.

**Fix:** Add HTML escaping function and apply to all user inputs:
```javascript
const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

// Use: ${escapeHtml(userEmail)} instead of ${userEmail}
```

---

### 7. No Rate Limiting on Admin Endpoint
**File:** `api/admin.js`
**Risk:** Unlimited admin operations possible; potential for brute force or abuse

**Issue:** Critical admin operations (list_users, clean_user_data, send_campaign) have NO rate limiting.

**Fix:** Add rate limiting middleware:
```javascript
import { rateLimit } from './utils/rateLimit';

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (req) => req.headers.authorization
});

// Apply at start of handler
const rateLimitResult = await adminRateLimit(req);
if (!rateLimitResult.allowed) {
  return res.status(429).json({ error: 'Too many requests' });
}
```

---

## High Severity Issues

### 8. CORS Allows Wildcard for No-Origin Requests
**File:** `api/utils/cors.js` (Lines 59-64)
**Risk:** Enables CSRF attacks and abuse from server-side requests

**Fix:** Only allow wildcard for specific webhook paths, not all endpoints.

---

### 9. OAuth State Parameter Validation Optional
**File:** `api/garmin-auth.js` (Line 268)
**Risk:** CSRF attacks could succeed if state is missing

**Issue:** State validation only happens if state is present (`if (state && state !== ...)`).

**Fix:** Always require state parameter:
```javascript
if (!state || state !== storedState) {
  throw new Error('State mismatch. Possible CSRF attack.');
}
```

---

### 10. Console Logging Exposes Client Secret
**File:** `api/strava-auth.js` (Lines 78-80)
**Risk:** Secrets exposed in server logs

**Issue:** Logs Strava Client ID and first 5 chars of Client Secret.

**Fix:** Remove these debug logs entirely:
```javascript
// DELETE these lines:
console.log('Client ID:', process.env.STRAVA_CLIENT_ID);
console.log('Client Secret (first 5 chars):', process.env.STRAVA_CLIENT_SECRET?.substring(0, 5));
```

---

### 11. Debug Logging in Auth Flows
**File:** `src/pages/Auth.jsx` (Lines 48-53, 72, 103-105)
**Risk:** Sensitive authentication info exposed in browser console

**Fix:** Remove or guard these console.log statements:
```javascript
if (import.meta.env.DEV) {
  console.log('signIn called with email:', email);
}
```

---

### 12. No Rate Limiting on OAuth Token Exchange
**File:** `api/garmin-auth.js` (Line 127)
**Risk:** Token exchange endpoint can be abused

**Fix:** Add rate limiting to exchange_token action.

---

### 13. No Rate Limiting on Email Sending
**File:** `api/email.js`
**Risk:** Could be abused for mass email generation

**Fix:** Implement rate limiting per user/IP.

---

### 14. Missing Authentication on Beta Feedback
**File:** `api/submit-beta-feedback.js` (Lines 10-30)
**Risk:** Anyone can submit feedback claiming to be any user

**Fix:** Require authentication and validate userId matches authenticated user.

---

### 15. Resend Webhook Accepts All if Secret Missing
**File:** `api/resend-webhook.js` (Lines 19-73)
**Risk:** All webhook requests accepted if secret not configured

**Fix:** Reject webhooks if secret is not configured in production.

---

### 16. CORS Misconfiguration in Beta Feedback
**File:** `api/submit-beta-feedback.js` (Lines 12-18)
**Risk:** Allows `Access-Control-Allow-Origin: *` with credentials enabled

**Fix:** Remove credentials flag or use specific origin:
```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://www.tribos.studio');
res.setHeader('Access-Control-Allow-Credentials', 'false');
```

---

## Medium Severity Issues

### 17. UserId Accepted from Request Body
**Files:** `api/activities.js`, `api/routes.js`, `api/fitness-snapshots.js`, `api/garmin-auth.js`
**Risk:** Privilege escalation if auth header is bypassed

**Fix:** Always prefer authenticated user ID over request body.

---

### 18. OAuth PKCE Race Condition
**File:** `api/garmin-auth.js` (Lines 190-210)
**Risk:** Concurrent OAuth flows can overwrite verifiers

**Fix:** Use composite key (user_id + timestamp) or session-based storage.

---

### 19. Token Expiration Buffer Too Short
**File:** `api/strava-activities.js` (Lines 128-131)
**Risk:** Tokens could expire during slow API calls

**Fix:** Increase buffer from 5 minutes to 10 minutes.

---

### 20. Missing Client-Side OAuth State Validation
**Files:** OAuth callback handlers in `src/pages/oauth/`
**Risk:** Secondary defense against CSRF missing

**Fix:** Validate state parameter presence on client side before server call.

---

### 21. Database Errors Logged with JSON.stringify
**Files:** `api/strava-auth.js` (Line 139), `api/google-calendar-auth.js` (Line 150)
**Risk:** Internal database details could be exposed

**Fix:** Log only error message, not full object:
```javascript
console.error('Database error storing tokens:', dbError.message);
```

---

### 22. Mapbox Tokens Visible in URLs
**Files:** `src/pages/RouteBuilder.jsx`, `src/utils/smartCyclingRouter.js`, `src/utils/directions.js`
**Risk:** Tokens visible in network logs and browser history

**Fix:** Use the masking pattern already in directions.js line 487:
```javascript
url.replace(/access_token=[^&]+/, 'access_token=***')
```

---

### 23. Debug Logging in Strava Service
**File:** `src/utils/stravaService.js` (Lines 63-68)
**Risk:** OAuth configuration exposed in console

**Fix:** Guard with environment check or remove.

---

## Low Severity Issues

### 24. Error Messages May Leak Garmin API Info
**File:** `api/garmin-auth.js` (Lines 291-297)
**Risk:** Information disclosure of external API errors

**Fix:** Sanitize error messages before returning to client.

---

### 25. No Explicit Session Timeout
**File:** `src/contexts/AuthContext.jsx`
**Risk:** Long-lived sessions could be compromised

**Fix:** Implement session timeout or refresh token rotation.

---

### 26. Demo Tokens Reveal Auth Structure
**File:** `src/utils/demoData.js` (Lines 165-166)
**Risk:** Low - reveals token structure for demo mode

**Fix:** No action required, but consider using more generic placeholder values.

---

## Dependency Vulnerabilities

### React Router - HIGH Severity
**Current Version:** 7.0.0
**Fixed Version:** 7.13.0+

3 vulnerabilities:
- CSRF issue in Action/Server Action Request Processing
- XSS vulnerability via Open Redirects
- SSR XSS in ScrollRestoration

**Fix:**
```bash
npm install react-router-dom@7.13.0
```

### Lodash - MODERATE Severity
**Vulnerability:** Prototype Pollution in `_.unset` and `_.omit`

**Fix:**
```bash
npm audit fix
```

### Unused Dependencies (Remove)
- `buffer@^6.0.3` - Not imported anywhere
- `dayjs@^1.11.19` - Not imported anywhere (verify before removal)

---

## Unused Code and Cleanup

### Unused Components (11 files)
Remove these unused components from `src/components/`:

| File | Lines of Code |
|------|---------------|
| `AICoach.jsx` | ~982 |
| `AccountabilityCoach.jsx` | ~50 |
| `BreadcrumbNav.jsx` | ~50 |
| `CoachMemories.jsx` | ~50 |
| `FormWidget.jsx` | ~50 |
| `IntervalDetection.jsx` | ~50 |
| `PreferenceSettings.jsx` | ~50 |
| `Pulse.jsx` | ~962 |
| `TrainingPlanImport.jsx` | ~50 |
| `TrainingProgress.jsx` | ~50 |
| `WeekSummary.jsx` | ~50 |

### Unused Utilities (2 files)
Remove from `src/utils/`:
- `routePreferences.js` - Route preference scoring utilities
- `workoutRouteMatch.ts` - Workout-to-route matching service

### Orphaned Page (1 file)
Remove from `src/pages/`:
- `Updates.jsx` - Deprecated, content moved to Settings

### Unused CSS Classes (5 classes)
Remove from `src/styles/global.css`:
- `.dashboard-grid` (lines 386-396)
- `.touch-none` (lines 421-426)
- `.scroll-container` (lines 438-441)
- `.page-transition-enter` (lines 535-544)
- `.page-transition-enter-active`

### Legacy Code Directory
**Location:** `/OLD/`
**Size:** 9.3 MB (242 files)
**Recommendation:** Archive or remove entirely - full mirror of outdated implementations

---

## Positive Security Findings

The codebase demonstrates many good security practices:

- **Supabase Service Role Key Validation** - `src/lib/supabase.js` correctly detects and rejects service role keys in browser
- **OAuth PKCE Implementation** - Garmin uses proper OAuth 2.0 PKCE flow
- **Proper Token Storage** - OAuth tokens stored server-side, not exposed to client
- **Authorization Header Validation** - Most endpoints properly validate Bearer tokens
- **Rate Limiting** - Implemented on many endpoints
- **Admin Access Control** - Strict email-based access control on admin endpoints
- **Input Sanitization** - `api/email.js` has proper escapeHtml() and sanitizeUrl() functions
- **Parameterized Queries** - All database operations use Supabase ORM, no raw SQL
- **No eval() Usage** - No dynamic code execution found
- **No dangerouslySetInnerHTML** - No unsafe HTML rendering
- **Proper .gitignore** - All sensitive files excluded
- **Error Details Restricted** - Most endpoints only show error details in development
- **Timing-Safe Comparisons** - Webhook token verification uses crypto.timingSafeEqual()
- **Sentry Integration** - Error tracking properly configured
- **Security Monitoring** - PostHog, Vercel Analytics active

---

## Recommended Action Plan

### Immediate (This Week)
1. **Fix Critical Authentication Issues**
   - Add auth check to `api/coach.js`
   - Remove backwards compatibility in `api/routes.js`
   - Add auth check to `api/submit-beta-feedback.js`

2. **Implement Webhook Security**
   - Add signature verification to `api/strava-webhook.js`
   - Fix conditional verification in `api/garmin-webhook.js`
   - Require token in `api/wahoo-webhook.js`
   - Require secret in `api/resend-webhook.js`

3. **Fix XSS in Email Template**
   - Add HTML escaping in `api/submit-beta-feedback.js`

4. **Update Dependencies**
   ```bash
   npm install react-router-dom@7.13.0
   npm audit fix
   ```

5. **Remove Debug Logs**
   - Remove secret logging in `api/strava-auth.js`

### Short-Term (This Month)
6. **Add Rate Limiting**
   - Admin endpoint
   - OAuth token exchange
   - Email sending

7. **Fix CORS Issues**
   - Remove wildcard CORS with credentials in `api/submit-beta-feedback.js`
   - Tighten no-origin handling in `api/utils/cors.js`

8. **Strengthen OAuth**
   - Make state validation mandatory
   - Add client-side state validation

### Medium-Term (This Quarter)
9. **Code Cleanup**
   - Remove 11 unused components
   - Remove 2 unused utility files
   - Remove orphaned Updates.jsx page
   - Remove unused CSS classes
   - Archive/remove OLD/ directory

10. **Remove Unused Dependencies**
    ```bash
    npm uninstall buffer dayjs
    ```

11. **Add Security Headers**
    - Implement Content Security Policy
    - Add security headers in vercel.json

---

## Appendix: Files Requiring Changes

| File | Issue Count | Priority |
|------|-------------|----------|
| `api/coach.js` | 2 | Critical |
| `api/routes.js` | 2 | Critical |
| `api/strava-webhook.js` | 1 | Critical |
| `api/garmin-webhook.js` | 1 | Critical |
| `api/wahoo-webhook.js` | 1 | Critical |
| `api/submit-beta-feedback.js` | 3 | Critical |
| `api/admin.js` | 1 | Critical |
| `api/strava-auth.js` | 2 | High |
| `api/garmin-auth.js` | 3 | High |
| `api/resend-webhook.js` | 1 | High |
| `api/utils/cors.js` | 1 | High |
| `api/email.js` | 1 | High |
| `src/pages/Auth.jsx` | 1 | High |
| `src/utils/stravaService.js` | 1 | Medium |
| Various route utilities | 3 | Medium |

---

*This report was generated by an automated security audit. Manual review is recommended for all critical findings before implementing fixes.*
