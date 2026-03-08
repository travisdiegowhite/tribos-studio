import { Box, Group, Text, Progress } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { tokens } from '../theme';

/**
 * StepIndicator - A horizontal step indicator for the Route Builder wizard
 * @param {number} currentStep - Current active step (0-indexed)
 * @param {Array} steps - Array of step objects with { id, label, icon }
 * @param {function} onStepClick - Callback when a step is clicked (optional)
 */
function StepIndicator({ currentStep, steps, onStepClick }) {
  const progressPercentage = ((currentStep + 1) / steps.length) * 100;

  return (
    <Box
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: tokens.radius.md,
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      {/* Step circles and labels */}
      <Group justify="space-between" style={{ position: 'relative', marginBottom: '12px' }}>
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          const isClickable = index <= currentStep && onStepClick;

          return (
            <Box
              key={step.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                cursor: isClickable ? 'pointer' : 'default',
                opacity: index > currentStep ? 0.5 : 1,
                transition: 'opacity 0.2s ease',
              }}
              onClick={() => isClickable && onStepClick(index)}
            >
              <Box
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: isCompleted
                    ? 'var(--color-teal)'
                    : isActive
                    ? `${'var(--color-teal)'}30`
                    : 'var(--color-bg-secondary)',
                  border: isActive
                    ? `2px solid ${'var(--color-teal)'}`
                    : isCompleted
                    ? 'none'
                    : `1px solid ${'var(--tribos-bg-elevated)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  marginBottom: '8px',
                }}
              >
                {isCompleted ? (
                  <IconCheck size={18} style={{ color: 'var(--color-bg)' }} />
                ) : (
                  <Text
                    size="sm"
                    fw={600}
                    style={{
                      color: isActive
                        ? 'var(--color-teal)'
                        : 'var(--color-text-muted)',
                    }}
                  >
                    {step.icon || index + 1}
                  </Text>
                )}
              </Box>
              <Text
                size="xs"
                fw={isActive ? 600 : 400}
                style={{
                  color: isActive
                    ? 'var(--color-teal)'
                    : isCompleted
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-muted)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </Text>
            </Box>
          );
        })}
      </Group>

      {/* Progress bar */}
      <Progress
        value={progressPercentage}
        size="xs"
        color="teal"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        animated={currentStep < steps.length - 1}
      />
    </Box>
  );
}

export default StepIndicator;
