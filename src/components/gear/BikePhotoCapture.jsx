import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Title,
  Button,
  FileButton,
  Image,
  Paper,
  Checkbox,
  TextInput,
  SegmentedControl,
  Badge,
  Loader,
  Alert,
  Box,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { Camera, Check, Warning, ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { resizeImageFile } from '../../utils/imageResize';
import { trackGear } from '../../utils/gearTelemetry';
import { PHOTO_SHOTS } from './gearConstants';
import {
  AGE_CHOICES,
  extractionToRows,
  rowToComponentParams,
  bikeUpdatesFromExtraction,
  duplicateTypes,
} from './catalogueConfirm';

const BUCKET = 'gear-photos';

/**
 * "Show me your bike" — the guided three-shot capture and the confirm screen.
 *
 * Steps: shots → reading → confirm → done. Photos are resized in the browser,
 * uploaded straight to the private bucket under RLS, and only their PATHS go
 * to /api/gear-vision. Vision proposes; nothing is saved until the rider
 * taps Save on the confirm screen.
 */
export default function BikePhotoCapture({
  opened,
  onClose,
  gear,
  existingComponents = [],
  catalogueFromPhotos,
  createComponent,
  updateGear,
  onSaved,
}) {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [step, setStep] = useState('shots');
  const [shots, setShots] = useState({}); // shotId → { blob, previewUrl }
  const [uploading, setUploading] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opened) {
      setStep('shots');
      setShots({});
      setExtraction(null);
      setRows([]);
      setError(null);
      trackGear('gear_photo_capture_opened', { gearItemId: gear?.id });
    }
  }, [opened, gear?.id]);

  // Free object URLs when the modal unmounts or shots change.
  useEffect(() => () => {
    Object.values(shots).forEach((s) => s?.previewUrl && URL.revokeObjectURL(s.previewUrl));
  }, [shots]);

  const dupes = useMemo(() => duplicateTypes(rows, existingComponents), [rows, existingComponents]);
  const includedCount = rows.filter((r) => r.included).length;

  const handleFile = async (shotId, file) => {
    if (!file) return;
    try {
      const blob = await resizeImageFile(file);
      setShots((prev) => {
        if (prev[shotId]?.previewUrl) URL.revokeObjectURL(prev[shotId].previewUrl);
        return { ...prev, [shotId]: { blob, previewUrl: URL.createObjectURL(blob) } };
      });
      trackGear('gear_photo_captured', { gearItemId: gear?.id, shot: shotId, bytes: blob.size });
    } catch (err) {
      notifications.show({ title: 'Could not read that photo', message: err?.message || 'Try another one', color: 'red' });
    }
  };

  const handleRead = async () => {
    if (!user?.id || !gear?.id) return;
    setUploading(true);
    setError(null);
    try {
      const ts = Date.now();
      const photoPaths = {};
      for (const [shotId, shot] of Object.entries(shots)) {
        const path = `${user.id}/${gear.id}/${shotId}-${ts}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, shot.blob, { contentType: 'image/jpeg', upsert: true, cacheControl: 'private, max-age=0' });
        if (upErr) throw new Error(`Upload failed for ${shotId}: ${upErr.message}`);
        photoPaths[shotId] = path;
      }
      trackGear('gear_photo_uploaded', { gearItemId: gear.id, shots: Object.keys(photoPaths).length });

      setStep('reading');
      trackGear('gear_vision_requested', { gearItemId: gear.id });
      const result = await catalogueFromPhotos(gear.id, photoPaths);
      const nextRows = extractionToRows(result.extraction);
      setExtraction(result.extraction);
      setRows(nextRows);
      setStep('confirm');
      trackGear('gear_vision_returned', {
        gearItemId: gear.id,
        proposed: nextRows.length,
        prefilled: nextRows.filter((r) => r.included).length,
        unreadable: result.extraction?.unreadable?.length || 0,
      });
    } catch (err) {
      setError(err?.message || 'Could not read the photos');
      setStep('shots');
      trackGear('gear_vision_failed', { gearItemId: gear?.id, message: err?.message });
    } finally {
      setUploading(false);
    }
  };

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const included = rows.filter((r) => r.included);
      let created = 0;
      for (const row of included) {
        await createComponent(rowToComponentParams(row, gear.id));
        created += 1;
        trackGear('gear_component_added', { gearItemId: gear.id, componentType: row.componentType, source: 'vision', confidence: row.confidence });
      }
      const bikeUpdates = bikeUpdatesFromExtraction(gear, extraction);
      await updateGear(gear.id, { ...bikeUpdates, cataloguedAt: new Date().toISOString() });
      trackGear('gear_catalogue_confirmed', { gearItemId: gear.id, created, edited: included.filter((r) => r.age !== 'unknown').length });
      notifications.show({
        title: created === 1 ? '1 part added' : `${created} parts added`,
        message: created ? `${gear.name} is catalogued. Wear tracking starts from here.` : 'Nothing added — you can catalogue again any time.',
        color: 'green',
      });
      setStep('done');
      onSaved?.();
      onClose();
    } catch (err) {
      notifications.show({ title: 'Could not save', message: err?.message || 'Try again', color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const hasRequired = PHOTO_SHOTS.filter((s) => s.required).every((s) => shots[s.id]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={4}>Show me your bike</Title>}
      size="lg"
      fullScreen={isMobile}
      closeOnClickOutside={!uploading && !saving}
    >
      {step === 'shots' && (
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Three photos and I&apos;ll list what&apos;s on {gear?.name || 'this bike'}. The first is enough to start; the closer shots read the tires and the drivetrain.
          </Text>
          {error && (
            <Alert color="red" icon={<Warning size={18} />} variant="light">{error}</Alert>
          )}
          <Stack gap="sm">
            {PHOTO_SHOTS.map((shot) => {
              const taken = shots[shot.id];
              return (
                <Paper key={shot.id} withBorder p="sm" radius={0}>
                  <Group wrap="nowrap" align="flex-start" gap="md">
                    <Box style={{ width: 96, height: 72, flex: '0 0 auto', background: 'var(--tribos-bg-subtle, #f4f4f2)', border: '1px solid var(--tribos-border-default)' }}>
                      {taken ? (
                        <Image src={taken.previewUrl} alt={shot.label} w={96} h={72} fit="cover" />
                      ) : (
                        <Group justify="center" align="center" h="100%"><Camera size={22} color="var(--color-text-secondary)" /></Group>
                      )}
                    </Box>
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        <Text fw={500} size="sm">{shot.label}</Text>
                        {shot.required ? <Badge size="xs" variant="light" color="teal">Start here</Badge> : <Badge size="xs" variant="light" color="gray">Optional</Badge>}
                        {taken && <Check size={14} color="var(--color-teal)" />}
                      </Group>
                      <Text size="xs" c="dimmed">{shot.instruction}</Text>
                      <Text size="xs" c="dimmed">Reads: {shot.reads}</Text>
                    </Stack>
                    <FileButton
                      onChange={(f) => handleFile(shot.id, f)}
                      accept="image/*"
                      inputProps={{ capture: 'environment' }}
                    >
                      {(props) => (
                        <Button {...props} size="xs" variant={taken ? 'subtle' : 'light'} leftSection={<Camera size={14} />}>
                          {taken ? 'Retake' : 'Photo'}
                        </Button>
                      )}
                    </FileButton>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={uploading}>Not now</Button>
            <Button onClick={handleRead} loading={uploading} disabled={!hasRequired} rightSection={<ArrowRight size={14} />}>
              Read the bike
            </Button>
          </Group>
        </Stack>
      )}

      {step === 'reading' && (
        <Stack align="center" gap="sm" py="xl">
          <Loader />
          <Text size="sm" c="dimmed">Reading sidewalls and counting sprockets…</Text>
        </Stack>
      )}

      {step === 'confirm' && (
        <Stack gap="md">
          <Stack gap={2}>
            <Text size="sm">
              Here&apos;s what I can see. Tick what&apos;s right, fix what isn&apos;t. Nothing is saved until you press Save.
            </Text>
            {extraction?.bike?.model && (
              <Text size="xs" c="dimmed">
                Bike: {[extraction.bike.brand, extraction.bike.model].filter(Boolean).join(' ')}
                {extraction.groupset?.tier ? ` · ${extraction.groupset.brand || ''} ${extraction.groupset.tier}`.trim() : ''}
              </Text>
            )}
          </Stack>

          {dupes.length > 0 && (
            <Alert color="yellow" variant="light" icon={<Warning size={18} />}>
              You already track {dupes.length === 1 ? 'a' : ''} {dupes.join(', ')} on this bike. Saving adds a second one; untick it if it&apos;s the same part.
            </Alert>
          )}

          <Stack gap="xs">
            {rows.map((row) => (
              <Paper key={row.key} withBorder p="sm" radius={0} style={{ opacity: row.included ? 1 : 0.7 }}>
                <Stack gap="xs">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Checkbox
                      checked={row.included}
                      onChange={(e) => updateRow(row.key, { included: e.currentTarget.checked })}
                      label={<Text fw={500} size="sm">{row.label}</Text>}
                    />
                    <Tooltip label={row.evidence || 'No evidence given'} multiline w={260} withArrow>
                      <Badge size="xs" variant="light" color={row.confidence >= 0.7 ? 'teal' : row.confidence >= 0.5 ? 'yellow' : 'gray'}>
                        {row.confidence >= 0.7 ? 'read it' : row.confidence >= 0.5 ? 'probably' : 'guessing'}
                      </Badge>
                    </Tooltip>
                  </Group>
                  {row.included && (
                    <>
                      <Group grow>
                        <TextInput size="xs" placeholder="Brand" value={row.brand} onChange={(e) => updateRow(row.key, { brand: e.currentTarget.value })} />
                        <TextInput size="xs" placeholder="Model" value={row.model} onChange={(e) => updateRow(row.key, { model: e.currentTarget.value })} />
                      </Group>
                      <MetadataChips metadata={row.metadata} />
                      {row.wearModel !== 'none' && (
                        <Group gap="xs" wrap="nowrap">
                          <Text size="xs" c="dimmed" style={{ flex: '0 0 auto' }}>How old?</Text>
                          <SegmentedControl
                            size="xs"
                            value={row.age}
                            onChange={(v) => updateRow(row.key, { age: v })}
                            data={AGE_CHOICES.map((a) => ({ value: a.value, label: a.label }))}
                          />
                        </Group>
                      )}
                    </>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>

          {extraction?.unreadable?.length > 0 && (
            <Text size="xs" c="dimmed">
              Couldn&apos;t read: {extraction.unreadable.map((u) => `${u.component_type.replace(/_/g, ' ')}${u.better_shot ? ` (try the ${u.better_shot.replace(/_/g, ' ')} shot)` : ''}`).join('; ')}.
            </Text>
          )}

          <Group justify="space-between">
            <Button variant="subtle" onClick={() => setStep('shots')} disabled={saving}>Retake photos</Button>
            <Button onClick={handleSave} loading={saving} disabled={includedCount === 0 && !extraction?.bike?.model}>
              Save {includedCount > 0 ? `${includedCount} part${includedCount === 1 ? '' : 's'}` : ''}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function MetadataChips({ metadata }) {
  const entries = Object.entries(metadata || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;
  return (
    <Group gap={4}>
      {entries.map(([k, v]) => (
        <Badge key={k} size="xs" variant="outline" color="gray">
          {k.replace(/_/g, ' ')}: {typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}
        </Badge>
      ))}
    </Group>
  );
}
