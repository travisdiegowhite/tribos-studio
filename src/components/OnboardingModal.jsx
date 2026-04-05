/**
 * OnboardingModal — Unified onboarding flow (v2).
 *
 * 11 screens: Welcome → 6 questions → Connect Device → Fitness Baseline → Coach Reveal → Ready
 *
 * Questions serve dual purpose:
 *   - Profile data (experience_level, primary_goal, weekly_hours, terrain) → user_profiles
 *   - Persona classification signals → api/onboarding-complete → user_coach_settings
 *
 * On Screen 9, calls /api/onboarding-complete which:
 *   1. Classifies persona from Q3+Q5 (with Q1+Q2+Q4 as context)
 *   2. Generates a personalized opening message via Claude
 *   3. Saves all profile + persona data
 *   4. Saves opening message to coach_conversations
 *   5. Sends welcome email
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Stepper,
  Button,
  Group,
  Text,
  Stack,
  Paper,
  Title,
  ThemeIcon,
  SimpleGrid,
  Badge,
  Box,
  NumberInput,
  Select,
  Divider,
  Radio,
  Progress,
  Chip,
  TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { ConnectWithStravaButton, STRAVA_ORANGE } from './StravaBranding';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';
import { PERSONAS } from '../data/coachingPersonas';
import {
  CaretLeft,
  CaretRight,
  Check,
  Heartbeat,
  Path,
  Rocket,
  Target,
  Watch,
  Sparkle,
} from '@phosphor-icons/react';

// ── Question definitions ──────────────────────────────────────

const ONBOARDING_QUESTIONS = [
  {
    id: 'experience',
    title: 'How would you describe yourself as a cyclist?',
    options: [
      { value: 'beginner', label: 'Just getting started', description: 'New to structured training' },
      { value: 'intermediate', label: 'Recreational rider', description: 'Riding regularly, no race goals' },
      { value: 'advanced', label: 'Competitive amateur', description: 'Racing or event-focused' },
      { value: 'racer', label: 'Returning rider', description: 'Coming back after a break' },
    ],
  },
  {
    id: 'goal',
    title: 'What are you training for this season?',
    options: [
      { value: 'event', label: 'A specific event', description: 'Race, gran fondo, or target ride' },
      { value: 'fitness', label: 'General fitness', description: 'Build base, stay healthy' },
      { value: 'performance', label: 'Getting faster', description: 'Push FTP and performance' },
      { value: 'comeback', label: 'Getting back into it', description: 'Returning from injury or time off' },
    ],
    hasEventFollowUp: true,
  },
  {
    id: 'coaching_style',
    title: 'When you miss a workout, what\'s most helpful to hear?',
    options: [
      { value: 'hammer_competitor', label: 'Push me to make it up', description: 'I need accountability' },
      { value: 'scientist', label: 'Explain why it matters', description: 'Help me understand the impact' },
      { value: 'encourager', label: 'Tell me it\'s okay', description: 'And help me move forward' },
      { value: 'pragmatist', label: 'Just adjust the plan', description: 'No lecture needed' },
    ],
  },
  {
    id: 'hours',
    title: 'How many hours per week can you realistically train?',
    options: [
      { value: '3.5', label: 'Under 5 hours', description: null },
      { value: '6.5', label: '5\u20138 hours', description: null },
      { value: '10', label: '8\u201312 hours', description: null },
      { value: '14', label: '12+ hours', description: null },
    ],
  },
  {
    id: 'coach_role',
    title: 'What does a good coach do for you?',
    options: [
      { value: 'hammer_competitor', label: 'Pushes me beyond what I\'d do alone', description: null },
      { value: 'scientist', label: 'Gives me the data and lets me decide', description: null },
      { value: 'encourager', label: 'Keeps me motivated and consistent', description: null },
      { value: 'pragmatist', label: 'Keeps things simple and tells me what to do', description: null },
    ],
  },
  {
    id: 'terrain',
    title: 'What kind of riding do you do?',
    isMultiSelect: true,
    options: [
      { value: 'road', label: 'Road' },
      { value: 'gravel', label: 'Gravel' },
      { value: 'mountain', label: 'Mountain' },
      { value: 'mixed', label: 'Mixed' },
    ],
    optional: true,
  },
];

const HOURS_TO_TSS = { '3.5': 100, '6.5': 250, '10': 450, '14': 650 };

// Total stepper steps: 0-9 are Stepper.Step, 10 is Stepper.Completed
const TOTAL_STEPS = 10;

function OnboardingModal({ opened, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fitness baseline (existing)
  const [ftp, setFtp] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');

  // Device connections (existing)
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [wahooConnected, setWahooConnected] = useState(false);

  // Question answers
  const [answers, setAnswers] = useState({});
  const [targetEventName, setTargetEventName] = useState('');
  const [targetEventDate, setTargetEventDate] = useState(null);
  const [selectedTerrain, setSelectedTerrain] = useState([]);

  // Coach reveal (screen 9)
  const [classifying, setClassifying] = useState(false);
  const [classificationResult, setClassificationResult] = useState(null);

  // Check device connection status on mount
  useEffect(() => {
    const checkConnections = async () => {
      if (!user) return;
      try {
        const [stravaStatus, garminStatus, wahooStatus] = await Promise.all([
          stravaService.getConnectionStatus().catch(() => ({ connected: false })),
          garminService.getConnectionStatus().catch(() => ({ connected: false })),
          wahooService.getConnectionStatus().catch(() => ({ connected: false })),
        ]);
        setStravaConnected(stravaStatus.connected);
        setGarminConnected(garminStatus.connected);
        setWahooConnected(wahooStatus.connected);
      } catch (err) {
        console.error('Error checking connections:', err);
      }
    };
    if (opened) checkConnections();
  }, [user, opened]);

  // Device connection handlers
  const handleConnectStrava = () => {
    window.location.href = stravaService.getAuthorizationUrl();
  };
  const handleConnectGarmin = async () => {
    if (!garminService.isConfigured()) return;
    window.location.href = await garminService.getAuthorizationUrl();
  };
  const handleConnectWahoo = () => {
    if (!wahooService.isConfigured()) return;
    window.location.href = wahooService.getAuthorizationUrl();
  };

  const handleAnswer = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const canAdvance = useCallback(() => {
    if (active === 0) return true;
    if (active >= 1 && active <= 6) {
      const q = ONBOARDING_QUESTIONS[active - 1];
      if (q.isMultiSelect || q.optional) return true;
      return !!answers[q.id];
    }
    if (active === 7 || active === 8) return true;
    if (active === 9) return !!classificationResult;
    return true;
  }, [active, answers, classificationResult]);

  // Fire classification + onboarding-complete on entering Screen 9
  const handleClassification = useCallback(async () => {
    if (classificationResult || classifying) return;
    setClassifying(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const res = await fetch('/api/onboarding-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          experience_level: answers.experience || null,
          primary_goal: answers.goal || null,
          target_event_name: targetEventName || null,
          target_event_date: targetEventDate ? targetEventDate.toISOString().split('T')[0] : null,
          weekly_hours_available: answers.hours ? parseFloat(answers.hours) : null,
          weekly_tss_estimate: answers.hours ? HOURS_TO_TSS[answers.hours] || null : null,
          preferred_terrain: selectedTerrain.length > 0 ? selectedTerrain : null,
          ftp: ftp || null,
          units_preference: unitsPreference,
          coaching_style_answer: answers.coaching_style || null,
          coach_role_answer: answers.coach_role || null,
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error('API failed');

      const data = await res.json();
      setClassificationResult(data);
    } catch (err) {
      console.error('Onboarding classification error:', err);
      setClassificationResult({
        persona: 'pragmatist',
        personaName: 'The Pragmatist',
        openingMessage: 'Good to meet you. Let\u2019s figure out what matters most and build from there.',
        confidence: 0.5,
        secondary: null,
      });
    } finally {
      setClassifying(false);
    }
  }, [answers, targetEventName, targetEventDate, selectedTerrain, ftp, unitsPreference, classificationResult, classifying]);

  useEffect(() => {
    if (active === 9 && !classificationResult && !classifying) {
      handleClassification();
    }
  }, [active, classificationResult, classifying, handleClassification]);

  const handleComplete = useCallback(async () => {
    setLoading(true);
    try {
      await supabase
        .from('user_profiles')
        .upsert({ id: user.id, onboarding_completed: true });
    } catch (err) {
      console.error('Error completing onboarding:', err);
    } finally {
      setLoading(false);
      onClose();
    }
  }, [user, onClose]);

  const nextStep = () => {
    if (active < TOTAL_STEPS) setActive((prev) => prev + 1);
  };
  const prevStep = () => {
    if (active > 0) setActive((prev) => prev - 1);
  };

  // Render a question screen (Screens 1-6)
  const renderQuestion = (questionIndex) => {
    const q = ONBOARDING_QUESTIONS[questionIndex];
    if (!q) return null;

    return (
      <Stack gap="lg" py="md">
        <Box>
          <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed" mb={4}>
            Question {questionIndex + 1} of 6
          </Text>
          <Progress value={((questionIndex + 1) / 6) * 100} size="xs" color="var(--color-teal)" />
        </Box>

        <Title order={4} style={{ color: 'var(--color-text-primary)' }}>
          {q.title}
        </Title>

        {q.isMultiSelect ? (
          <Stack gap="sm">
            <Chip.Group multiple value={selectedTerrain} onChange={setSelectedTerrain}>
              <Group gap="sm">
                {q.options.map((opt) => (
                  <Chip
                    key={opt.value}
                    value={opt.value}
                    color="teal"
                    variant="outline"
                    size="md"
                    styles={{ label: { cursor: 'pointer' } }}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
            <Text size="xs" c="dimmed">Pick all that apply, or skip this one.</Text>
          </Stack>
        ) : (
          <Radio.Group
            value={answers[q.id] || ''}
            onChange={(value) => handleAnswer(q.id, value)}
          >
            <Stack gap="sm">
              {q.options.map((opt) => (
                <Paper
                  key={opt.value}
                  p="sm"
                  withBorder
                  style={{
                    borderRadius: 0,
                    cursor: 'pointer',
                    borderColor: answers[q.id] === opt.value ? 'var(--color-teal)' : undefined,
                  }}
                  onClick={() => handleAnswer(q.id, opt.value)}
                >
                  <Radio
                    value={opt.value}
                    label={
                      <Box>
                        <Text size="sm" fw={500}>{opt.label}</Text>
                        {opt.description && <Text size="xs" c="dimmed">{opt.description}</Text>}
                      </Box>
                    }
                    styles={{ radio: { cursor: 'pointer' }, label: { cursor: 'pointer' } }}
                  />
                </Paper>
              ))}
            </Stack>
          </Radio.Group>
        )}

        {q.hasEventFollowUp && answers.goal === 'event' && (
          <Paper p="md" withBorder style={{ borderRadius: 0, borderColor: 'var(--color-teal-border)' }}>
            <Stack gap="sm">
              <Text size="xs" fw={600} tt="uppercase" c="dimmed">Event details (optional)</Text>
              <TextInput
                label="Event name"
                placeholder="e.g., Boulder Roubaix"
                value={targetEventName}
                onChange={(e) => setTargetEventName(e.currentTarget.value)}
                styles={{ input: { borderRadius: 0 } }}
              />
              <DateInput
                label="Event date"
                placeholder="Pick a date"
                value={targetEventDate}
                onChange={setTargetEventDate}
                minDate={new Date()}
                styles={{ input: { borderRadius: 0 } }}
                clearable
              />
            </Stack>
          </Paper>
        )}
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="sm">
          <ThemeIcon color="teal" variant="light" size="lg">
            <Rocket size={20} />
          </ThemeIcon>
          <Text fw={600} size="lg">Welcome to tribos.studio</Text>
          <Badge color="gray" variant="light">Beta</Badge>
        </Group>
      }
      closeOnClickOutside={false}
      withCloseButton={false}
    >
      <Stepper
        active={active}
        color="teal"
        size="xs"
        mb="xl"
        styles={{ steps: { display: 'none' } }}
      >
        {/* Screen 0: Welcome */}
        <Stepper.Step>
          <Stack gap="lg" py="md">
            <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
              Thanks for joining the beta!
            </Title>

            <Text style={{ color: 'var(--color-text-secondary)' }}>
              Six quick questions. We&apos;ll use your answers to set up your coach and
              personalize your training from day one.
            </Text>

            <Paper p="md" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <Text size="sm" style={{ color: 'var(--color-text-secondary)' }} mb="sm">
                <strong>As a beta user, you&apos;ll get:</strong>
              </Text>
              <Stack gap="xs">
                {['Early access to all features', 'Direct line to Travis for feedback', 'Free access during the beta period'].map((text) => (
                  <Group gap="xs" key={text}>
                    <Check size={16} color="var(--color-text-muted)" />
                    <Text size="sm" style={{ color: 'var(--color-text-primary)' }}>{text}</Text>
                  </Group>
                ))}
              </Stack>
            </Paper>

            <Text size="sm" style={{ color: 'var(--color-text-muted)' }}>
              This takes about 3 minutes.
            </Text>
          </Stack>
        </Stepper.Step>

        {/* Screens 1-6: Questions */}
        {ONBOARDING_QUESTIONS.map((_, idx) => (
          <Stepper.Step key={idx}>
            {renderQuestion(idx)}
          </Stepper.Step>
        ))}

        {/* Screen 7: Connect Device */}
        <Stepper.Step>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                Connect Your Device
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                Sync your activities to unlock training insights. No device yet? No problem — your
                coach and training plans work without it.
              </Text>
            </Box>

            <SimpleGrid cols={1} spacing="sm">
              <Paper p="md" withBorder style={{ borderColor: stravaConnected ? 'var(--color-teal)' : 'var(--tribos-border)', backgroundColor: stravaConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)' }}>
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" style={{ backgroundColor: `${STRAVA_ORANGE}20` }}>
                      <Heartbeat size={20} color={STRAVA_ORANGE} />
                    </ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: 'var(--color-text-primary)' }}>Strava</Text>
                      <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Import rides and activities</Text>
                    </Box>
                  </Group>
                  {stravaConnected ? (
                    <Badge color="green" leftSection={<Check size={12} />}>Connected</Badge>
                  ) : (
                    <ConnectWithStravaButton onClick={handleConnectStrava} />
                  )}
                </Group>
              </Paper>

              <Paper p="md" withBorder style={{ borderColor: garminConnected ? 'var(--color-teal)' : 'var(--tribos-border)', backgroundColor: garminConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)' }}>
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="blue" variant="light"><Watch size={20} /></ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: 'var(--color-text-primary)' }}>Garmin</Text>
                      <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Auto-sync from your Garmin device</Text>
                    </Box>
                  </Group>
                  {garminConnected ? (
                    <Badge color="green" leftSection={<Check size={12} />}>Connected</Badge>
                  ) : (
                    <Button size="xs" variant="light" color="blue" onClick={handleConnectGarmin}>Connect</Button>
                  )}
                </Group>
              </Paper>

              <Paper p="md" withBorder style={{ borderColor: wahooConnected ? 'var(--color-teal)' : 'var(--tribos-border)', backgroundColor: wahooConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)' }}>
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="cyan" variant="light"><Watch size={20} /></ThemeIcon>
                    <Box>
                      <Text fw={500} style={{ color: 'var(--color-text-primary)' }}>Wahoo</Text>
                      <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>Sync with Wahoo devices</Text>
                    </Box>
                  </Group>
                  {wahooConnected ? (
                    <Badge color="green" leftSection={<Check size={12} />}>Connected</Badge>
                  ) : (
                    <Button size="xs" variant="light" color="cyan" onClick={handleConnectWahoo}>Connect</Button>
                  )}
                </Group>
              </Paper>
            </SimpleGrid>

            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              You can always connect devices later in Settings.
            </Text>
          </Stack>
        </Stepper.Step>

        {/* Screen 8: Fitness Baseline */}
        <Stepper.Step>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                Fitness Baseline
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                Help us calibrate your training zones and display preferences.
              </Text>
            </Box>

            <Select
              label="Units Preference"
              description="How should we display distances and speeds?"
              value={unitsPreference}
              onChange={setUnitsPreference}
              data={[
                { value: 'metric', label: 'Metric (km, kg)' },
                { value: 'imperial', label: 'Imperial (mi, lbs)' },
              ]}
            />

            <NumberInput
              label="FTP (Functional Threshold Power)"
              description="Your 1-hour max sustainable power in watts. Leave blank if unsure."
              placeholder="e.g., 250"
              value={ftp || ''}
              onChange={(val) => setFtp(val || null)}
              min={50}
              max={600}
              suffix=" W"
            />

            <Paper p="sm" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
                <strong>Tip:</strong> If you don&apos;t know your FTP, you can set it later.
                We can also estimate it from your ride data once you&apos;ve connected a device.
              </Text>
            </Paper>
          </Stack>
        </Stepper.Step>

        {/* Screen 9: Coach Reveal */}
        <Stepper.Step>
          <Stack gap="lg" py="xl">
            {classifying && (
              <Stack align="center" gap="lg" py="xl">
                <Sparkle size={40} color="var(--color-teal)" />
                <Text size="lg" fw={600} style={{ color: 'var(--color-text-primary)' }}>
                  Setting up your coach...
                </Text>
                <Progress value={100} size="xs" color="var(--color-teal)" animated w="60%" />
              </Stack>
            )}

            {classificationResult && !classifying && (
              <Stack gap="lg">
                <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
                  Your Coach
                </Text>

                <Box>
                  <Title order={2} style={{ color: 'var(--color-text-primary)' }}>
                    {classificationResult.personaName || PERSONAS[classificationResult.persona]?.name || 'The Pragmatist'}
                  </Title>
                  <Text size="sm" c="dimmed" mt={4}>
                    &ldquo;{PERSONAS[classificationResult.persona]?.philosophy || ''}&rdquo;
                  </Text>
                </Box>

                {classificationResult.confidence < 0.75 && classificationResult.secondary && (
                  <Text size="xs" c="dimmed">
                    You also have some {PERSONAS[classificationResult.secondary]?.name} in you — you can explore this in Settings.
                  </Text>
                )}

                <Divider />

                <Paper
                  p="md"
                  style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderLeft: '3px solid var(--color-teal)',
                  }}
                >
                  <Text
                    size="sm"
                    style={{
                      color: 'var(--color-text-primary)',
                      lineHeight: 1.7,
                      fontStyle: 'italic',
                    }}
                  >
                    {classificationResult.openingMessage}
                  </Text>
                </Paper>
              </Stack>
            )}
          </Stack>
        </Stepper.Step>

        {/* Screen 10: You're Ready */}
        <Stepper.Completed>
          <Stack gap="lg" py="md" align="center">
            <ThemeIcon size={80} radius="xl" color="teal" variant="light">
              <Check size={40} />
            </ThemeIcon>

            <Title order={3} ta="center" style={{ color: 'var(--color-text-primary)' }}>
              You&apos;re all set{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(' ')[0]}` : ''}.
            </Title>

            <Text ta="center" size="sm" style={{ color: 'var(--color-text-secondary)' }}>
              Your coach is ready. Here&apos;s what to do next:
            </Text>

            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md" style={{ width: '100%' }}>
              <Paper
                p="md"
                withBorder
                style={{ backgroundColor: 'var(--color-bg-secondary)', cursor: 'pointer' }}
                onClick={handleComplete}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="teal" variant="light">
                    <Sparkle size={20} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} ta="center" style={{ color: 'var(--color-text-primary)' }}>
                    See your TODAY screen
                  </Text>
                </Stack>
              </Paper>

              <Paper
                p="md"
                withBorder
                style={{ backgroundColor: 'var(--color-bg-secondary)', cursor: 'pointer' }}
                onClick={() => { handleComplete(); navigate('/train/planner?tab=browse'); }}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="gray" variant="light">
                    <Heartbeat size={20} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} ta="center" style={{ color: 'var(--color-text-primary)' }}>
                    Browse training plans
                  </Text>
                </Stack>
              </Paper>
            </SimpleGrid>

            <Text size="xs" style={{ color: 'var(--color-text-muted)' }}>
              Use the feedback button (bottom right) to send suggestions or report issues!
            </Text>
          </Stack>
        </Stepper.Completed>
      </Stepper>

      {/* Navigation buttons */}
      {active < TOTAL_STEPS && (
        <>
          <Divider mb="md" />
          <Group justify="space-between">
            {active > 0 && active <= 9 ? (
              <Button
                variant="subtle"
                onClick={prevStep}
                leftSection={<CaretLeft size={16} />}
                disabled={active === 9 && classifying}
              >
                Back
              </Button>
            ) : (
              <div />
            )}

            {active < 9 ? (
              <Button
                onClick={nextStep}
                rightSection={<CaretRight size={16} />}
                color="teal"
                disabled={!canAdvance()}
              >
                {active === 0 ? 'Get Started' : active === 8 ? 'Meet Your Coach' : 'Next'}
              </Button>
            ) : active === 9 ? (
              <Button
                onClick={nextStep}
                rightSection={<CaretRight size={16} />}
                color="teal"
                disabled={!classificationResult || classifying}
              >
                Sounds good
              </Button>
            ) : null}
          </Group>
        </>
      )}
    </Modal>
  );
}

export default OnboardingModal;
