import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Title,
  Text,
  TextInput,
  Textarea,
  Button,
  Group,
  Paper,
  ThemeIcon,
  Alert,
  Checkbox,
} from '@mantine/core';
import { Rocket, CheckCircle, Mail, User, MessageSquare, Calendar } from 'lucide-react';
import { supabase } from '../supabase';
import toast from 'react-hot-toast';

const BetaSignup = ({ opened, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    cyclingExperience: '',
    interests: '',
    betaNotifications: true
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [nameError, setNameError] = useState('');

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e) => {
    const email = e.target.value;
    setFormData({ ...formData, email });

    if (email && !validateEmail(email)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    setFormData({ ...formData, name });

    if (name && name.length < 2) {
      setNameError('Name must be at least 2 characters');
    } else {
      setNameError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate before submitting
    if (!formData.name || formData.name.length < 2) {
      setNameError('Name is required and must be at least 2 characters');
      return;
    }

    if (!formData.email || !validateEmail(formData.email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      // Store beta signup in database
      const { error } = await supabase
        .from('beta_signups')
        .insert([{
          name: formData.name,
          email: formData.email,
          cycling_experience: formData.cyclingExperience,
          interests: formData.interests,
          wants_notifications: formData.betaNotifications,
          signed_up_at: new Date().toISOString(),
          status: 'pending'
        }]);

      if (error) {
        // Check if it's a duplicate email
        if (error.code === '23505') {
          toast.error('This email is already registered for the beta!');
        } else {
          throw error;
        }
      } else {
        // Send welcome email via API
        try {
          const emailResponse = await fetch('/api/send-welcome-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
            }),
          });

          if (!emailResponse.ok) {
            console.error('Failed to send welcome email:', await emailResponse.text());
            // Don't throw error - signup was successful even if email fails
            toast.success('Successfully signed up for the beta!');
          } else {
            toast.success('Successfully signed up! Check your email for details.');
          }
        } catch (emailError) {
          console.error('Error sending welcome email:', emailError);
          // Don't throw error - signup was successful even if email fails
          toast.success('Successfully signed up for the beta!');
        }

        setSubmitted(true);
      }
    } catch (error) {
      console.error('Beta signup error:', error);
      toast.error('Failed to sign up. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setFormData({
      name: '',
      email: '',
      cyclingExperience: '',
      interests: '',
      betaNotifications: true
    });
    setEmailError('');
    setNameError('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size="lg"
      title={
        <Group>
          <ThemeIcon size={32} color="teal" variant="light">
            <Rocket size={20} />
          </ThemeIcon>
          <Title order={3}>Join the Beta</Title>
        </Group>
      }
      centered
    >
      {!submitted ? (
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Alert color="teal" variant="light">
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  🎉 Beta is Now Open!
                </Text>
                <Text size="sm">
                  Sign up now to get immediate access to AI-powered cycling route intelligence.
                  Start creating smarter routes today!
                </Text>
              </Stack>
            </Alert>

            <TextInput
              label="Name"
              placeholder="Your name"
              value={formData.name}
              onChange={handleNameChange}
              required
              leftSection={<User size={16} />}
              error={nameError}
            />

            <TextInput
              label="Email"
              placeholder="your@email.com"
              type="email"
              value={formData.email}
              onChange={handleEmailChange}
              required
              leftSection={<Mail size={16} />}
              error={emailError}
            />

            <TextInput
              label="Cycling Experience"
              placeholder="e.g., Road cycling, 5 years, 200km/week"
              value={formData.cyclingExperience}
              onChange={(e) => setFormData({ ...formData, cyclingExperience: e.target.value })}
              description="Tell us about your cycling background (optional)"
            />

            <Textarea
              label="What features interest you most?"
              placeholder="e.g., AI route generation, training plans, Strava integration..."
              value={formData.interests}
              onChange={(e) => setFormData({ ...formData, interests: e.target.value })}
              minRows={3}
              leftSection={<MessageSquare size={16} />}
              description="Help us prioritize features for you (optional)"
            />

            <Checkbox
              label="Send me updates about the beta launch and new features"
              checked={formData.betaNotifications}
              onChange={(e) => setFormData({ ...formData, betaNotifications: e.currentTarget.checked })}
            />

            <Group justify="space-between" mt="md">
              <Button variant="subtle" onClick={handleClose}>
                Maybe Later
              </Button>
              <Button
                type="submit"
                loading={loading}
                leftSection={<Rocket size={18} />}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
                }}
              >
                Sign Up for Beta
              </Button>
            </Group>
          </Stack>
        </form>
      ) : (
        <Stack align="center" gap="lg" py="xl">
          <ThemeIcon size={80} color="teal" variant="light">
            <CheckCircle size={40} />
          </ThemeIcon>

          <Title order={2} ta="center">
            You're In!
          </Title>

          <Text size="lg" ta="center" c="dimmed" maw={400}>
            Thank you for signing up! Check your email for your welcome message and start exploring Tribos.Studio right away.
          </Text>

          <Paper withBorder p="md" bg="teal.0" w="100%">
            <Stack gap="xs">
              <Group>
                <ThemeIcon size={24} color="teal" variant="light">
                  <CheckCircle size={14} />
                </ThemeIcon>
                <Text size="sm" fw={600}>
                  Beta Access: Available Now
                </Text>
              </Group>
              <Text size="sm" c="dimmed" pl={32}>
                You can start creating AI-powered routes immediately!
              </Text>
            </Stack>
          </Paper>

          <Text size="sm" ta="center" c="dimmed">
            Ready to discover the road less traveled? Start exploring now!
          </Text>

          <Button onClick={handleClose} size="md" fullWidth>
            Got It!
          </Button>
        </Stack>
      )}
    </Modal>
  );
};

export default BetaSignup;
