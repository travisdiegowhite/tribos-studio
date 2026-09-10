import { Box, Menu, Text, UnstyledButton } from '@mantine/core';
import { Bicycle, Check } from '@phosphor-icons/react';

const SURFACES = [
  { value: null, label: 'Let the ride type decide' },
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mtb', label: 'Trail / MTB' },
  { value: 'indoor', label: 'Trainer' },
];

const MONO = "'DM Mono', monospace";

/**
 * One ride, which bike: a chip that opens a menu of the rider's bikes and,
 * once the ride is on one, the surface it was ridden on. Used in the ride
 * history rows and the ride modal. `ride.gear` is the activity_gear row
 * merged client-side by TrainingDashboard.
 *
 * Every write here is the rider's decision (assigned_by 'manual'), so bulk
 * backfills leave it alone afterwards.
 */
export default function BikePickerMenu({ ride, bikes = [], onAssignBike, onSetSurface, size = 'sm' }) {
  if (!bikes.length || !onAssignBike) return null;
  const current = ride.gear?.gear_item_id ? bikes.find((b) => b.id === ride.gear.gear_item_id) : null;
  const surface = ride.gear?.surface_override ?? null;
  const active = bikes.filter((b) => b.status === 'active');
  const retiredCurrent = current && current.status !== 'active' ? current : null;
  const fontSize = size === 'xs' ? 10 : 11;

  return (
    <Box onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
      <Menu withinPortal position="bottom-end" shadow="md" width={240} radius={0}>
        <Menu.Target>
          <UnstyledButton
            aria-label={current ? `On ${current.name}. Change bike` : 'Pick a bike for this ride'}
            title={current ? `On ${current.name}` : 'Which bike?'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: size === 'xs' ? '2px 6px' : '3px 8px',
              border: `1px solid ${current ? 'var(--color-border)' : 'var(--color-orange)'}`,
              background: current ? 'transparent' : 'var(--color-orange-subtle, transparent)',
              fontFamily: MONO, fontSize, fontWeight: 500, letterSpacing: '1px', textTransform: 'uppercase',
              color: current ? 'var(--color-text-secondary)' : 'var(--color-orange)', whiteSpace: 'nowrap', borderRadius: 0, maxWidth: 160,
            }}
          >
            <Bicycle size={12} weight="bold" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{current ? current.name : 'Bike?'}</span>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Bike</Menu.Label>
          {active.map((b) => (
            <Menu.Item
              key={b.id}
              leftSection={current?.id === b.id ? <Check size={14} weight="bold" /> : <span style={{ width: 14, display: 'inline-block' }} />}
              onClick={() => { if (current?.id !== b.id) onAssignBike(ride, b.id); }}
            >
              {b.name}
              {b.is_default && <Text span size="xs" c="dimmed"> · default</Text>}
            </Menu.Item>
          ))}
          {retiredCurrent && (
            <Menu.Item leftSection={<Check size={14} weight="bold" />} disabled>
              {retiredCurrent.name}<Text span size="xs" c="dimmed"> · retired</Text>
            </Menu.Item>
          )}
          {current && onSetSurface && (
            <>
              <Menu.Divider />
              <Menu.Label>Ridden on</Menu.Label>
              {SURFACES.map((s) => (
                <Menu.Item
                  key={String(s.value)}
                  leftSection={surface === s.value ? <Check size={14} weight="bold" /> : <span style={{ width: 14, display: 'inline-block' }} />}
                  onClick={() => { if (surface !== s.value) onSetSurface(ride, s.value); }}
                >
                  {s.label}
                </Menu.Item>
              ))}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
