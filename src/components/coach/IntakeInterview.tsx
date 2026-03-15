/**
 * IntakeInterview — 5-question coaching persona intake flow.
 *
 * Presented as a modal on first visit to the check-in page (or re-takeable
 * from Settings). Collects answers, sends to /api/coach-classify-persona,
 * shows the result, and lets the user confirm or override.
 */

import { useState } from 'react';
import {
  Modal,
  Stack,
  Text,
  Title,
  Button,
  Group,
  Radio,
  Progress,
  Paper,
  Badge,
  Divider,
  Box,
} from '@mantine/core';
import { IconArrowRight, IconArrowLeft, IconCheck, IconSparkles } from '@tabler/icons-react';
import { INTAKE_QUESTIONS, PERSONAS, PERSONA_LIST } from '../../data/coachingPersonas';
import type { PersonaId, PersonaClassification, IntakeAnswers } from '../../types/checkIn';
import { supabase } from '../../lib/supabase';

interface IntakeInterviewProps {
  opened: boolean;
  onComplete: (personaId: PersonaId) => void;
  userId: string;
}

type Step = 'questions' | 'classifying' | 'result';

export default function IntakeInterview({ opened, onComplete, userId }: IntakeInterviewProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>('questions');
  const [classification, setClassification] = useState<PersonaClassification | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const question = INTAKE_QUESTIONS[currentQuestion];
  const progress = ((currentQuestion + 1) / INTAKE_QUESTIONS.length) * 100;

  const handleAnswer = (value: string) => {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const handleNext = () => {
    if (currentQuestion < INTAKE_QUESTIONS.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setStep('classifying');
    setError(null);

    try {
      const intakeAnswers: IntakeAnswers = {
        q1: answers.q1 || '',
        q2: answers.q2 || '',
        q3: answers.q3 || '',
        q4: answers.q4 || '',
        q5: answers.q5 || '',
      };

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/coach-classify-persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ answers: intakeAnswers, userId }),
      });

      if (!response.ok) {
        throw new Error('Classification failed');
      }

      const data = await response.json();
      setClassification(data.classification);
      setSelectedPersona(data.classification.persona);
      setStep('result');
    } catch (err) {
      console.error('Intake classification error:', err);
      setError('Something went wrong. You can try again or pick a persona manually.');
      setClassification(null);
      setSelectedPersona('pragmatist');
      setStep('result');
    }
  };

  const handleConfirm = () => {
    if (!selectedPersona) return;
    onComplete(selectedPersona);
  };

  const handleReset = () => {
    setCurrentQuestion(0);
    setAnswers({});
    setStep('questions');
    setClassification(null);
    setSelectedPersona(null);
    setError(null);
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      size="lg"
      centered
      styles={{
        content: { borderRadius: 0, border: '1.5px solid var(--tribos-border-default)' },
        header: { borderRadius: 0 },
      }}
    >
      {step === 'questions' && (
        <Stack gap="lg">
          <Box>
            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              ff="monospace"
              c="dimmed"
              mb={4}
            >
              Coaching Style · Question {currentQuestion + 1} of {INTAKE_QUESTIONS.length}
            </Text>
            <Progress value={progress} size="xs" color="var(--color-teal)" />
          </Box>

          <Title order={4}>{question.question}</Title>

          <Radio.Group
            value={answers[question.id] || ''}
            onChange={handleAnswer}
          >
            <Stack gap="sm">
              {question.options.map((option) => (
                <Paper
                  key={option.value}
                  p="sm"
                  withBorder
                  style={{
                    borderRadius: 0,
                    cursor: 'pointer',
                    borderColor: answers[question.id] === option.value
                      ? 'var(--color-teal)'
                      : undefined,
                  }}
                  onClick={() => handleAnswer(option.value)}
                >
                  <Radio
                    value={option.value}
                    label={option.label}
                    styles={{ label: { cursor: 'pointer' } }}
                  />
                </Paper>
              ))}
            </Stack>
          </Radio.Group>

          <Group justify="space-between">
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={handleBack}
              disabled={currentQuestion === 0}
            >
              Back
            </Button>
            <Button
              rightSection={
                currentQuestion === INTAKE_QUESTIONS.length - 1
                  ? <IconSparkles size={16} />
                  : <IconArrowRight size={16} />
              }
              onClick={handleNext}
              disabled={!answers[question.id]}
              color="var(--color-teal)"
              style={{ borderRadius: 0 }}
            >
              {currentQuestion === INTAKE_QUESTIONS.length - 1 ? 'Find My Coach' : 'Next'}
            </Button>
          </Group>
        </Stack>
      )}

      {step === 'classifying' && (
        <Stack align="center" gap="lg" py="xl">
          <IconSparkles size={40} color="var(--color-teal)" />
          <Text size="lg" fw={600}>Analyzing your coaching style...</Text>
          <Progress value={100} size="xs" color="var(--color-teal)" animated w="60%" />
        </Stack>
      )}

      {step === 'result' && (
        <Stack gap="lg">
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            ff="monospace"
            c="dimmed"
          >
            Your Coaching Match
          </Text>

          {error && (
            <Text size="sm" c="red">{error}</Text>
          )}

          {classification && (
            <Text size="sm" c="dimmed">
              {classification.reasoning}
              {classification.confidence < 0.75 && classification.secondary && (
                <> We also considered <strong>{PERSONAS[classification.secondary]?.name}</strong> as a close match.</>
              )}
            </Text>
          )}

          <Radio.Group
            value={selectedPersona || ''}
            onChange={(value) => setSelectedPersona(value as PersonaId)}
          >
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
                      borderColor: selectedPersona === persona.id
                        ? 'var(--color-teal)'
                        : undefined,
                      borderWidth: isRecommended ? 2 : undefined,
                    }}
                    onClick={() => setSelectedPersona(persona.id)}
                  >
                    <Group justify="space-between" mb={4}>
                      <Group gap="xs">
                        <Radio value={persona.id} label={persona.name} fw={600} />
                        {isRecommended && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="teal"
                          >
                            Recommended
                          </Badge>
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

          <Divider />

          <Group justify="space-between">
            <Button variant="subtle" onClick={handleReset}>
              Retake Interview
            </Button>
            <Button
              rightSection={<IconCheck size={16} />}
              onClick={handleConfirm}
              disabled={!selectedPersona}
              color="var(--color-teal)"
              style={{ borderRadius: 0 }}
            >
              Confirm Coach
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
