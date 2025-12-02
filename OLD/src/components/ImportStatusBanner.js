// ImportStatusBanner - Shows active import jobs at top of page
// Allows users to see progress even after leaving import wizard

import React from 'react';
import { Alert, Text, Progress, Group, Button, Badge } from '@mantine/core';
import { Activity, X } from 'lucide-react';

const ImportStatusBanner = ({ job, onDismiss }) => {
  if (!job) return null;

  const { status, progressPercent, importType, processedCount, totalActivities, importedCount } = job;

  // Don't show banner if job is completed and already dismissed
  if (status === 'completed' && !job._showCompleted) return null;
  if (status === 'failed' && !job._showFailed) return null;

  // Determine color based on status
  let color = 'blue';
  if (status === 'completed') color = 'green';
  if (status === 'failed') color = 'red';

  // Build status message
  let message = '';
  if (status === 'running' || status === 'pending') {
    if (totalActivities) {
      message = `Importing ${processedCount || 0} of ${totalActivities} activities...`;
    } else {
      message = 'Import in progress...';
    }
  } else if (status === 'completed') {
    message = `Import complete! Successfully imported ${importedCount} rides.`;
  } else if (status === 'failed') {
    message = 'Import failed. Please try again.';
  }

  return (
    <Alert
      color={color}
      variant="light"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none'
      }}
      withCloseButton={status === 'completed' || status === 'failed'}
      onClose={onDismiss}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" style={{ flex: 1 }}>
          <Activity size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" mb={4}>
              <Text size="sm" fw={600}>
                {importType === 'strava_bulk' && 'Strava Import'}
                {importType === 'garmin_backfill' && 'Garmin Backfill'}
              </Text>
              <Badge size="xs" color={color}>
                {status}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
              {message}
            </Text>
            {status === 'running' && progressPercent !== undefined && (
              <Progress
                value={progressPercent}
                size="sm"
                mt="xs"
                color={color}
                animated
              />
            )}
          </div>
        </Group>

        {(status === 'running' || status === 'pending') && (
          <Button
            size="xs"
            variant="subtle"
            color={color}
            onClick={onDismiss}
          >
            Hide
          </Button>
        )}
      </Group>
    </Alert>
  );
};

export default ImportStatusBanner;
