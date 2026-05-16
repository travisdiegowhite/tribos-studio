/**
 * FormPanel — Route Builder 2.0 cold-start form panel.
 *
 * Collapsible panel in the upper-left. Collapsed state shows a summary
 * row; expanded state shows the goal/duration/surface/start-location
 * form. Submit calls useAIGeneration.generate.
 */

import { forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { Box, Text, UnstyledButton, Select, NumberInput, TextInput, Button, Loader } from '@mantine/core';
import { CaretDown, CaretRight, X } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import type { UseAIGenerationReturn } from '../../../hooks/route-builder';
import type { Coordinate } from '../../../routing/executor';
import { trackRb2 } from '../telemetry/trackRb2';

export interface FormPanelHandle {
  expand: () => void;
}

export interface FormPanelProps {
  generation: UseAIGenerationReturn;
  defaultStart?: Coordinate | null;
  isMobile?: boolean;
}

type Goal = 'endurance' | 'tempo' | 'threshold' | 'recovery' | 'long_ride' | 'commute';
type Surface = 'road' | 'gravel' | 'mountain' | 'mixed';
type Shape = 'loop' | 'out_and_back' | 'point_to_point';

const GOAL_OPTIONS: Array<{ value: Goal; label: string }> = [
  { value: 'endurance', label: 'Endurance' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'long_ride', label: 'Long Ride' },
  { value: 'commute', label: 'Commute' },
];

const SURFACE_OPTIONS: Array<{ value: Surface; label: string }> = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'mixed', label: 'Mixed' },
];

const SHAPE_OPTIONS: Array<{ value: Shape; label: string }> = [
  { value: 'loop', label: 'Loop' },
  { value: 'out_and_back', label: 'Out & Back' },
  { value: 'point_to_point', label: 'Point to Point' },
];

const labelStyle: React.CSSProperties = {
  fontFamily: RB2_FONT.mono,
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: RB2.textTertiary,
  marginBottom: 4,
};

