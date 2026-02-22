import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Stack,
  Button,
  SegmentedControl,
  SimpleGrid,
  Text,
  Group,
  Collapse,
  UnstyledButton,
  ThemeIcon,
} from '@mantine/core';
import { IconPlus, IconChevronDown, IconChevronRight, IconTool } from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useGear } from '../hooks/useGear.ts';
import AppShell from '../components/AppShell.jsx';
import PageHeader from '../components/PageHeader.jsx';
import GearItemCard from '../components/gear/GearItemCard.jsx';
import GearDetailView from '../components/gear/GearDetailView.jsx';
import GearAlertBanner from '../components/gear/GearAlertBanner.jsx';
import AddGearModal from '../components/gear/AddGearModal.jsx';
import { notifications } from '@mantine/notifications';

function GearPage() {
  const { user } = useAuth();
  const { gearId: urlGearId } = useParams();
  const [activeSport, setActiveSport] = useState('cycling');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedGearId, setSelectedGearId] = useState(urlGearId || null);
  const [showRetired, setShowRetired] = useState(false);

  const gearHook = useGear({ userId: user?.id });
  const {
    gearItems,
    alerts,
    loading,
    createGear,
    dismissAlert,
  } = gearHook;

  // TODO: Get from user preferences context
  const useImperial = true;

  const activeGear = gearItems.filter(g => g.status === 'active' && g.sport_type === activeSport);
  const retiredGear = gearItems.filter(g => g.status === 'retired' && g.sport_type === activeSport);

  const handleCreateGear = async (params) => {
    try {
      const gear = await createGear(params);
      notifications.show({
        title: 'Gear added',
        message: `${gear.name} has been added`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to add gear',
        color: 'red',
      });
      throw err;
    }
  };

  return (
    <AppShell>
      <Container size="md" py="lg">
        <Stack gap="xl">
          <PageHeader
            title="Gear"
            subtitle="Track your bikes, shoes, and components"
            actions={
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setAddModalOpen(true)}
              >
                Add Gear
              </Button>
            }
          />

          {/* Alerts */}
          {alerts.length > 0 && (
            <GearAlertBanner
              alerts={alerts}
              onDismiss={dismissAlert}
              useImperial={useImperial}
            />
          )}

          {/* Sport type filter */}
          <SegmentedControl
            value={activeSport}
            onChange={setActiveSport}
            data={[
              { label: 'Cycling', value: 'cycling' },
              { label: 'Running', value: 'running' },
            ]}
          />

          {/* Active gear */}
          {loading ? (
            <Text c="dimmed" ta="center" py="xl">Loading gear...</Text>
          ) : activeGear.length === 0 ? (
            <Stack align="center" gap="sm" py="xl">
              <ThemeIcon size={48} radius="xl" variant="light" color="gray">
                <IconTool size={24} />
              </ThemeIcon>
              <Text c="dimmed" ta="center">
                No {activeSport === 'cycling' ? 'bikes' : 'shoes'} tracked yet.
              </Text>
              <Button
                variant="light"
                size="sm"
                onClick={() => setAddModalOpen(true)}
              >
                Add your first {activeSport === 'cycling' ? 'bike' : 'pair of shoes'}
              </Button>
            </Stack>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {activeGear.map((gear) => (
                <GearItemCard
                  key={gear.id}
                  gear={gear}
                  onClick={() => setSelectedGearId(gear.id)}
                  useImperial={useImperial}
                />
              ))}
            </SimpleGrid>
          )}

          {/* Retired gear */}
          {retiredGear.length > 0 && (
            <>
              <UnstyledButton onClick={() => setShowRetired(!showRetired)}>
                <Group gap={4}>
                  {showRetired ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  <Text size="sm" c="dimmed">
                    Retired ({retiredGear.length})
                  </Text>
                </Group>
              </UnstyledButton>
              <Collapse in={showRetired}>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {retiredGear.map((gear) => (
                    <GearItemCard
                      key={gear.id}
                      gear={gear}
                      onClick={() => setSelectedGearId(gear.id)}
                      useImperial={useImperial}
                    />
                  ))}
                </SimpleGrid>
              </Collapse>
            </>
          )}
        </Stack>
      </Container>

      {/* Modals */}
      <AddGearModal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleCreateGear}
      />

      <GearDetailView
        gearId={selectedGearId}
        opened={!!selectedGearId}
        onClose={() => setSelectedGearId(null)}
        useGearHook={gearHook}
        useImperial={useImperial}
      />
    </AppShell>
  );
}

export default GearPage;
