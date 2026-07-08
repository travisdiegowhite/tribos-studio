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
import type { UseAIGenerationReturn, UserLocationStatus } from '../../../hooks/route-builder';
import type { Coordinate } from '../../../types/geo';
import { trackRb2 } from '../telemetry/trackRb2';
import {
  useGenerateForm,
  GOAL_OPTIONS,
  SURFACE_OPTIONS,
  SHAPE_OPTIONS,
  type Goal,
  type Surface,
  type Shape,
  type GenerateFormSeed,
} from './useGenerateForm';
import {
  toDisplayDistance,
  fromDisplayDistance,
  toDisplayElevation,
  fromDisplayElevation,
  distanceUnit,
  elevationUnit,
  distanceBounds,
  elevationBounds,
} from './unitFormInput';

export interface FormPanelHandle {
  expand: () => void;
}

export interface FormPanelProps {
  generation: UseAIGenerationReturn;
  /** Coordinate from geolocation (`useUserLocation.coord`), if available. */
  defaultStart?: Coordinate | null;
  /** Geolocation status, drives the inline hint when denied/error. */
  locationStatus?: UserLocationStatus;
  /** Map viewport center, used as a last-resort start_coord fallback. */
  viewportCenter?: Coordinate | null;
  isMobile?: boolean;
  isImperial?: boolean;
  formSeed?: GenerateFormSeed;
  /** Start expanded (e.g. when a workout has just been attached). */
  defaultExpanded?: boolean;
  /** Active route's routing profile, so the collapsed summary reflects it. */
  activeRouteProfile?: string | null;
}

const labelStyle: React.CSSProperties = {
  fontFamily: RB2_FONT.mono,
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: RB2.textTertiary,
  marginBottom: 4,
};

export const FormPanel = forwardRef<FormPanelHandle, FormPanelProps>(function FormPanel(
  { generation, defaultStart, locationStatus = 'idle', viewportCenter = null, isMobile = false, isImperial = false, formSeed, defaultExpanded = false, activeRouteProfile = null },
  ref,
) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const {
    goal,
    setGoal,
    duration,
    setDuration,
    surface,
    setSurface,
    shape,
    setShape,
    startLocation,
    setStartLocation,
    distanceKm,
    setDistanceKm,
    elevationGainM,
    setElevationGainM,
    localError,
    setLocalError,
    isResolving,
    summary,
    onSubmit,
    onReset,
  } = useGenerateForm({
    generation,
    defaultStart,
    locationStatus,
    viewportCenter,
    initialGoal: formSeed?.goal,
    initialDurationMinutes: formSeed?.durationMinutes,
    initialDistanceKm: formSeed?.distanceKm,
    initialElevationGainM: formSeed?.elevationGainM,
    initialStartLocation: formSeed?.startLocation,
    activeRouteProfile,
  });

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
          <Box style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Distance ({distanceUnit(isImperial)})</Text>
              <NumberInput
                data-testid="rb2-distance-input"
                value={toDisplayDistance(distanceKm, isImperial)}
                onChange={(v) => {
                  setDistanceKm(fromDisplayDistance(v, isImperial));
                  trackRb2('form_field_changed', { field: 'distance_km' });
                }}
                {...distanceBounds(isImperial)}
                placeholder="auto"
                disabled={generation.isGenerating}
                styles={{ input: { borderRadius: 0 } }}
              />
            </Box>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Elevation ({elevationUnit(isImperial)})</Text>
              <NumberInput
                data-testid="rb2-elevation-input"
                value={toDisplayElevation(elevationGainM, isImperial)}
                onChange={(v) => {
                  setElevationGainM(fromDisplayElevation(v, isImperial));
                  trackRb2('form_field_changed', { field: 'elevation_gain_m' });
                }}
                {...elevationBounds(isImperial)}
                placeholder="auto"
                disabled={generation.isGenerating}
                styles={{ input: { borderRadius: 0 } }}
              />
            </Box>
          </Box>
          <Box style={{ marginTop: 10 }}>
            <Text style={labelStyle}>Start Location</Text>
            <TextInput
              value={startLocation}
              onChange={(e) => {
                setStartLocation(e.currentTarget.value);
                if (localError) setLocalError(null);
                trackRb2('form_field_changed', { field: 'start_location' });
              }}
              placeholder={
                defaultStart
                  ? 'Using current location'
                  : locationStatus === 'denied' || locationStatus === 'error' || locationStatus === 'unsupported'
                    ? 'Address or place (geolocation off)'
                    : 'Address or place'
              }
              disabled={generation.isGenerating}
              styles={{ input: { borderRadius: 0 } }}
            />
            {(locationStatus === 'denied' ||
              locationStatus === 'error' ||
              locationStatus === 'unsupported') &&
              !defaultStart && (
                <Text
                  data-testid="rb2-form-location-hint"
                  style={{
                    fontFamily: RB2_FONT.body,
                    fontSize: 11,
                    color: RB2.textTertiary,
                    marginTop: 4,
                    lineHeight: 1.4,
                  }}
                >
                  Geolocation unavailable — type an address or pan the map to set a start point.
                </Text>
              )}
          </Box>

          {localError && (
            <Box
              data-testid="rb2-form-local-error"
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
                {localError}
              </Text>
              <UnstyledButton onClick={() => setLocalError(null)} aria-label="Dismiss error">
                <X size={14} color={RB2.coral} />
              </UnstyledButton>
            </Box>
          )}

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
              disabled={generation.isGenerating || isResolving}
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
              {generation.isGenerating || isResolving ? (
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

export default FormPanel;
