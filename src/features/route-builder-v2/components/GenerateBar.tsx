/**
 * GenerateBar — Route Builder 2.0 desktop generation chips.
 *
 * The structured "Generate" form, folded into the chat dock as a compact
 * row of chips/menus instead of a standing sidebar panel (the chat is the
 * primary loop; this is the structured alternative for cold start). Shares
 * all generation logic with the mobile FormPanel via useGenerateForm.
 *
 * Two states:
 *   - collapsed: a single "＋ New route" pill + the current summary.
 *   - expanded:  goal / duration / surface / shape / distance / elevation /
 *                start-location controls and a Generate button.
 */

import {
  Box,
  Text,
  UnstyledButton,
  Select,
  NumberInput,
  TextInput,
  Button,
  Loader,
} from '@mantine/core';
import { CaretDown, CaretRight, X, Sparkle } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import type { UseAIGenerationReturn, UserLocationStatus } from '../../../hooks/route-builder';
import type { Coordinate } from '../../../types/geo';
import {
  useGenerateForm,
  GOAL_OPTIONS,
  SURFACE_OPTIONS,
  SHAPE_OPTIONS,
  type Goal,
  type Surface,
  type Shape,
} from './useGenerateForm';

export interface GenerateBarHandle {
  expand: () => void;
}

export interface GenerateBarProps {
  generation: UseAIGenerationReturn;
  defaultStart?: Coordinate | null;
  locationStatus?: UserLocationStatus;
  viewportCenter?: Coordinate | null;
  /** Controlled expanded state (lifted so chat cold-start can open it). */
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}

const labelStyle: React.CSSProperties = {
  fontFamily: RB2_FONT.mono,
  fontSize: 9,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: RB2.textTertiary,
  marginBottom: 3,
};

const inputStyles = { input: { borderRadius: 0, fontSize: 13 } } as const;

export function GenerateBar({
  generation,
  defaultStart,
  locationStatus = 'idle',
  viewportCenter = null,
  expanded,
  onExpandedChange,
}: GenerateBarProps) {
  const f = useGenerateForm({ generation, defaultStart, locationStatus, viewportCenter });

  const handleSubmit = async () => {
    await f.onSubmit();
    // Collapse on a clean submit so the chat reclaims the space; if the
    // resolve failed, f.localError stays set and we keep the form open.
  };

  return (
    <Box
      data-testid="rb2-generate-bar"
      style={{
        borderBottom: `1px solid ${RB2.border}`,
        backgroundColor: RB2.bgSecondary,
        flexShrink: 0,
        maxHeight: expanded ? '60vh' : undefined,
        overflowY: expanded ? 'auto' : undefined,
      }}
    >
      <UnstyledButton
        data-testid="rb2-generate-bar-toggle"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide generate options' : 'New route'}
        style={{
          width: '100%',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Sparkle size={14} color={RB2.teal} weight="duotone" />
          <Text
            style={{
              fontFamily: RB2_FONT.heading,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: RB2.textPrimary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {expanded ? 'New Route' : f.summary}
          </Text>
        </Box>
        {expanded ? (
          <CaretDown size={14} color={RB2.textSecondary} />
        ) : (
          <CaretRight size={14} color={RB2.textSecondary} />
        )}
      </UnstyledButton>

      {expanded && (
        <Box style={{ padding: '0 12px 12px' }}>
          <Box style={{ display: 'flex', gap: 8 }}>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Goal</Text>
              <Select
                data={GOAL_OPTIONS}
                value={f.goal}
                onChange={(v) => v && f.setGoal(v as Goal)}
                disabled={generation.isGenerating}
                styles={inputStyles}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            </Box>
            <Box style={{ width: 96 }}>
              <Text style={labelStyle}>Min</Text>
              <NumberInput
                value={f.duration}
                onChange={(v) => {
                  const n = typeof v === 'number' ? v : Number(v);
                  f.setDuration(Number.isFinite(n) ? n : 60);
                }}
                min={10}
                max={600}
                step={15}
                disabled={generation.isGenerating}
                styles={inputStyles}
              />
            </Box>
          </Box>

          <Box style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Surface</Text>
              <Select
                data={SURFACE_OPTIONS}
                value={f.surface}
                onChange={(v) => v && f.setSurface(v as Surface)}
                disabled={generation.isGenerating}
                styles={inputStyles}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            </Box>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Shape</Text>
              <Select
                data={SHAPE_OPTIONS}
                value={f.shape}
                onChange={(v) => v && f.setShape(v as Shape)}
                disabled={generation.isGenerating}
                styles={inputStyles}
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
              />
            </Box>
          </Box>

          <Box style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Distance (km)</Text>
              <NumberInput
                value={f.distanceKm}
                onChange={(v) => {
                  if (v === '' || v === null || v === undefined) {
                    f.setDistanceKm('');
                  } else {
                    const n = typeof v === 'number' ? v : Number(v);
                    f.setDistanceKm(Number.isFinite(n) ? n : '');
                  }
                }}
                min={1}
                max={500}
                step={5}
                placeholder="auto"
                disabled={generation.isGenerating}
                styles={inputStyles}
              />
            </Box>
            <Box style={{ flex: 1 }}>
              <Text style={labelStyle}>Elevation (m)</Text>
              <NumberInput
                value={f.elevationGainM}
                onChange={(v) => {
                  if (v === '' || v === null || v === undefined) {
                    f.setElevationGainM('');
                  } else {
                    const n = typeof v === 'number' ? v : Number(v);
                    f.setElevationGainM(Number.isFinite(n) ? n : '');
                  }
                }}
                min={0}
                max={10000}
                step={50}
                placeholder="auto"
                disabled={generation.isGenerating}
                styles={inputStyles}
              />
            </Box>
          </Box>

          <Box style={{ marginTop: 8 }}>
            <Text style={labelStyle}>Start Location</Text>
            <TextInput
              value={f.startLocation}
              onChange={(e) => {
                f.setStartLocation(e.currentTarget.value);
                if (f.localError) f.setLocalError(null);
              }}
              placeholder={defaultStart ? 'Using current location' : 'Address or place'}
              disabled={generation.isGenerating}
              styles={inputStyles}
            />
          </Box>

          {(f.localError || generation.lastError) && (
            <Box
              data-testid="rb2-generate-bar-error"
              style={{
                marginTop: 10,
                padding: '6px 8px',
                backgroundColor: '#FBE9E5',
                border: `1px solid ${RB2.coral}`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: RB2_FONT.body,
                  fontSize: 12,
                  color: RB2.coral,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {f.localError ?? generation.lastError}
              </Text>
              <UnstyledButton
                onClick={() => {
                  f.setLocalError(null);
                  generation.clearSuggestions();
                }}
                aria-label="Dismiss error"
              >
                <X size={12} color={RB2.coral} />
              </UnstyledButton>
            </Box>
          )}

          <Box style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              data-testid="rb2-generate-bar-submit"
              onClick={handleSubmit}
              disabled={generation.isGenerating || f.isResolving}
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
              {generation.isGenerating || f.isResolving ? (
                <Loader size="xs" color="white" />
              ) : (
                'Generate'
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => onExpandedChange(false)}
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
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default GenerateBar;
