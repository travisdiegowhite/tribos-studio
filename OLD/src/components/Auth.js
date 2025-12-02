import React, { useState } from 'react';
import {
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Alert,
  Container,
  Stack,
  Group,
  Anchor,
  Divider,
} from '@mantine/core';
import { Route, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import LandingPage from './LandingPage';
import { enableDemoMode } from '../utils/demoData';

// Google icon component
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
    <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.18L12.05 13.56c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
    <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.003 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
  </svg>
);

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(true); // Default to sign up
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isDemoLogin, setIsDemoLogin] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  const { signIn, signUp, signInWithGoogle } = useAuth();

  // Check if user came from email confirmation
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirmed') === 'true') {
      setEmailConfirmed(true);
      setShowAuth(true);
      setIsSignUp(false); // Switch to sign-in mode
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Demo account credentials (read-only)
  const DEMO_EMAIL = 'demo@tribos.studio';
  const DEMO_PASSWORD = 'demo2024tribos';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSignUpSuccess(false);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password);
        if (error) throw error;

        // Show success message - user needs to check email
        setSignUpEmail(email);
        setSignUpSuccess(true);
        setEmail('');
        setPassword('');
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    console.log('🎯 Starting demo mode (no authentication required)');
    setLoading(true);

    // Enable demo mode - uses mock data instead of real authentication
    enableDemoMode();

    // Trigger a page reload to activate demo mode
    // The AuthContext will detect demo mode and provide mock session
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
      // User will be redirected to Google OAuth, then back to the app
    } catch (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  // Show landing page by default, auth form when requested
  if (!showAuth) {
    return (
      <LandingPage
        onGetStarted={() => {
          setIsSignUp(true); // Ensure we're in sign-up mode
          setShowAuth(true);
        }}
        onSignIn={() => {
          setIsSignUp(false); // Switch to sign-in mode
          setShowAuth(true);
        }}
        onTryDemo={handleDemoLogin}
      />
    );
  }

  return (
    <Container size={420} my={40}>
      <Group justify="center" mb={30}>
        <Route size={32} color="#2196f3" />
        <Title order={1} c="blue">tribos.studio</Title>
      </Group>

      <Paper withBorder shadow="md" p={30} radius="md">
        <Title order={2} ta="center" mb="md">
          {isSignUp ? 'Create Your Free Account' : 'Welcome Back'}
        </Title>

        <Text c="#cbd5e1" size="sm" ta="center" mb="xl">
          {isSignUp
            ? 'Start planning smarter routes in under 2 minutes. No credit card required.'
            : 'Sign in to access your cycling routes and training data'
          }
        </Text>

        {error && (
          <Alert icon={<AlertCircle size={16} />} color="red" mb="md">
            {error}
          </Alert>
        )}

        {emailConfirmed && (
          <Alert color="green" mb="md" title="Email Confirmed!">
            <Text size="sm" c="#1a202c">
              Your email has been confirmed successfully. Please sign in to continue.
            </Text>
          </Alert>
        )}

        {signUpSuccess && (
          <Alert color="green" mb="md" title="Check Your Email!">
            <Stack gap="xs">
              <Text size="sm" c="#1a202c">
                We've sent a confirmation link to <strong>{signUpEmail}</strong>
              </Text>
              <Text size="sm" c="#1a202c">
                Click the link in the email to activate your account, then return here to sign in.
              </Text>
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  setSignUpSuccess(false);
                  setIsSignUp(false);
                }}
                mt="xs"
              >
                Go to Sign In
              </Button>
            </Stack>
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              size="md"
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              size="md"
            />

            <Button type="submit" loading={loading} size="md" mt="sm">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </Stack>
        </form>

        <Divider label="OR" labelPosition="center" my="lg" />

        <Button
          variant="default"
          size="md"
          fullWidth
          onClick={handleGoogleSignIn}
          leftSection={<GoogleIcon />}
          disabled={loading}
          styles={{
            root: {
              color: '#FFFFFF',
              backgroundColor: '#2d3748',
              borderColor: '#475569',
            }
          }}
        >
          Continue with Google
        </Button>

        <Text ta="center" mt="md">
          {isSignUp ? 'Already have an account?' : 'Need an account?'}{' '}
          <Anchor
            component="button"
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </Anchor>
        </Text>

        <Text ta="center" mt="lg">
          <Anchor
            component="button"
            type="button"
            onClick={() => setShowAuth(false)}
            size="sm"
          >
            ← Back to home
          </Anchor>
        </Text>
      </Paper>
    </Container>
  );
};

export default Auth;
