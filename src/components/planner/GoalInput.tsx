/**
 * GoalInput Component
 * Allows users to set training goals via templates or freeform input
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Text,
  Group,
  Button,
  TextInput,
  Textarea,
  Select,
  Badge,
  ActionIcon,
  Collapse,
  Stack,
  SimpleGrid,
  Tooltip,
} from '@mantine/core';
import {
  IconTarget,
  IconPlus,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconCalendar,
  IconTrophy,
  IconBike,
  IconMountain,
  IconClock,
} from '@tabler/icons-react';
import type { PlannerGoal } from '../../types/planner';

// ============================================================
// GOAL TEMPLATES
// ============================================================

interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  suggestedDuration: number; // weeks
}

const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'gran-fondo',
    name: 'Gran Fondo',
    description: 'Prepare for a long-distance cycling event (100+ miles)',
    icon: <IconMountain size={20} />,
    color: 'blue',
    suggestedDuration: 12,
  },
  {
    id: 'century',
    name: 'Century Ride',
    description: 'Build endurance for your first 100-mile ride',
    icon: <IconBike size={20} />,
    color: 'green',
    suggestedDuration: 10,
  },
  {
    id: 'crit-racing',
    name: 'Criterium Racing',
    description: 'Sharpen speed and handling for criterium races',
    icon: <IconTrophy size={20} />,
    color: 'red',
    suggestedDuration: 8,
  },
  {
    id: 'road-race',
    name: 'Road Race',
    description: 'Prepare for competitive road racing',
    icon: <IconTrophy size={20} />,
    color: 'orange',
    suggestedDuration: 10,
  },
  {
    id: 'time-trial',
    name: 'Time Trial',
    description: 'Maximize power output for time trials',
    icon: <IconClock size={20} />,
    color: 'violet',
    suggestedDuration: 8,
  },
  {
    id: 'base-building',
    name: 'Base Building',
    description: 'Build aerobic foundation for the season',
    icon: <IconBike size={20} />,
    color: 'cyan',
    suggestedDuration: 8,
  },
];

// ============================================================
// COMPONENT PROPS
// ============================================================

interface GoalInputProps {
  goals: PlannerGoal[];
  onAddGoal: (goal: Omit<PlannerGoal, 'id' | 'createdAt'>) => void;
  onRemoveGoal: (id: string) => void;
  onUpdateGoal: (id: string, updates: Partial<PlannerGoal>) => void;
}

// ============================================================
// COMPONENT
// ============================================================

export function GoalInput({
  goals,
  onAddGoal,
  onRemoveGoal,
  onUpdateGoal,
}: GoalInputProps) {
  const [isExpanded, setIsExpanded] = useState(goals.length === 0);
  const [showFreeform, setShowFreeform] = useState(false);
  const [freeformName, setFreeformName] = useState('');
  const [freeformDescription, setFreeformDescription] = useState('');
  const [freeformDate, setFreeformDate] = useState('');
  const [freeformPriority, setFreeformPriority] = useState<'A' | 'B' | 'C'>('A');

  // State for template customization
  const [selectedTemplate, setSelectedTemplate] = useState<GoalTemplate | null>(null);
  const [templateDate, setTemplateDate] = useState('');
  const [templatePriority, setTemplatePriority] = useState<'A' | 'B' | 'C'>('A');

  // Handle template selection - show customization form
  const handleTemplateClick = useCallback((template: GoalTemplate) => {
    // Calculate default target date based on suggested duration
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + template.suggestedDuration * 7);

    setSelectedTemplate(template);
    setTemplateDate(targetDate.toISOString().split('T')[0]);
    setTemplatePriority('A');
  }, []);

  // Confirm template selection with custom date
  const handleTemplateConfirm = useCallback(() => {
    if (!selectedTemplate) return;

    onAddGoal({
      type: 'template',
      templateId: selectedTemplate.id,
      name: selectedTemplate.name,
      description: selectedTemplate.description,
      targetDate: templateDate || undefined,
      priority: templatePriority,
    });

    setSelectedTemplate(null);
    setTemplateDate('');
    setTemplatePriority('A');
    setIsExpanded(false);
  }, [selectedTemplate, templateDate, templatePriority, onAddGoal]);

  // Cancel template selection
  const handleTemplateCancel = useCallback(() => {
    setSelectedTemplate(null);
    setTemplateDate('');
    setTemplatePriority('A');
  }, []);

  // Handle freeform submission
  const handleFreeformSubmit = useCallback(() => {
    if (!freeformName.trim()) return;

    onAddGoal({
      type: 'freeform',
      name: freeformName.trim(),
      description: freeformDescription.trim() || undefined,
      targetDate: freeformDate || undefined,
      priority: freeformPriority,
    });

    // Reset form
    setFreeformName('');
    setFreeformDescription('');
    setFreeformDate('');
    setFreeformPriority('A');
    setShowFreeform(false);
    setIsExpanded(false);
  }, [freeformName, freeformDescription, freeformDate, freeformPriority, onAddGoal]);

  // Priority color
  const getPriorityColor = (priority: 'A' | 'B' | 'C') => {
    switch (priority) {
      case 'A':
        return 'red';
      case 'B':
        return 'yellow';
      case 'C':
        return 'blue';
    }
  };

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-4)',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        <Group gap="xs">
          <IconTarget size={18} color="var(--mantine-color-lime-5)" />
          <Text size="sm" fw={600}>
            Training Goals
          </Text>
          {goals.length > 0 && (
            <Badge size="sm" variant="light" color="lime">
              {goals.length}
            </Badge>
          )}
        </Group>
        <ActionIcon variant="subtle" size="sm">
          {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      {/* Current Goals Display */}
      {goals.length > 0 && !isExpanded && (
        <Group gap="xs" mt="xs" wrap="wrap">
          {goals.map((goal) => (
            <Badge
              key={goal.id}
              size="sm"
              variant="light"
              color={getPriorityColor(goal.priority)}
              rightSection={
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveGoal(goal.id);
                  }}
                >
                  <IconX size={12} />
                </ActionIcon>
              }
            >
              {goal.name}
            </Badge>
          ))}
        </Group>
      )}

      {/* Expanded Content */}
      <Collapse in={isExpanded}>
        <Box mt="md">
          {/* Existing Goals */}
          {goals.length > 0 && (
            <Stack gap="xs" mb="md">
              {goals.map((goal) => (
                <Paper
                  key={goal.id}
                  p="xs"
                  style={{
                    backgroundColor: 'var(--mantine-color-dark-6)',
                    border: '1px solid var(--mantine-color-dark-4)',
                  }}
                >
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Badge size="xs" color={getPriorityColor(goal.priority)}>
                        {goal.priority}
                      </Badge>
                      <Text size="sm" fw={500}>
                        {goal.name}
                      </Text>
                    </Group>
                    <Group gap="xs">
                      {goal.targetDate && (
                        <Text size="xs" c="dimmed">
                          <IconCalendar size={12} style={{ marginRight: 4 }} />
                          {new Date(goal.targetDate).toLocaleDateString()}
                        </Text>
                      )}
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onRemoveGoal(goal.id)}
                      >
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  {goal.description && (
                    <Text size="xs" c="dimmed" mt={4}>
                      {goal.description}
                    </Text>
                  )}
                </Paper>
              ))}
            </Stack>
          )}

          {/* Template Selection */}
          {!showFreeform && !selectedTemplate && (
            <>
              <Text size="xs" c="dimmed" mb="xs">
                Choose a goal template or create your own:
              </Text>
              <SimpleGrid cols={2} spacing="xs">
                {GOAL_TEMPLATES.map((template) => (
                  <Tooltip
                    key={template.id}
                    label={template.description}
                    position="top"
                    multiline
                    w={200}
                  >
                    <Paper
                      p="xs"
                      onClick={() => handleTemplateClick(template)}
                      style={{
                        backgroundColor: 'var(--mantine-color-dark-6)',
                        border: '1px solid var(--mantine-color-dark-4)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `var(--mantine-color-${template.color}-6)`;
                        e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-5)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--mantine-color-dark-4)';
                        e.currentTarget.style.backgroundColor = 'var(--mantine-color-dark-6)';
                      }}
                    >
                      <Group gap="xs">
                        <Box c={template.color}>{template.icon}</Box>
                        <Box>
                          <Text size="sm" fw={500}>
                            {template.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            ~{template.suggestedDuration} weeks
                          </Text>
                        </Box>
                      </Group>
                    </Paper>
                  </Tooltip>
                ))}
              </SimpleGrid>

              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconPlus size={14} />}
                onClick={() => setShowFreeform(true)}
                mt="sm"
                fullWidth
              >
                Create Custom Goal
              </Button>
            </>
          )}

          {/* Template Customization Form */}
          {selectedTemplate && (
            <Paper
              p="sm"
              style={{
                backgroundColor: 'var(--mantine-color-dark-6)',
                border: `2px solid var(--mantine-color-${selectedTemplate.color}-6)`,
              }}
            >
              <Group gap="xs" mb="sm">
                <Box c={selectedTemplate.color}>{selectedTemplate.icon}</Box>
                <Box>
                  <Text size="sm" fw={600}>
                    {selectedTemplate.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {selectedTemplate.description}
                  </Text>
                </Box>
              </Group>

              <Stack gap="xs">
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>
                    Target Date (default: ~{selectedTemplate.suggestedDuration} weeks from now)
                  </Text>
                  <TextInput
                    type="date"
                    value={templateDate}
                    onChange={(e) => setTemplateDate(e.target.value)}
                    size="sm"
                    leftSection={<IconCalendar size={14} />}
                  />
                </Box>

                <Select
                  label="Priority"
                  data={[
                    { value: 'A', label: 'A - Primary Goal' },
                    { value: 'B', label: 'B - Secondary Goal' },
                    { value: 'C', label: 'C - Tertiary Goal' },
                  ]}
                  value={templatePriority}
                  onChange={(v) => setTemplatePriority(v as 'A' | 'B' | 'C')}
                  size="sm"
                />

                <Group justify="flex-end" gap="xs" mt="xs">
                  <Button variant="subtle" size="xs" onClick={handleTemplateCancel}>
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    color={selectedTemplate.color}
                    onClick={handleTemplateConfirm}
                  >
                    Add Goal
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}

          {/* Freeform Input */}
          {showFreeform && (
            <Stack gap="xs">
              <TextInput
                placeholder="Goal name (e.g., 'Complete Mt. Diablo Challenge')"
                value={freeformName}
                onChange={(e) => setFreeformName(e.target.value)}
                size="sm"
              />
              <Textarea
                placeholder="Description (optional)"
                value={freeformDescription}
                onChange={(e) => setFreeformDescription(e.target.value)}
                size="sm"
                minRows={2}
              />
              <Group grow>
                <TextInput
                  type="date"
                  placeholder="Target date"
                  value={freeformDate}
                  onChange={(e) => setFreeformDate(e.target.value)}
                  size="sm"
                  leftSection={<IconCalendar size={14} />}
                />
                <Select
                  data={[
                    { value: 'A', label: 'A - Primary' },
                    { value: 'B', label: 'B - Secondary' },
                    { value: 'C', label: 'C - Tertiary' },
                  ]}
                  value={freeformPriority}
                  onChange={(v) => setFreeformPriority(v as 'A' | 'B' | 'C')}
                  size="sm"
                />
              </Group>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setShowFreeform(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  onClick={handleFreeformSubmit}
                  disabled={!freeformName.trim()}
                >
                  Add Goal
                </Button>
              </Group>
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default GoalInput;
