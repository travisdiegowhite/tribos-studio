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
import {
  IconBike,
  IconRun,
  IconPlus,
  IconArchive,
  IconTrash,
  IconStar,
  IconRefresh,
} from '@tabler/icons-react';
import { formatDistance } from '../../utils/units';
import { RUNNING_SHOE_THRESHOLDS, METERS_PER_MILE } from './gearConstants';
import ComponentTable from './ComponentTable';
import AddComponentForm from './AddComponentForm';
import { notifications } from '@mantine/notifications';

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

  const {
    getGearDetail,
    updateGear,
    retireGear,
    deleteGear,
    createComponent,
    replaceComponent,
    deleteComponent,
    recalculateMileage,
  } = useGearHook;

  // Load detail data
  useEffect(() => {
    if (opened && gearId) {
      setLoading(true);
      setAddCompOpen(false);
      getGearDetail(gearId)
        .then(({ gear: g, components: c, activities: a }) => {
          setGear(g);
          setComponents(c);
          setActivities(a);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [opened, gearId, getGearDetail]);

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
  };

  const distanceKm = (gear?.total_distance_logged || 0) / 1000;
  const isShoes = gear?.gear_type === 'shoes';
  const isBike = gear?.gear_type === 'bike';
  const isRetired = gear?.status === 'retired';
  const Icon = isBike ? IconBike : IconRun;

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
            <Group gap="sm">
              <Icon size={24} color="var(--tribos-terracotta-500)" stroke={1.5} />
              <Box>
                <Title order={3}>{gear.name}</Title>
                {(gear.brand || gear.model) && (
                  <Text c="dimmed" size="sm">
                    {[gear.brand, gear.model].filter(Boolean).join(' ')}
                  </Text>
                )}
              </Box>
            </Group>
            <Group gap={4}>
              {gear.is_default && <Badge color="terracotta" variant="light">Default</Badge>}
              {isRetired && <Badge color="gray" variant="light">Retired</Badge>}
            </Group>
          </Group>

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
                    leftSection={<IconPlus size={14} />}
                    onClick={() => setAddCompOpen(!addCompOpen)}
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
                  <Button size="xs" variant="light" leftSection={<IconStar size={14} />} onClick={handleSetDefault}>
                    Set Default
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Recalculate mileage from activities">
                <Button size="xs" variant="light" color="gray" leftSection={<IconRefresh size={14} />} onClick={handleRecalculate}>
                  Recalculate
                </Button>
              </Tooltip>
            </Group>
            <Group gap="xs">
              {!isRetired && (
                <Button size="xs" variant="light" color="yellow" leftSection={<IconArchive size={14} />} onClick={handleRetire}>
                  Retire
                </Button>
              )}
              <Button size="xs" variant="light" color="red" leftSection={<IconTrash size={14} />} onClick={handleDelete}>
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
