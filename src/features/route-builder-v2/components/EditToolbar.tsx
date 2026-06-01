/**
 * EditToolbar — Route Builder 2.0 undo / redo controls.
 *
 * A compact two-button group floated on the map. Backed by useRouteHistory,
 * so it steps through every kind of route change (map drag, AI edit,
 * generation, GPX import, clear) — not just one subsystem's edits. Buttons
 * disable at the ends of the history; keyboard shortcuts (⌘/Ctrl+Z, ⌘/Ctrl+
 * Shift+Z) are wired by the page.
 */

import { Box, Tooltip, UnstyledButton } from '@mantine/core';
import { ArrowUUpLeft, ArrowUUpRight, ArrowsLeftRight } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';

export interface EditToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** When provided, renders a reverse-route button after undo/redo. */
  onReverse?: () => void;
  canReverse?: boolean;
  /** When provided, renders a units toggle (MI/KM) after reverse. */
  onToggleUnits?: () => void;
  /** Whether imperial units are currently active (drives the toggle label). */
  unitsImperial?: boolean;
}

export function EditToolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReverse,
  canReverse = false,
  onToggleUnits,
  unitsImperial = false,
}: EditToolbarProps) {
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
}: {
  label: string;
  shortcut: string;
  testid: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
          color: disabled ? RB2.border : RB2.textSecondary,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {children}
      </UnstyledButton>
    </Tooltip>
  );
}

export default EditToolbar;
