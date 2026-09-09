import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Title,
  Badge,
  Button,
  Progress,
  Divider,
  Table,
  ActionIcon,
  Tooltip,
  Loader,
  Box,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { formatDistance } from '../../utils/units';
import { supabase } from '../../lib/supabase';
import { RUNNING_SHOE_THRESHOLDS, METERS_PER_MILE, BIKE_CATEGORIES } from './gearConstants';
import ComponentTable from './ComponentTable';
import AddComponentForm from './AddComponentForm';
import BikePhotoCapture from './BikePhotoCapture';
import { notifications } from '@mantine/notifications';
import { Archive, ArrowsClockwise, Bicycle, Camera, PersonSimpleRun, Plus, Star, Trash } from '@phosphor-icons/react';

const PHOTO_BUCKET = 'gear-photos';

/**
 * Full gear detail view shown as a modal.
 */
export default function GearDetailView({
  gearId,
  opened,
  onClose,
  useGearHook,
  useImperial = true,
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [gear, setGear] = useState(null);
  const [components, setComponents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addCompOpen, setAddCompOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);

  const {
    getGearDetail,
    updateGear,
    retireGear,
    deleteGear,
    createComponent,
    replaceComponent,
    deleteComponent,
    recalculateMileage,
    catalogueFromPhotos,
  } = useGearHook;

  const loadDetail = () => {
    if (!gearId) return Promise.resolve();
    return getGearDetail(gearId)
      .then(({ gear: g, components: c, activities: a }) => {
        setGear(g);
        setComponents(c);
        setActivities(a);
      })
      .catch(() => {});
  };

  // Load detail data
  useEffect(() => {
    if (opened && gearId) {
      setLoading(true);
      setAddCompOpen(false);
      setPhotoOpen(false);
      loadDetail().finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, gearId, getGearDetail]);

  // The bike's whole-bike photo lives in the private bucket; sign a URL
  // under RLS (owner-only select policy) for the hour this modal is open.
  const wholeBikePath = gear?.photo_paths?.whole_bike || null;
  useEffect(() => {
    let cancelled = false;
    if (!opened || !wholeBikePath) {
      setPhotoUrl(null);
      return undefined;
    }
    supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(wholeBikePath, 3600)
      .then(({ data }) => {
        if (!cancelled) setPhotoUrl(data?.signedUrl || null);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(null);
      });
    return () => { cancelled = true; };
  }, [opened, wholeBikePath]);

  if (!opened) return null;

  const handleRetire = async () => {
    if (!gear) return;
    try {
      await retireGear(gear.id);
      notifications.show({ title: 'Gear retired', message: `${gear.name} has been retired`, color: 'blue' });
      onClose();
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to retire gear', color: 'red' });
    }
  };

  const handleDelete = async () => {
    if (!gear || !window.confirm(`Delete "${gear.name}"? This cannot be undone.`)) return;
    try {
      await deleteGear(gear.id);
      notifications.show({ title: 'Gear deleted', message: `${gear.name} has been deleted`, color: 'red' });
      onClose();
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to delete gear', color: 'red' });
    }
  };

  const handleSetDefault = async () => {
    if (!gear) return;
    try {
      await updateGear(gear.id, { isDefault: true });
      setGear(prev => prev ? { ...prev, is_default: true } : prev);
      notifications.show({ title: 'Default updated', message: `${gear.name} is now your default`, color: 'green' });
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to set default', color: 'red' });
    }
  };

  const handleRecalculate = async () => {
    if (!gear) return;
    try {
      const newDistance = await recalculateMileage(gear.id);
      setGear(prev => prev ? { ...prev, total_distance_logged: newDistance } : prev);
      notifications.show({ title: 'Mileage recalculated', message: `Updated from ${activities.length} activities`, color: 'green' });
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to recalculate', color: 'red' });
    }
  };

  const handleReplaceComponent = async (comp) => {
    try {
      await replaceComponent(comp.id);
      const { components: c } = await getGearDetail(gearId);
      setComponents(c);
      notifications.show({ title: 'Component replaced', message: `New ${comp.component_type} installed`, color: 'green' });
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to replace component', color: 'red' });
    }
  };

  const handleDeleteComponent = async (comp) => {
    if (!window.confirm(`Delete this ${comp.component_type}?`)) return;
    try {
      await deleteComponent(comp.id);
      setComponents(prev => prev.filter(c => c.id !== comp.id));
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to delete component', color: 'red' });
    }
  };

  const handleAddComponent = async (params) => {
    try {
      const comp = await createComponent(params);
      // Refresh components list
      const { components: c } = await getGearDetail(gearId);
      setComponents(c);
      setAddCompOpen(false);
      notifications.show({
        title: 'Component added',
        message: `${params.componentType} has been added`,
        color: 'green',
      });
      return comp;
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to add component',
        color: 'red',
      });
    }
  };

  const distanceKm = (gear?.total_distance_logged || 0) / 1000;
  const isShoes = gear?.gear_type === 'shoes';
  const isBike = gear?.gear_type === 'bike';
  const isRetired = gear?.status === 'retired';
  const Icon = isBike ? Bicycle : PersonSimpleRun;

  // Cost per mile/km
  const costPerUnit = gear?.purchase_price && gear.total_distance_logged > 0
    ? useImperial
      ? (gear.purchase_price / (gear.total_distance_logged / METERS_PER_MILE))
      : (gear.purchase_price / (gear.total_distance_logged / 1000))
    : null;

  // Shoe progress
  const shoeProgress = isShoes
    ? Math.min(100, ((gear?.total_distance_logged || 0) / RUNNING_SHOE_THRESHOLDS.replace) * 100)
    : 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={null}
      size="xl"
      fullScreen={isMobile}
    >
      {loading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : gear ? (
        <Stack gap="lg">
          {/* Header */}
          <Group justify="space-between" align="flex-start">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              {photoUrl ? (
                <Box
                  component="img"
                  src={photoUrl}
                  alt={gear.name}
                  style={{ width: 96, height: 72, objectFit: 'cover', border: '1px solid var(--tribos-border-default)', flex: '0 0 auto' }}
                />
              ) : (
                <Icon size={24} color="var(--color-teal)" />
              )}
              <Box>
                <Title order={3}>{gear.name}</Title>
                {(gear.brand || gear.model) && (
                  <Text c="dimmed" size="sm">
                    {[gear.brand, gear.model].filter(Boolean).join(' ')}
                  </Text>
                )}
                {gear.category && (
                  <Text c="dimmed" size="xs">
                    {BIKE_CATEGORIES.find((c) => c.value === gear.category)?.label || gear.category}
                  </Text>
                )}
              </Box>
            </Group>
            <Group gap={4}>
              {gear.is_default && <Badge color="teal" variant="light">Default</Badge>}
              {isRetired && <Badge color="gray" variant="light">Retired</Badge>}
            </Group>
          </Group>

          {/* Photo catalogue — the way parts get on a bike */}
          {isBike && !isRetired && (
            <Box>
              {gear.catalogued_at ? (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Catalogued from photos on {new Date(gear.catalogued_at).toLocaleDateString()}.
                  </Text>
                  <Button size="xs" variant="subtle" leftSection={<Camera size={14} />} onClick={() => setPhotoOpen(true)}>
                    Re-catalogue
                  </Button>
                </Group>
              ) : (
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm">
                    Show me your bike and I&apos;ll list the parts — no forms.
                  </Text>
                  <Button size="xs" leftSection={<Camera size={14} />} onClick={() => setPhotoOpen(true)}>
                    Show me your bike
                  </Button>
                </Group>
              )}
            </Box>
          )}

          <BikePhotoCapture
            opened={photoOpen}
            onClose={() => setPhotoOpen(false)}
            gear={gear}
            existingComponents={components}
            catalogueFromPhotos={catalogueFromPhotos}
            createComponent={createComponent}
            updateGear={updateGear}
            onSaved={loadDetail}
          />

          {/* Stats */}
          <Group grow>
            <Box>
              <Text size="xs" c="dimmed">Total Distance</Text>
              <Text size="lg" fw={600}>{formatDistance(distanceKm, useImperial, 1)}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">Activities</Text>
              <Text size="lg" fw={600}>{activities.length}</Text>
            </Box>
            {gear.purchase_date && (
              <Box>
                <Text size="xs" c="dimmed">Purchased</Text>
                <Text size="lg" fw={600}>
                  {new Date(gear.purchase_date).toLocaleDateString()}
                </Text>
              </Box>
            )}
            {costPerUnit !== null && (
              <Box>
                <Text size="xs" c="dimmed">Cost per {useImperial ? 'mile' : 'km'}</Text>
                <Text size="lg" fw={600}>${costPerUnit.toFixed(2)}</Text>
              </Box>
            )}
          </Group>

          {/* Shoe progress */}
          {isShoes && !isRetired && (
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="sm" c="dimmed">Replacement threshold</Text>
                <Text size="sm" fw={500}>
                  {formatDistance(distanceKm, useImperial, 0)} / {formatDistance(RUNNING_SHOE_THRESHOLDS.replace / 1000, useImperial, 0)}
                </Text>
              </Group>
              <Progress
                value={shoeProgress}
                color={shoeProgress >= 100 ? 'red' : shoeProgress >= 87.5 ? 'yellow' : 'teal'}
                size="md"
                radius="xl"
              />
            </Box>
          )}

          <Divider />

          {/* Components (bikes only) */}
          {isBike && (
            <>
              <Group justify="space-between">
                <Title order={4}>Components</Title>
                {!isRetired && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<Plus size={14} />}
                    onClick={() => setAddCompOpen(true)}
                  >
                    Add Component
                  </Button>
                )}
              </Group>
              {/* Inline add component form */}
              <AddComponentForm
                opened={addCompOpen}
                gearItemId={gearId}
                onSave={handleAddComponent}
                onCancel={() => setAddCompOpen(false)}
              />
              <ComponentTable
                components={components}
                parentDistance={gear.total_distance_logged}
                onReplace={handleReplaceComponent}
                onDelete={handleDeleteComponent}
                useImperial={useImperial}
              />
              <Divider />
            </>
          )}

          {/* Recent activities */}
          {activities.length > 0 && (
            <>
              <Title order={4}>Recent Activities</Title>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Distance</Table.Th>
                    <Table.Th>Assigned</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {activities.map((act) => (
                    <Table.Tr key={act.id}>
                      <Table.Td>
                        <Text size="sm" truncate style={{ maxWidth: 200 }}>{act.name}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {act.start_date ? new Date(act.start_date).toLocaleDateString() : '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: 'right' }}>
                        <Text size="sm">
                          {formatDistance((act.distance || 0) / 1000, useImperial, 1)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light"
                          color={act.assigned_by === 'manual' ? 'blue' : act.assigned_by === 'strava' ? 'orange' : 'gray'}
                        >
                          {act.assigned_by}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              <Divider />
            </>
          )}

          {/* Actions */}
          <Group justify="space-between">
            <Group gap="xs">
              {!isRetired && !gear.is_default && (
                <Tooltip label="Set as default">
                  <Button size="xs" variant="light" leftSection={<Star size={14} />} onClick={handleSetDefault}>
                    Set Default
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Recalculate mileage from activities">
                <Button size="xs" variant="light" color="gray" leftSection={<ArrowsClockwise size={14} />} onClick={handleRecalculate}>
                  Recalculate
                </Button>
              </Tooltip>
            </Group>
            <Group gap="xs">
              {!isRetired && (
                <Button size="xs" variant="light" color="yellow" leftSection={<Archive size={14} />} onClick={handleRetire}>
                  Retire
                </Button>
              )}
              <Button size="xs" variant="light" color="red" leftSection={<Trash size={14} />} onClick={handleDelete}>
                Delete
              </Button>
            </Group>
          </Group>
        </Stack>
      ) : (
        <Text c="dimmed" ta="center" py="xl">Gear not found</Text>
      )}
    </Modal>
  );
}
