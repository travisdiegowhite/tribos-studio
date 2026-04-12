import React, { useState, useCallback, useEffect } from 'react';
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
  Accordion,
  Code,
  Timeline,
  Tabs,
  ScrollArea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { parseGpxFile, gpxToActivityFormat } from '../utils/gpxParser';
import { parseFitFile } from '../utils/fitParser';
import { arrayBufferToBase64 } from '../utils/base64';
import { formatDistance as formatDistanceUnit, formatElevation as formatElevationUnit } from '../utils/units';
import { trackUpload, EventType } from '../utils/activityTracking';
import JSZip from 'jszip';
import pako from 'pako';
import { ArrowSquareOut, Bicycle, CaretRight, Check, Clock, File, FileZip, Files, FolderOpen, Heartbeat, Info, Mountains, Path, UploadSimple, Warning, WarningCircle, X } from '@phosphor-icons/react';

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
  const [unitsPreference, setUnitsPreference] = useState('imperial');

  // Load user's units preference
  useEffect(() => {
    const loadUnitsPreference = async () => {
      if (!user) return;
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('units_preference')
          .eq('id', user.id)
          .single();
        if (data?.units_preference) {
          setUnitsPreference(data.units_preference);
        }
      } catch (err) {
        console.error('Failed to load units preference:', err);
      }
    };
    loadUnitsPreference();
  }, [user]);

  // Unit formatting helpers
  const isImperial = unitsPreference === 'imperial';

  /**
   * Determine file type from filename
   */
  const getFileType = (filename) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.fit.gz')) return 'fit.gz';
    if (lower.endsWith('.fit')) return 'fit';
    if (lower.endsWith('.gpx.gz')) return 'gpx.gz';
    if (lower.endsWith('.gpx')) return 'gpx';
    if (lower.endsWith('.tcx.gz')) return 'tcx.gz';
    if (lower.endsWith('.tcx')) return 'tcx';
    return null;
  };

  /**
   * Parse activities.csv from Strava export to get activity names
   * @param {string} csvContent - The CSV file content
   * @returns {Object} Map of activity ID to activity name
   */
  const parseActivitiesCsv = (csvContent) => {
    const activityNames = {};
    const lines = csvContent.split('\n');

    if (lines.length < 2) return activityNames;

    // Parse header to find column indices
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const idIndex = header.findIndex(h => h === 'activity id' || h === 'id');
    const nameIndex = header.findIndex(h => h === 'activity name' || h === 'name');
    const filenameIndex = header.findIndex(h => h === 'filename');

    // Need at least ID/filename and name columns
    if (nameIndex === -1 || (idIndex === -1 && filenameIndex === -1)) {
      console.warn('activities.csv missing required columns');
      return activityNames;
    }

    // Parse each row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Handle CSV with quoted fields that may contain commas
      const values = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));

      // Extract activity ID and name
      const name = values[nameIndex];
      let activityId = null;

      // Try to get ID from filename column first (format: "activities/12345678901.fit.gz")
      if (filenameIndex !== -1 && values[filenameIndex]) {
        const filename = values[filenameIndex];
        const match = filename.match(/(\d+)\.(fit|gpx|tcx)/i);
        if (match) {
          activityId = match[1];
        }
      }

      // Fall back to activity ID column
      if (!activityId && idIndex !== -1) {
        activityId = values[idIndex];
      }

      if (activityId && name) {
        activityNames[activityId] = name;
      }
    }

    return activityNames;
  };

  /**
   * Extract activity files from a Strava export zip
   * Uses batched extraction to handle large exports without running out of memory
   * @param {File} zipFile - The zip file to extract
   * @param {Function} onProgress - Optional callback for progress updates (current, total, fileName)
   */
  const extractFilesFromZip = async (zipFile, onProgress) => {
    const zip = await JSZip.loadAsync(zipFile);
    let activityNames = {};

    // First, look for activities.csv to get activity names
    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;

      const fileName = relativePath.split('/').pop().toLowerCase();
      if (fileName === 'activities.csv') {
        try {
          const csvContent = await zipEntry.async('string');
          activityNames = parseActivitiesCsv(csvContent);
          console.log(`Found ${Object.keys(activityNames).length} activity names in activities.csv`);
        } catch (err) {
          console.warn('Failed to parse activities.csv:', err);
        }
        break;
      }
    }

    // Collect only activity file entries (filter BEFORE reading content)
    // This skips photos and other media files entirely
    const activityEntries = [];
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;

      const fileType = getFileType(relativePath);
      if (!fileType) return; // Skip non-activity files (photos, etc.)
      if (fileType.startsWith('tcx')) return; // Skip TCX files

      const baseName = relativePath.split('/').pop();
      const activityIdMatch = baseName.match(/^(\d+)\.(fit|gpx)/i);
      const activityId = activityIdMatch ? activityIdMatch[1] : null;
      const stravaActivityName = activityId ? activityNames[activityId] : null;
      const isBinary = fileType.startsWith('fit');

      activityEntries.push({
        relativePath,
        zipEntry,
        fileType,
        isBinary,
        stravaActivityName
      });
    });

    console.log(`Found ${activityEntries.length} activity files to extract (skipped non-activity files)`);

    // Extract files in batches to prevent memory issues and reference staleness
    const BATCH_SIZE = 20;
    const extractedFiles = [];

    for (let i = 0; i < activityEntries.length; i += BATCH_SIZE) {
      const batch = activityEntries.slice(i, i + BATCH_SIZE);

      // Report progress
      if (onProgress) {
        const firstFile = batch[0].relativePath.split('/').pop();
        onProgress(i, activityEntries.length, firstFile);
      }

      // Extract this batch in parallel
      const batchPromises = batch.map(async (entry) => {
        const { relativePath, zipEntry, fileType, isBinary, stravaActivityName } = entry;
        try {
          const content = await zipEntry.async(isBinary ? 'arraybuffer' : 'string');
          return {
            name: relativePath.split('/').pop(),
            path: relativePath,
            content,
            size: isBinary ? content.byteLength : content.length,
            fileType,
            isBinary,
            stravaActivityName
          };
        } catch (err) {
          console.warn(`Failed to extract ${relativePath}:`, err);
          return null; // Skip failed files instead of failing entire import
        }
      });

      const batchResults = await Promise.all(batchPromises);
      extractedFiles.push(...batchResults.filter(f => f !== null));
    }

    // Final progress update
    if (onProgress) {
      onProgress(activityEntries.length, activityEntries.length, 'Done');
    }

    return extractedFiles;
  };

  /**
   * Parse a single activity file (GPX or FIT)
   */
  const parseActivityFile = async (file) => {
    const { content, fileType, name, isBinary } = file;

    if (fileType === 'gpx') {
      return await parseGpxFile(content, name);
    } else if (fileType === 'gpx.gz') {
      // Decompress gzipped GPX
      const decompressed = pako.inflate(new Uint8Array(content), { to: 'string' });
      return await parseGpxFile(decompressed, name);
    } else if (fileType === 'fit') {
      return await parseFitFile(content, false);
    } else if (fileType === 'fit.gz') {
      // parseFitFile handles decompression internally
      return await parseFitFile(content, true);
    }

    throw new Error(`Unsupported file type: ${fileType}`);
  };

  /**
   * Convert parsed GPX data to activity format.
   * FIT files don't go through this helper any more — they're base64-encoded
   * and POSTed to /api/fit-upload so the full analytics pipeline runs
   * server-side (fit_coach_context, activity_streams, power_curve_summary,
   * etc. that enable deep ride analysis).
   */
  const gpxActivityFormat = (parsedData, userId, stravaActivityName = null) => {
    const activity = gpxToActivityFormat(parsedData, userId);
    if (stravaActivityName) activity.name = stravaActivityName;
    return activity;
  };

  /**
   * Handle file selection (zip or individual files)
   */
  const handleFileSelect = useCallback(async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setError(null);
    setParsedActivities([]);
    setResults(null);

    const allFiles = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Handle zip file
        try {
          setCurrentFile(`Loading ${file.name}...`);
          const extractedFiles = await extractFilesFromZip(file, (current, total, fileName) => {
            setCurrentFile(`Extracting ${file.name}: ${current}/${total} files (${fileName})`);
          });
          allFiles.push(...extractedFiles.map(f => ({
            ...f,
            source: 'zip',
            zipName: file.name
          })));
        } catch (err) {
          console.error('Error extracting zip:', err);
          setError(`Failed to extract ${file.name}: ${err.message}`);
        }
      } else {
        // Handle individual file
        const fileType = getFileType(file.name);
        if (!fileType) continue;
        if (fileType.startsWith('tcx')) continue; // Skip TCX

        try {
          const isBinary = fileType.startsWith('fit');
          const content = isBinary ? await file.arrayBuffer() : await file.text();
          allFiles.push({
            name: file.name,
            path: file.name,
            content,
            size: file.size,
            fileType,
            isBinary,
            source: 'file'
          });
        } catch (err) {
          console.error('Error reading file:', err);
        }
      }
    }

    setSelectedFiles(allFiles);
    setCurrentFile('');

    // Parse first few files for preview
    if (allFiles.length > 0 && allFiles.length <= 5) {
      const previews = [];
      for (const actFile of allFiles.slice(0, 5)) {
        try {
          const parsed = await parseActivityFile(actFile);
          previews.push({
            fileName: actFile.name,
            fileType: actFile.fileType,
            ...parsed
          });
        } catch (err) {
          console.error(`Error parsing ${actFile.name}:`, err);
        }
      }
      setParsedActivities(previews);
    }

    // Auto-switch to upload tab when files are selected
    if (allFiles.length > 0) {
      setActiveTab('upload');
    }
  }, []);

  /**
   * Upload a single FIT file through /api/fit-upload so the server can run
   * the full analytics pipeline (fit_coach_context, activity_streams,
   * power_curve_summary, NP, TSS, IF, etc.). Returns { action, activity }
   * on success, or throws on failure.
   */
  const uploadFitToServer = async (actFile, accessToken) => {
    // actFile.content is an ArrayBuffer for FIT/FIT.GZ extracted from the zip.
    const buffer = actFile.content instanceof ArrayBuffer
      ? actFile.content
      : await actFile.content.arrayBuffer?.();
    if (!buffer) throw new Error('FIT content is not a binary buffer');

    const fileBase64 = arrayBufferToBase64(buffer);
    const compressed = actFile.fileType === 'fit.gz';

    const resp = await fetch('/api/fit-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        fileName: actFile.name,
        fileBase64,
        compressed,
        stravaActivityName: actFile.stravaActivityName || null,
      }),
    });

    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok || !payload.success) {
      throw new Error(payload.message || payload.error || `Upload failed (${resp.status})`);
    }
    return payload; // { action, activity }
  };

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
      updated: [],
      skipped: [],
      failed: []
    };

    // Needed by the server endpoint for auth; refreshed once per batch.
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (sessionError || !accessToken) {
      setUploading(false);
      setError('Session expired — please sign in again and retry.');
      return;
    }

    for (let i = 0; i < selectedFiles.length; i++) {
      const actFile = selectedFiles[i];
      setCurrentFile(actFile.name);
      setProgress(Math.round((i / selectedFiles.length) * 100));

      try {
        // FIT files go through the server pipeline; GPX stays on the client
        // path since GPX has no power/HR streams that server-only analytics
        // could enrich.
        if (actFile.fileType === 'fit' || actFile.fileType === 'fit.gz') {
          const payload = await uploadFitToServer(actFile, accessToken);
          const bucket = payload.action === 'updated' ? uploadResults.updated : uploadResults.success;
          bucket.push({ file: actFile.name, activity: payload.activity });
          continue;
        }

        // GPX path (unchanged from the legacy bulk importer).
        const parsedData = await parseActivityFile(actFile);

        if (!parsedData.trackPoints || parsedData.trackPoints.length === 0) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'No GPS data found'
          });
          continue;
        }

        const distanceKm = parsedData.summary?.totalDistance || 0;
        if (distanceKm < 0.1) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'Activity too short (< 100m)'
          });
          continue;
        }

        const activityData = gpxActivityFormat(parsedData, user.id, actFile.stravaActivityName);

        if (!activityData.start_date) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'No valid date found in file'
          });
          continue;
        }

        try {
          const startDate = new Date(activityData.start_date);
          if (!isNaN(startDate.getTime())) {
            const { data: existing } = await supabase
              .from('activities')
              .select('id, name')
              .eq('user_id', user.id)
              .gte('start_date', new Date(startDate.getTime() - 120000).toISOString())
              .lte('start_date', new Date(startDate.getTime() + 120000).toISOString())
              .gte('distance', activityData.distance * 0.90)
              .lte('distance', activityData.distance * 1.10)
              .maybeSingle();

            if (existing) {
              uploadResults.skipped.push({
                file: actFile.name,
                reason: `Duplicate of "${existing.name}"`
              });
              continue;
            }
          }
        } catch (dupErr) {
          console.warn('Duplicate check failed, continuing:', dupErr);
        }

        const { data, error: insertError } = await supabase
          .from('activities')
          .insert(activityData)
          .select()
          .single();

        if (insertError) {
          console.error('Database insert error:', insertError);
          throw new Error(insertError.message || 'Database insert failed');
        }

        uploadResults.success.push({
          file: actFile.name,
          activity: data
        });

      } catch (err) {
        console.error(`Error uploading ${actFile.name}:`, err);
        uploadResults.failed.push({
          file: actFile.name,
          error: err.message || 'Unknown error'
        });
      }
    }

    setProgress(100);
    setCurrentFile('');
    setUploading(false);
    setResults(uploadResults);

    trackUpload(EventType.BULK_IMPORT, {
      totalFiles: selectedFiles.length,
      successCount: uploadResults.success.length + uploadResults.updated.length,
      updatedCount: uploadResults.updated.length,
      skippedCount: uploadResults.skipped.length,
      failedCount: uploadResults.failed.length
    });

    // Show notification
    const totalOk = uploadResults.success.length + uploadResults.updated.length;
    if (totalOk > 0) {
      const parts = [];
      if (uploadResults.success.length > 0) parts.push(`imported ${uploadResults.success.length} new`);
      if (uploadResults.updated.length > 0) parts.push(`enriched ${uploadResults.updated.length} existing`);
      notifications.show({
        title: 'Import Complete',
        message: `Successfully ${parts.join(', ')} activit${totalOk === 1 ? 'y' : 'ies'}.`,
        color: 'green',
        icon: <Check size={16} />,
      });
    }

    if (uploadResults.failed.length > 0) {
      notifications.show({
        title: 'Some imports failed',
        message: `${uploadResults.failed.length} file(s) could not be imported`,
        color: 'yellow',
        icon: <WarningCircle size={16} />,
      });
    }

    // Notify parent
    onUploadComplete?.(uploadResults);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const validExtensions = ['.gpx', '.fit', '.zip'];
    const files = Array.from(e.dataTransfer.files).filter(f =>
      validExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
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
    return formatDistanceUnit(km, isImperial);
  };

  const formatElevation = (m) => {
    if (!m && m !== 0) return '--';
    return formatElevationUnit(m, isImperial);
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

  // Count file types for display
  const fileCounts = selectedFiles.reduce((acc, f) => {
    const type = f.fileType?.startsWith('fit') ? 'FIT' : 'GPX';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="orange" variant="light" size="lg">
            <Heartbeat size={20} />
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
          <Tabs.Tab value="guide" leftSection={<Info size={16} />}>
            How to Export
          </Tabs.Tab>
          <Tabs.Tab
            value="upload"
            leftSection={<UploadSimple size={16} />}
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
              icon={<Info size={18} />}
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
                    rightSection={<ArrowSquareOut size={14} />}
                  >
                    Strava Data Export Page
                  </Button>
                  <Text size="xs" c="dimmed" mt="xs">
                    Or go to: Settings → My Account → Download or Delete Your Account
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
                    It contains an <Code>activities</Code> folder with your activity files.
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<Text size="xs" fw={700}>4</Text>}
                  title={<Text fw={600}>Upload Here</Text>}
                >
                  <Text size="sm" c="dimmed" mt={4}>
                    Go to the "Upload Files" tab and upload the ZIP file directly.
                    We'll extract and import all your activities automatically.
                  </Text>
                </Timeline.Item>
              </Timeline>
            </Paper>

            <Accordion variant="contained">
              <Accordion.Item value="what-gets-imported">
                <Accordion.Control icon={<Bicycle size={18} />}>
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
                <Accordion.Control icon={<Warning size={18} />}>
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
                <Accordion.Control icon={<File size={18} />}>
                  Supported file types
                </Accordion.Control>
                <Accordion.Panel>
                  <List size="sm" spacing="xs">
                    <List.Item><Code>.zip</Code> - Strava export archive (recommended)</List.Item>
                    <List.Item><Code>.fit / .fit.gz</Code> - Garmin FIT files</List.Item>
                    <List.Item><Code>.gpx</Code> - GPX files</List.Item>
                  </List>
                  <Text size="sm" c="dimmed" mt="xs">
                    Strava exports typically contain FIT files from Garmin-synced rides and GPX files from other sources.
                    We handle both formats automatically.
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <Group justify="flex-end">
              <Button
                variant="light"
                rightSection={<CaretRight size={16} />}
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
              onClick={() => !uploading && document.getElementById('activity-file-input').click()}
            >
              <input
                id="activity-file-input"
                type="file"
                accept=".gpx,.fit,.zip"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} variant="light" color="orange">
                  <FileZip size={24} />
                </ThemeIcon>
                <Text fw={500}>
                  {currentFile || 'Drop your Strava export ZIP here'}
                </Text>
                <Text size="xs" c="dimmed">
                  Supports .zip (Strava export), .fit, and .gpx files
                </Text>
              </Stack>
            </Paper>

            {/* Error */}
            {error && (
              <Alert color="red" icon={<X size={16} />}>
                {error}
              </Alert>
            )}

            {/* Selected Files Summary */}
            {selectedFiles.length > 0 && !results && (
              <Paper withBorder p="sm">
                <Group justify="space-between" mb="xs">
                  <Group gap="xs">
                    <FolderOpen size={16} />
                    <Text size="sm" fw={500}>Files Ready for Import</Text>
                  </Group>
                  <Group gap="xs">
                    {fileCounts.FIT && <Badge color="blue">{fileCounts.FIT} FIT</Badge>}
                    {fileCounts.GPX && <Badge color="green">{fileCounts.GPX} GPX</Badge>}
                  </Group>
                </Group>

                {selectedFiles.length <= 10 ? (
                  <ScrollArea h={selectedFiles.length > 5 ? 150 : 'auto'}>
                    <List size="sm" spacing={4}>
                      {selectedFiles.map((file, index) => (
                        <List.Item key={index} icon={<File size={12} />}>
                          <Text size="xs" lineClamp={1}>{file.name}</Text>
                        </List.Item>
                      ))}
                    </List>
                  </ScrollArea>
                ) : (
                  <Text size="sm" c="dimmed">
                    {selectedFiles.length} activity files ready to import
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
                              <Bicycle size={14} />
                            </ThemeIcon>
                            <Text size="sm" fw={500} lineClamp={1}>
                              {activity.metadata?.name || activity.fileName}
                            </Text>
                          </Group>
                          <Badge size="xs" color={activity.fileType?.startsWith('fit') ? 'blue' : 'green'} variant="light">
                            {activity.fileType?.toUpperCase() || 'Unknown'}
                          </Badge>
                        </Group>
                        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                          <Group gap={4}>
                            <Path size={12} color="var(--mantine-color-blue-5)" />
                            <Text size="xs">{formatDistance(activity.summary?.totalDistance)}</Text>
                          </Group>
                          <Group gap={4}>
                            <Clock size={12} color="var(--mantine-color-green-5)" />
                            <Text size="xs">{formatDuration(activity.summary?.totalMovingTime)}</Text>
                          </Group>
                          <Group gap={4}>
                            <Mountains size={12} color="var(--mantine-color-orange-5)" />
                            <Text size="xs">{formatElevation(activity.summary?.totalAscent)}</Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {activity.trackPoints?.length || activity.rawData?.records || 0} pts
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

                  <SimpleGrid cols={results.updated?.length ? 4 : 3} spacing="xs">
                    <Paper p="xs" bg="green.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="green.3">{results.success.length}</Text>
                      <Text size="xs" c="green.5">Imported</Text>
                    </Paper>
                    {results.updated?.length > 0 && (
                      <Paper p="xs" bg="blue.9" style={{ textAlign: 'center' }}>
                        <Text size="lg" fw={700} c="blue.3">{results.updated.length}</Text>
                        <Text size="xs" c="blue.5">Enriched</Text>
                      </Paper>
                    )}
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
                        <Accordion.Control icon={<WarningCircle size={16} />}>
                          Skipped Files ({results.skipped.length})
                        </Accordion.Control>
                        <Accordion.Panel>
                          <ScrollArea h={results.skipped.length > 5 ? 150 : 'auto'}>
                            <List size="xs" spacing={4}>
                              {results.skipped.slice(0, 50).map((item, index) => (
                                <List.Item key={index}>
                                  <Text size="xs">
                                    <Text span fw={500}>{item.file}</Text>
                                    <Text span c="dimmed"> - {item.reason}</Text>
                                  </Text>
                                </List.Item>
                              ))}
                              {results.skipped.length > 50 && (
                                <List.Item>
                                  <Text size="xs" c="dimmed">
                                    ...and {results.skipped.length - 50} more
                                  </Text>
                                </List.Item>
                              )}
                            </List>
                          </ScrollArea>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  )}

                  {results.failed.length > 0 && (
                    <Accordion variant="contained" defaultValue="failed">
                      <Accordion.Item value="failed">
                        <Accordion.Control icon={<X size={16} />}>
                          Failed Files ({results.failed.length})
                        </Accordion.Control>
                        <Accordion.Panel>
                          <ScrollArea h={results.failed.length > 5 ? 150 : 'auto'}>
                            <List size="xs" spacing={4}>
                              {results.failed.slice(0, 50).map((item, index) => (
                                <List.Item key={index}>
                                  <Text size="xs">
                                    <Text span fw={500}>{item.file}</Text>
                                    <Text span c="red"> - {item.error}</Text>
                                  </Text>
                                </List.Item>
                              ))}
                              {results.failed.length > 50 && (
                                <List.Item>
                                  <Text size="xs" c="dimmed">
                                    ...and {results.failed.length - 50} more
                                  </Text>
                                </List.Item>
                              )}
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
                    leftSection={<UploadSimple size={16} />}
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
