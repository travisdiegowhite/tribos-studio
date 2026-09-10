import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Container, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { Archive, ArrowLeft, ArrowsClockwise, Camera, Plus, Star, Trash } from '@phosphor-icons/react';
import AppShell from '../components/AppShell.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useUserPreferences } from '../contexts/UserPreferencesContext.jsx';
import { useGear } from '../hooks/useGear';
import { useBikeHistory } from '../hooks/useBikeHistory';
import { BIKE_CATEGORIES } from '../components/gear/gearConstants';
import BikePhotoCaptureJs from '../components/gear/BikePhotoCapture.jsx';
import ComponentTable from '../components/gear/ComponentTable.jsx';
import AddComponentForm from '../components/gear/AddComponentForm.jsx';
import { BikePhoto } from '../components/garage/BikePhoto';
import { Eyebrow } from '../components/garage/Eyebrow';
import { FactChip } from '../components/garage/StatusChip';
import { WearBars } from '../components/garage/WearBars';
import { WearTimeline } from '../components/garage/WearTimeline';
import { ServiceLog } from '../components/garage/ServiceLog';
import { SeasonTotals } from '../components/garage/SeasonTotals';
import { FONT, cardStyle } from '../components/garage/garageTokens';
import { formatWhole } from '../lib/gear/wearSeries';
import { trackGear } from '../utils/gearTelemetry';

// The capture modal is untyped JSX; its defaulted props infer as never[].
const BikePhotoCapture = BikePhotoCaptureJs as unknown as React.ComponentType<Record<string, unknown>>;

function Card({ label, accent, children }: { label: string; accent: string; children: React.ReactNode }) {
  return (
    <Box style={cardStyle}>
      <Eyebrow label={label} accent={accent} />
      {children}
    </Box>
  );
}

/**
 * /garage/:gearId — one bike: the verdict, the parts, the wear and the rides
 * that did it, the service log, and the parts list for edits.
 */
