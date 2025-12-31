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
  Stepper,
  Accordion,
  Code,
  Timeline,
  Tabs,
  ScrollArea,
  Box,
  Tooltip,
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
  IconFileZip,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconChevronRight,
  IconBrandStrava,
  IconFolderOpen,
  IconFiles,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { parseGpxFile, gpxToActivityFormat } from '../utils/gpxParser';
import JSZip from 'jszip';

function BulkGpxUploadModal({ opened, onClose, onUploadComplete }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('guide');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [parsedActivities, setParsedActivities] = useState([]);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  /**
   * Extract GPX files from a Strava export zip
   */
  const extractGpxFromZip = async (zipFile) => {
    const zip = await JSZip.loadAsync(zipFile);
    const gpxFiles = [];

    // Strava exports have GPX files in activities/ folder
    // Look for all .gpx and .gpx.gz files
    const promises = [];

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;

      const lowerPath = relativePath.toLowerCase();
      if (lowerPath.endsWith('.gpx') || lowerPath.endsWith('.gpx.gz')) {
        promises.push(
          zipEntry.async('string').then(content => ({
            name: relativePath.split('/').pop(),
            path: relativePath,
            content,
            size: content.length
          }))
        );
      }
    });

    return Promise.all(promises);
  };

  /**
   * Handle file selection (zip or individual GPX files)
   */
  const handleFileSelect = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setError(null);
    setParsedActivities([]);
    setResults(null);

    const allGpxFiles = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Handle zip file
        try {
          setCurrentFile(`Extracting ${file.name}...`);
          const extractedFiles = await extractGpxFromZip(file);
          allGpxFiles.push(...extractedFiles.map(f => ({
            ...f,
            source: 'zip',
            zipName: file.name
          })));
        } catch (err) {
          console.error('Error extracting zip:', err);
          setError(`Failed to extract ${file.name}: ${err.message}`);
        }
      } else if (file.name.toLowerCase().endsWith('.gpx')) {
        // Handle individual GPX file
        try {
          const content = await file.text();
          allGpxFiles.push({
            name: file.name,
            path: file.name,
            content,
            size: file.size,
            source: 'file'
          });
        } catch (err) {
          console.error('Error reading file:', err);
        }
      }
    }

    setSelectedFiles(allGpxFiles);
    setCurrentFile('');

    // Parse first few files for preview
    if (allGpxFiles.length > 0 && allGpxFiles.length <= 5) {
      const previews = [];
      for (const gpxFile of allGpxFiles.slice(0, 5)) {
        try {
          const parsed = await parseGpxFile(gpxFile.content, gpxFile.name);
          previews.push({
            fileName: gpxFile.name,
            ...parsed
          });
        } catch (err) {
          console.error(`Error parsing ${gpxFile.name}:`, err);
        }
      }
      setParsedActivities(previews);
    }

    // Auto-switch to upload tab when files are selected
    if (allGpxFiles.length > 0) {
      setActiveTab('upload');
    }
  }, []);

  /**
   * Handle the bulk upload
   */
  const handleUpload = async () => {
    if (!user || selectedFiles.length === 0) return;

    setUploading(true);
    setProgress(0);
    setError(null);
    setResults(null);

    const uploadResults = {
      success: [],
      skipped: [],
      failed: []
    };

    for (let i = 0; i < selectedFiles.length; i++) {
      const gpxFile = selectedFiles[i];
      setCurrentFile(gpxFile.name);
      setProgress(Math.round((i / selectedFiles.length) * 100));

      try {
        // Parse the GPX file
        const gpxData = await parseGpxFile(gpxFile.content, gpxFile.name);

        // Skip if no GPS data
        if (gpxData.trackPoints.length === 0) {
          uploadResults.skipped.push({
            file: gpxFile.name,
            reason: 'No GPS data found'
          });
          continue;
        }

        // Skip very short activities (less than 100m)
        if (gpxData.summary.totalDistance < 0.1) {
          uploadResults.skipped.push({
            file: gpxFile.name,
            reason: 'Activity too short (< 100m)'
          });
          continue;
        }

        // Convert to database format
        const activityData = gpxToActivityFormat(gpxData, user.id);

        // Check for duplicate (same date and similar distance)
        if (activityData.start_date) {
          const { data: existing } = await supabase
            .from('activities')
            .select('id, name')
            .eq('user_id', user.id)
            .gte('start_date_local', new Date(new Date(activityData.start_date_local).getTime() - 60000).toISOString())
            .lte('start_date_local', new Date(new Date(activityData.start_date_local).getTime() + 60000).toISOString())
            .gte('distance', activityData.distance * 0.95)
            .lte('distance', activityData.distance * 1.05)
            .maybeSingle();

          if (existing) {
            uploadResults.skipped.push({
              file: gpxFile.name,
              reason: `Duplicate of "${existing.name}"`
            });
            continue;
          }
        }

        // Insert into database
        const { data, error: insertError } = await supabase
          .from('activities')
          .insert(activityData)
          .select()
          .single();

        if (insertError) throw insertError;

        uploadResults.success.push({
          file: gpxFile.name,
          activity: data
        });

      } catch (err) {
        console.error(`Error uploading ${gpxFile.name}:`, err);
        uploadResults.failed.push({
          file: gpxFile.name,
          error: err.message
        });
      }
    }

    setProgress(100);
    setCurrentFile('');
    setUploading(false);
    setResults(uploadResults);

    // Show notification
    if (uploadResults.success.length > 0) {
      notifications.show({
        title: 'Import Complete',
        message: `Successfully imported ${uploadResults.success.length} activit${uploadResults.success.length === 1 ? 'y' : 'ies'}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    }

    if (uploadResults.failed.length > 0) {
      notifications.show({
        title: 'Some imports failed',
        message: `${uploadResults.failed.length} file(s) could not be imported`,
        color: 'yellow',
        icon: <IconAlertCircle size={16} />,
      });
    }

    // Notify parent
    onUploadComplete?.(uploadResults);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.toLowerCase().endsWith('.gpx') ||
           f.name.toLowerCase().endsWith('.zip')
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

  const formatDistance = (km) => {
    if (!km) return '--';
    return `${km.toFixed(1)} km`;
  };

  const formatElevation = (m) => {
    if (!m && m !== 0) return '--';
    return `${Math.round(m)} m`;
  };

  const resetModal = () => {
    setSelectedFiles([]);
    setParsedActivities([]);
    setError(null);
    setResults(null);
    setProgress(0);
    setCurrentFile('');
    setActiveTab('guide');
  };

  const handleClose = () => {
    if (!uploading) {
      resetModal();
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="orange" variant="light" size="lg">
            <IconBrandStrava size={20} />
          </ThemeIcon>
          <div>
            <Text fw={600}>Import from Strava Export</Text>
            <Text size="xs" c="dimmed">Bulk import your ride history</Text>
          </div>
        </Group>
      }
      size="xl"
      closeOnClickOutside={!uploading}
      closeOnEscape={!uploading}
    >
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List mb="md">
          <Tabs.Tab value="guide" leftSection={<IconInfoCircle size={16} />}>
            How to Export
          </Tabs.Tab>
          <Tabs.Tab
            value="upload"
            leftSection={<IconUpload size={16} />}
            rightSection={selectedFiles.length > 0 ? (
              <Badge size="xs" circle>{selectedFiles.length}</Badge>
            ) : null}
          >
            Upload Files
          </Tabs.Tab>
        </Tabs.List>

        {/* GUIDE TAB */}
        <Tabs.Panel value="guide">
          <Stack gap="md">
            <Alert
              icon={<IconInfoCircle size={18} />}
              color="blue"
              variant="light"
            >
              Follow these steps to download your complete activity history from Strava,
              then upload it here to import all your rides at once.
            </Alert>

            <Paper withBorder p="md">
              <Timeline active={-1} bulletSize={28} lineWidth={2}>
                <Timeline.Item
                  bullet={<Text size="xs" fw={700}>1</Text>}
                  title={<Text fw={600}>Go to Strava Settings</Text>}
                >
                  <Text size="sm" c="dimmed" mt={4}>
                    Log into Strava and navigate to:
                  </Text>
                  <Button
                    component="a"
                    href="https://www.strava.com/athlete/delete_your_account"
                    target="_blank"
                    variant="light"
                    color="orange"
                    size="xs"
                    mt="xs"
                    rightSection={<IconExternalLink size={14} />}
                  >
                    Strava Data Export Page
                  </Button>
                  <Text size="xs" c="dimmed" mt="xs">
                    Or go to: Settings &rarr; My Account &rarr; Download or Delete Your Account
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<Text size="xs" fw={700}>2</Text>}
                  title={<Text fw={600}>Request Your Archive</Text>}
                >
                  <Text size="sm" c="dimmed" mt={4}>
                    Click <Code>Request Your Archive</Code> under "Download Request".
                    Strava will prepare your data (this may take a few hours for large accounts).
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<Text size="xs" fw={700}>3</Text>}
                  title={<Text fw={600}>Download the ZIP File</Text>}
                >
                  <Text size="sm" c="dimmed" mt={4}>
                    You'll receive an email when ready. Download the ZIP file.
                    It contains an <Code>activities</Code> folder with your GPX files.
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<Text size="xs" fw={700}>4</Text>}
                  title={<Text fw={600}>Upload Here</Text>}
                >
                  <Text size="sm" c="dimmed" mt={4}>
                    Go to the "Upload Files" tab and either:
                  </Text>
                  <List size="sm" mt="xs" spacing="xs">
                    <List.Item icon={<IconFileZip size={14} />}>
                      Upload the entire ZIP file directly
                    </List.Item>
                    <List.Item icon={<IconFiles size={14} />}>
                      Or select individual GPX files from the activities folder
                    </List.Item>
                  </List>
                </Timeline.Item>
              </Timeline>
            </Paper>

            <Accordion variant="contained">
              <Accordion.Item value="what-gets-imported">
                <Accordion.Control icon={<IconBike size={18} />}>
                  What gets imported?
                </Accordion.Control>
                <Accordion.Panel>
                  <List size="sm" spacing="xs">
                    <List.Item>Activity name and type (Ride, Run, etc.)</List.Item>
                    <List.Item>Date and time</List.Item>
                    <List.Item>GPS route with map visualization</List.Item>
                    <List.Item>Distance, duration, and elevation</List.Item>
                    <List.Item>Heart rate data (if recorded)</List.Item>
                    <List.Item>Power and cadence (if recorded)</List.Item>
                  </List>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="duplicates">
                <Accordion.Control icon={<IconAlertTriangle size={18} />}>
                  What about duplicates?
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm">
                    We automatically detect duplicate activities by comparing the date and distance.
                    If you've already synced activities via Strava API or uploaded them before,
                    they'll be skipped to prevent duplicates.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="file-types">
                <Accordion.Control icon={<IconFile size={18} />}>
                  Supported file types
                </Accordion.Control>
                <Accordion.Panel>
                  <List size="sm" spacing="xs">
                    <List.Item><Code>.zip</Code> - Strava export archive (recommended)</List.Item>
                    <List.Item><Code>.gpx</Code> - Individual GPX files</List.Item>
                  </List>
                  <Text size="sm" c="dimmed" mt="xs">
                    Note: FIT files from Garmin/Wahoo devices can be uploaded using the separate FIT Upload feature.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <Group justify="flex-end">
              <Button
                variant="light"
                rightSection={<IconChevronRight size={16} />}
                onClick={() => setActiveTab('upload')}
              >
                Continue to Upload
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* UPLOAD TAB */}
        <Tabs.Panel value="upload">
          <Stack gap="md">
            {/* Drop Zone */}
            <Paper
              withBorder
              p="xl"
              style={{
                borderStyle: 'dashed',
                backgroundColor: 'var(--mantine-color-dark-7)',
                cursor: uploading ? 'not-allowed' : 'pointer',
                textAlign: 'center',
                opacity: uploading ? 0.6 : 1
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => !uploading && document.getElementById('gpx-file-input').click()}
            >
              <input
                id="gpx-file-input"
                type="file"
                accept=".gpx,.zip"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} variant="light" color="orange">
                  <IconFileZip size={24} />
                </ThemeIcon>
                <Text fw={500}>
                  {currentFile || 'Drop your Strava export ZIP or GPX files here'}
                </Text>
                <Text size="xs" c="dimmed">
                  Supports .zip (Strava export) and .gpx files
                </Text>
              </Stack>
            </Paper>

            {/* Error */}
            {error && (
              <Alert color="red" icon={<IconX size={16} />}>
                {error}
              </Alert>
            )}

            {/* Selected Files Summary */}
            {selectedFiles.length > 0 && !results && (
              <Paper withBorder p="sm">
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <IconFolderOpen size={16} />
                    <Text size="sm" fw={500}>Files Ready for Import</Text>
                  </Group>
                  <Badge color="orange">{selectedFiles.length} GPX files</Badge>
                </Group>

                {selectedFiles.length <= 10 ? (
                  <ScrollArea h={selectedFiles.length > 5 ? 150 : 'auto'}>
                    <List size="sm" spacing={4}>
                      {selectedFiles.map((file, index) => (
                        <List.Item key={index} icon={<IconFile size={12} />}>
                          <Text size="xs" lineClamp={1}>{file.name}</Text>
                        </List.Item>
                      ))}
                    </List>
                  </ScrollArea>
                ) : (
                  <Text size="sm" c="dimmed">
                    {selectedFiles.length} files selected from {
                      [...new Set(selectedFiles.filter(f => f.zipName).map(f => f.zipName))].join(', ') || 'files'
                    }
                  </Text>
                )}
              </Paper>
            )}

            {/* Activity Preview (for small number of files) */}
            {parsedActivities.length > 0 && !results && (
              <>
                <Divider label="Preview" labelPosition="center" />
                <ScrollArea h={parsedActivities.length > 2 ? 200 : 'auto'}>
                  <Stack gap="xs">
                    {parsedActivities.map((activity, index) => (
                      <Paper key={index} withBorder p="sm">
                        <Group justify="space-between" mb="xs">
                          <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="blue">
                              <IconBike size={14} />
                            </ThemeIcon>
                            <Text size="sm" fw={500} lineClamp={1}>
                              {activity.metadata.name}
                            </Text>
                          </Group>
                          <Badge size="xs" color="blue" variant="light">
                            {activity.metadata.sport}
                          </Badge>
                        </Group>
                        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                          <Group gap={4}>
                            <IconRoute size={12} color="var(--mantine-color-blue-5)" />
                            <Text size="xs">{formatDistance(activity.summary.totalDistance)}</Text>
                          </Group>
                          <Group gap={4}>
                            <IconClock size={12} color="var(--mantine-color-green-5)" />
                            <Text size="xs">{formatDuration(activity.summary.totalMovingTime)}</Text>
                          </Group>
                          <Group gap={4}>
                            <IconMountain size={12} color="var(--mantine-color-orange-5)" />
                            <Text size="xs">{formatElevation(activity.summary.totalAscent)}</Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {activity.rawData.trackPointCount} pts
                          </Text>
                        </SimpleGrid>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              </>
            )}

            {/* Progress */}
            {uploading && (
              <Paper withBorder p="sm">
                <Text size="sm" mb="xs">
                  Importing activities... {currentFile && `(${currentFile})`}
                </Text>
                <Progress value={progress} animated color="orange" />
                <Text size="xs" c="dimmed" mt="xs" ta="center">
                  {Math.round(progress)}% complete
                </Text>
              </Paper>
            )}

            {/* Results */}
            {results && (
              <Paper withBorder p="md">
                <Stack gap="sm">
                  <Text fw={600}>Import Results</Text>

                  <SimpleGrid cols={3} spacing="xs">
                    <Paper p="xs" bg="green.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="green.3">{results.success.length}</Text>
                      <Text size="xs" c="green.5">Imported</Text>
                    </Paper>
                    <Paper p="xs" bg="yellow.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="yellow.3">{results.skipped.length}</Text>
                      <Text size="xs" c="yellow.5">Skipped</Text>
                    </Paper>
                    <Paper p="xs" bg="red.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="red.3">{results.failed.length}</Text>
                      <Text size="xs" c="red.5">Failed</Text>
                    </Paper>
                  </SimpleGrid>

                  {results.skipped.length > 0 && (
                    <Accordion variant="contained" defaultValue="">
                      <Accordion.Item value="skipped">
                        <Accordion.Control icon={<IconAlertCircle size={16} />}>
                          Skipped Files ({results.skipped.length})
                        </Accordion.Control>
                        <Accordion.Panel>
                          <ScrollArea h={results.skipped.length > 5 ? 150 : 'auto'}>
                            <List size="xs" spacing={4}>
                              {results.skipped.map((item, index) => (
                                <List.Item key={index}>
                                  <Text size="xs">
                                    <Text span fw={500}>{item.file}</Text>
                                    <Text span c="dimmed"> - {item.reason}</Text>
                                  </Text>
                                </List.Item>
                              ))}
                            </List>
                          </ScrollArea>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  )}

                  {results.failed.length > 0 && (
                    <Accordion variant="contained" defaultValue="">
                      <Accordion.Item value="failed">
                        <Accordion.Control icon={<IconX size={16} />}>
                          Failed Files ({results.failed.length})
                        </Accordion.Control>
                        <Accordion.Panel>
                          <ScrollArea h={results.failed.length > 5 ? 150 : 'auto'}>
                            <List size="xs" spacing={4}>
                              {results.failed.map((item, index) => (
                                <List.Item key={index}>
                                  <Text size="xs">
                                    <Text span fw={500}>{item.file}</Text>
                                    <Text span c="red"> - {item.error}</Text>
                                  </Text>
                                </List.Item>
                              ))}
                            </List>
                          </ScrollArea>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  )}
                </Stack>
              </Paper>
            )}

            {/* Actions */}
            <Group justify="flex-end" gap="sm">
              {results ? (
                <>
                  <Button variant="subtle" onClick={resetModal}>
                    Import More
                  </Button>
                  <Button color="orange" onClick={handleClose}>
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="subtle" onClick={handleClose} disabled={uploading}>
                    Cancel
                  </Button>
                  <Button
                    color="orange"
                    leftSection={<IconUpload size={16} />}
                    onClick={handleUpload}
                    disabled={selectedFiles.length === 0 || uploading}
                    loading={uploading}
                  >
                    Import {selectedFiles.length > 0 ? `${selectedFiles.length} Files` : 'Activities'}
                  </Button>
                </>
              )}
            </Group>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

export default BulkGpxUploadModal;
