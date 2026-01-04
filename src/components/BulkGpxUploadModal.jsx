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
  Accordion,
  Code,
  Timeline,
  Tabs,
  ScrollArea,
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
  IconFileZip,
  IconExternalLink,
  IconInfoCircle,
  IconChevronRight,
  IconBrandStrava,
  IconFolderOpen,
  IconFiles,
  IconAlertTriangle,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.jsx';
import { parseGpxFile, gpxToActivityFormat } from '../utils/gpxParser';
import { parseFitFile, fitToActivityFormat } from '../utils/fitParser';
import JSZip from 'jszip';
import pako from 'pako';

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
  const [backfillCsv, setBackfillCsv] = useState(null);
  const [backfillResults, setBackfillResults] = useState(null);

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
   * Handle backfill - update existing activity names from activities.csv
   */
  const handleBackfillNames = async () => {
    if (!user || !backfillCsv) return;

    setUploading(true);
    setProgress(0);
    setError(null);
    setBackfillResults(null);

    try {
      // Parse the CSV content
      const activityNames = parseActivitiesCsv(backfillCsv.content);
      const entries = Object.entries(activityNames);

      if (entries.length === 0) {
        setError('No activity names found in the CSV file');
        setUploading(false);
        return;
      }

      setCurrentFile(`Found ${entries.length} activities to match...`);

      // Get all user's activities with date-based or generic names
      const { data: existingActivities, error: fetchError } = await supabase
        .from('activities')
        .select('id, name, start_date, distance')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });

      if (fetchError) {
        throw new Error(`Failed to fetch activities: ${fetchError.message}`);
      }

      const results = {
        updated: [],
        notFound: [],
        alreadyCorrect: []
      };

      // For each activity in the CSV, try to find a matching activity by date
      for (let i = 0; i < entries.length; i++) {
        const [activityId, newName] = entries[i];
        setProgress(Math.round((i / entries.length) * 100));
        setCurrentFile(`Matching: ${newName.substring(0, 40)}...`);

        // Find matching activity by date (within 2 minutes) and similar distance (±10%)
        // We need to look up the activity date from the CSV - but we only have the name
        // So we'll match by checking if the current name looks like it was auto-generated

        // Find activities that have date-based names or generic FIT names
        const matchingActivities = existingActivities.filter(act => {
          // Check if name looks auto-generated (date-based or generic)
          const isDateBased = /^(Cycling|Running|Swimming|Walking|Hiking) - (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d+, \d{4}$/.test(act.name);
          const isGenericFit = /^(FIT Activity|.+ Activity)$/.test(act.name);
          const isGenericGpx = /^\d+$/.test(act.name); // Just a number

          return isDateBased || isGenericFit || isGenericGpx;
        });

        // For now, just update activities that have the exact same auto-generated name pattern
        // A more sophisticated approach would use the activities.csv date column

        // Skip if no generic-named activities to update
        if (matchingActivities.length === 0) {
          continue;
        }

        // Try to find by activity ID embedded in provider_activity_id or by date matching
        // For FIT imports, we need to find by date since we don't have the Strava ID
        // Check if any activity was uploaded around the same time

        // For simplicity, we'll update based on the order of activities
        // This works if the user re-uploads the same export they originally imported
      }

      // Alternative approach: Update ALL activities with generic names using the CSV
      // by matching the date from the CSV to the activity date

      // Parse dates from activities.csv if available
      const lines = backfillCsv.content.split('\n');
      const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
      const dateIndex = header.findIndex(h => h === 'activity date' || h === 'date');
      const filenameIndex = header.findIndex(h => h === 'filename');
      const nameIndex = header.findIndex(h => h === 'activity name' || h === 'name');

      if (dateIndex !== -1 && nameIndex !== -1) {
        // We can match by date!
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Parse the CSV line properly (handling quoted fields)
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

          const activityName = values[nameIndex];
          const activityDate = values[dateIndex];

          if (!activityName || !activityDate) continue;

          // Parse the date (Strava format: "Jan 5, 2026, 10:30:00 AM" or ISO format)
          let parsedDate;
          try {
            parsedDate = new Date(activityDate);
            if (isNaN(parsedDate.getTime())) continue;
          } catch {
            continue;
          }

          // Find matching activity by date (within 5 minutes)
          const matchWindow = 5 * 60 * 1000; // 5 minutes in ms
          const matching = existingActivities.find(act => {
            const actDate = new Date(act.start_date);
            const diff = Math.abs(actDate.getTime() - parsedDate.getTime());
            return diff < matchWindow;
          });

          if (matching) {
            if (matching.name === activityName) {
              results.alreadyCorrect.push({ name: activityName });
            } else {
              // Update the activity name
              const { error: updateError } = await supabase
                .from('activities')
                .update({ name: activityName, updated_at: new Date().toISOString() })
                .eq('id', matching.id);

              if (!updateError) {
                results.updated.push({
                  oldName: matching.name,
                  newName: activityName
                });
                // Remove from existing so we don't match it again
                const idx = existingActivities.indexOf(matching);
                if (idx > -1) existingActivities.splice(idx, 1);
              }
            }
          } else {
            results.notFound.push({ name: activityName, date: activityDate });
          }
        }
      }

      setProgress(100);
      setCurrentFile('');
      setBackfillResults(results);

      if (results.updated.length > 0) {
        notifications.show({
          title: 'Names Updated',
          message: `Updated ${results.updated.length} activity name${results.updated.length === 1 ? '' : 's'}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        onUploadComplete?.({ backfillUpdated: results.updated.length });
      }

    } catch (err) {
      console.error('Backfill error:', err);
      setError(err.message || 'Failed to backfill names');
    } finally {
      setUploading(false);
    }
  };

  /**
   * Handle file selection for backfill (ZIP or CSV)
   */
  const handleBackfillFileSelect = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setBackfillResults(null);

    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Extract activities.csv from ZIP
        const zip = await JSZip.loadAsync(file);

        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          if (zipEntry.dir) continue;
          const fileName = relativePath.split('/').pop().toLowerCase();
          if (fileName === 'activities.csv') {
            const content = await zipEntry.async('string');
            setBackfillCsv({ name: 'activities.csv', content });
            setActiveTab('backfill');
            return;
          }
        }
        setError('No activities.csv found in ZIP file');
      } else if (file.name.toLowerCase().endsWith('.csv')) {
        // Direct CSV file
        const content = await file.text();
        setBackfillCsv({ name: file.name, content });
        setActiveTab('backfill');
      } else {
        setError('Please select a Strava export ZIP or activities.csv file');
      }
    } catch (err) {
      console.error('Error reading file:', err);
      setError('Failed to read file');
    }
  }, []);

  /**
   * Extract activity files from a Strava export zip
   */
  const extractFilesFromZip = async (zipFile) => {
    const zip = await JSZip.loadAsync(zipFile);
    const activityFiles = [];
    const promises = [];
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

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;

      // Only process files in activities folder or root activity files
      const fileType = getFileType(relativePath);
      if (!fileType) return;

      // Skip TCX files for now (could add TCX parser later)
      if (fileType.startsWith('tcx')) return;

      // For FIT files, extract as binary; for GPX, extract as string
      const isBinary = fileType.startsWith('fit');

      // Extract activity ID from filename (e.g., "12345678901.fit.gz" -> "12345678901")
      const baseName = relativePath.split('/').pop();
      const activityIdMatch = baseName.match(/^(\d+)\.(fit|gpx)/i);
      const activityId = activityIdMatch ? activityIdMatch[1] : null;
      const stravaActivityName = activityId ? activityNames[activityId] : null;

      promises.push(
        zipEntry.async(isBinary ? 'arraybuffer' : 'string').then(content => ({
          name: relativePath.split('/').pop(),
          path: relativePath,
          content,
          size: isBinary ? content.byteLength : content.length,
          fileType,
          isBinary,
          stravaActivityName // Include the actual Strava activity name if found
        }))
      );
    });

    return Promise.all(promises);
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
   * Convert parsed data to activity format
   * @param {Object} parsedData - Parsed activity data
   * @param {string} fileType - File type (gpx, fit, etc.)
   * @param {string} userId - User ID
   * @param {string|null} fileName - Original filename
   * @param {string|null} stravaActivityName - Actual Strava activity name from activities.csv
   */
  const toActivityFormat = (parsedData, fileType, userId, fileName = null, stravaActivityName = null) => {
    if (fileType.startsWith('gpx')) {
      const activity = gpxToActivityFormat(parsedData, userId);
      // Override name with Strava activity name if available
      if (stravaActivityName) {
        activity.name = stravaActivityName;
      }
      return activity;
    } else if (fileType.startsWith('fit')) {
      return fitToActivityFormat(parsedData, userId, fileName, stravaActivityName);
    }
    throw new Error(`Cannot convert file type: ${fileType}`);
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
          setCurrentFile(`Extracting ${file.name}...`);
          const extractedFiles = await extractFilesFromZip(file);
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
      const actFile = selectedFiles[i];
      setCurrentFile(actFile.name);
      setProgress(Math.round((i / selectedFiles.length) * 100));

      try {
        // Parse the activity file
        const parsedData = await parseActivityFile(actFile);

        // Skip if no GPS data
        if (!parsedData.trackPoints || parsedData.trackPoints.length === 0) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'No GPS data found'
          });
          continue;
        }

        // Skip very short activities (less than 100m)
        const distance = parsedData.summary?.totalDistance || 0;
        if (distance < 0.1) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'Activity too short (< 100m)'
          });
          continue;
        }

        // Convert to database format (pass filename and Strava name for proper naming)
        const activityData = toActivityFormat(parsedData, actFile.fileType, user.id, actFile.name, actFile.stravaActivityName);

        // Skip activities without a valid date
        if (!activityData.start_date) {
          uploadResults.skipped.push({
            file: actFile.name,
            reason: 'No valid date found in file'
          });
          continue;
        }

        // Check for duplicate (same date and similar distance)
        if (activityData.start_date) {
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
        }

        // Insert into database
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
    setBackfillCsv(null);
    setBackfillResults(null);
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
          <Tabs.Tab
            value="backfill"
            leftSection={<IconRefresh size={16} />}
          >
            Fix Names
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
                  <IconFileZip size={24} />
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
                  <Group gap="xs">
                    {fileCounts.FIT && <Badge color="blue">{fileCounts.FIT} FIT</Badge>}
                    {fileCounts.GPX && <Badge color="green">{fileCounts.GPX} GPX</Badge>}
                  </Group>
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
                              <IconBike size={14} />
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
                            <IconRoute size={12} color="var(--mantine-color-blue-5)" />
                            <Text size="xs">{formatDistance(activity.summary?.totalDistance)}</Text>
                          </Group>
                          <Group gap={4}>
                            <IconClock size={12} color="var(--mantine-color-green-5)" />
                            <Text size="xs">{formatDuration(activity.summary?.totalMovingTime)}</Text>
                          </Group>
                          <Group gap={4}>
                            <IconMountain size={12} color="var(--mantine-color-orange-5)" />
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
                        <Accordion.Control icon={<IconX size={16} />}>
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

        {/* BACKFILL TAB */}
        <Tabs.Panel value="backfill">
          <Stack gap="md">
            <Alert
              icon={<IconRefresh size={18} />}
              color="blue"
              variant="light"
            >
              Already imported activities with date-based names like "Cycling - Monday, Jan 5, 2026"?
              Upload your Strava export again to fix the names.
            </Alert>

            {/* Drop Zone for Backfill */}
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
              onClick={() => !uploading && document.getElementById('backfill-file-input').click()}
            >
              <input
                id="backfill-file-input"
                type="file"
                accept=".zip,.csv"
                style={{ display: 'none' }}
                onChange={handleBackfillFileSelect}
                disabled={uploading}
              />
              <Stack align="center" gap="xs">
                <ThemeIcon size={48} variant="light" color="blue">
                  <IconRefresh size={24} />
                </ThemeIcon>
                <Text fw={500}>
                  {backfillCsv ? backfillCsv.name : 'Drop your Strava export ZIP here'}
                </Text>
                <Text size="xs" c="dimmed">
                  We'll read the activities.csv to update your activity names
                </Text>
              </Stack>
            </Paper>

            {/* Error */}
            {error && (
              <Alert color="red" icon={<IconX size={16} />}>
                {error}
              </Alert>
            )}

            {/* CSV Preview */}
            {backfillCsv && !backfillResults && (
              <Paper withBorder p="sm">
                <Group gap="xs" mb="xs">
                  <IconCheck size={16} color="var(--mantine-color-green-5)" />
                  <Text size="sm" fw={500}>Ready to update names</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  Found {backfillCsv.name}. Click the button below to match activities
                  by date and update their names.
                </Text>
              </Paper>
            )}

            {/* Progress */}
            {uploading && (
              <Paper withBorder p="sm">
                <Text size="sm" mb="xs">
                  Updating names... {currentFile}
                </Text>
                <Progress value={progress} animated color="blue" />
                <Text size="xs" c="dimmed" mt="xs" ta="center">
                  {Math.round(progress)}% complete
                </Text>
              </Paper>
            )}

            {/* Results */}
            {backfillResults && (
              <Paper withBorder p="md">
                <Stack gap="sm">
                  <Text fw={600}>Update Results</Text>

                  <SimpleGrid cols={3} spacing="xs">
                    <Paper p="xs" bg="green.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="green.3">{backfillResults.updated.length}</Text>
                      <Text size="xs" c="green.5">Updated</Text>
                    </Paper>
                    <Paper p="xs" bg="blue.9" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="blue.3">{backfillResults.alreadyCorrect.length}</Text>
                      <Text size="xs" c="blue.5">Already Correct</Text>
                    </Paper>
                    <Paper p="xs" bg="gray.8" style={{ textAlign: 'center' }}>
                      <Text size="lg" fw={700} c="gray.3">{backfillResults.notFound.length}</Text>
                      <Text size="xs" c="gray.5">Not Found</Text>
                    </Paper>
                  </SimpleGrid>

                  {backfillResults.updated.length > 0 && (
                    <Accordion variant="contained" defaultValue="updated">
                      <Accordion.Item value="updated">
                        <Accordion.Control icon={<IconCheck size={16} />}>
                          Updated Names ({backfillResults.updated.length})
                        </Accordion.Control>
                        <Accordion.Panel>
                          <ScrollArea h={backfillResults.updated.length > 5 ? 150 : 'auto'}>
                            <List size="xs" spacing={4}>
                              {backfillResults.updated.slice(0, 50).map((item, index) => (
                                <List.Item key={index}>
                                  <Text size="xs">
                                    <Text span c="dimmed" td="line-through">{item.oldName}</Text>
                                    <Text span> → </Text>
                                    <Text span fw={500}>{item.newName}</Text>
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
              {backfillResults ? (
                <>
                  <Button variant="subtle" onClick={resetModal}>
                    Start Over
                  </Button>
                  <Button color="blue" onClick={handleClose}>
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="subtle" onClick={handleClose} disabled={uploading}>
                    Cancel
                  </Button>
                  <Button
                    color="blue"
                    leftSection={<IconRefresh size={16} />}
                    onClick={handleBackfillNames}
                    disabled={!backfillCsv || uploading}
                    loading={uploading}
                  >
                    Update Activity Names
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
