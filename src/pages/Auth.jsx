import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Divider,
  Group,
  Box,
  Anchor,
  Alert,
  CopyButton,
  ActionIcon,
  Tooltip,
  Checkbox,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { peekReturnTo, clearReturnTo } from '../utils/returnTo';
import { tokens } from '../theme';
import { detectWebview, getWebviewInstructions } from '../utils/webviewDetection';

// Update beta_signups status when user activates their account
async function markBetaSignupActivated(email) {
  try {
    const { error } = await supabase
      .from('beta_signups')
      .update({
        status: 'activated',
        activated_at: new Date().toISOString(),
      })
      .eq('email', email.toLowerCase())
      .eq('status', 'pending'); // Only update if still pending

    if (error) {
      console.log('Beta signup update (may not exist):', error.message);
    }
  } catch (err) {
    // Silently fail - user may not have signed up via landing page
    console.log('Beta signup activation check:', err.message);
  }
}

function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Which form to open. `?mode=signup` is the linkable form (landing CTAs,
  // the guest route-builder modal, a Threads post); router state is kept
  // for one release so any cached bundle still passing it keeps working.
  const { email: prefilledEmail, fromBetaSignup } = location.state || {};
  const startInSignUp = searchParams.get('mode') === 'signup' || !!fromBetaSignup;

  const [isSignUp, setIsSignUp] = useState(startInSignUp);
  const [email, setEmail] = useState(prefilledEmail || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  // /auth/callback redirects here with ?error=callback_failed when a
  // confirmation or OAuth link could not be completed. Say so; a blank
  // login form after clicking an email link reads as "the link did nothing".
  const [error, setError] = useState(() =>
    searchParams.get('error') === 'callback_failed'
      ? "We couldn't complete sign-in from that link. Try signing in below, or request a new link."
      : ''
  );

  useEffect(() => {
    if (!searchParams.has('error')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('error');
    setSearchParams(next, { replace: true });
    // Once, on mount: strip the param so a refresh does not re-show the message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [message, setMessage] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [webviewInfo, setWebviewInfo] = useState({ isWebview: false, appName: null });

  const { signIn, signUp, signInWithGoogle } = useAuth();

  // Check if we're in an in-app browser/webview
  useEffect(() => {
    const info = detectWebview();
    setWebviewInfo(info);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, { full_name: name });
        if (error) throw error;

        // Store consent acceptance for later persistence to user_profiles.
        // The row is created on first authenticated load (AppShell →
        // ensureUserProfile), which then flushes this.
        try {
          localStorage.setItem('tribos_consent_pending', JSON.stringify({
            tos_accepted_at: new Date().toISOString(),
            privacy_accepted_at: new Date().toISOString(),
            tos_version: '2026-02',
            privacy_version: '2026-02',
          }));
        } catch (storageErr) {
          console.error('Failed to store consent locally:', storageErr);
        }

        setMessage('Check your email for the confirmation link!');
      } else {
        // Peek (don't consume) before signing in: PublicRoute's redirect can
        // race this navigate once the session exists, and both must agree on
        // the target. Clear only after a successful sign-in.
        const returnTo = peekReturnTo();
        const { error } = await signIn(email, password);
        if (error) throw error;
        // Mark beta signup as activated on successful login
        await markBetaSignupActivated(email);
        clearReturnTo();
        // Guests arriving from the route builder go back to their
        // in-progress route instead of /today.
        navigate(returnTo || '/today');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');

    // Block Google OAuth in webviews - it will fail with 403 disallowed_useragent
    if (webviewInfo.isWebview) {
      setError(
        `Google sign-in doesn't work in ${webviewInfo.appName}'s browser. ` +
        `Please open this page in your regular browser (Safari, Chrome, etc.) to use Google sign-in, ` +
        `or use email/password instead.`
      );
      return;
    }

    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.spacing.md,
      }}
    >
      <Container size="xs">
        <Box mb="xl" style={{ textAlign: 'center' }}>
          <Text
            size="lg"
            fw={600}
            style={{ color: 'var(--color-teal)', letterSpacing: '0.1em' }}
            mb="xs"
          >
            TRIBOS.STUDIO
          </Text>
          <Title order={2} style={{ color: 'var(--color-text-primary)' }}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Title>
        </Box>

        <Paper p="xl" radius="lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {webviewInfo.isWebview && (
                <Alert color="yellow" variant="light" title={`You're in ${webviewInfo.appName}'s browser`}>
                  <Text size="sm" mb="xs">
                    Google sign-in won't work here. To use Google, open this page in your regular browser.
                  </Text>
                  <Group gap="xs">
                    <CopyButton value={window.location.href}>
                      {({ copied, copy }) => (
                        <Button
                          size="xs"
                          variant="light"
                          color={copied ? 'sage' : 'yellow'}
                          onClick={copy}
                        >
                          {copied ? 'Copied!' : 'Copy link to open in browser'}
                        </Button>
                      )}
                    </CopyButton>
                  </Group>
                </Alert>
              )}

              {error && (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              )}

              {message && (
                <Alert color="teal" variant="light">
                  {message}
                </Alert>
              )}

              {isSignUp && (
                <TextInput
                  label="Full Name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              )}

              <TextInput
                label="Email"
                placeholder="you@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <PasswordInput
                label="Password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />

              {isSignUp && (
                <Checkbox
                  label={
                    <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
                      I agree to the{' '}
                      <Anchor component={Link} to="/terms" target="_blank" style={{ color: 'var(--color-teal)' }}>
                        Terms of Service
                      </Anchor>
                      {' '}and{' '}
                      <Anchor component={Link} to="/privacy" target="_blank" style={{ color: 'var(--color-teal)' }}>
                        Privacy Policy
                      </Anchor>
                    </Text>
                  }
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.currentTarget.checked)}
                  color="teal"
                  size="sm"
                />
              )}

              <Button
                type="submit"
                color="teal"
                loading={loading}
                fullWidth
                mt="sm"
                disabled={isSignUp && !tosAccepted}
              >
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </Stack>
          </form>

          <Divider my="lg" label="or continue with" labelPosition="center" />

          <Stack gap="sm">
            <Tooltip
              label={webviewInfo.isWebview ? `Google sign-in doesn't work in ${webviewInfo.appName}'s browser` : null}
              disabled={!webviewInfo.isWebview}
            >
              <Button
                variant="outline"
                color="gray"
                fullWidth
                onClick={handleGoogleSignIn}
                leftSection={<span>🔵</span>}
                style={webviewInfo.isWebview ? { opacity: 0.5 } : undefined}
              >
                Google {webviewInfo.isWebview && '(unavailable)'}
              </Button>
            </Tooltip>
          </Stack>

          <Text ta="center" mt="lg" size="sm" style={{ color: 'var(--color-text-secondary)' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Anchor
              component="button"
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setMessage('');
              }}
              style={{ color: 'var(--color-teal)' }}
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </Anchor>
          </Text>
        </Paper>
      </Container>
    </Box>
  );
}

export default Auth;
