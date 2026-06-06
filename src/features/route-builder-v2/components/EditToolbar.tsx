/**
 * EditToolbar — Route Builder 2.0 undo / redo controls.
 *
 * A compact two-button group floated on the map. Backed by useRouteHistory,
 * so it steps through every kind of route change (map drag, AI edit,
 * generation, GPX import, clear) — not just one subsystem's edits. Buttons
 * disable at the ends of the history; keyboard shortcuts (⌘/Ctrl+Z, ⌘/Ctrl+
 * Shift+Z) are wired by the page.
 */

import { Box, Menu, Tooltip, UnstyledButton } from '@mantine/core';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowsLeftRight,
  RoadHorizon,
  Pencil,
  Path,
  Trash,
  Check,
} from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export const ROUTE_PROFILE_OPTIONS = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'walking', label: 'Walking' },
] as const;

export interface EditToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** When provided, renders a reverse-route button after undo/redo. */
  onReverse?: () => void;
  canReverse?: boolean;
  /** When provided, renders a snap-to-roads ↔ freehand toggle. */
  onToggleSnap?: () => void;
  /** Whether road-snapping is currently on (drives the toggle icon). */
  snapEnabled?: boolean;
  /** When provided (with onChangeProfile), renders a routing-profile menu. */
  routeProfile?: string;
  onChangeProfile?: (profile: string) => void;
  /** When provided, renders a units toggle (MI/KM). */
  onToggleUnits?: () => void;
  /** Whether imperial units are currently active (drives the toggle label). */
  unitsImperial?: boolean;
  /** When provided, renders an always-visible clear-route button. */
  onClear?: () => void;
  /** Whether there's anything to clear (disables the button when false). */
  canClear?: boolean;
}

export function EditToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReverse,
  canReverse = false,
  onToggleSnap,
  snapEnabled = true,
  routeProfile = 'road',
  onChangeProfile,
  onToggleUnits,
  unitsImperial = false,
  onClear,
  canClear = false,
}: EditToolbarProps) {
  const profileLabel =
    ROUTE_PROFILE_OPTIONS.find((p) => p.value === routeProfile)?.label ?? 'Road';
  return (
    <Box
      data-testid="rb2-edit-toolbar"
      style={{
        display: 'flex',
        backgroundColor: RB2.cardBg,
        border: `1px solid ${RB2.border}`,
        boxShadow: RB2.shadowCard,
      }}
    >
      <ToolbarButton
        label="Undo"
        shortcut="⌘Z"
        testid="rb2-undo-button"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <ArrowUUpLeft size={18} />
      </ToolbarButton>
      <Box style={{ width: 1, backgroundColor: RB2.border }} />
      <ToolbarButton
        label="Redo"
        shortcut="⌘⇧Z"
        testid="rb2-redo-button"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <ArrowUUpRight size={18} />
      </ToolbarButton>
      {onReverse && (
        <>
          <Box style={{ width: 1, backgroundColor: RB2.border }} />
          <ToolbarButton
            label="Reverse direction"
            shortcut="flip start/end"
            testid="rb2-reverse-button"
            disabled={!canReverse}
            onClick={onReverse}
          >
            <ArrowsLeftRight size={18} />
          </ToolbarButton>
        </>
      )}
      {onToggleSnap && (
        <>
          <Box style={{ width: 1, backgroundColor: RB2.border }} />
          <ToolbarButton
            label={snapEnabled ? 'Snapping to roads' : 'Freehand drawing'}
            shortcut={snapEnabled ? 'switch to freehand' : 'switch to snap-to-roads'}
            testid="rb2-snap-toggle"
            disabled={false}
            onClick={onToggleSnap}
          >
            {snapEnabled ? <RoadHorizon size={18} /> : <Pencil size={18} />}
          </ToolbarButton>
        </>
      )}
      {onChangeProfile && snapEnabled && (
        <>
          <Box style={{ width: 1, backgroundColor: RB2.border }} />
          <Menu position="bottom" withinPortal shadow="md">
            <Menu.Target>
              <UnstyledButton
                data-testid="rb2-profile-menu"
                aria-label={`Routing profile: ${profileLabel}`}
                style={{
                  width: 38,
                  height: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: RB2.textSecondary,
                  cursor: 'pointer',
                }}
              >
                <Path size={18} />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Routing profile</Menu.Label>
              {ROUTE_PROFILE_OPTIONS.map((p) => (
                <Menu.Item
                  key={p.value}
                  data-testid={`rb2-profile-${p.value}`}
                  leftSection={
                    p.value === routeProfile ? <Check size={14} /> : <Box style={{ width: 14 }} />
                  }
                  onClick={() => onChangeProfile(p.value)}
                >
                  {p.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </>
      )}
      {onToggleUnits && (
        <>
          <Box style={{ width: 1, backgroundColor: RB2.border }} />
          <ToolbarButton
            label={`Units: ${unitsImperial ? 'miles' : 'kilometers'}`}
            shortcut={`switch to ${unitsImperial ? 'km' : 'mi'}`}
            testid="rb2-units-toggle"
            disabled={false}
            onClick={onToggleUnits}
          >
            <span
              style={{
                fontFamily: RB2_FONT.mono,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}
            >
              {unitsImperial ? 'MI' : 'KM'}
            </span>
          </ToolbarButton>
        </>
      )}
      {onClear && (
        <>
          <Box style={{ width: 1, backgroundColor: RB2.border }} />
          <ToolbarButton
            label="Clear route"
            shortcut="wipe the map"
            testid="rb2-clear-button"
            disabled={!canClear}
            onClick={onClear}
            danger
          >
            <Trash size={18} />
          </ToolbarButton>
        </>
      )}
    </Box>
  );
}

function ToolbarButton({
  label,
  shortcut,
  testid,
  disabled,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  shortcut: string;
  testid: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const color = disabled ? RB2.textDisabled : danger ? RB2.coral : RB2.textSecondary;
  return (
    <Tooltip label={`${label} (${shortcut})`} position="bottom" withinPortal disabled={disabled}>
      <UnstyledButton
        data-testid={testid}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        style={{
          width: 38,
          height: 34,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {children}
      </UnstyledButton>
    </Tooltip>
  );
}

export default EditToolbar;
