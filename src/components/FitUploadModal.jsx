import React, { useState, useCallback } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  Paper,
  Progress,
  Alert,
  ThemeIcon,
  Badge,
  SimpleGrid,
  Divider,
  List,
} from '@mantine/core';
import {
  IconUpload,
  IconFile,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconBike,
  IconClock,
  IconRoute,
  IconMountain,
  IconHeart,
  IconBolt,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { parseFitFile, fitToActivityFormat } from '../utils/fitParser';
import { trackUpload, EventType } from '../utils/activityTracking';

function FitUploadModal({ opened, onClose, onUploadComplete, formatDistance: formatDistanceProp, formatElevation: formatElevationProp }) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setSelectedFiles(files);
    setError(null);
    setParsedData(null);

    // Parse the first file to show preview
    if (files.length === 1) {
      try {
        const file = files[0];
        const buffer = await file.arrayBuffer();
        const isCompressed = file.name.endsWith('.gz');
        const data = await parseFitFile(buffer, isCompressed);
        setParsedData(data);
      } catch (err) {
        console.error('Error parsing FIT file:', err);
        setError(err.message);
      }
    }
  }, []);

  const handleUpload = async () => {
    if (!user || selectedFiles.length === 0) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    const results = {
      success: [],
      failed: []
    };

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress(Math.round((i / selectedFiles.length) * 100));

      try {
        // Parse the FIT file
        const buffer = await file.arrayBuffer();
        const isCompressed = file.name.endsWith('.gz');
        const fitData = await parseFitFile(buffer, isCompressed);

        // Convert to database format (pass filename for better naming)
        const activityData = fitToActivityFormat(fitData, user.id, file.name);

        // Check for duplicate (same date and similar distance)
        const { data: existing } = await supabase
          .from('activities')
          .select('id')
          .eq('user_id', user.id)
          .gte('start_date_local', new Date(new Date(activityData.start_date_local).getTime() - 60000).toISOString())
          .lte('start_date_local', new Date(new Date(activityData.start_date_local).getTime() + 60000).toISOString())
          .gte('distance', activityData.distance * 0.95)
          .lte('distance', activityData.distance * 1.05)
          .maybeSingle();

        if (existing) {
          results.failed.push({
            file: file.name,
            error: 'Duplicate activity already exists'
          });
          continue;
        }

        // Insert into database
        const { data, error: insertError } = await supabase
          .from('activities')
          .insert(activityData)
          .select()
          .single();

        if (insertError) throw insertError;

        results.success.push({
          file: file.name,
          activity: data
        });

      } catch (err) {
        console.error(`Error uploading ${file.name}:`, err);
        results.failed.push({
          file: file.name,
          error: err.message
        });
      }
    }

    setProgress(100);
    setUploading(false);

    trackUpload(EventType.FIT_UPLOAD, {
      totalFiles: selectedFiles.length,
      successCount: results.success.length,
      failedCount: results.failed.length
    });

    // Show results
    if (results.success.length > 0) {
      notifications.show({
        title: 'Upload Complete',
        message: `Successfully uploaded ${results.success.length} activit${results.success.length === 1 ? 'y' : 'ies'}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    }

    if (results.failed.length > 0) {
      notifications.show({
        title: 'Some uploads failed',
        message: `${results.failed.length} file(s) could not be uploaded`,
        color: 'yellow',
        icon: <IconAlertCircle size={16} />,
      });
    }

    // Reset state
    setSelectedFiles([]);
    setParsedData(null);

    // Notify parent
    onUploadComplete?.(results);

    if (results.success.length > 0) {
      onClose();
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.fit') || f.name.endsWith('.fit.gz')
    );
    if (files.length > 0) {
      const event = { target: { files } };
      handleFileSelect(event);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Format distance - use prop if provided, otherwise default to simple format
  const formatDistance = formatDistanceProp || ((km) => {
    if (!km) return '--';
    return `${km.toFixed(1)} km`;
  });

  // Format elevation - use prop if provided, otherwise default to simple format
  const formatElevation = formatElevationProp || ((m) => {
    if (!m && m !== 0) return '--';
    return `${Math.round(m)} m`;
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="orange" variant="light">
            <IconUpload size={18} />
          </ThemeIcon>
          <Text fw={600}>Upload FIT File</Text>
        </Group>
      }
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Upload .fit files from your Garmin, Wahoo, or other cycling computer to import activities.
        </Text>

        {/* Drop Zone */}
        <Paper
          withBorder
          p="xl"
          style={{
            borderStyle: 'dashed',
            backgroundColor: 'var(--mantine-color-dark-7)',
            cursor: 'pointer',
            textAlign: 'center'
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => document.getElementById('fit-file-input').click()}
        >
          <input
            id="fit-file-input"
            type="file"
            accept=".fit,.fit.gz"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Stack align="center" gap="xs">
            <ThemeIcon size={48} variant="light" color="gray">
              <IconUpload size={24} />
            </ThemeIcon>
            <Text fw={500}>Drop FIT files here or click to browse</Text>
            <Text size="xs" c="dimmed">Supports .fit and .fit.gz files</Text>
          </Stack>
        </Paper>

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <Paper withBorder p="sm">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>Selected Files</Text>
              <Badge>{selectedFiles.length} file(s)</Badge>
            </Group>
            <List size="sm" spacing="xs">
              {selectedFiles.map((file, index) => (
                <List.Item key={index} icon={<IconFile size={14} />}>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </List.Item>
              ))}
            </List>
          </Paper>
        )}

        {/* Error */}
        {error && (
          <Alert color="red" icon={<IconX size={16} />}>
            {error}
          </Alert>
        )}

        {/* Preview */}
        {parsedData && (
          <>
            <Divider label="Activity Preview" labelPosition="center" />
            <Paper withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    <ThemeIcon size="sm" variant="light" color="blue">
                      <IconBike size={14} />
                    </ThemeIcon>
                    <Text fw={500}>{parsedData.metadata.name}</Text>
                  </Group>
                  <Badge color="blue" variant="light">
                    {parsedData.metadata.sport}
                  </Badge>
                </Group>

                <Text size="xs" c="dimmed">
                  {parsedData.metadata.startTime
                    ? new Date(parsedData.metadata.startTime).toLocaleString()
                    : 'Unknown date'}
                  {parsedData.metadata.manufacturer && ` | ${parsedData.metadata.manufacturer}`}
                </Text>

                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="xs">
                  <Paper p="xs" bg="dark.6">
                    <Group gap="xs">
                      <IconRoute size={14} color="var(--mantine-color-blue-5)" />
                      <div>
                        <Text size="xs" c="dimmed">Distance</Text>
                        <Text size="sm" fw={500}>
                          {formatDistance(parsedData.summary.totalDistance)}
                        </Text>
                      </div>
                    </Group>
                  </Paper>

                  <Paper p="xs" bg="dark.6">
                    <Group gap="xs">
                      <IconClock size={14} color="var(--mantine-color-green-5)" />
                      <div>
                        <Text size="xs" c="dimmed">Duration</Text>
                        <Text size="sm" fw={500}>
                          {formatDuration(parsedData.summary.totalMovingTime)}
                        </Text>
                      </div>
                    </Group>
                  </Paper>

                  <Paper p="xs" bg="dark.6">
                    <Group gap="xs">
                      <IconMountain size={14} color="var(--mantine-color-orange-5)" />
                      <div>
                        <Text size="xs" c="dimmed">Elevation</Text>
                        <Text size="sm" fw={500}>
                          {formatElevation(parsedData.summary.totalAscent || 0)}
                        </Text>
                      </div>
                    </Group>
                  </Paper>
                </SimpleGrid>

                {(parsedData.summary.avgHeartRate || parsedData.summary.avgPower) && (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                    {parsedData.summary.avgHeartRate && (
                      <Paper p="xs" bg="dark.6">
                        <Group gap="xs">
                          <IconHeart size={14} color="var(--mantine-color-red-5)" />
                          <div>
                            <Text size="xs" c="dimmed">Avg HR</Text>
                            <Text size="sm" fw={500}>
                              {parsedData.summary.avgHeartRate} bpm
                            </Text>
                          </div>
                        </Group>
                      </Paper>
                    )}

                    {parsedData.summary.avgPower && (
                      <Paper p="xs" bg="dark.6">
                        <Group gap="xs">
                          <IconBolt size={14} color="var(--mantine-color-yellow-5)" />
                          <div>
                            <Text size="xs" c="dimmed">Avg Power</Text>
                            <Text size="sm" fw={500}>
                              {parsedData.summary.avgPower}W
                            </Text>
                          </div>
                        </Group>
                      </Paper>
                    )}
                  </SimpleGrid>
                )}

                <Text size="xs" c="dimmed">
                  {parsedData.rawData.records} GPS points | {parsedData.laps?.length || 0} laps
                </Text>
              </Stack>
            </Paper>
          </>
        )}

        {/* Progress */}
        {uploading && (
          <Paper withBorder p="sm">
            <Text size="sm" mb="xs">Uploading activities...</Text>
            <Progress value={progress} animated />
          </Paper>
        )}

        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            color="orange"
            leftSection={<IconUpload size={16} />}
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || uploading}
            loading={uploading}
          >
            Upload {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'Activity'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default FitUploadModal;
