/**
 * TrainingPlanExportMenu Component
 * Dropdown menu for exporting training plan workouts in various formats.
 *
 * The items are exported on their own as `TrainingPlanExportItems` so a page
 * can fold them into an existing overflow menu (as /train does) instead of
 * spending a header button on them.
 */

import { useState } from 'react';
import { Menu, Button, Text, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { exportTrainingPlan, exportTrainingPlanFit, downloadPlanExport } from '../../utils/trainingPlanExport';
import { CalendarBlank, CaretDown, DownloadSimple, FileCode, FileXls, Watch } from '@phosphor-icons/react';

function usePlanExport(plan, workouts, progress) {
  const [exporting, setExporting] = useState(false);

  const handleExport = (format) => {
    try {
      const result = exportTrainingPlan(plan, workouts, { format }, progress);
      downloadPlanExport(result);

      const formatLabels = { csv: 'CSV', ical: 'Calendar (.ics)', json: 'JSON' };
      notifications.show({
        title: 'Plan Exported',
        message: `Your training plan has been exported as ${formatLabels[format]}.`,
        color: 'green',
        icon: <DownloadSimple size={16} />,
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
        icon: <Watch size={16} />,
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

  return { exporting, handleExport, handleFitExport };
}

/**
 * The export entries only — Menu.Label / Menu.Item / Menu.Divider nodes —
 * for rendering inside a caller's own `<Menu.Dropdown>`. Renders nothing
 * when there is no plan or no workouts to export.
 */
export function TrainingPlanExportItems({ plan, workouts, progress }) {
  const { exporting, handleExport, handleFitExport } = usePlanExport(plan, workouts, progress);

  if (!plan || !workouts || workouts.length === 0) {
    return null;
  }

  return (
    <>
      <Menu.Label>Export plan for bike computers</Menu.Label>

      <Menu.Item
        leftSection={<Watch size={16} />}
        onClick={handleFitExport}
        disabled={exporting}
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
      <Menu.Label>Export plan — other formats</Menu.Label>

      <Menu.Item
        leftSection={<CalendarBlank size={16} />}
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
        leftSection={<FileXls size={16} />}
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
        leftSection={<FileCode size={16} />}
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
    </>
  );
}

export default function TrainingPlanExportMenu({
  plan,
  workouts,
  progress,
  variant = 'light',
  size = 'xs',
  disabled = false,
}) {
  if (!plan || !workouts || workouts.length === 0) {
    return null;
  }

  // The in-flight FIT export disables its own item; the button needs no
  // loading state of its own.
  return (
    <Menu shadow="md" width={280} position="bottom-end">
      <Menu.Target>
        <Button
          variant={variant}
          size={size}
          leftSection={<DownloadSimple size={14} />}
          rightSection={<CaretDown size={12} />}
          disabled={disabled}
          color="blue"
        >
          Export Plan
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <TrainingPlanExportItems plan={plan} workouts={workouts} progress={progress} />
      </Menu.Dropdown>
    </Menu>
  );
}
