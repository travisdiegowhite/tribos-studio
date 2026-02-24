# Claude Code Project Guidelines

## Auth Flow — Critical Path (DO NOT BREAK)

The signup and login flow is the most critical path in the app. Any breakage blocks all new users. Follow these rules strictly:

### Before modifying auth-related files, always read them first:
- `src/pages/Auth.jsx` — signup/login form UI
- `src/contexts/AuthContext.jsx` — signUp, signIn, signInWithGoogle, resetPassword
- `src/pages/oauth/AuthCallback.jsx` — post-confirmation redirect handler
- `src/lib/supabase.js` — Supabase client initialization

### Database rules for auth triggers:
- **All `SECURITY DEFINER` functions must include `SET search_path = public`** and use fully-qualified table names (e.g., `public.user_activation`, not just `user_activation`)
- **Triggers on `auth.users` are critical** — any failure in a trigger function rolls back the entire signup transaction, producing a generic "Database error saving new user" error
- Test trigger functions in isolation before deploying

### General auth rules:
- Never remove or alter the signup/login flow (email+password or Google OAuth) without explicit user approval
- After any auth-adjacent change, verify that both signup and login still work end-to-end
- Email confirmation flow must remain intact: signup → confirmation email → `/auth/callback` → dashboard
