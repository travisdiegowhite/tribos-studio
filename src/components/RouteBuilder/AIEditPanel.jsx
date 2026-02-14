/**
 * AIEditPanel — Chat-style panel for natural language route edits.
 *
 * Provides a text input for freeform commands plus quick-action buttons
 * for common edits (flatten, more gravel, scenic, etc.). Shows a
 * before/after comparison when an edit is applied.
 */

import { useState, useRef, useEffect } from 'react';
import {
  Box, Text, TextInput, Button, Group, Stack, ActionIcon, Badge,
  Tooltip, Loader, Paper, Divider, SimpleGrid,
} from '@mantine/core';
import {
  IconWand, IconX, IconSend, IconMountain, IconTree,
  IconRoad, IconBolt, IconArrowsExchange, IconCheck,
  IconArrowBack, IconRoute, IconDroplet,
} from '@tabler/icons-react';
import { tokens } from '../../theme';
import { classifyEditIntent, QUICK_ACTIONS } from '../../utils/aiRouteEditService';

const QUICK_ACTION_ICONS = {
  mountain: IconMountain,
  tree: IconTree,
  road: IconRoute,
  bolt: IconBolt,
  arrows: IconArrowsExchange,
};

/**
 * @param {Object}   props
 * @param {boolean}  props.loading          Whether an edit is being applied
 * @param {Object}   props.lastResult       Result from applyRouteEdit (or null)
 * @param {Function} props.onSubmitEdit     Called with { intent, ...classifyResult } when user submits
 * @param {Function} props.onAccept         Called when user accepts the preview
 * @param {Function} props.onReject         Called when user rejects the preview
 * @param {Function} props.onClose          Close the panel
 * @param {Function} props.formatDist       Distance formatter from parent
 */
export default function AIEditPanel({
  loading,
  lastResult,
  onSubmitEdit,
  onAccept,
  onReject,
  onClose,
  formatDist,
}) {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus input on mount
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = () => {
    const text = inputText.trim();
    if (!text || loading) return;
    const classified = classifyEditIntent(text);
    onSubmitEdit(classified);
    setInputText('');
  };

  const handleQuickAction = (action) => {
    if (loading) return;
    onSubmitEdit({
      intent: action.intent,
      confidence: 1,
      label: action.label,
      description: action.description,
      location: null,
      distanceModifier: null,
      originalText: action.label,
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showPreview = lastResult?.success && !loading;
  const showError = lastResult && !lastResult.success && !loading;

  return (
    <Box
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderRadius: tokens.radius.md,
        border: '1px solid var(--tribos-bg-tertiary)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="sm"
        py="xs"
        style={{ borderBottom: '1px solid var(--tribos-bg-tertiary)' }}
      >
        <Group gap={6}>
          <IconWand size={16} color="var(--tribos-lime)" />
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            AI Route Edit
          </Text>
        </Group>
        <ActionIcon size="sm" variant="subtle" onClick={onClose} color="gray">
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs" p="sm">
        {/* Quick actions */}
        {!showPreview && (
          <SimpleGrid cols={3} spacing={4}>
            {QUICK_ACTIONS.map((action) => {
              const Icon = QUICK_ACTION_ICONS[action.icon] || IconRoute;
              return (
                <Tooltip key={action.id} label={action.description} position="top">
                  <Button
                    variant="light"
                    color="gray"
                    size="xs"
                    onClick={() => handleQuickAction(action)}
                    disabled={loading}
                    leftSection={<Icon size={14} />}
                    styles={{
                      root: {
                        padding: '4px 8px',
                        height: 'auto',
                        minHeight: 30,
                      },
                      label: { fontSize: 11 },
                    }}
                  >
                    {action.label}
                  </Button>
                </Tooltip>
              );
            })}
          </SimpleGrid>
        )}

        {/* Text input */}
        {!showPreview && (
          <Group gap={4}>
            <TextInput
              ref={inputRef}
              placeholder="e.g. &quot;make it flatter&quot; or &quot;avoid downtown&quot;"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              size="sm"
              style={{ flex: 1 }}
              styles={{
                input: {
                  backgroundColor: 'var(--tribos-bg-primary)',
                  borderColor: 'var(--tribos-bg-tertiary)',
                  fontSize: 13,
                },
              }}
            />
            <ActionIcon
              variant="filled"
              color="lime"
              size="lg"
              onClick={handleSubmit}
              disabled={!inputText.trim() || loading}
            >
              {loading ? <Loader size={14} color="dark" /> : <IconSend size={16} />}
            </ActionIcon>
          </Group>
        )}

        {/* Loading state */}
        {loading && (
          <Group gap="xs" justify="center" py="xs">
            <Loader size={16} color="lime" />
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
              Finding a better route...
            </Text>
          </Group>
        )}

        {/* Error message */}
        {showError && (
          <Paper
            p="xs"
            style={{
              backgroundColor: 'rgba(196, 120, 92, 0.1)',
              border: '1px solid rgba(196, 120, 92, 0.3)',
              borderRadius: tokens.radius.sm,
            }}
          >
            <Text size="xs" c="red">{lastResult.message}</Text>
          </Paper>
        )}

        {/* Preview comparison */}
        {showPreview && (
          <Stack gap="xs">
            <Paper
              p="xs"
              style={{
                backgroundColor: 'rgba(132, 204, 22, 0.08)',
                border: '1px solid rgba(132, 204, 22, 0.3)',
                borderRadius: tokens.radius.sm,
              }}
            >
              <Text size="xs" fw={500} style={{ color: 'var(--tribos-lime)' }} mb={4}>
                {lastResult.message}
              </Text>

              {/* Stats comparison */}
              {lastResult.comparison && (
                <Group gap="md">
                  <ComparisonStat
                    label="Distance"
                    delta={lastResult.comparison.distanceDelta}
                    unit="km"
                    value={lastResult.comparison.newDistance}
                    formatDist={formatDist}
                  />
                  {lastResult.comparison.elevationDelta != null && (
                    <ComparisonStat
                      label="Climbing"
                      delta={lastResult.comparison.elevationDelta}
                      unit="m"
                    />
                  )}
                </Group>
              )}
            </Paper>

            {/* Accept / Reject */}
            <Group grow>
              <Button
                variant="filled"
                color="lime"
                size="xs"
                onClick={onAccept}
                leftSection={<IconCheck size={14} />}
              >
                Apply
              </Button>
              <Button
                variant="light"
                color="gray"
                size="xs"
                onClick={onReject}
                leftSection={<IconArrowBack size={14} />}
              >
                Undo
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

function ComparisonStat({ label, delta, unit, value, formatDist }) {
  if (delta == null) return null;
  const isPositive = delta > 0;
  const isNegative = delta < 0;
  const color = label === 'Climbing'
    ? (isNegative ? 'green' : isPositive ? 'red' : 'gray')
    : (isNegative ? 'blue' : isPositive ? 'orange' : 'gray');

  const sign = isPositive ? '+' : '';
  const displayDelta = unit === 'km' ? delta.toFixed(1) : Math.round(delta);

  return (
    <Box>
      <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>{label}</Text>
      <Badge size="xs" variant="light" color={color}>
        {sign}{displayDelta}{unit}
      </Badge>
    </Box>
  );
}
