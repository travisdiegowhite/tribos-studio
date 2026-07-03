/**
 * RouteActionsPanel — Route Builder 2.0 Save / Load / Export controls.
 *
 * Sits below the WaypointListPanel in the overlay column. Visible only
 * when a route exists. Save opens a Modal collecting a name; Load opens
 * a Modal listing the user's saved routes; Export is a Menu with
 * GPX / TCX / FIT items wired to `useRoutePersistence.exportRoute`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Menu,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  CaretDown,
  Check,
  CloudArrowUp,
  DownloadSimple,
  FloppyDisk,
  FolderOpen,
  ShareNetwork,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react';
import { RB2, RB2_FONT } from './brand';
import { trackRb2 } from '../telemetry/trackRb2';
import type { Coordinate } from '../../../types/geo';
import type {
  UseRoutePersistenceReturn,
  SavedRouteSummary,
  ExportFormat,
} from '../../../hooks/route-builder';

export interface RouteActionsPanelProps {
  persistence: UseRoutePersistenceReturn;
  defaultName?: string;
  /** Pre-fills the description field in the Save modal (from the loaded route). */
  defaultDescription?: string;
  /** Whether a route currently exists. Save/Export require one; Load/Import don't. */
  hasRoute?: boolean;
  /** Called after a save succeeds with the new id (e.g. to update URL). */
  onSaved?: (id: string) => void;
  /** Called after a load succeeds with the loaded id. */
  onLoaded?: (id: string) => void;
  /** Called after a GPX import succeeds, with the track coords (to frame the map). */
  onImported?: (coords: Coordinate[]) => void;
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
  defaultDescription,
  hasRoute = true,
  onSaved,
  onLoaded,
  onImported,
  isMobile = false,
}: RouteActionsPanelProps) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [name, setName] = useState(defaultName ?? '');
  const [description, setDescription] = useState(defaultDescription ?? '');
  // Editing a saved route → "Update"; otherwise "Save".
  const isUpdate = !!persistence.savedRouteId;
  const [savedRoutes, setSavedRoutes] = useState<SavedRouteSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [garminConnected, setGarminConnected] = useState(false);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check Garmin connection once on mount so the "Send to Garmin" item only
  // appears for connected users (mirrors v1's RouteExportMenu).
  useEffect(() => {
    let cancelled = false;
    persistence.checkGarminConnection().then((connected) => {
      if (!cancelled) setGarminConnected(connected);
    });
    return () => {
      cancelled = true;
    };
  }, [persistence]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so re-selecting the same file fires change again.
      e.target.value = '';
      if (!file) return;
      trackRb2('import_gpx_selected', { file_size: file.size });
      const coords = await persistence.importGpx(file);
      if (coords) {
        if (onImported) onImported(coords);
      } else {
        notifications.show({
          title: 'Import failed',
          message: persistence.lastError || "That GPX file couldn't be read.",
          color: 'red',
          autoClose: 6000,
        });
      }
    },
    [persistence, onImported],
  );

  useEffect(() => {
    if (defaultName && !name) setName(defaultName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultName]);

  const handleOpenSave = useCallback(() => {
    setName(defaultName ?? '');
    setDescription(defaultDescription ?? '');
    setSaveOpen(true);
    trackRb2('save_modal_opened', {});
  }, [defaultName, defaultDescription]);

  const handleConfirmSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = await persistence.save(trimmed, description);
    if (saved) {
      setSaveOpen(false);
      if (onSaved) onSaved(saved.id);
    }
  }, [name, description, persistence, onSaved]);

  const handleOpenLoad = useCallback(async () => {
    setLoadOpen(true);
    setLoadingList(true);
    setConfirmDeleteId(null);
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

  // Two-click delete: first click arms (turns red), second confirms.
  const handleDeleteRoute = useCallback(
    async (id: string) => {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        return;
      }
      const ok = await persistence.deleteRoute(id);
      setConfirmDeleteId(null);
      if (ok) {
        setSavedRoutes((prev) => prev.filter((r) => r.id !== id));
        notifications.show({ title: 'Route deleted', message: '', color: 'gray' });
      } else {
        notifications.show({
          title: 'Delete failed',
          message: persistence.lastError || 'Could not delete the route.',
          color: 'red',
        });
      }
    },
    [confirmDeleteId, persistence],
  );

  const handleExport = useCallback(
    (format: ExportFormat) => {
      persistence.exportRoute(format);
    },
    [persistence],
  );

  const handleSendToGarmin = useCallback(async () => {
    trackRb2('send_to_garmin_clicked', {});
    const result = await persistence.pushToGarmin();
    if (result.ok) {
      notifications.show({
        title: 'Sent to Garmin!',
        message: result.message,
        color: 'green',
        icon: <Check size={16} />,
        autoClose: 5000,
      });
      return;
    }
    if (result.reason === 'courses_unavailable') {
      // Auto-fallback to a TCX download, same as v1.
      notifications.show({
        title: 'Direct send not available yet',
        message: 'Downloading as TCX instead. Import it at connect.garmin.com → Courses → Import.',
        color: 'yellow',
        autoClose: 8000,
      });
      persistence.exportRoute('tcx');
      return;
    }
    notifications.show({
      title: result.reason === 'reconnect' ? 'Garmin Connection Issue' : 'Send Failed',
      message: result.message,
      color: result.reason === 'reconnect' ? 'yellow' : 'red',
      autoClose: 10000,
    });
  }, [persistence]);

  const handleShare = useCallback(() => {
    trackRb2('share_clicked', {});
    if (!persistence.savedRouteId) {
      // Not saved yet — prompt a save so the route has a shareable URL.
      notifications.show({
        title: 'Save first',
        message: 'Save your route to get a shareable link.',
        color: 'yellow',
      });
      handleOpenSave();
      return;
    }
    setShareConfirmOpen(true);
  }, [persistence, handleOpenSave]);

  const handleShareConfirm = useCallback(async () => {
    setSharing(true);
    try {
      const result = await persistence.shareRoute();
      if (result.ok) {
        setShareConfirmOpen(false);
        notifications.show({
          title: 'Link copied',
          message: 'Anyone signed in to tribos can open this link.',
          color: 'green',
          icon: <Check size={16} />,
        });
        return;
      }
      notifications.show({
        title: 'Share failed',
        message:
          result.reason === 'error'
            ? result.message
            : 'Save your route to get a shareable link.',
        color: 'red',
      });
    } finally {
      setSharing(false);
    }
  }, [persistence]);

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
            disabled={persistence.isSaving || !hasRoute}
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
                disabled={!hasRoute}
                styles={buttonStyles}
              >
                Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown style={{ borderRadius: 0 }}>
              {garminConnected && (
                <>
                  <Menu.Item
                    data-testid="rb2-send-to-garmin"
                    leftSection={
                      persistence.isPushingToDevice ? (
                        <Loader size={14} />
                      ) : (
                        <CloudArrowUp size={14} />
                      )
                    }
                    onClick={handleSendToGarmin}
                    disabled={persistence.isPushingToDevice}
                  >
                    {persistence.isPushingToDevice ? 'Sending…' : 'Send to Garmin'}
                  </Menu.Item>
                  <Divider my={4} />
                  <Menu.Label>Download Files</Menu.Label>
                </>
              )}
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
        <Button
          data-testid="rb2-import-gpx-button"
          variant="outline"
          fullWidth
          leftSection={<UploadSimple size={14} />}
          onClick={handleImportClick}
          disabled={persistence.isLoading}
          styles={buttonStyles}
          mt={6}
        >
          {persistence.isLoading ? <Loader size="xs" /> : 'Import GPX'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          onChange={handleFileSelected}
          data-testid="rb2-import-gpx-input"
          style={{ display: 'none' }}
        />
        <Button
          data-testid="rb2-share-route-button"
          variant="outline"
          fullWidth
          leftSection={<ShareNetwork size={14} />}
          onClick={handleShare}
          disabled={!hasRoute}
          styles={buttonStyles}
          mt={6}
        >
          Share Link
        </Button>
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
        title={isUpdate ? 'Update Route' : 'Save Route'}
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
          <Textarea
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder="Where it goes, the surface, anything worth remembering…"
            data-testid="rb2-save-description-input"
            rows={3}
            styles={{ input: { borderRadius: 0 } }}
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
              {persistence.isSaving ? (
                <Loader size="xs" color="white" />
              ) : isUpdate ? (
                'Update'
              ) : (
                'Save'
              )}
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
              <Box key={r.id} style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                <UnstyledButton
                  onClick={() => handlePickRoute(r.id)}
                  data-testid={`rb2-load-item-${r.id}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
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
                  <Text style={{ fontSize: 12, color: RB2.textTertiary, flexShrink: 0 }}>
                    {r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : ''}
                    {r.elevation_gain_m != null ? ` · ${Math.round(r.elevation_gain_m)} m` : ''}
                  </Text>
                </UnstyledButton>
                <ActionIcon
                  variant="outline"
                  color={confirmDeleteId === r.id ? 'red' : 'gray'}
                  data-testid={`rb2-delete-route-${r.id}`}
                  aria-label={confirmDeleteId === r.id ? 'Confirm delete' : 'Delete route'}
                  onClick={() => handleDeleteRoute(r.id)}
                  style={{ borderRadius: 0, width: 38, height: 'auto' }}
                >
                  <Trash size={14} />
                </ActionIcon>
              </Box>
            ))}
          </Stack>
        )}
      </Modal>

      <Modal
        opened={shareConfirmOpen}
        onClose={() => setShareConfirmOpen(false)}
        title="Share Route"
        radius={0}
        data-testid="rb2-share-confirm-modal"
      >
        <Stack>
          <Text style={{ fontFamily: RB2_FONT.body, fontSize: 14, color: RB2.textSecondary }}>
            Sharing makes this route viewable by anyone with the link who is signed in to
            tribos. You can keep editing it — only you can change or delete it.
          </Text>
          <Group justify="flex-end" gap={6}>
            <Button
              variant="outline"
              onClick={() => setShareConfirmOpen(false)}
              styles={buttonStyles}
            >
              Cancel
            </Button>
            <Button
              onClick={handleShareConfirm}
              disabled={sharing}
              data-testid="rb2-share-confirm"
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
              {sharing ? <Loader size="xs" color="white" /> : 'Share & Copy Link'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default RouteActionsPanel;
