/**
 * LayerToggles — Route Builder 2.0 map layer toggle panel.
 *
 * Five toggles: surface, gradient, POI, bike infra, familiar segments.
 * POI dispatches through useRouteAnalysis.togglePOILayer. The other
 * four are local UI state owned by the page (passed in as props).
 */

import { useState, useCallback } from 'react';
import { Box, Text, Switch, Tooltip, UnstyledButton } from '@mantine/core';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { POILayer } from '../../../hooks/route-builder';

export interface LayerVisibilityState {
  surface: boolean;
  gradient: boolean;
  poi: boolean;
  bikeInfra: boolean;
  familiar: boolean;
}

export interface LayerTogglesProps {
  visibility: LayerVisibilityState;
  onToggle: (key: keyof LayerVisibilityState, next: boolean) => void;
  onPoiLayerToggle: (layer: POILayer) => void;
  activePoiLayers: POILayer[];
  isMobile?: boolean;
  hasStravaConnection?: boolean;
}

const POI_LAYERS: Array<{ id: POILayer; label: string }> = [
  { id: 'coffee', label: 'Coffee' },
  { id: 'water', label: 'Water' },
  { id: 'food', label: 'Food' },
  { id: 'bike_shop', label: 'Bike Shop' },
  { id: 'restroom', label: 'Restroom' },
  { id: 'viewpoint', label: 'Viewpoint' },
];

export function LayerToggles({
  visibility,
  onToggle,
  onPoiLayerToggle,
  activePoiLayers,
  isMobile = false,
  hasStravaConnection = false,
}: LayerTogglesProps) {
  const [expanded, setExpanded] = useState(!isMobile);

  const toggle = useCallback(
    (key: keyof LayerVisibilityState, next: boolean) => {
      onToggle(key, next);
      trackRb2('layer_toggled', { layer: key, state: next ? 'shown' : 'hidden' });
    },
    [onToggle],
  );

  return (
    <Box
      data-testid="rb2-layer-toggles"
      style={{
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        borderRadius: 0,
        width: isMobile ? '100%' : 320,
        boxShadow: RB2.shadowCard,
      }}
    >
      <UnstyledButton
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textSecondary,
            fontWeight: 600,
          }}
        >
          Layers
        </Text>
        {expanded ? (
          <CaretDown size={14} color={RB2.textTertiary} />
        ) : (
          <CaretRight size={14} color={RB2.textTertiary} />
        )}
      </UnstyledButton>

      {expanded && (
        <Box style={{ padding: '0 14px 12px', borderTop: `1px solid ${RB2.border}` }}>
          <ToggleRow
            label="Surface"
            checked={visibility.surface}
            onChange={(v) => toggle('surface', v)}
          />
          <ToggleRow
            label="Gradient"
            checked={visibility.gradient}
            onChange={(v) => toggle('gradient', v)}
          />
          <ToggleRow
            label="Bike Infrastructure"
            checked={visibility.bikeInfra}
            onChange={(v) => toggle('bikeInfra', v)}
          />
          <Tooltip
            label={hasStravaConnection ? 'Roads you have ridden before' : 'Connect Strava to enable'}
            disabled={false}
            withinPortal
          >
            <Box>
              <ToggleRow
                label="Familiar Segments"
                checked={visibility.familiar}
                onChange={(v) => toggle('familiar', v)}
                disabled={!hasStravaConnection}
              />
            </Box>
          </Tooltip>

          <Box style={{ marginTop: 10 }}>
            <ToggleRow
              label="POIs along route"
              checked={visibility.poi}
              onChange={(v) => toggle('poi', v)}
            />
            {visibility.poi && (
              <Box style={{ paddingLeft: 12, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {POI_LAYERS.map((p) => {
                  const active = activePoiLayers.includes(p.id);
                  return (
                    <UnstyledButton
                      key={p.id}
                      onClick={() => onPoiLayerToggle(p.id)}
                      style={{
                        padding: '4px 8px',
                        border: `1px solid ${active ? RB2.teal : RB2.border}`,
                        backgroundColor: active ? RB2.teal : RB2.cardBg,
                        color: active ? RB2.textInverse : RB2.textSecondary,
                        fontFamily: RB2_FONT.mono,
                        fontSize: 11,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.label}
                    </UnstyledButton>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 0',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: RB2_FONT.body,
          fontSize: 13,
          color: RB2.textPrimary,
        }}
      >
        {label}
      </Text>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        color="teal"
        size="sm"
        styles={{
          track: { borderRadius: 0 },
          thumb: { borderRadius: 0 },
        }}
      />
    </Box>
  );
}

export default LayerToggles;
