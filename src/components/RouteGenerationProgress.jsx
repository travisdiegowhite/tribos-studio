import { Box, Text, Stack, Transition } from '@mantine/core';
import { IconMapSearch, IconRoute, IconStarFilled, IconShieldCheck, IconSparkles } from '@tabler/icons-react';

const STEPS = [
  { key: 'analyzing', label: 'Analyzing terrain & roads', icon: IconMapSearch },
  { key: 'generating', label: 'Building route candidates', icon: IconRoute },
  { key: 'scoring', label: 'Scoring & ranking routes', icon: IconStarFilled },
  { key: 'safety', label: 'Checking road safety', icon: IconShieldCheck },
  { key: 'optimizing', label: 'Optimizing final routes', icon: IconSparkles },
];

export default function RouteGenerationProgress({ currentStep, visible }) {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <Transition mounted={visible} transition="fade" duration={250}>
      {(styles) => (
        <Box
          style={{
            ...styles,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <Box
            style={{
              background: 'var(--mantine-color-body)',
              border: '2px solid var(--color-teal, #2d9f7f)',
              padding: '28px 32px',
              maxWidth: 340,
              width: '90%',
            }}
          >
            {/* Animated bike */}
            <Box
              style={{
                textAlign: 'center',
                marginBottom: 20,
                fontSize: 28,
                animation: 'bike-ride 1.5s ease-in-out infinite',
              }}
            >
              <span role="img" aria-label="cyclist">&#x1F6B4;</span>
            </Box>

            <Text
              size="xs"
              fw={700}
              tt="uppercase"
              ta="center"
              mb="md"
              style={{ color: 'var(--color-teal, #2d9f7f)', letterSpacing: '0.12em' }}
            >
              Building Your Route
            </Text>

            <Stack gap={6}>
              {STEPS.map((step, idx) => {
                const isActive = idx === currentIdx;
                const isDone = idx < currentIdx;
                const isPending = idx > currentIdx;
                const Icon = step.icon;

                return (
                  <Box
                    key={step.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 8px',
                      opacity: isPending ? 0.35 : 1,
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    <Box
                      style={{
                        width: 24,
                        height: 24,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isDone ? (
                        <Text size="sm" style={{ color: 'var(--color-teal, #2d9f7f)' }}>&#10003;</Text>
                      ) : isActive ? (
                        <Box
                          style={{
                            width: 18,
                            height: 18,
                            border: '2px solid var(--color-teal, #2d9f7f)',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 0.8s linear infinite',
                          }}
                        />
                      ) : (
                        <Icon size={16} style={{ opacity: 0.4 }} />
                      )}
                    </Box>
                    <Text
                      size="sm"
                      fw={isActive ? 600 : 400}
                      style={{
                        color: isDone
                          ? 'var(--color-teal, #2d9f7f)'
                          : isActive
                          ? 'var(--mantine-color-text)'
                          : undefined,
                      }}
                    >
                      {step.label}
                    </Text>
                  </Box>
                );
              })}
            </Stack>

            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
              @keyframes bike-ride {
                0%, 100% { transform: translateX(-8px); }
                50% { transform: translateX(8px); }
              }
            `}</style>
          </Box>
        </Box>
      )}
    </Transition>
  );
}
