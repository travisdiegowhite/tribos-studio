import { useState, useEffect } from 'react';
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
  SegmentedControl,
  Chip,
  TextInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { ConnectWithStravaButton, STRAVA_ORANGE } from './StravaBranding';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import {
  INTAKE_QUESTIONS,
  EXPERIENCE_LEVEL_QUESTION,
  PERSONAS,
  PERSONA_LIST,
  DEFAULT_PERSONA,
} from '../data/coachingPersonas';
import { stravaService } from '../utils/stravaService';
import { garminService } from '../utils/garminService';
import { wahooService } from '../utils/wahooService';
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
  Barbell,
  Mountains,
  ArrowLeft,
  ArrowRight,
} from '@phosphor-icons/react';

// Weekly hours midpoint mapping
const HOURS_MAP = { '<5': 3.5, '5-8': 6.5, '8-12': 10, '12+': 14 };

// Weekly TSS estimate mapping
const TSS_MAP = {
  starting: 100,
  moderate: 250,
  high: 450,
  very_high: 650,
};

function OnboardingModal({ opened, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1 — About Your Riding
  const [experienceLevel, setExperienceLevel] = useState(null);
  const [weeklyHours, setWeeklyHours] = useState(null);
  const [preferredTerrain, setPreferredTerrain] = useState([]);

  // Step 2 — Your Goal
  const [primaryGoal, setPrimaryGoal] = useState(null);
  const [targetEventName, setTargetEventName] = useState('');
  const [targetEventDate, setTargetEventDate] = useState(null);

  // Step 3 — Meet Your Coach (inlined intake)
  const allIntakeQuestions = [...INTAKE_QUESTIONS, EXPERIENCE_LEVEL_QUESTION];
  const [intakeAnswers, setIntakeAnswers] = useState({});
  const [intakeQuestion, setIntakeQuestion] = useState(0);
  const [personaStep, setPersonaStep] = useState('questions');
  const [classification, setClassification] = useState(null);
  const [selectedPersona, setSelectedPersona] = useState(null);

  // Step 4 — Connect Device
  const [stravaConnected, setStravaConnected] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [wahooConnected, setWahooConnected] = useState(false);

  // Step 5 — Fitness Baseline
  const [ftp, setFtp] = useState(null);
  const [unitsPreference, setUnitsPreference] = useState('imperial');
  const [weeklyTssEstimate, setWeeklyTssEstimate] = useState(null);

  // Check device connections on mount
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

  // ── Persona Classification ───────────────────────────────────
  const handleClassify = async () => {
    setPersonaStep('classifying');

    try {
      const intakePayload = {
        q1: intakeAnswers.q1 || '',
        q2: intakeAnswers.q2 || '',
        q3: intakeAnswers.q3 || '',
        q4: intakeAnswers.q4 || '',
        q5: intakeAnswers.q5 || '',
      };

      const { data: { session } } = await supabase.auth.getSession();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('/api/coach-classify-persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ answers: intakePayload, userId: user?.id }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error('Classification failed');

      const data = await response.json();
      setClassification(data.classification);
      setSelectedPersona(data.classification.persona);

      // Store experience level from intake
      const expLevel = intakeAnswers.experience;
      if (expLevel && user?.id) {
        await supabase
          .from('user_coach_settings')
          .upsert({ user_id: user.id, coaching_experience_level: expLevel }, { onConflict: 'user_id' });
      }

      setPersonaStep('result');
    } catch (err) {
      console.error('Classification error:', err);
      // Fallback: assign pragmatist silently
      setClassification(null);
      setSelectedPersona(DEFAULT_PERSONA);
      setPersonaStep('result');
    }
  };

  // ── Save persona to user_coach_settings ─────────────────────
  const savePersona = async (personaId) => {
    if (!user?.id || !personaId) return;
    await supabase
      .from('user_coach_settings')
      .upsert(
        {
          user_id: user.id,
          coaching_persona: personaId,
          persona_set_at: new Date().toISOString(),
          persona_set_by: 'intake',
        },
        { onConflict: 'user_id' }
      );
  };

  // ── Completion ──────────────────────────────────────────────
  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Save persona first
      if (selectedPersona) {
        await savePersona(selectedPersona);
      }

      // Call completion endpoint
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/onboarding-complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          experience_level: experienceLevel,
          weekly_hours_available: weeklyHours ? HOURS_MAP[weeklyHours] : null,
          preferred_terrain: preferredTerrain.length > 0 ? preferredTerrain : null,
          primary_goal: primaryGoal,
          target_event_date: targetEventDate ? targetEventDate.toISOString().split('T')[0] : null,
          target_event_name: targetEventName || null,
          ftp: ftp || null,
          units_preference: unitsPreference,
          weekly_tss_estimate: weeklyTssEstimate ? TSS_MAP[weeklyTssEstimate] : null,
          persona_id: selectedPersona,
        }),
      });
    } catch (err) {
      console.error('Error completing onboarding:', err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  // ── Step Navigation ─────────────────────────────────────────
  const canAdvance = () => {
    switch (active) {
      case 1: return !!experienceLevel;
      case 2: return !!primaryGoal;
      case 3: return !!selectedPersona && personaStep === 'result';
      default: return true;
    }
  };

  const nextStep = () => {
    setActive((current) => (current < 5 ? current + 1 : current));
  };

  const prevStep = () => {
    setActive((current) => (current > 0 ? current - 1 : current));
  };

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

  // Current intake question
  const currentIntakeQ = allIntakeQuestions[intakeQuestion];
  const intakeProgress = ((intakeQuestion + 1) / allIntakeQuestions.length) * 100;

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
    >
      <Stepper active={active} onStepClick={setActive} color="teal" size="sm" mb="xl">
        {/* ── Step 0: Welcome ────────────────────────────── */}
        <Stepper.Step label="Welcome" icon={<Rocket size={18} />}>
          <Stack gap="lg" py="md">
            <Title order={3} style={{ color: 'var(--color-text-primary)' }}>
              Thanks for joining the beta!
            </Title>

            <Text style={{ color: 'var(--color-text-secondary)' }}>
              This takes about 3 minutes. We&apos;ll use your answers to personalize
              your training, your routes, and your coach from day one.
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
          </Stack>
        </Stepper.Step>

        {/* ── Step 1: About Your Riding ──────────────────── */}
        <Stepper.Step label="Riding" icon={<Mountains size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                About Your Riding
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                Help us understand where you are so we can meet you there.
              </Text>
            </Box>

            <Radio.Group
              label="Experience level"
              value={experienceLevel || ''}
              onChange={setExperienceLevel}
              withAsterisk
            >
              <Stack gap="xs" mt="xs">
                {[
                  { value: 'beginner', label: 'Just getting started — New to structured training' },
                  { value: 'intermediate', label: 'Recreational rider — Riding regularly, no race goals' },
                  { value: 'advanced', label: 'Competitive amateur — Racing or event-focused' },
                  { value: 'racer', label: 'Ex-racer / returning — Coming back after a break' },
                ].map((opt) => (
                  <Paper
                    key={opt.value}
                    p="sm"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      borderColor: experienceLevel === opt.value ? 'var(--color-teal)' : undefined,
                    }}
                    onClick={() => setExperienceLevel(opt.value)}
                  >
                    <Radio value={opt.value} label={opt.label} styles={{ label: { cursor: 'pointer' } }} />
                  </Paper>
                ))}
              </Stack>
            </Radio.Group>

            <Box>
              <Text size="sm" fw={500} mb="xs">Hours available per week</Text>
              <SegmentedControl
                fullWidth
                value={weeklyHours || ''}
                onChange={setWeeklyHours}
                data={[
                  { label: '< 5 hrs', value: '<5' },
                  { label: '5–8 hrs', value: '5-8' },
                  { label: '8–12 hrs', value: '8-12' },
                  { label: '12+ hrs', value: '12+' },
                ]}
              />
            </Box>

            <Box>
              <Text size="sm" fw={500} mb="xs">Preferred terrain (pick 1–3)</Text>
              <Chip.Group multiple value={preferredTerrain} onChange={setPreferredTerrain}>
                <Group gap="sm">
                  {['road', 'gravel', 'mountain', 'mixed'].map((t) => (
                    <Chip key={t} value={t} variant="outline" color="teal">
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            </Box>
          </Stack>
        </Stepper.Step>

        {/* ── Step 2: Your Goal ──────────────────────────── */}
        <Stepper.Step label="Goal" icon={<Target size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                Your Goal
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                What are you training for?
              </Text>
            </Box>

            <Radio.Group value={primaryGoal || ''} onChange={setPrimaryGoal}>
              <Stack gap="xs">
                {[
                  { value: 'event', label: 'A specific event', desc: 'Race, gran fondo, or target ride', icon: <Target size={18} /> },
                  { value: 'fitness', label: 'General fitness', desc: 'Stay fit, build base', icon: <Heartbeat size={18} /> },
                  { value: 'performance', label: 'Performance gains', desc: 'Push FTP, get faster', icon: <Barbell size={18} /> },
                  { value: 'comeback', label: 'Getting back', desc: 'Returning from injury or time off', icon: <ArrowRight size={18} /> },
                ].map((opt) => (
                  <Paper
                    key={opt.value}
                    p="md"
                    withBorder
                    style={{
                      cursor: 'pointer',
                      borderColor: primaryGoal === opt.value ? 'var(--color-teal)' : undefined,
                    }}
                    onClick={() => setPrimaryGoal(opt.value)}
                  >
                    <Group gap="sm">
                      <ThemeIcon size="md" variant="light" color="gray">{opt.icon}</ThemeIcon>
                      <Box>
                        <Radio value={opt.value} label={opt.label} styles={{ label: { cursor: 'pointer', fontWeight: 500 } }} />
                        <Text size="xs" c="dimmed" ml={26}>{opt.desc}</Text>
                      </Box>
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Radio.Group>

            {primaryGoal === 'event' && (
              <Paper p="md" withBorder style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                <Stack gap="sm">
                  <TextInput
                    label="Event name"
                    placeholder="e.g., Gran Fondo New York"
                    value={targetEventName}
                    onChange={(e) => setTargetEventName(e.target.value)}
                  />
                  <DatePickerInput
                    label="Event date"
                    placeholder="Pick a date"
                    value={targetEventDate}
                    onChange={setTargetEventDate}
                    minDate={new Date()}
                    clearable
                  />
                </Stack>
              </Paper>
            )}
          </Stack>
        </Stepper.Step>

        {/* ── Step 3: Meet Your Coach ────────────────────── */}
        <Stepper.Step label="Coach" icon={<Sparkle size={18} />}>
          <Stack gap="lg" py="md">
            {personaStep === 'questions' && (
              <>
                <Box>
                  <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed" mb={4}>
                    Coaching Style · Question {intakeQuestion + 1} of {allIntakeQuestions.length}
                  </Text>
                  <Progress value={intakeProgress} size="xs" color="var(--color-teal)" />
                </Box>

                <Title order={4}>{currentIntakeQ.question}</Title>

                <Radio.Group
                  value={intakeAnswers[currentIntakeQ.id] || ''}
                  onChange={(value) => setIntakeAnswers((prev) => ({ ...prev, [currentIntakeQ.id]: value }))}
                >
                  <Stack gap="sm">
                    {currentIntakeQ.options.map((option) => (
                      <Paper
                        key={option.value}
                        p="sm"
                        withBorder
                        style={{
                          borderRadius: 0,
                          cursor: 'pointer',
                          borderColor: intakeAnswers[currentIntakeQ.id] === option.value ? 'var(--color-teal)' : undefined,
                        }}
                        onClick={() => setIntakeAnswers((prev) => ({ ...prev, [currentIntakeQ.id]: option.value }))}
                      >
                        <Radio value={option.value} label={option.label} styles={{ label: { cursor: 'pointer' } }} />
                      </Paper>
                    ))}
                  </Stack>
                </Radio.Group>

                <Group justify="space-between">
                  <Button
                    variant="subtle"
                    leftSection={<ArrowLeft size={16} />}
                    onClick={() => setIntakeQuestion((prev) => Math.max(0, prev - 1))}
                    disabled={intakeQuestion === 0}
                  >
                    Back
                  </Button>
                  <Button
                    rightSection={intakeQuestion === allIntakeQuestions.length - 1 ? <Sparkle size={16} /> : <ArrowRight size={16} />}
                    onClick={() => {
                      if (intakeQuestion < allIntakeQuestions.length - 1) {
                        setIntakeQuestion((prev) => prev + 1);
                      } else {
                        handleClassify();
                      }
                    }}
                    disabled={!intakeAnswers[currentIntakeQ.id]}
                    color="var(--color-teal)"
                    style={{ borderRadius: 0 }}
                  >
                    {intakeQuestion === allIntakeQuestions.length - 1 ? 'Find My Coach' : 'Next'}
                  </Button>
                </Group>
              </>
            )}

            {personaStep === 'classifying' && (
              <Stack align="center" gap="lg" py="xl">
                <Sparkle size={40} color="var(--color-teal)" />
                <Text size="lg" fw={600}>Analyzing your coaching style...</Text>
                <Progress value={100} size="xs" color="var(--color-teal)" animated w="60%" />
              </Stack>
            )}

            {personaStep === 'result' && (
              <>
                <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
                  Your Coaching Match
                </Text>

                {classification?.reasoning && (
                  <Text size="sm" c="dimmed">
                    {classification.reasoning}
                    {classification.confidence < 0.75 && classification.secondary && (
                      <> We also considered <strong>{PERSONAS[classification.secondary]?.name}</strong> as a close match.</>
                    )}
                  </Text>
                )}

                <Radio.Group value={selectedPersona || ''} onChange={setSelectedPersona}>
                  <Stack gap="sm">
                    {PERSONA_LIST.map((persona) => {
                      const isRecommended = classification?.persona === persona.id;
                      return (
                        <Paper
                          key={persona.id}
                          p="md"
                          withBorder
                          style={{
                            borderRadius: 0,
                            cursor: 'pointer',
                            borderColor: selectedPersona === persona.id ? 'var(--color-teal)' : undefined,
                            borderWidth: isRecommended ? 2 : undefined,
                          }}
                          onClick={() => setSelectedPersona(persona.id)}
                        >
                          <Group justify="space-between" mb={4}>
                            <Group gap="xs">
                              <Radio value={persona.id} label={persona.name} fw={600} />
                              {isRecommended && (
                                <Badge size="xs" variant="light" color="teal">Recommended</Badge>
                              )}
                            </Group>
                          </Group>
                          <Text size="xs" c="dimmed" ml={26}>{persona.tagline}</Text>
                          <Text size="sm" mt={4} ml={26} lineClamp={2}>
                            &ldquo;{persona.philosophy}&rdquo;
                          </Text>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Radio.Group>

                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setIntakeQuestion(0);
                    setIntakeAnswers({});
                    setClassification(null);
                    setSelectedPersona(null);
                    setPersonaStep('questions');
                  }}
                >
                  Retake Interview
                </Button>
              </>
            )}
          </Stack>
        </Stepper.Step>

        {/* ── Step 4: Connect Device ─────────────────────── */}
        <Stepper.Step label="Connect" icon={<Watch size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                Connect Your Devices
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                Sync your activities from Strava, Garmin, or Wahoo to unlock training insights.
              </Text>
            </Box>

            <SimpleGrid cols={1} spacing="sm">
              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: stravaConnected ? 'var(--color-teal)' : 'var(--tribos-border)',
                  backgroundColor: stravaConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)',
                }}
              >
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

              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: garminConnected ? 'var(--color-teal)' : 'var(--tribos-border)',
                  backgroundColor: garminConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)',
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="blue" variant="light">
                      <Watch size={20} />
                    </ThemeIcon>
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

              <Paper
                p="md"
                withBorder
                style={{
                  borderColor: wahooConnected ? 'var(--color-teal)' : 'var(--tribos-border)',
                  backgroundColor: wahooConnected ? 'var(--color-teal)10' : 'var(--color-bg-secondary)',
                }}
              >
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon size="lg" color="cyan" variant="light">
                      <Watch size={20} />
                    </ThemeIcon>
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

            <Text size="xs" ta="center" style={{ color: 'var(--color-text-muted)' }}>
              No device yet? No problem — you can connect later. Your coach and training plans work without it.
            </Text>
          </Stack>
        </Stepper.Step>

        {/* ── Step 5: Fitness Baseline ───────────────────── */}
        <Stepper.Step label="Baseline" icon={<Barbell size={18} />}>
          <Stack gap="lg" py="md">
            <Box>
              <Title order={3} style={{ color: 'var(--color-text-primary)' }} mb="xs">
                Your Fitness Baseline
              </Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>
                These help us calibrate your training metrics from day one.
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

            <Box>
              <Text size="sm" fw={500} mb="xs">Current weekly training load</Text>
              <SegmentedControl
                fullWidth
                value={weeklyTssEstimate || ''}
                onChange={setWeeklyTssEstimate}
                data={[
                  { label: 'Just starting', value: 'starting' },
                  { label: 'Moderate', value: 'moderate' },
                  { label: 'High', value: 'high' },
                  { label: 'Very high', value: 'very_high' },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>
                {weeklyTssEstimate === 'starting' && '< 3 hrs/week'}
                {weeklyTssEstimate === 'moderate' && '3–6 hrs/week'}
                {weeklyTssEstimate === 'high' && '6–10 hrs/week'}
                {weeklyTssEstimate === 'very_high' && '10+ hrs/week'}
              </Text>
            </Box>
          </Stack>
        </Stepper.Step>

        {/* ── Completed ─────────────────────────────────── */}
        <Stepper.Completed>
          <Stack gap="lg" py="md" align="center">
            <ThemeIcon size={80} radius="xl" color="teal" variant="light">
              <Check size={40} />
            </ThemeIcon>

            <Title order={3} ta="center" style={{ color: 'var(--color-text-primary)' }}>
              You&apos;re All Set!
            </Title>

            {selectedPersona && PERSONAS[selectedPersona] && (
              <Text ta="center" style={{ color: 'var(--color-text-secondary)' }}>
                Your coach is <strong>{PERSONAS[selectedPersona].name}</strong>
              </Text>
            )}

            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md" style={{ width: '100%' }}>
              <Paper
                p="md"
                withBorder
                style={{ backgroundColor: 'var(--color-bg-secondary)', cursor: 'pointer' }}
                onClick={handleComplete}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="teal" variant="light">
                    <Rocket size={20} />
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
                onClick={async () => { await handleComplete(); navigate('/train/planner?tab=browse'); }}
              >
                <Stack gap="xs" align="center">
                  <ThemeIcon size="lg" color="gray" variant="light">
                    <Path size={20} />
                  </ThemeIcon>
                  <Text size="sm" fw={500} ta="center" style={{ color: 'var(--color-text-primary)' }}>
                    Start a training plan
                  </Text>
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Stepper.Completed>
      </Stepper>

      <Divider mb="md" />

      <Group justify="space-between">
        {active > 0 && active < 6 ? (
          <Button
            variant="subtle"
            onClick={active === 3 && personaStep !== 'result' ? undefined : prevStep}
            leftSection={<CaretLeft size={16} />}
            disabled={active === 3 && personaStep !== 'result'}
          >
            Back
          </Button>
        ) : (
          <div />
        )}

        {active < 5 ? (
          <Button
            onClick={nextStep}
            rightSection={<CaretRight size={16} />}
            color="teal"
            disabled={!canAdvance()}
          >
            Continue
          </Button>
        ) : active === 5 ? (
          <Button
            onClick={nextStep}
            rightSection={<CaretRight size={16} />}
            color="teal"
          >
            Finish Setup
          </Button>
        ) : null}
      </Group>
    </Modal>
  );
}

export default OnboardingModal;
