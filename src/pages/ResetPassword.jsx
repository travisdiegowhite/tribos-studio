/**
 * ResetPassword — the page a password-reset email lands on.
 *
 * Supabase's recovery link arrives as
 *   /auth/reset-password#access_token=…&refresh_token=…&type=recovery
 * The client consumes the hash at boot (implicit flow, detectSessionInUrl),
 * stores a session, and emits PASSWORD_RECOVERY, which AuthContext records
 * in sessionStorage. By the time this lazy page mounts the person is
 * authenticated, so it is mounted under OpenRoute: PublicRoute would bounce
 * the recovery session to /today and ProtectedRoute would bounce the
 * expired-link case (no session) before it could be explained.
 *
 * An expired or reused link arrives as
 *   /auth/reset-password#error=access_denied&error_code=otp_expired&…
 * with no session; the hash is still present because the client had
 * nothing to consume.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth, clearPendingPasswordRecovery } from '../contexts/AuthContext.jsx';
import { tokens } from '../theme';

const MIN_PASSWORD_LENGTH = 6; // matches the signup form

function readHashError() {
  try {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    if (!params.get('error') && !params.get('error_code')) return null;
    return {
      code: params.get('error_code') || params.get('error') || 'unknown',
      description: params.get('error_description') || '',
    };
  } catch {
    return null;
  }
}

function ResetPassword() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hashError = useMemo(readHashError, []);

  // The recovery session is consumed at boot; if it never arrived and the
  // hash carries no error either, give the client a moment, then treat it
  // as an unusable link rather than spinning forever.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (user || hashError) return undefined;
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [user, hashError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearPendingPasswordRecovery();
      notifications.show({
        title: 'Password updated',
        message: "You're signed in with your new password.",
        color: 'teal',
      });
      navigate('/today', { replace: true });
    } catch (err) {
      console.error('Password update error:', err);
      setError(err.message || 'Could not update your password. Try the link again.');
    } finally {
      setSaving(false);
    }
  };

  const linkUnusable = !!hashError || (!loading && !user && timedOut);

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
            Choose a new password
          </Title>
        </Box>

        <Paper p="xl" radius="lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          {linkUnusable ? (
            <Stack gap="md">
              <Alert color="red" variant="light" title="That link has expired">
                Reset links work once and only for a short while.
                {hashError?.description ? ` (${hashError.description})` : ''}
              </Alert>
              <Button component={Link} to="/auth?mode=forgot" color="teal" fullWidth>
                Request a new link
              </Button>
            </Stack>
          ) : !user ? (
            <Stack align="center" gap="md" py="md">
              <div className="loading-spinner" />
              <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
                Checking your reset link...
              </Text>
            </Stack>
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                {error && (
                  <Alert color="red" variant="light">
                    {error}
                  </Alert>
                )}
                <Text size="sm" style={{ color: 'var(--color-text-secondary)' }}>
                  Resetting the password for <strong>{user.email}</strong>.
                </Text>
                <PasswordInput
                  id="reset-password-new"
                  label="New password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
                <PasswordInput
                  id="reset-password-confirm"
                  label="Confirm new password"
                  placeholder="Same again"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
                <Button type="submit" color="teal" loading={saving} fullWidth mt="sm">
                  Update password
                </Button>
              </Stack>
            </form>
          )}

          <Text ta="center" mt="lg" size="sm" style={{ color: 'var(--color-text-secondary)' }}>
            <Anchor component={Link} to="/auth" style={{ color: 'var(--color-teal)' }}>
              Back to sign in
            </Anchor>
          </Text>
        </Paper>
      </Container>
    </Box>
  );
}

export default ResetPassword;
