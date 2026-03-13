import React, { useState } from 'react';
import {
  Card,
  Text,
  Stack,
  Group,
  Button,
  Progress,
  Badge,
  Box,
  Alert,
  Loader,
} from '@mantine/core';
import {
  IconMessageCircle,
  IconChevronRight,
  IconChevronLeft,
  IconCheck,
  IconRefresh,
} from '@tabler/icons-react';
import type { IntakeAnswers, PersonaClassification, PersonaId } from '../../types/checkIn';
import { COACHING_PERSONAS } from '../../data/coachingPersonas';

interface IntakeInterviewProps {
  onComplete: (answers: IntakeAnswers) => Promise<PersonaClassification | null>;
  onSkip: () => void;
  loading?: boolean;
}

interface Question {
  id: keyof IntakeAnswers;
  text: string;
  options: { label: string; value: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: 'answer_1',
    text: 'When you miss or cut short a workout, what\'s most helpful to hear from a coach?',
    options: [
      { label: 'Just tell me what to do next', value: 'Just tell me what to do next' },
      { label: 'Help me understand why it matters', value: 'Help me understand why it matters' },
      { label: 'Remind me it\'s okay and help me move on', value: 'Remind me it\'s okay and help me move on' },
      { label: 'Hold me accountable', value: 'Hold me accountable' },
    ],
  },
  {
    id: 'answer_2',
    text: 'What\'s your main goal this season?',
    options: [
      { label: 'Specific race result or PR', value: 'Specific race result or PR' },
      { label: 'Build a sustainable training habit', value: 'Build a sustainable training habit' },
      { label: 'Understand my physiology and optimize', value: 'Understand my physiology and optimize performance' },
      { label: 'Complete a target event', value: 'Complete a target event and finish strong' },
    ],
  },
  {
    id: 'answer_3',
    text: 'When a training week gets hard, how do you naturally respond?',
    options: [
      { label: 'Push through, no matter what', value: 'Push through, no matter what' },
      { label: 'Assess the data and adjust', value: 'Assess the data and adjust intelligently' },
      { label: 'Remind myself why I started', value: 'Remind myself why I started' },
      { label: 'Figure out what\'s realistic and do that', value: 'Figure out what\'s actually realistic and do that' },
      { label: 'Think about race day', value: 'Think about race day and what it\'ll take to compete' },
    ],
  },
  {
    id: 'answer_4',
    text: 'How many hours per week are you realistically training right now?',
    options: [
      { label: 'Under 6 hours', value: 'Under 6 hours' },
      { label: '6–10 hours', value: '6-10 hours' },
      { label: '10+ hours', value: '10+ hours' },
    ],
  },
  {
    id: 'answer_5',
    text: 'What does a good coach do for you that a training plan alone can\'t?',
    options: [
      { label: 'Keeps me honest and accountable', value: 'Keeps me honest and accountable' },
      { label: 'Explains the why behind everything', value: 'Explains the why behind everything' },
      { label: 'Believes in me when I don\'t', value: 'Believes in me when I don\'t believe in myself' },
      { label: 'Works with my real life', value: 'Works with my real life, not an ideal version of it' },
      { label: 'Keeps my eyes on the prize', value: 'Keeps my eyes on the prize' },
    ],
  },
];

export function IntakeInterview({ onComplete, onSkip, loading = false }: IntakeInterviewProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<IntakeAnswers>>({});
  const [result, setResult] = useState<PersonaClassification | null>(null);
  const [classifying, setClassifying] = useState(false);

  const currentQuestion = QUESTIONS[step];
  const progress = ((step + 1) / QUESTIONS.length) * 100;
  const isComplete = step >= QUESTIONS.length;

  const handleSelect = (value: string) => {
    const updated = { ...answers, [currentQuestion.id]: value };
    setAnswers(updated);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      // All questions answered — classify
      handleClassify(updated as IntakeAnswers);
    }
  };

  const handleClassify = async (allAnswers: IntakeAnswers) => {
    setClassifying(true);
    setStep(QUESTIONS.length); // Move past questions
    const classification = await onComplete(allAnswers);
    setResult(classification);
    setClassifying(false);
  };

  if (isComplete) {
    if (classifying) {
      return (
        <Card withBorder p="xl" style={{ borderRadius: 0 }}>
          <Stack align="center" gap="md" py="xl">
            <Loader size="md" color="teal" />
            <Text size="sm" c="dimmed">Analyzing your coaching preferences...</Text>
          </Stack>
        </Card>
      );
    }

    if (result) {
      const persona = COACHING_PERSONAS[result.persona as PersonaId];
      const secondary = result.secondary ? COACHING_PERSONAS[result.secondary as PersonaId] : null;

      return (
        <Card withBorder p="xl" style={{ borderRadius: 0 }}>
          <Stack gap="md">
            <Group gap="xs">
              <IconCheck size={20} color="var(--mantine-color-teal-6)" />
              <Text fw={600}>Your coaching persona</Text>
            </Group>

            <Box p="md" style={{ border: '2px solid var(--mantine-color-teal-6)', borderRadius: 0 }}>
              <Text fw={700} size="lg">{persona.name}</Text>
              <Text size="sm" c="dimmed">{persona.subtitle}</Text>
              <Text size="sm" mt="xs" fs="italic">"{persona.philosophy}"</Text>
            </Box>

            <Text size="sm" c="dimmed">{result.reasoning}</Text>

            {secondary && result.confidence < 0.75 && (
              <Alert color="yellow" variant="light" style={{ borderRadius: 0 }}>
                <Text size="sm">
                  Also a strong match: <strong>{secondary.name}</strong> — {secondary.subtitle}
                </Text>
              </Alert>
            )}

            <Text size="xs" c="dimmed">You can change your coaching persona anytime in Settings.</Text>
          </Stack>
        </Card>
      );
    }
  }

  return (
    <Card withBorder p="xl" style={{ borderRadius: 0 }}>
      <Stack gap="lg">
        <Group justify="space-between">
          <Group gap="xs">
            <IconMessageCircle size={20} />
            <Text fw={600}>Set up your coach</Text>
          </Group>
          <Badge variant="light" color="teal" size="sm">
            {step + 1} / {QUESTIONS.length}
          </Badge>
        </Group>

        <Progress value={progress} color="teal" size="xs" />

        <Text size="md" fw={500}>{currentQuestion.text}</Text>

        <Stack gap="xs">
          {currentQuestion.options.map((option) => (
            <Button
              key={option.value}
              variant={answers[currentQuestion.id] === option.value ? 'filled' : 'outline'}
              color="teal"
              fullWidth
              justify="flex-start"
              onClick={() => handleSelect(option.value)}
              loading={loading}
              style={{ borderRadius: 0 }}
              size="md"
            >
              {option.label}
            </Button>
          ))}
        </Stack>

        <Group justify="space-between">
          {step > 0 ? (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconChevronLeft size={14} />}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button variant="subtle" color="gray" size="xs" onClick={onSkip}>
            Skip — use default coach
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
