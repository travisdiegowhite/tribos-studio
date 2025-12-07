import { useState } from 'react';
import {
  Modal,
  Button,
  Textarea,
  Select,
  Stack,
  Text,
  Alert,
  ActionIcon,
  Tooltip,
  Box,
  Group,
  ThemeIcon,
} from '@mantine/core';
import {
  IconMessageCircle,
  IconSend,
  IconX,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { tokens } from '../theme';

function BetaFeedbackWidget() {
  const [opened, setOpened] = useState(false);
  const [feedbackType, setFeedbackType] = useState('general');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const feedbackTypes = [
    { value: 'bug', label: 'Bug Report' },
    { value: 'feature', label: 'Feature Request' },
    { value: 'improvement', label: 'Improvement Idea' },
    { value: 'question', label: 'Question' },
    { value: 'general', label: 'General Feedback' },
  ];

  const handleSubmit = async () => {
    if (!message.trim()) {
      setError('Please enter your feedback');
      return;
    }

    if (!user) {
      setError('You must be logged in to submit feedback');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get current page context
      const pageUrl = window.location.href;
      const userAgent = navigator.userAgent;

      // Insert feedback into database
      const { error: dbError } = await supabase
        .from('beta_feedback')
        .insert({
          user_id: user.id,
          feedback_type: feedbackType,
          message: message.trim(),
          page_url: pageUrl,
          user_agent: userAgent,
          status: 'new',
        });

      if (dbError) throw dbError;

      // Send email notification to admin
      try {
        const apiBase = import.meta.env.VITE_API_URL || '';
        await fetch(`${apiBase}/api/submit-beta-feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedbackType,
            message: message.trim(),
            pageUrl,
            userEmail: user.email,
            userId: user.id,
          }),
        });
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
        // Don't fail the whole submission if email fails
      }

      // Show success
      setSuccess(true);
      setMessage('');

      // Auto-close after 2 seconds
      setTimeout(() => {
        setOpened(false);
        setSuccess(false);
        setFeedbackType('general');
      }, 2000);

    } catch (err) {
      console.error('Feedback submission error:', err);
      setError('Failed to submit feedback. Please try again or email travis@tribos.studio');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpened(false);
    setSuccess(false);
    setError(null);
    setMessage('');
  };

  // Only show for authenticated users
  if (!user) return null;

  return (
    <>
      {/* Floating Feedback Button */}
      <Tooltip label="Send Feedback" position="left" withArrow>
        <ActionIcon
          size="xl"
          radius="xl"
          variant="gradient"
          gradient={{ from: 'blue', to: 'cyan' }}
          onClick={() => setOpened(true)}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            width: '56px',
            height: '56px',
          }}
        >
          <IconMessageCircle size={24} />
        </ActionIcon>
      </Tooltip>

      {/* Feedback Modal */}
      <Modal
        opened={opened}
        onClose={handleClose}
        title={
          <Group gap="xs">
            <ThemeIcon color="blue" variant="light">
              <IconMessageCircle size={18} />
            </ThemeIcon>
            <Text fw={600}>Send Feedback</Text>
          </Group>
        }
        size="lg"
      >
        {success ? (
          <Alert icon={<IconCheck size={20} />} color="green" title="Feedback Sent!">
            <Text>
              Thank you! Your feedback helps make tribos.studio better for everyone.
              Travis will review this personally.
            </Text>
          </Alert>
        ) : (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              As a beta user, your feedback is incredibly valuable. Share bugs, ideas,
              questions, or just say hi! Travis reads every single message.
            </Text>

            <Select
              label="Feedback Type"
              value={feedbackType}
              onChange={setFeedbackType}
              data={feedbackTypes}
              required
            />

            <Textarea
              label="Your Message"
              placeholder="Tell me what's on your mind..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              minRows={5}
              maxRows={10}
              required
              autoFocus
            />

            <Box
              p="sm"
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
              }}
            >
              <Text size="xs" c="dimmed">
                <strong>Tip:</strong> Include details like what you expected vs. what happened,
                steps to reproduce (for bugs), or why a feature would help your training.
              </Text>
            </Box>

            {error && (
              <Alert icon={<IconAlertCircle size={20} />} color="red">
                {error}
              </Alert>
            )}

            <Group justify="space-between" mt="md">
              <Button
                variant="subtle"
                onClick={handleClose}
                leftSection={<IconX size={18} />}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={loading}
                leftSection={<IconSend size={18} />}
                gradient={{ from: 'blue', to: 'cyan' }}
                variant="gradient"
              >
                Send to Travis
              </Button>
            </Group>

            <Text size="xs" c="dimmed" ta="center" mt="xs">
              Or email directly:{' '}
              <a href="mailto:travis@tribos.studio" style={{ color: tokens.colors.electricLime }}>
                travis@tribos.studio
              </a>
            </Text>
          </Stack>
        )}
      </Modal>
    </>
  );
}

export default BetaFeedbackWidget;