export const FormPanel = forwardRef<FormPanelHandle, FormPanelProps>(function FormPanel(
  { generation, defaultStart, isMobile = false },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  const [goal, setGoal] = useState<Goal>('endurance');
  const [duration, setDuration] = useState<number>(60);
  const [surface, setSurface] = useState<Surface>('road');
  const [shape, setShape] = useState<Shape>('loop');
  const [startLocation, setStartLocation] = useState<string>('');

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      trackRb2(next ? 'form_expanded' : 'form_collapsed', {});
      return next;
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => {
        setExpanded((prev) => {
          if (!prev) {
            trackRb2('form_expanded', { source: 'chat_cold_start' });
            return true;
          }
          return prev;
        });
      },
    }),
    [],
  );

  const onSubmit = useCallback(async () => {
    trackRb2('form_submitted', {
      goal,
      duration_minutes: duration,
      surface,
      shape,
    });
    await generation.generate({
      goal,
      duration_minutes: duration,
      route_profile: surface === 'mountain' ? 'mtb' : surface === 'mixed' ? 'gravel' : (surface as 'road' | 'gravel'),
      route_shape: shape,
      start_coord: defaultStart ?? undefined,
    });
  }, [generation, goal, duration, surface, shape, defaultStart]);

  const onReset = useCallback(() => {
    setGoal('endurance');
    setDuration(60);
    setSurface('road');
    setShape('loop');
    setStartLocation('');
    generation.clearSuggestions();
  }, [generation]);

  const summary = `${prettyLabel(GOAL_OPTIONS, goal)} · ${duration}min · ${prettyLabel(SURFACE_OPTIONS, surface)}`;

  const width = isMobile ? '100%' : 320;

  return (
    <Box
      data-testid="rb2-form-panel"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        width,
        boxShadow: RB2.shadowCard,
        maxHeight: expanded ? '70vh' : 'auto',
        overflowY: 'auto',
      }}
    >
      <UnstyledButton
        onClick={toggleExpanded}
        data-testid="rb2-form-panel-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse form' : 'Expand form'}
        style={{
          width: '100%',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Box style={{ textAlign: 'left' }}>
          <Text
            style={{
              fontFamily: RB2_FONT.mono,
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: RB2.textTertiary,
              lineHeight: 1.2,
            }}
          >
            Generate Route
          </Text>
          <Text
            style={{
              fontFamily: RB2_FONT.heading,
              fontSize: 14,
              fontWeight: 600,
              color: RB2.textPrimary,
              letterSpacing: '0.02em',
              lineHeight: 1.3,
            }}
          >
            {summary}
          </Text>
        </Box>
        {expanded ? (
          <CaretDown size={16} color={RB2.textSecondary} />
        ) : (
          <CaretRight size={16} color={RB2.textSecondary} />
        )}
      </UnstyledButton>

      {expanded && (
        <Box style={{ padding: '0 14px 14px', borderTop: `1px solid ${RB2.border}` }}>
          <Box style={{ marginTop: 12 }}>
            <Text style={labelStyle}>Goal</Text>
            <Select
              data={GOAL_OPTIONS}
              value={goal}
              onChange={(v) => {
                if (!v) return;
                setGoal(v as Goal);
                trackRb2('form_field_changed', { field: 'goal' });
              }}
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
              allowDeselect={false}
            />
          </Box>
          <Box style={{ marginTop: 10 }}>
            <Text style={labelStyle}>Duration (min)</Text>
            <NumberInput
              value={duration}
              onChange={(v) => {
                const n = typeof v === 'number' ? v : Number(v);
                setDuration(Number.isFinite(n) ? n : 60);
                trackRb2('form_field_changed', { field: 'duration' });
              }}
              min={10}
              max={600}
              step={15}
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
            />
          </Box>
          <Box style={{ marginTop: 10 }}>
            <Text style={labelStyle}>Surface</Text>
            <Select
              data={SURFACE_OPTIONS}
              value={surface}
              onChange={(v) => {
                if (!v) return;
                setSurface(v as Surface);
                trackRb2('form_field_changed', { field: 'surface' });
              }}
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
              allowDeselect={false}
            />
          </Box>
          <Box style={{ marginTop: 10 }}>
            <Text style={labelStyle}>Shape</Text>
            <Select
              data={SHAPE_OPTIONS}
              value={shape}
              onChange={(v) => {
                if (!v) return;
                setShape(v as Shape);
                trackRb2('form_field_changed', { field: 'shape' });
              }}
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
              allowDeselect={false}
            />
          </Box>
          <Box style={{ marginTop: 10 }}>
            <Text style={labelStyle}>Start Location</Text>
            <TextInput
              value={startLocation}
              onChange={(e) => {
                setStartLocation(e.currentTarget.value);
                trackRb2('form_field_changed', { field: 'start_location' });
              }}
              placeholder={defaultStart ? 'Using map center' : 'Address or place'}
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
            />
          </Box>

          {generation.lastError && (
            <Box
              data-testid="rb2-form-error"
              style={{
                marginTop: 12,
                padding: '8px 10px',
                backgroundColor: '#FBE9E5',
                border: `1px solid ${RB2.coral}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: RB2_FONT.body,
                  fontSize: 13,
                  color: RB2.coral,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {generation.lastError}
              </Text>
              <UnstyledButton
                onClick={generation.clearSuggestions}
                aria-label="Dismiss error"
              >
                <X size={14} color={RB2.coral} />
              </UnstyledButton>
            </Box>
          )}

          <Box style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button
              data-testid="rb2-form-submit"
              onClick={onSubmit}
              disabled={generation.isGenerating}
              styles={{
                root: {
                  borderRadius: 0,
                  backgroundColor: RB2.teal,
                  flex: 1,
                  fontFamily: RB2_FONT.heading,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                },
              }}
            >
              {generation.isGenerating ? (
                <Loader size="xs" color="white" />
              ) : (
                'Generate'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={onReset}
              disabled={generation.isGenerating}
              styles={{
                root: {
                  borderRadius: 0,
                  borderColor: RB2.border,
                  color: RB2.textSecondary,
                  fontFamily: RB2_FONT.heading,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                },
              }}
            >
              Reset
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
});

function prettyLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export default FormPanel;
