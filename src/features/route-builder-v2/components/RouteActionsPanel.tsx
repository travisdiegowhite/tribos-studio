/**
 * RouteActionsPanel — Route Builder 2.0 Save / Load / Export controls.
 *
 * Sits below the WaypointListPanel in the overlay column. Visible only
 * when a route exists. Save opens a Modal collecting a name; Load opens
 * a Modal listing the user's saved routes; Export is a Menu with
 * GPX / TCX / FIT items wired to `useRoutePersistence.exportRoute`.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { CaretDown, DownloadSimple, FloppyDisk, FolderOpen } from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type {
  UseRoutePersistenceReturn,
  SavedRouteSummary,
  ExportFormat,
} from '../../../hooks/route-builder';

export interface RouteActionsPanelProps {
  persistence: UseRoutePersistenceReturn;
  defaultName?: string;
  /** Called after a save succeeds with the new id (e.g. to update URL). */
  onSaved?: (id: string) => void;
  /** Called after a load succeeds with the loaded id. */
  onLoaded?: (id: string) => void;
  isMobile?: boolean;
}

const buttonStyles = {
  root: {
    borderRadius: 0,
    borderColor: RB2.border,
    color: RB2.textSecondary,
    fontFamily: RB2_FONT.heading,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    fontSize: 12,
    height: 32,
    paddingLeft: 10,
    paddingRight: 10,
  },
};

export function RouteActionsPanel({
  persistence,
  defaultName,
  onSaved,
  onLoaded,
  isMobile = false,
}: RouteActionsPanelProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? '');
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultName]);

  const handleOpenSave = useCallback(() => {
    setName(defaultName ?? '');
    setSaveOpen(true);
    trackRb2('save_modal_opened', {});
  }, [defaultName]);

  const handleConfirmSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = await persistence.save(trimmed);
    if (saved) {
      setSaveOpen(false);
      if (onSaved) onSaved(saved.id);
    }
  }, [name, persistence, onSaved]);

  const handleOpenLoad = useCallback(async () => {
    setLoadOpen(true);
    setLoadingList(true);
    trackRb2('load_modal_opened', {});
    const rows = await persistence.listSavedRoutes();
    setSavedRoutes(rows);
    setLoadingList(false);
  }, [persistence]);

  const handlePickRoute = useCallback(
    async (id: string) => {
      const ok = await persistence.loadRoute(id);
      if (ok) {
        setLoadOpen(false);
        if (onLoaded) onLoaded(id);
      }
    },
    [persistence, onLoaded],
  );

  const handleExport = useCallback(
    (format: ExportFormat) => {
      persistence.exportRoute(format);
    },
    [persistence],
  );

  return (
    <>
      <Box
        data-testid="rb2-route-actions-panel"
        style={{
          backgroundColor: RB2.cardBg,
          border: `1px solid ${RB2.border}`,
          borderRadius: 0,
          padding: '10px 12px',
          boxShadow: RB2.shadowCard,
          width: isMobile ? '100%' : 320,
        }}
      >
        <Text
          style={{
            fontFamily: RB2_FONT.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: RB2.textTertiary,
            marginBottom: 8,
          }}
        >
          Route Actions
        </Text>
        <Group gap={6} wrap="nowrap">
          <Button
            data-testid="rb2-save-route-button"
            variant="outline"
            leftSection={<FloppyDisk size={14} />}
            onClick={handleOpenSave}
            disabled={persistence.isSaving}
            styles={buttonStyles}
          >
            {persistence.isSaving ? <Loader size="xs" /> : 'Save'}
          </Button>
          <Button
            data-testid="rb2-load-route-button"
            variant="outline"
            leftSection={<FolderOpen size={14} />}
            onClick={handleOpenLoad}
            disabled={persistence.isLoading}
            styles={buttonStyles}
          >
            Load
          </Button>
          <Menu position="bottom-end" withinPortal shadow="sm" radius={0}>
            <Menu.Target>
              <Button
                data-testid="rb2-export-route-button"
                variant="outline"
                leftSection={<DownloadSimple size={14} />}
                rightSection={<CaretDown size={12} />}
                styles={buttonStyles}
              >
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown style={{ borderRadius: 0 }}>
              <Menu.Item data-testid="rb2-export-gpx" onClick={() => handleExport('gpx')}>
                GPX
              </Menu.Item>
              <Menu.Item data-testid="rb2-export-tcx" onClick={() => handleExport('tcx')}>
                TCX
              </Menu.Item>
              <Menu.Item data-testid="rb2-export-fit" onClick={() => handleExport('fit')}>
                FIT
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        {persistence.lastError && (
          <Text
            style={{
              marginTop: 8,
              fontFamily: RB2_FONT.body,
              fontSize: 12,
              color: RB2.coral,
            }}
          >
            {persistence.lastError}
          </Text>
        )}
      </Box>

      <Modal
        opened={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save Route"
        radius={0}
        data-testid="rb2-save-modal"
      >
        <Stack>
          <TextInput
            label="Route Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Morning Loop"
            data-testid="rb2-save-name-input"
            styles={{ input: { borderRadius: 0 } }}
            autoFocus
          />
          <Group justify="flex-end" gap={6}>
            <Button variant="outline" onClick={() => setSaveOpen(false)} styles={buttonStyles}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSave}
              disabled={!name.trim() || persistence.isSaving}
              data-testid="rb2-save-confirm"
              styles={{
                root: {
                  borderRadius: 0,
                  backgroundColor: RB2.teal,
                  fontFamily: RB2_FONT.heading,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontSize: 12,
                  height: 32,
                },
              }}
            >
              {persistence.isSaving ? <Loader size="xs" color="white" /> : 'Save'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={loadOpen}
        onClose={() => setLoadOpen(false)}
        title="Load Route"
        radius={0}
        data-testid="rb2-load-modal"
        size="lg"
      >
        {loadingList ? (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        ) : savedRoutes.length === 0 ? (
          <Text style={{ fontFamily: RB2_FONT.body, color: RB2.textTertiary }}>
            No saved routes yet.
          </Text>
        ) : (
          <Stack gap={4}>
            {savedRoutes.map((r) => (
              <UnstyledButton
                key={r.id}
                onClick={() => handlePickRoute(r.id)}
                data-testid={`rb2-load-item-${r.id}`}
                style={{
                  padding: '10px 12px',
                  border: `1px solid ${RB2.border}`,
                  fontFamily: RB2_FONT.body,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                }}
              >
                <Text style={{ fontWeight: 600, color: RB2.textPrimary }}>
                  {r.name || 'Untitled Route'}
                </Text>
                <Text style={{ fontSize: 12, color: RB2.textTertiary }}>
                  {r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : ''}
                  {r.elevation_gain_m != null ? ` · ${Math.round(r.elevation_gain_m)} m` : ''}
                </Text>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
}

export default RouteActionsPanel;
