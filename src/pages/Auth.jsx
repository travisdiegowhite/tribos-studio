import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
} from '@mantine/core';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

function Auth() {
  const navigate = useNavigate();
  const location = useLocation();

  // Check if coming from beta signup flow
  const { email: prefilledEmail, fromBetaSignup } = location.state || {};

  const [isSignUp, setIsSignUp] = useState(fromBetaSignup || false);
  const [email, setEmail] = useState(prefilledEmail || '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const handleSubmit = async (e) => {
    console.log('handleSubmit called');
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isSignUp) {
        console.log('Attempting sign up...');
        const { data, error } = await signUp(email, password, { full_name: name });
        if (error) throw error;

        // Link beta signup record to the new user account
        if (fromBetaSignup && data?.user?.id) {
          try {
            await supabase
              .from('beta_signups')
              .update({
                user_id: data.user.id,
                status: 'activated',
                activated_at: new Date().toISOString()
              })
              .eq('email', email);
          } catch (linkError) {
            console.error('Failed to link beta signup:', linkError);
            // Non-blocking - don't prevent signup success
          }
        }

        setMessage('Check your email for the confirmation link!');
      } else {
        console.log('Attempting sign in...');
        const { error } = await signIn(email, password);
        console.log('Sign in completed, error:', error);
        if (error) throw error;
        console.log('Navigating to dashboard...');
        navigate('/dashboard');
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
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.colors.bgPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.spacing.md,
      }}
    >
      <Container size={420}>
        <Box mb="xl" style={{ textAlign: 'center' }}>
          <Text
            size="lg"
            fw={600}
            style={{ color: tokens.colors.electricLime, letterSpacing: '0.1em' }}
            mb="xs"
          >
            TRIBOS.STUDIO
          </Text>
          <Title order={2} style={{ color: tokens.colors.textPrimary }}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Title>
        </Box>

        <Paper p="xl" radius="lg" style={{ backgroundColor: tokens.colors.bgSecondary }}>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {error && (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              )}

              {message && (
                <Alert color="green" variant="light">
                  {message}
                </Alert>
              )}

              {fromBetaSignup && !message && (
                <Alert color="lime" variant="light">
                  Your email has been added to the beta list! Complete your account below.
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

              <Button type="submit" color="lime" loading={loading} fullWidth mt="sm">
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </Stack>
          </form>

          <Divider my="lg" label="or continue with" labelPosition="center" />

          <Stack gap="sm">
            <Button
              variant="outline"
              color="gray"
              fullWidth
              onClick={handleGoogleSignIn}
              leftSection={<span>🔵</span>}
            >
              Google
            </Button>
          </Stack>

          <Text ta="center" mt="lg" size="sm" style={{ color: tokens.colors.textSecondary }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Anchor
              component="button"
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setMessage('');
              }}
              style={{ color: tokens.colors.electricLime }}
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