export default function BikeDetailPage() {
  const { gearId } = useParams<{ gearId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { unitsPreference } = useUserPreferences() as { unitsPreference: string };
  const useImperial = unitsPreference !== 'metric';

  const gearHook = useGear({ userId: user?.id, alertsOnly: true });
  const { updateGear, retireGear, deleteGear, createComponent, replaceComponent, deleteComponent, recalculateMileage, catalogueFromPhotos } = gearHook;
  const { bike, components, serviceLog, history, loading, error, refetch } = useBikeHistory(gearId, useImperial);

  const [photoOpen, setPhotoOpen] = useState(false);
  const [addPartOpen, setAddPartOpen] = useState(false);

  useEffect(() => {
    if (bike && history) {
      trackGear('bike_detail_viewed', {
        gearId: bike.id,
        componentCount: components.filter((c) => c.status === 'active').length,
        rideCount: history.totals.rides,
        worstLevel: history.componentWear.find((c) => c.status === 'active')?.level ?? 'unknown',
        bucket: history.domain.bucket,
      });
    }
    // fire once per bike load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bike?.id, history === null]);

  const isShoes = bike?.gear_type === 'shoes';
  const category = bike ? (isShoes ? 'Shoes' : BIKE_CATEGORIES.find((c) => c.value === bike.category)?.label || null) : null;
  const unit = useImperial ? 'mi' : 'km';

  const withRefresh = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await refetch();
      await gearHook.refreshAlerts();
      notifications.show({ title: ok, color: 'green', message: undefined });
    } catch (err) {
      notifications.show({ title: 'That didn’t work', message: err instanceof Error ? err.message : 'Try again', color: 'red' });
    }
  };

  const sinceLabel = history ? new Date(history.domain.startT).toLocaleDateString('en-US', { month: 'short' }) : '';

  return (
    <AppShell>
      <Container size="md" py="lg">
        {loading ? (
          <Group justify="center" py="xl"><Loader /></Group>
        ) : error || !bike || !history ? (
          <Stack align="center" gap="sm" py="xl">
            <Text c="dimmed">{error || 'That bike isn’t in your garage.'}</Text>
            <Button component={Link} to="/garage" variant="subtle" leftSection={<ArrowLeft size={14} />}>Back to the garage</Button>
          </Stack>
        ) : (
          <Stack gap="lg">
            <Button component={Link} to="/garage" variant="subtle" size="xs" leftSection={<ArrowLeft size={14} />} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
              Garage
            </Button>

            {/* Header */}
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Group gap={isMobile ? 12 : 16} align="flex-start" wrap="nowrap">
                <BikePhoto path={bike.photo_paths?.whole_bike} alt={bike.name} width={isMobile ? 84 : 112} height={isMobile ? 64 : 84} shoes={isShoes} iconSize={isMobile ? 36 : 48} />
                <Stack gap={6}>
                  <Title order={1} style={{ color: 'var(--color-text-primary)' }}>{bike.name}</Title>
                  {(bike.brand || bike.model) && (
                    <Text style={{ fontFamily: FONT.body, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                      {[bike.brand, bike.model].filter(Boolean).join(' ')}
                    </Text>
                  )}
                  <Group gap={6} wrap="wrap">
                    {category && <FactChip>{category}</FactChip>}
                    <FactChip>{`${formatWhole(bike.total_distance_logged || 0, useImperial)} ${unit}`}</FactChip>
                    <FactChip>{`${history.totals.rides} ride${history.totals.rides === 1 ? '' : 's'} this year`}</FactChip>
                    {bike.is_default && <FactChip>Default</FactChip>}
                    {bike.status === 'retired' && <FactChip>Retired</FactChip>}
                  </Group>
                </Stack>
              </Group>
              {!isShoes && bike.status === 'active' && (
                <Button variant="outline" leftSection={<Camera size={14} />} onClick={() => setPhotoOpen(true)} fullWidth={isMobile}>
                  {bike.catalogued_at ? 'Re-catalogue from photos' : 'Show me your bike'}
                </Button>
              )}
            </Group>

            {/* Verdict */}
            <Text style={{ fontFamily: FONT.body, fontSize: isMobile ? 18 : 20, fontWeight: 500, lineHeight: 1.35, color: 'var(--color-text-primary)', maxWidth: 760, textWrap: 'pretty' as never }}>
              {history.verdict}
            </Text>

            {!isShoes && (
              <BikePhotoCapture
                opened={photoOpen}
                onClose={() => setPhotoOpen(false)}
                gear={bike}
                existingComponents={components}
                catalogueFromPhotos={catalogueFromPhotos}
                createComponent={createComponent}
                updateGear={updateGear}
                onSaved={() => { refetch(); gearHook.refreshAlerts(); }}
              />
            )}

            {/* Parts */}
            <Card label="Parts" accent="var(--color-gold)">
              <WearBars parts={history.componentWear} useImperial={useImperial} isLowerBound={history.isLowerBound} />
            </Card>

            {/* Wear over time + rides */}
            {!isShoes && (
              <Card label="Wear over time, and the rides that did it" accent="var(--color-teal)">
                <Text style={{ fontFamily: FONT.body, fontSize: isMobile ? 13 : 14, color: 'var(--color-text-secondary)', margin: '-4px 0 12px' }}>
                  Each row is one part&rsquo;s life. The dashed line is where it&rsquo;s done. The rides underneath share the same {history.domain.bucket === 'week' ? 'weeks' : 'days'}.
                </Text>
                <WearTimeline history={history} useImperial={useImperial} />
              </Card>
            )}

            {/* Service log + totals */}
            <Box style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
              <Card label="Service log" accent="var(--color-orange)">
                <ServiceLog rows={serviceLog} compact={Boolean(isMobile)} />
              </Card>
              <Card label="This year" accent="var(--color-teal)">
                <SeasonTotals totals={history.totals} useImperial={useImperial} sinceLabel={sinceLabel} />
              </Card>
            </Box>

            {/* Parts list (edit surface) */}
            {!isShoes && (
              <Card label="Parts list" accent="var(--color-text-muted)">
                <ComponentTable
                  components={components}
                  parentDistance={bike.total_distance_logged}
                  onReplace={(comp: { id: string; component_type: string }) => withRefresh(() => replaceComponent(comp.id), 'Replaced — the new one starts from zero')}
                  onDelete={(comp: { id: string; component_type: string }) => {
                    if (!window.confirm(`Remove this ${comp.component_type.replace(/_/g, ' ')}?`)) return;
                    withRefresh(() => deleteComponent(comp.id), 'Removed');
                  }}
                  useImperial={useImperial}
                />
                <AddComponentForm
                  opened={addPartOpen}
                  gearItemId={bike.id}
                  onSave={async (params: Parameters<typeof createComponent>[0]) => { await withRefresh(() => createComponent(params), 'Part added'); setAddPartOpen(false); }}
                  onCancel={() => setAddPartOpen(false)}
                />
                {!addPartOpen && bike.status === 'active' && (
                  <Button mt="sm" variant="outline" size="xs" leftSection={<Plus size={14} />} onClick={() => setAddPartOpen(true)}>Add a part by hand</Button>
                )}
              </Card>
            )}

            {/* Actions */}
            <Group justify="space-between" wrap="wrap" gap="xs">
              <Group gap="xs">
                {bike.status === 'active' && !bike.is_default && (
                  <Button size="xs" variant="light" leftSection={<Star size={14} />} onClick={() => withRefresh(() => updateGear(bike.id, { isDefault: true }), `${bike.name} is now your default`)}>
                    Make default
                  </Button>
                )}
                <Button size="xs" variant="light" color="gray" leftSection={<ArrowsClockwise size={14} />} onClick={() => withRefresh(() => recalculateMileage(bike.id), 'Mileage recounted from rides')}>
                  Recount mileage
                </Button>
              </Group>
              <Group gap="xs">
                {bike.status === 'active' && (
                  <Button size="xs" variant="light" color="yellow" leftSection={<Archive size={14} />} onClick={() => withRefresh(() => retireGear(bike.id), `${bike.name} retired`)}>
                    Retire
                  </Button>
                )}
                <Button
                  size="xs" variant="light" color="red" leftSection={<Trash size={14} />}
                  onClick={async () => {
                    if (!window.confirm(`Delete "${bike.name}" and its parts? This cannot be undone.`)) return;
                    try { await deleteGear(bike.id); navigate('/garage'); } catch (err) { notifications.show({ title: 'Could not delete', message: err instanceof Error ? err.message : '', color: 'red' }); }
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Container>
    </AppShell>
  );
}
