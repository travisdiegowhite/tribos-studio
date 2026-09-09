import { Table, Badge, Group, Text, Button, ActionIcon, Tooltip } from '@mantine/core';
import { formatDistance } from '../../utils/units';
import { getComponentLabel } from './gearConstants';
import { ArrowsClockwise, Trash } from '@phosphor-icons/react';

// Same words and colours as the Garage wear bars (src/components/garage), so
// the table and the bars above it never disagree about a part.
function getStatusInfo(componentDistance, warningThreshold, replaceThreshold) {
  if (replaceThreshold && componentDistance >= replaceThreshold) {
    return { label: 'Past due', color: 'var(--color-coral)' };
  }
  if (warningThreshold && componentDistance >= warningThreshold) {
    return { label: 'Nearly done', color: 'var(--color-gold)' };
  }
  if (replaceThreshold && componentDistance >= replaceThreshold * 0.5) {
    return { label: 'Wearing in', color: 'var(--color-teal)' };
  }
  return { label: 'Fresh', color: 'var(--color-teal)' };
}

/**
 * Table displaying components for a bike with mileage and status.
 */
export default function ComponentTable({
  components,
  parentDistance,
  onReplace,
  onDelete,
  useImperial = true,
}) {
  const activeComponents = (components || []).filter(c => c.status === 'active');
  const replacedComponents = (components || []).filter(c => c.status === 'replaced');

  if (activeComponents.length === 0 && replacedComponents.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="md">
        No components tracked yet. Add components to get maintenance alerts.
      </Text>
    );
  }

  return (
    <>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Component</Table.Th>
            <Table.Th>Brand/Model</Table.Th>
            <Table.Th>Installed</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Mileage</Table.Th>
            <Table.Th style={{ textAlign: 'center' }}>Status</Table.Th>
            <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {activeComponents.map((comp) => {
            const componentDistance = (parentDistance || 0) - (comp.distance_at_install || 0);
            const distKm = componentDistance / 1000;
            const status = getStatusInfo(
              componentDistance,
              comp.warning_threshold_meters,
              comp.replace_threshold_meters
            );

            return (
              <Table.Tr key={comp.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>{getComponentLabel(comp.component_type)}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {[comp.brand, comp.model].filter(Boolean).join(' ') || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {comp.installed_date
                      ? new Date(comp.installed_date).toLocaleDateString()
                      : '—'}
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Text size="sm" fw={500}>
                    {formatDistance(distKm, useImperial, 0)}
                  </Text>
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <Badge
                    size="sm"
                    variant="outline"
                    radius={0}
                    style={{ color: status.color, borderColor: status.color }}
                  >
                    {status.label}
                  </Badge>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Group gap={4} justify="flex-end">
                    <Tooltip label="Replace component">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="blue"
                        onClick={() => onReplace?.(comp)}
                      >
                        <ArrowsClockwise size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete component">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={() => onDelete?.(comp)}
                      >
                        <Trash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {replacedComponents.length > 0 && (
        <>
          <Text size="xs" c="dimmed" mt="sm" mb="xs">
            Previously replaced ({replacedComponents.length})
          </Text>
          <Table>
            <Table.Tbody>
              {replacedComponents.map((comp) => {
                const componentDistance = (comp.replaced_date ? parentDistance : parentDistance) - (comp.distance_at_install || 0);
                const distKm = componentDistance / 1000;
                return (
                  <Table.Tr key={comp.id} style={{ opacity: 0.5 }}>
                    <Table.Td>
                      <Text size="xs">{getComponentLabel(comp.component_type)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {[comp.brand, comp.model].filter(Boolean).join(' ') || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        Replaced {comp.replaced_date ? new Date(comp.replaced_date).toLocaleDateString() : ''}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>
                      <Text size="xs">{formatDistance(distKm, useImperial, 0)}</Text>
                    </Table.Td>
                    <Table.Td />
                    <Table.Td />
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </>
      )}
    </>
  );
}
