/**
 * TrainingPlanExportMenu Component
 * Dropdown menu for exporting training plan workouts in various formats
 */

import { useState } from 'react';
import { Menu, Button, Text, Stack } from '@mantine/core';
import {
  IconDownload,
  IconFileSpreadsheet,
  IconCalendarEvent,
  IconFileCode,
  IconChevronDown,
  IconDeviceWatch,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { exportTrainingPlan, exportTrainingPlanFit, downloadPlanExport } from '../../utils/trainingPlanExport';

export default function TrainingPlanExportMenu({
  plan,
  workouts,
  progress,
  variant = 'light',
  size = 'xs',
  disabled = false,
}) {
  const [exporting, setExporting] = useState(false);

  if (!plan || !workouts || workouts.length === 0) {
    return null;
  }

  const handleExport = (format) => {
    try {
      const result = exportTrainingPlan(plan, workouts, { format }, progress);
      downloadPlanExport(result);

      const formatLabels = { csv: 'CSV', ical: 'Calendar (.ics)', json: 'JSON' };
      notifications.show({
        title: 'Plan Exported',
        message: `Your training plan has been exported as ${formatLabels[format]}.`,
        color: 'green',
        icon: <IconDownload size={16} />,
      });
    } catch (error) {
      console.error('Plan export failed:', error);
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export training plan',
        color: 'red',
      });
    }
  };

  const handleFitExport = async () => {
    setExporting(true);
    try {
      const result = await exportTrainingPlanFit(plan, workouts);
      downloadPlanExport(result);
      notifications.show({
        title: 'FIT Workouts Exported',
        message: 'ZIP file with structured workouts downloaded. Upload to Garmin Connect or copy to your device.',
        color: 'green',
        icon: <IconDeviceWatch size={16} />,
      });
    } catch (error) {
      console.error('FIT export failed:', error);
      notifications.show({
        title: 'Export Failed',
        message: error.message || 'Failed to export FIT workouts',
        color: 'red',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Menu shadow="md" width={280} position="bottom-end">
      <Menu.Target>
        <Button
          variant={variant}
          size={size}
          leftSection={<IconDownload size={14} />}
          rightSection={<IconChevronDown size={12} />}
          disabled={disabled || exporting}
          loading={exporting}
          color="blue"
        >
          Export Plan
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>For Bike Computers</Menu.Label>

        <Menu.Item
          leftSection={<IconDeviceWatch size={16} />}
          onClick={handleFitExport}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              FIT Workouts (ZIP)
            </Text>
            <Text size="xs" c="dimmed">
              Garmin, Wahoo, Hammerhead structured workouts
            </Text>
          </Stack>
        </Menu.Item>

        <Menu.Divider />
        <Menu.Label>Other Formats</Menu.Label>

        <Menu.Item
          leftSection={<IconCalendarEvent size={16} />}
          onClick={() => handleExport('ical')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              Calendar (.ics)
            </Text>
            <Text size="xs" c="dimmed">
              Import into Google Calendar, Apple Calendar
            </Text>
          </Stack>
        </Menu.Item>

        <Menu.Item
          leftSection={<IconFileSpreadsheet size={16} />}
          onClick={() => handleExport('csv')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              CSV Spreadsheet
            </Text>
            <Text size="xs" c="dimmed">
              Open in Excel, Google Sheets, etc.
            </Text>
          </Stack>
        </Menu.Item>

        <Menu.Item
          leftSection={<IconFileCode size={16} />}
          onClick={() => handleExport('json')}
        >
          <Stack gap={0}>
            <Text size="sm" fw={500}>
              JSON Data
            </Text>
            <Text size="xs" c="dimmed">
              Full structured data for backup
            </Text>
          </Stack>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
