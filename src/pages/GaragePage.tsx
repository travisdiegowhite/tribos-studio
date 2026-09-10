import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Collapse, Container, Group, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Bicycle, CaretDown, CaretRight, Plus } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUserPreferences } from '../contexts/UserPreferencesContext.jsx';
import { useGear, type GearItem } from '../hooks/useGear';
import AppShell from '../components/AppShell.jsx';
import AddGearModal from '../components/gear/AddGearModal.jsx';
import GearAlertBanner from '../components/gear/GearAlertBanner.jsx';
import { BikeCard } from '../components/garage/BikeCard';
import { Eyebrow } from '../components/garage/Eyebrow';
import { FONT } from '../components/garage/garageTokens';
import { trackGear } from '../utils/gearTelemetry';

/**
 * /garage — the bikes, what's on them, and what's due.
 * Bike-first: shoes keep working but sit in a quiet row underneath.
 */
export default function GaragePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unitsPreference } = useUserPreferences() as { unitsPreference: string };
  const useImperial = unitsPreference !== 'metric';
  const { gearItems, alerts, loading, createGear, dismissAlert } = useGear({ userId: user?.id });
  const [addOpen, setAddOpen] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => { trackGear('garage_opened', {}); }, []);

  const bikes = useMemo(() => gearItems.filter((g) => g.gear_type === 'bike' && g.status === 'active'), [gearItems]);
  const shoes = useMemo(() => gearItems.filter((g) => g.gear_type === 'shoes' && g.status === 'active'), [gearItems]);
  const retired = useMemo(() => gearItems.filter((g) => g.status === 'retired'), [gearItems]);

  const handleCreate = async (params: Parameters<typeof createGear>[0]) => {
    try {
      const gear: GearItem = await createGear(params);
      setAddOpen(false);
      notifications.show({
        title: gear.gear_type === 'bike' ? `${gear.name} is in the garage` : `${gear.name} added`,
        message: gear.gear_type === 'bike' ? 'Show me a photo and I’ll list the parts.' : undefined,
        color: 'green',
      });
      navigate(`/garage/${gear.id}`);
    } catch (err) {
      notifications.show({ title: 'Could not add it', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
      throw err;
    }
  };

  return (
    <AppShell>
      <Container size="md" py="lg">
        <Stack gap="xl">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Box>
              <Title order={1} style={{ color: 'var(--color-text-primary)' }}>Garage</Title>
              <Text style={{ color: 'var(--color-text-secondary)' }}>Your bikes, what&rsquo;s on them, and what&rsquo;s due.</Text>
            </Box>
            <Button leftSection={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add a bike</Button>
          </Group>

          <AddGearModal opened={addOpen} onClose={() => setAddOpen(false)} onSave={handleCreate} />

          {alerts.length > 0 && (
            <GearAlertBanner alerts={alerts} onDismiss={dismissAlert} useImperial={useImperial} />
          )}

          {loading ? (
            <Text c="dimmed" ta="center" py="xl">Opening the garage…</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {bikes.map((g) => <BikeCard key={g.id} gear={g} alerts={alerts} useImperial={useImperial} />)}
              <UnstyledButton
                onClick={() => setAddOpen(true)}
                style={{
                  border: '1.5px dashed var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 10, padding: 24, minHeight: bikes.length === 0 ? 260 : 240, borderRadius: 0,
                }}
              >
                <Bicycle size={56} color="var(--color-text-muted)" />
                <Text ta="center" style={{ fontFamily: FONT.body, fontSize: 15, color: 'var(--color-text-secondary)', maxWidth: 260 }}>
                  {bikes.length === 0 ? 'Add your first bike, then show me a photo and I’ll list the parts.' : 'Add a bike, then show me a photo and I’ll list the parts.'}
                </Text>
                <Button variant="outline" size="xs" leftSection={<Plus size={14} />} component="span">Add a bike</Button>
              </UnstyledButton>
            </SimpleGrid>
          )}

          {retired.length > 0 && (
            <Box>
              <UnstyledButton onClick={() => setShowRetired((v) => !v)}>
                <Group gap={6}>
                  {showRetired ? <CaretDown size={12} /> : <CaretRight size={12} />}
                  <Text style={{ fontFamily: FONT.mono, fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
                    Retired ({retired.length})
                  </Text>
                </Group>
              </UnstyledButton>
              <Collapse in={showRetired}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="sm">
                  {retired.map((g) => <BikeCard key={g.id} gear={g} alerts={alerts} useImperial={useImperial} />)}
                </SimpleGrid>
              </Collapse>
            </Box>
          )}

          {shoes.length > 0 && (
            <Box>
              <Eyebrow label="Shoes" accent="var(--color-text-muted)" />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {shoes.map((g) => <BikeCard key={g.id} gear={g} alerts={alerts} useImperial={useImperial} />)}
              </SimpleGrid>
            </Box>
          )}
        </Stack>
      </Container>
    </AppShell>
  );
}
