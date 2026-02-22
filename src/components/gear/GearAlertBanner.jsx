import { Alert, Stack, Group, Text, CloseButton, Badge, Anchor } from '@mantine/core';
import { IconAlertTriangle, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { formatDistance } from '../../utils/units';
import { METERS_PER_MILE } from './gearConstants';

function formatAlertMessage(alert, useImperial) {
  if (alert.message) return alert.message;
  if (alert.timeBased) {
    return `Bar tape overdue for replacement (installed ${new Date(alert.installedDate).toLocaleDateString()})`;
  }
  const currentKm = (alert.currentDistance || 0) / 1000;
  const thresholdKm = (alert.threshold || 0) / 1000;
  const verb = alert.type === 'replace' ? 'needs replacement' : 'approaching maintenance';
  return `${verb} — ${formatDistance(currentKm, useImperial, 0)} of ${formatDistance(thresholdKm, useImperial, 0)}`;
}

function getAlertIcon(level) {
  if (level === 'critical') return <IconAlertCircle size={18} />;
  if (level === 'info') return <IconInfoCircle size={18} />;
  return <IconAlertTriangle size={18} />;
}

function getAlertColor(level) {
  if (level === 'critical') return 'red';
  if (level === 'info') return 'blue';
  return 'yellow';
}

/**
 * Displays gear maintenance alerts.
 * @param {Object} props
 * @param {Array} props.alerts - Array of GearAlert objects
 * @param {Function} props.onDismiss - Called with alert object when dismissed
 * @param {boolean} [props.compact=false] - Compact mode for dashboard
 * @param {boolean} [props.useImperial=true] - Unit preference
 */
export default function GearAlertBanner({ alerts, onDismiss, compact = false, useImperial = true }) {
  if (!alerts || alerts.length === 0) return null;

  const hasCritical = alerts.some(a => a.level === 'critical');
  const displayAlerts = compact ? alerts.slice(0, 3) : alerts;

  return (
    <Alert
      color={hasCritical ? 'red' : 'yellow'}
      variant="light"
      icon={hasCritical ? <IconAlertCircle size={20} /> : <IconAlertTriangle size={20} />}
      title={compact ? undefined : `${alerts.length} gear alert${alerts.length !== 1 ? 's' : ''}`}
    >
      <Stack gap="xs">
        {displayAlerts.map((alert) => {
          const key = `${alert.gearItemId}-${alert.componentId || 'item'}-${alert.type}`;
          return (
            <Group key={key} justify="space-between" wrap="nowrap" gap="xs">
              <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                {!compact && getAlertIcon(alert.level)}
                <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                  <Text span fw={500}>{alert.gearName}</Text>
                  {alert.componentType && (
                    <Text span c="dimmed"> — {alert.componentType}</Text>
                  )}
                  {': '}
                  {formatAlertMessage(alert, useImperial)}
                </Text>
                <Badge size="xs" color={getAlertColor(alert.level)} variant="filled">
                  {alert.type}
                </Badge>
              </Group>
              {onDismiss && (
                <CloseButton size="sm" onClick={() => onDismiss(alert)} />
              )}
            </Group>
          );
        })}
        {compact && alerts.length > 3 && (
          <Anchor component={Link} to="/gear" size="sm">
            +{alerts.length - 3} more alert{alerts.length - 3 !== 1 ? 's' : ''}
          </Anchor>
        )}
      </Stack>
    </Alert>
  );
}
