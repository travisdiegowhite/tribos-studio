import { useState, useEffect } from 'react';
import { Container, Text, Paper, Group, ThemeIcon, Box, Stack, Button } from '@mantine/core';
import { IconSparkles, IconUser, IconRobot, IconPlus } from '@tabler/icons-react';
import { useScrollReveal, usePrefersReducedMotion } from './useScrollReveal';

const chatMessages = [
  {
    type: 'user',
    text: 'What should I ride today? I have about 90 minutes.',
    delay: 0,
  },
  {
    type: 'typing',
    delay: 600,
    duration: 1200,
  },
  {
    type: 'coach',
    text: 'Your TSB is +8 and you had a rest day yesterday \u2014 you\'re fresh. Based on your last 3 weeks of loading, I\'d recommend sweet spot intervals: 3\u00d715min at 88-93% FTP with 5min recovery between sets.',
    delay: 1800,
    action: { icon: IconPlus, label: 'Add Sweet Spot 3\u00d715' },
  },
  {
    type: 'user',
    text: 'Build me a route for that? Rolling hills, avoid highways.',
    delay: 4200,
  },
  {
    type: 'typing',
    delay: 4800,
    duration: 1200,
  },
  {
    type: 'coach',
    text: 'Done \u2014 42mi loop through Hygiene and Longmont using roads from your ride history. 2,230ft elevation, chip-seal free. Sweet spot zones are mapped to the rollers on Nelson Rd. Sending to your Garmin.',
    delay: 6000,
  },
];

function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
}

export default function CoachStep() {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  const reducedMotion = usePrefersReducedMotion();
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [showTyping, setShowTyping] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    if (reducedMotion) {
      // Show all non-typing messages immediately
      setVisibleMessages(chatMessages.filter(m => m.type !== 'typing'));
      return;
    }

    const timers = [];

    chatMessages.forEach((msg) => {
      if (msg.type === 'typing') {
        timers.push(setTimeout(() => setShowTyping(true), msg.delay));
        timers.push(setTimeout(() => setShowTyping(false), msg.delay + msg.duration));
      } else {
        timers.push(setTimeout(() => {
          setVisibleMessages(prev => [...prev, msg]);
        }, msg.delay));
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [isVisible, reducedMotion]);

  return (
    <Box
      py={{ base: 60, md: 100 }}
      px={{ base: 'md', md: 'xl' }}
      style={{ backgroundColor: 'var(--tribos-bg-secondary)', borderTop: '1px solid var(--tribos-border-default)', borderBottom: '1px solid var(--tribos-border-default)' }}
    >
      <Container size="md">
        <div ref={ref} className={`landing-step ${isVisible ? 'visible' : ''}`}>
          <Stack gap="xl" align="center">
            <div>
              <Text
                className="step-label"
                size="xs"
                ta="center"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                  color: 'var(--tribos-terracotta-500)',
                  marginBottom: 8,
                }}
              >
                Step 04 — Ask
              </Text>
              <Text
                className="step-title"
                ta="center"
                style={{
                  fontSize: 'clamp(1.4rem, 3.5vw, 2.2rem)',
                  fontFamily: "'Anybody', sans-serif",
                  fontWeight: 800,
                  color: 'var(--tribos-text-primary)',
                }}
              >
                Your coach already knows the answer.
              </Text>
            </div>

            <Paper
              className="step-content"
              p={0}
              style={{
                width: '100%',
                maxWidth: 560,
                overflow: 'hidden',
              }}
            >
              {/* Chat header */}
              <Group
                px="md"
                py="sm"
                gap="sm"
                style={{ borderBottom: '1px solid var(--tribos-border-default)' }}
              >
                <ThemeIcon color="terracotta" variant="light" size="sm">
                  <IconSparkles size={14} />
                </ThemeIcon>
                <Text fw={600} size="sm" style={{ color: 'var(--tribos-text-primary)' }}>
                  AI Coach
                </Text>
                <Box
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: 'var(--tribos-sage-500)',
                    marginLeft: -4,
                  }}
                />
              </Group>

              {/* Chat messages */}
              <Stack gap={0} p="md" style={{ minHeight: 280 }}>
                {visibleMessages.map((msg, index) => {
                  if (msg.type === 'user') {
                    return (
                      <Box
                        key={index}
                        className={`chat-message ${isVisible ? 'visible' : ''}`}
                        mb="md"
                        style={{ display: 'flex', justifyContent: 'flex-end' }}
                      >
                        <Paper
                          p="sm"
                          style={{
                            maxWidth: '80%',
                            backgroundColor: 'var(--tribos-input, var(--tribos-bg-tertiary))',
                            border: '1px solid var(--tribos-border-default)',
                          }}
                        >
                          <Text size="sm" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.5 }}>
                            {msg.text}
                          </Text>
                        </Paper>
                      </Box>
                    );
                  }

                  if (msg.type === 'coach') {
                    return (
                      <Box key={index} className={`chat-message ${isVisible ? 'visible' : ''}`} mb="md">
                        <Group gap={8} align="flex-start">
                          <ThemeIcon color="terracotta" variant="light" size="sm" mt={2}>
                            <IconRobot size={12} />
                          </ThemeIcon>
                          <Stack gap="xs" style={{ flex: 1 }}>
                            <Paper
                              p="sm"
                              style={{
                                backgroundColor: 'var(--tribos-terracotta-surface)',
                                border: '1px solid var(--tribos-terracotta-border)',
                              }}
                            >
                              <Text size="sm" style={{ color: 'var(--tribos-text-primary)', lineHeight: 1.6 }}>
                                {msg.text}
                              </Text>
                            </Paper>
                            {msg.action && (
                              <Button
                                size="compact-xs"
                                variant="light"
                                color="terracotta"
                                leftSection={<msg.action.icon size={12} />}
                                style={{ alignSelf: 'flex-start', pointerEvents: 'none' }}
                              >
                                {msg.action.label}
                              </Button>
                            )}
                          </Stack>
                        </Group>
                      </Box>
                    );
                  }

                  return null;
                })}

                {/* Typing indicator */}
                {showTyping && (
                  <Box mb="md">
                    <Group gap={8} align="flex-start">
                      <ThemeIcon color="terracotta" variant="light" size="sm" mt={2}>
                        <IconRobot size={12} />
                      </ThemeIcon>
                      <Paper
                        p="xs"
                        style={{
                          backgroundColor: 'var(--tribos-terracotta-surface)',
                          border: '1px solid var(--tribos-terracotta-border)',
                        }}
                      >
                        <TypingIndicator />
                      </Paper>
                    </Group>
                  </Box>
                )}
              </Stack>
            </Paper>
          </Stack>
        </div>
      </Container>
    </Box>
  );
}
