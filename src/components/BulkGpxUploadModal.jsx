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
import { parseFitFile, peekFitType, peekFitHeader } from '../utils/fitParser';
import { arrayBufferToBase64 } from '../utils/base64';
import { formatDistance as formatDistanceUnit, formatElevation as formatElevationUnit } from '../utils/units';
import { trackUpload, EventType } from '../utils/activityTracking';
import JSZip from 'jszip';
import pako from 'pako';
import { ArrowSquareOut, Bicycle, CaretRight, Check, Clock, File, FileZip, Files, FolderOpen, Heartbeat, Info, Mountains, Path, UploadSimple, Warning, WarningCircle, Watch, X } from '@phosphor-icons/react';

function BulkGpxUploadModal({ opened, onClose, onUploadComplete, zIndex }) {
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
  // Per-ZIP detection results, used to drive the banner + an initial skipped
  // tally (Garmin export ZIPs contain many JSON sidecars we don't ingest).
  const [zipSources, setZipSources] = useState([]);
  const [preSkipped, setPreSkipped] = useState([]);

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

  // Yield to the browser so any pending React render (e.g. the progress
  // label updated via onProgress) can paint before the next blocking
  // operation (zipEntry.async or JSON.parse on multi-MB strings).
  const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

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
   * Walk an arbitrary parsed-JSON value and collect any ID fields that
   * could match the numeric ID in a Garmin FIT filename. Garmin's data
   * model uses several:
   *   - activityId       — the Connect activity entity
   *   - uploadId/fileId  — the uploaded source file (what FIT filenames use)
   *   - summaryId        — webhook/summary correlation
   *   - originalFileId   — pre-conversion file ID for some upload paths
   * The FIT filenames inside DI-Connect-Uploaded-Files are named by the
   * upload-side ID, so we have to grab all of them and union into one Set
   * for filename matching.
   */
  const GARMIN_ID_FIELDS = ['activityId', 'uploadId', 'fileId', 'summaryId', 'originalFileId'];
  const collectActivityIdsFromJson = (parsed, acc) => {
    if (Array.isArray(parsed)) {
      for (const item of parsed) collectActivityIdsFromJson(item, acc);
    } else if (parsed && typeof parsed === 'object') {
      for (const field of GARMIN_ID_FIELDS) {
        const v = parsed[field];
        if (v != null && (typeof v === 'number' || typeof v === 'string')) {
          acc.add(String(v));
        }
      }
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v) || (v && typeof v === 'object')) {
          collectActivityIdsFromJson(v, acc);
        }
      }
    }
  };

  /**
   * Walk the parsed manifest and collect activity start times as Unix
   * seconds (rounded). Reads `beginTimestamp` (ms) preferentially, falls
   * back to `startTimeGmt` (ISO string). These are the only fields that
   * cross-reference reliably to FIT file_id.time_created — the manifest's
   * `activityId` is in a different ID space than the FIT filename IDs.
   */
  const collectActivityTimestamps = (parsed, acc) => {
    if (Array.isArray(parsed)) {
      for (const item of parsed) collectActivityTimestamps(item, acc);
    } else if (parsed && typeof parsed === 'object') {
      if (typeof parsed.beginTimestamp === 'number') {
        acc.add(Math.round(parsed.beginTimestamp / 1000));
      } else if (typeof parsed.startTimeGmt === 'string') {
        const t = Date.parse(parsed.startTimeGmt);
        if (!isNaN(t)) acc.add(Math.round(t / 1000));
      }
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v) || (v && typeof v === 'object')) {
          collectActivityTimestamps(v, acc);
        }
      }
    }
  };

  /**
   * Diagnostic: find the first object in a parsed manifest that carries
   * any known Garmin ID field, so we can log its keys and see what other
   * ID fields exist (in case Garmin uses a name we don't know about yet).
   */
  const findFirstObjectWithIdField = (parsed) => {
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const found = findFirstObjectWithIdField(item);
        if (found) return found;
      }
    } else if (parsed && typeof parsed === 'object') {
      for (const field of GARMIN_ID_FIELDS) {
        if (parsed[field] != null) return parsed;
      }
      for (const v of Object.values(parsed)) {
        if (Array.isArray(v) || (v && typeof v === 'object')) {
          const found = findFirstObjectWithIdField(v);
          if (found) return found;
        }
      }
    }
    return null;
  };

  /**
   * Detect whether the ZIP is a Strava export, a Garmin Connect "Export Your
   * Data" archive, or something we can't identify.
   *
   * Strava: flat root + activities.csv name map.
   * Garmin: real exports nest activities under a top-level UUID folder.
   *   Two variants in the wild:
   *     1. Newer / multi-part: <UUID>_1/DI_CONNECT/DI-Connect-Uploaded-Files/
   *        UploadedFiles_*.zip → FIT files live INSIDE those inner ZIPs.
   *     2. Older / smaller: <UUID>_1/DI_CONNECT/DI-Connect-Fitness/<id>.fit(.gz)
   *        sitting loose in the outer ZIP.
   * We accept either by dropping the start-of-string anchor.
   */
  const detectZipSource = (zip) => {
    let hasGarminNestedZip = false;
    let hasGarminLooseFit = false;
    let hasStravaCsv = false;
    zip.forEach((relativePath) => {
      if (/(^|\/)DI_CONNECT\/DI-Connect-Uploaded-Files\/UploadedFiles[^/]*\.zip$/i.test(relativePath)) {
        hasGarminNestedZip = true;
      }
      if (/(^|\/)DI_CONNECT\/DI-Connect-Fitness\/[^/]+\.fit(\.gz)?$/i.test(relativePath)) {
        hasGarminLooseFit = true;
      }
      if (relativePath.split('/').pop().toLowerCase() === 'activities.csv') {
        hasStravaCsv = true;
      }
    });
    if (hasGarminNestedZip || hasGarminLooseFit) return 'garmin';
    if (hasStravaCsv) return 'strava';
    return 'unknown';
  };

  /**
   * Extract a Garmin activity ID from a FIT filename inside a Garmin export.
   * Garmin's DI-Connect-Uploaded-Files archive uses many naming conventions
   * across firmware generations and third-party uploaders. Known patterns:
   *   - <activityId>.fit                       (modern Connect uploads)
   *   - <activityId>_ACTIVITY.fit              (older Edge devices)
   *   - <userId>_<activityId>.fit              (some legacy exports)
   *   - <timestamp>-<activityId>-<hash>.fit    (third-party uploads)
   *   - YYYY-MM-DD-HH-MM-SS.fit                (no ID at all)
   * Strategy: find the longest numeric run of 8+ digits in the basename
   * (Garmin activity IDs are typically 10–12 digits). If none, return null
   * and the caller falls back to a generic FIT upload (no ID-based dedupe
   * against webhook, but the row still imports via the time+distance
   * heuristic).
   */
  const parseGarminFilename = (baseName) => {
    // Strip extension first so .fit/.gz aren't candidates.
    const stem = baseName.replace(/\.fit(\.gz)?$/i, '');
    const runs = stem.match(/\d{8,}/g);
    if (!runs || runs.length === 0) return null;
    // Return the longest numeric run. Ties → pick the last one
    // (in <userId>_<activityId> the activity ID is typically the larger
    // tail value).
    let best = runs[0];
    for (const r of runs) {
      if (r.length > best.length) best = r;
      else if (r.length === best.length) best = r; // keeps the later occurrence
    }
    return best;
  };

  /**
   * Extract activity files from a Strava or Garmin export zip.
   * Uses batched extraction to handle large exports without running out of memory.
   * @param {File} zipFile - The zip file to extract
   * @param {Function} onProgress - Optional callback for progress updates (current, total, fileName)
   * @returns {Promise<{files: Array, zipSource: 'strava'|'garmin'|'unknown', skipped: Array}>}
   */
  const extractFilesFromZip = async (zipFile, onProgress) => {
    const zip = await JSZip.loadAsync(zipFile);
    const zipSource = detectZipSource(zip);
    let activityNames = {};
    const skipped = [];

    // Only Strava exports carry an activities.csv name map; skip the scan
    // entirely for Garmin / unknown.
    if (zipSource === 'strava') {
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
    }

    // Collect only activity file entries (filter BEFORE reading content)
    // This skips photos, JSON sidecars, and other non-activity files entirely.
    // For Garmin: push directly to extractedFiles (read content immediately
    // while the inner ZIP is in scope) and apply a 5KB size filter to drop
    // monitoring/wellness/sleep FITs before they reach the server.
    // For Strava/unknown: queue in activityEntries for the batch loop below.
    const activityEntries = [];
    const extractedFiles = [];

    // Garmin's UploadedFiles archive includes every FIT the user ever
    // uploaded — monitoring, wellness, sleep, sport, settings, etc. — not
    // just activities. Real activity FITs are >=10KB; monitoring FITs are
    // 1-5KB. 5KB cutoff drops the bulk without false-skipping any short ride.
    const GARMIN_MIN_FIT_BYTES = 5 * 1024;

    if (zipSource === 'garmin') {
      // Garmin export ships FIT files inside DI-Connect-Uploaded-Files/
      // UploadedFiles_*.zip (multi-part) OR loose under DI-Connect-Fitness/.
      // Handle both shapes. We open inner ZIPs sequentially to bound peak
      // memory (each inner part can be ~40MB).

      // Step 0: Find the activity manifest in the outer ZIP.
      // Garmin ships every export with a list of real training activities
      // (their numeric activityId values match the ID embedded in each FIT
      // filename: <email>_<activityId>.fit). The format is JSON in modern
      // exports — typically DI_CONNECT/DI-Connect-Fitness/<userNum>_<N>_summarizedActivities.json
      // either as a flat array of activity objects or wrapped in an outer
      // [{ summarizedActivitiesExport: [...] }]. We also accept the legacy
      // summarizedActivities.csv variant. Building a Set from it lets us
      // drop all non-activity FITs in a fast in-memory lookup without
      // parsing any FIT binary locally.
      if (onProgress) onProgress(0, 0, 'Scanning Garmin export…');
      await yieldToUi();

      const manifestJsonEntries = [];
      let manifestCsvEntry = null;
      const outerSamples = [];
      let outerEntryCount = 0;
      zip.forEach((relativePath, zipEntry) => {
        outerEntryCount += 1;
        if (outerSamples.length < 30) outerSamples.push(relativePath);
        if (zipEntry.dir) return;
        if (/summarizedActivities.*\.json$/i.test(relativePath)) {
          manifestJsonEntries.push({ relativePath, zipEntry });
        } else if (/summarizedActivities\.csv$/i.test(relativePath)) {
          manifestCsvEntry = zipEntry;
        }
      });
      console.log(`Garmin outer ZIP: ${outerEntryCount} entries. Sample paths (first 30): ${JSON.stringify(outerSamples)}`);
      console.log(`Garmin manifest scan: ${manifestJsonEntries.length} JSON, ${manifestCsvEntry ? 1 : 0} CSV`);

      // Two complementary indexes built from the manifest:
      //   - activityTimestamps: Set of Unix-seconds start times. Primary
      //     match: FIT file_id.time_created → manifest.beginTimestamp.
      //   - garminActivityIds: legacy ID Set, kept for the CSV fallback
      //     path and any future export that does expose upload IDs.
      let activityTimestamps = null; // null = no manifest found
      let garminActivityIds = null;
      if (manifestJsonEntries.length > 0) {
        if (onProgress) {
          onProgress(0, 0, `Found ${manifestJsonEntries.length} manifest file(s) — reading…`);
        }
        await yieldToUi();

        const ts = new Set();
        const ids = new Set();
        for (let mi = 0; mi < manifestJsonEntries.length; mi++) {
          const { relativePath, zipEntry } = manifestJsonEntries[mi];
          try {
            if (onProgress) onProgress(0, 0, `Reading manifest ${mi + 1}/${manifestJsonEntries.length}…`);
            await yieldToUi();
            const text = await zipEntry.async('string');
            const sizeMb = (text.length / (1024 * 1024)).toFixed(1);
            if (onProgress) onProgress(0, 0, `Parsing manifest ${mi + 1}/${manifestJsonEntries.length} (${sizeMb} MB)…`);
            await yieldToUi();
            const parsed = JSON.parse(text);
            const tsBefore = ts.size;
            const idsBefore = ids.size;
            collectActivityTimestamps(parsed, ts);
            collectActivityIdsFromJson(parsed, ids);
            console.log(`Garmin manifest ${relativePath} (${sizeMb} MB): +${ts.size - tsBefore} timestamps, +${ids.size - idsBefore} IDs (totals ${ts.size}/${ids.size})`);
            const firstObj = findFirstObjectWithIdField(parsed);
            if (firstObj) {
              console.log(`Garmin manifest ${relativePath} first-entry keys: ${JSON.stringify(Object.keys(firstObj))}`);
            }
          } catch (err) {
            console.warn(`Failed to parse Garmin manifest ${relativePath}:`, err);
          }
        }
        if (ts.size > 0) activityTimestamps = ts;
        if (ids.size > 0) garminActivityIds = ids;
      }
      if (activityTimestamps === null && garminActivityIds === null && manifestCsvEntry) {
        if (onProgress) onProgress(0, 0, 'Reading legacy CSV manifest…');
        await yieldToUi();
        try {
          const csvText = await manifestCsvEntry.async('string');
          const map = parseActivitiesCsv(csvText);
          if (Object.keys(map).length > 0) {
            garminActivityIds = new Set(Object.keys(map));
            console.log(`Garmin legacy CSV manifest: ${garminActivityIds.size} activity IDs`);
          }
        } catch (err) {
          console.warn('Failed to parse legacy Garmin summarizedActivities.csv:', err);
        }
      }
      console.log(`Garmin manifest result: ${activityTimestamps ? activityTimestamps.size + ' timestamps' : ''}${activityTimestamps && garminActivityIds ? ' / ' : ''}${garminActivityIds ? garminActivityIds.size + ' IDs' : ''}${(!activityTimestamps && !garminActivityIds) ? 'NONE FOUND — fallback to size+peek filters' : ''}`);
      if (activityTimestamps && activityTimestamps.size > 0) {
        const sampleTs = Array.from(activityTimestamps).slice(0, 5);
        console.log(`Garmin manifest sample timestamps (first 5, Unix seconds): ${JSON.stringify(sampleTs)}`);
      }
      if (onProgress) {
        if (activityTimestamps !== null) {
          onProgress(0, 0, `Manifest loaded — ${activityTimestamps.size} activities to import…`);
        } else if (garminActivityIds !== null) {
          onProgress(0, 0, `Legacy manifest loaded — ${garminActivityIds.size} activities to import…`);
        } else {
          // Hint: Garmin sometimes splits exports into multiple parts.
          const looksMultiPart = /_\d+\.zip$/i.test(zipFile?.name || '');
          if (looksMultiPart) {
            onProgress(0, 0, 'No manifest in this ZIP — Garmin may have split your export into multiple parts. Check for other <UUID>_N.zip files.');
          } else {
            onProgress(0, 0, 'No manifest found — falling back to size + type filters…');
          }
        }
      }
      await yieldToUi();

      const innerZipEntries = [];
      const looseFitEntries = [];
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        if (/(^|\/)DI_CONNECT\/DI-Connect-Uploaded-Files\/UploadedFiles[^/]*\.zip$/i.test(relativePath)) {
          innerZipEntries.push({ relativePath, zipEntry });
        } else if (/(^|\/)DI_CONNECT\/DI-Connect-Fitness\/[^/]+\.fit(\.gz)?$/i.test(relativePath)) {
          looseFitEntries.push({ relativePath, zipEntry });
        }
      });

      for (let i = 0; i < innerZipEntries.length; i++) {
        const { relativePath: innerPath, zipEntry: innerZipEntry } = innerZipEntries[i];
        if (onProgress) {
          const hasManifest = activityTimestamps !== null || garminActivityIds !== null;
          const label = hasManifest
            ? `Filtering with manifest: ${innerPath.split('/').pop()} (${i + 1}/${innerZipEntries.length})…`
            : `Opening ${innerPath.split('/').pop()} (${i + 1}/${innerZipEntries.length})…`;
          onProgress(0, 0, label);
        }
        let innerZip;
        try {
          const buf = await innerZipEntry.async('arraybuffer');
          innerZip = await JSZip.loadAsync(buf);
        } catch (err) {
          console.warn(`Failed to open inner Garmin ZIP ${innerPath}:`, err);
          skipped.push({ file: innerPath.split('/').pop(), reason: `Inner ZIP unreadable: ${err.message}` });
          continue;
        }

        // Sync-collect FIT entries from the inner ZIP (forEach can't await).
        const innerFitFiles = [];
        let innerTotal = 0;
        const innerSamples = [];
        innerZip.forEach((innerRelPath, innerEntry) => {
          if (innerEntry.dir) return;
          innerTotal += 1;
          if (innerSamples.length < 5) innerSamples.push(innerRelPath);
          const fileType = getFileType(innerRelPath);
          if (!fileType || !fileType.startsWith('fit')) return;
          innerFitFiles.push({ innerRelPath, innerEntry, fileType });
        });

        // Diagnostic: log the first 5 parsed filename IDs so we can confirm
        // they overlap with the manifest sample IDs logged earlier.
        if (innerFitFiles.length > 0) {
          const filenameIdSamples = innerFitFiles.slice(0, 5).map((f) =>
            parseGarminFilename(f.innerRelPath.split('/').pop())
          );
          console.log(`Inner ZIP ${innerPath.split('/').pop()} filename IDs (first 5): ${JSON.stringify(filenameIdSamples)}`);
        }

        // Async loop: read each FIT immediately while innerZip is in scope.
        let keptCount = 0;
        let sizeSkippedCount = 0;
        let manifestSkippedCount = 0;
        let peekSkippedCount = 0;
        let typeFilteredCount = 0;
        let timestampFilteredCount = 0;
        for (let fitIdx = 0; fitIdx < innerFitFiles.length; fitIdx++) {
          const { innerRelPath, innerEntry, fileType } = innerFitFiles[fitIdx];
          const baseName = innerRelPath.split('/').pop();

          if (onProgress && fitIdx > 0 && fitIdx % 200 === 0) {
            onProgress(0, 0, `Inspecting FITs in ${innerPath.split('/').pop()} (${fitIdx}/${innerFitFiles.length}, kept ${keptCount})…`);
            await yieldToUi();
          }

          // Legacy CSV fast-path: when only ID-based matching is available
          // we can skip without reading bytes. The JSON-manifest path requires
          // reading the file_id header (timestamp matching) so we always
          // proceed to the content read below.
          if (activityTimestamps === null && garminActivityIds !== null) {
            const actId = parseGarminFilename(baseName);
            if (!actId || !garminActivityIds.has(actId)) {
              manifestSkippedCount += 1;
              skipped.push({ file: baseName, reason: 'Not in Garmin activity manifest (legacy CSV)' });
              continue;
            }
          }

          let content;
          try {
            content = await innerEntry.async('arraybuffer');
          } catch (err) {
            console.warn(`Failed to read FIT ${innerRelPath} from inner ZIP:`, err);
            skipped.push({ file: baseName, reason: `Read failed: ${err.message}` });
            continue;
          }

          // JSON-manifest path: peek file_id.type + time_created from the
          // raw FIT header and cross-reference to manifest start times.
          if (activityTimestamps !== null) {
            let fitBytes = content;
            if (fileType === 'fit.gz') {
              try {
                fitBytes = pako.inflate(new Uint8Array(content)).buffer;
              } catch {
                // Defer to server.
              }
            }
            const peek = peekFitHeader(fitBytes);
            if (peek.ok) {
              if (peek.type !== 'activity') {
                typeFilteredCount += 1;
                skipped.push({ file: baseName, reason: `Not an activity FIT (type=${peek.type})` });
                continue;
              }
              if (peek.timeCreatedSeconds != null) {
                let matched = false;
                for (let off = -10; off <= 10; off++) {
                  if (activityTimestamps.has(peek.timeCreatedSeconds + off)) { matched = true; break; }
                }
                if (!matched) {
                  timestampFilteredCount += 1;
                  skipped.push({ file: baseName, reason: 'No matching manifest timestamp' });
                  continue;
                }
              }
            }
            // peek.ok === false → let it through; server backstop will sort it.
          } else if (garminActivityIds === null) {
            // No manifest at all: size + easy-fit type peek fallback.
            if (content.byteLength < GARMIN_MIN_FIT_BYTES) {
              sizeSkippedCount += 1;
              skipped.push({
                file: baseName,
                reason: `Too small to be an activity (${(content.byteLength / 1024).toFixed(1)} KB) — likely monitoring/wellness data`,
              });
              continue;
            }
            try {
              const peek = await peekFitType(content, fileType === 'fit.gz');
              if (peek.type && peek.type !== 'activity') {
                peekSkippedCount += 1;
                skipped.push({
                  file: baseName,
                  reason: `Not an activity FIT (file_id.type=${peek.type})`,
                });
                continue;
              }
            } catch (err) {
              console.warn(`peekFitType failed for ${innerRelPath}, deferring to server:`, err);
            }
          }

          const garminActivityId = parseGarminFilename(baseName);
          extractedFiles.push({
            name: baseName,
            path: `${innerPath}!${innerRelPath}`,
            content,
            size: content.byteLength,
            fileType,
            isBinary: true,
            stravaActivityName: null,
            zipSource: garminActivityId ? 'garmin' : 'garmin_no_id',
            garminActivityId,
          });
          keptCount += 1;
        }
        console.log(
          `Garmin inner ZIP ${innerPath.split('/').pop()}: ` +
          `${innerTotal} entries, ${innerFitFiles.length} FIT, ` +
          `${keptCount} kept, ${typeFilteredCount} type-skipped, ` +
          `${timestampFilteredCount} timestamp-skipped, ` +
          `${manifestSkippedCount} legacy-id-skipped, ` +
          `${sizeSkippedCount} size-skipped, ${peekSkippedCount} peek-skipped. ` +
          `Samples: ${JSON.stringify(innerSamples)}`
        );
      }

      // Loose FIT files from older Garmin exports — same filtering as the
      // inner-ZIP loop above (manifest timestamp / legacy ID / size+peek).
      for (const { relativePath, zipEntry } of looseFitEntries) {
        const fileType = getFileType(relativePath);
        if (!fileType || !fileType.startsWith('fit')) continue;
        const baseName = relativePath.split('/').pop();

        if (activityTimestamps === null && garminActivityIds !== null) {
          const actId = parseGarminFilename(baseName);
          if (!actId || !garminActivityIds.has(actId)) {
            skipped.push({ file: baseName, reason: 'Not in Garmin activity manifest (legacy CSV)' });
            continue;
          }
        }

        let content;
        try {
          content = await zipEntry.async('arraybuffer');
        } catch (err) {
          console.warn(`Failed to read loose FIT ${relativePath}:`, err);
          skipped.push({ file: baseName, reason: `Read failed: ${err.message}` });
          continue;
        }

        if (activityTimestamps !== null) {
          let fitBytes = content;
          if (fileType === 'fit.gz') {
            try { fitBytes = pako.inflate(new Uint8Array(content)).buffer; } catch { /* defer */ }
          }
          const peek = peekFitHeader(fitBytes);
          if (peek.ok) {
            if (peek.type !== 'activity') {
              skipped.push({ file: baseName, reason: `Not an activity FIT (type=${peek.type})` });
              continue;
            }
            if (peek.timeCreatedSeconds != null) {
              let matched = false;
              for (let off = -10; off <= 10; off++) {
                if (activityTimestamps.has(peek.timeCreatedSeconds + off)) { matched = true; break; }
              }
              if (!matched) {
                skipped.push({ file: baseName, reason: 'No matching manifest timestamp' });
                continue;
              }
            }
          }
        } else if (garminActivityIds === null) {
          if (content.byteLength < GARMIN_MIN_FIT_BYTES) {
            skipped.push({
              file: baseName,
              reason: `Too small to be an activity (${(content.byteLength / 1024).toFixed(1)} KB) — likely monitoring/wellness data`,
            });
            continue;
          }
          try {
            const peek = await peekFitType(content, fileType === 'fit.gz');
            if (peek.type && peek.type !== 'activity') {
              skipped.push({
                file: baseName,
                reason: `Not an activity FIT (file_id.type=${peek.type})`,
              });
              continue;
            }
          } catch (err) {
            console.warn(`peekFitType failed for ${relativePath}, deferring to server:`, err);
          }
        }

        const garminActivityId = parseGarminFilename(baseName);
        extractedFiles.push({
          name: baseName,
          path: relativePath,
          content,
          size: content.byteLength,
          fileType,
          isBinary: true,
          stravaActivityName: null,
          zipSource: garminActivityId ? 'garmin' : 'garmin_no_id',
          garminActivityId,
        });
      }

      // Defensive guard: if we couldn't find a manifest AND we'd be about to
      // upload thousands of files, refuse rather than silently flooding the
      // server. The outer-ZIP sample log above tells the user (and us) what
      // files are actually in the export so the regex can be fixed.
      if (activityTimestamps === null && garminActivityIds === null && extractedFiles.length > 2000) {
        const samplePaths = outerSamples.slice(0, 10).join('  •  ');
        throw new Error(
          `Found ${extractedFiles.length} candidate FIT files but no Garmin ` +
          `activity manifest (summarizedActivities.json / .csv) in the export. ` +
          `Aborting to avoid uploading thousands of non-activity files. ` +
          `First paths in the ZIP: ${samplePaths}. ` +
          `Share these so the manifest regex can be updated, or check whether ` +
          `Garmin split your export into multiple parts (additional <UUID>_N.zip files).`
        );
      }
    } else {
      // Strava / unknown — flat walk; accept FIT and GPX at any path.
      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;

        const fileType = getFileType(relativePath);
        if (!fileType) return; // Skip non-activity files (photos, JSON, etc.)
        if (fileType.startsWith('tcx')) return; // Skip TCX files

        const baseName = relativePath.split('/').pop();
        const activityIdMatch = baseName.match(/^(\d+)\.(fit|gpx)/i);
        const activityId = activityIdMatch ? activityIdMatch[1] : null;
        const stravaActivityName = (zipSource === 'strava' && activityId)
          ? activityNames[activityId]
          : null;
        const isBinary = fileType.startsWith('fit');

        activityEntries.push({
          relativePath,
          zipEntry,
          fileType,
          isBinary,
          stravaActivityName,
          zipSource,
          garminActivityId: null,
        });
      });
    }

    console.log(
      `extractFilesFromZip(${zipSource}): ` +
      `${activityEntries.length} entries queued for batch extraction, ` +
      `${extractedFiles.length} already extracted (Garmin immediate), ` +
      `${skipped.length} skipped`
    );

    // Extract Strava/unknown entries in batches. Garmin entries are already in
    // extractedFiles (read immediately during the Garmin branch above).
    const BATCH_SIZE = 20;

    for (let i = 0; i < activityEntries.length; i += BATCH_SIZE) {
      const batch = activityEntries.slice(i, i + BATCH_SIZE);

      // Report progress
      if (onProgress) {
        const firstFile = batch[0].relativePath.split('/').pop();
        onProgress(i, activityEntries.length, firstFile);
      }

      // Extract this batch in parallel
      const batchPromises = batch.map(async (entry) => {
        const { relativePath, zipEntry, fileType, isBinary, stravaActivityName, zipSource: entryZipSource, garminActivityId } = entry;
        try {
          const content = await zipEntry.async(isBinary ? 'arraybuffer' : 'string');
          return {
            name: relativePath.split('/').pop(),
            path: relativePath,
            content,
            size: isBinary ? content.byteLength : content.length,
            fileType,
            isBinary,
            stravaActivityName,
            zipSource: entryZipSource,
            garminActivityId,
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

    return { files: extractedFiles, zipSource, skipped };
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
    setZipSources([]);
    setPreSkipped([]);

    const allFiles = [];
    const detectedSources = [];
    const allPreSkipped = [];

    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        // Handle zip file
        try {
          setCurrentFile(`Loading ${file.name}...`);
          const { files: extractedFiles, zipSource, skipped } = await extractFilesFromZip(file, (current, total, fileName) => {
            setCurrentFile(`Extracting ${file.name}: ${current}/${total} files (${fileName})`);
          });
          detectedSources.push({ zipName: file.name, zipSource });
          if (skipped.length > 0) {
            allPreSkipped.push(...skipped.map(s => ({ ...s, zipName: file.name })));
          }
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
    setZipSources(detectedSources);
    setPreSkipped(allPreSkipped);
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

    // Garmin export ZIPs tag every file with provider='garmin' + the numeric
    // activity ID parsed from the filename, so the server can dedupe against
    // webhook-imported activities via UNIQUE(user_id, provider_activity_id).
    const isGarminBulk = actFile.zipSource === 'garmin' && !!actFile.garminActivityId;

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
        provider: isGarminBulk ? 'garmin' : undefined,
        garminActivityId: isGarminBulk ? actFile.garminActivityId : undefined,
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
      // Seed with sidecar files (e.g. Garmin user_bio.json) we filtered out
      // at extraction time so the user sees a single accurate tally.
      skipped: preSkipped.map(s => ({ file: s.file, reason: s.reason })),
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
          // Server classifies non-activity FITs (monitoring, wellness, settings,
          // etc.) as action: 'skipped' so they don't pollute the Failed bucket.
          if (payload.action === 'skipped') {
            uploadResults.skipped.push({
              file: actFile.name,
              reason: payload.message || 'Not an activity file',
            });
            continue;
          }
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
    setZipSources([]);
    setPreSkipped([]);
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
            <Text fw={600}>Import from Strava or Garmin Export</Text>
            <Text size="xs" c="dimmed">Bulk import your ride history</Text>
          </div>
        </Group>
      }
      size="xl"
      closeOnClickOutside={!uploading}
      closeOnEscape={!uploading}
      zIndex={zIndex}
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
              <Text size="xs" mt={4}>
                Garmin Connect "Export Your Data" archives work too — drop the ZIP into
                the Upload tab and we'll auto-detect the format.
              </Text>
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

            {/* Garmin export shortcut — same modal handles both archives. */}
            <Paper withBorder p="md">
              <Stack gap="xs">
                <Group gap="xs">
                  <ThemeIcon color="blue" variant="light" size="md">
                    <Watch size={16} />
                  </ThemeIcon>
                  <Text fw={600}>Have a Garmin account instead?</Text>
                </Group>
                <Text size="sm" c="dimmed">
                  Request your Garmin Connect data export and drop the ZIP into the Upload tab —
                  we auto-detect Garmin archives and import the full <Code>.fit</Code> files.
                </Text>
                <Button
                  component="a"
                  href="https://www.garmin.com/en-US/account/datamanagement/exportdata"
                  target="_blank"
                  variant="light"
                  color="blue"
                  size="xs"
                  rightSection={<ArrowSquareOut size={14} />}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Garmin Data Export Page
                </Button>
                <Text size="xs" c="dimmed">
                  Or go to: Garmin Connect → Account → Account Information → Export Your Data
                </Text>
              </Stack>
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
                    <List.Item><Code>.zip</Code> - Strava export OR Garmin Connect "Export Your Data" archive</List.Item>
                    <List.Item><Code>.fit / .fit.gz</Code> - Individual Garmin FIT files</List.Item>
                    <List.Item><Code>.gpx</Code> - GPX files</List.Item>
                  </List>
                  <Text size="sm" c="dimmed" mt="xs">
                    Garmin exports nest activities under <Code>DI_CONNECT/DI-Connect-Fitness/</Code>;
                    we extract them automatically and dedupe against any activities already synced
                    via the Garmin webhook.
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

            {/* ZIP source detection banner — surfaces whether we detected a
                Strava or Garmin export so the user knows the dedupe and
                tagging mode the import will use. */}
            {zipSources.length > 0 && !results && (
              <Stack gap="xs">
                {zipSources.map(({ zipName, zipSource }) => (
                  <Alert
                    key={zipName}
                    color={zipSource === 'garmin' ? 'blue' : zipSource === 'strava' ? 'orange' : 'yellow'}
                    variant="light"
                    icon={zipSource === 'unknown' ? <Warning size={16} /> : <Info size={16} />}
                    title={
                      zipSource === 'garmin'
                        ? `Detected: Garmin export (${zipName})`
                        : zipSource === 'strava'
                          ? `Detected: Strava export (${zipName})`
                          : `Unknown ZIP — attempting generic FIT/GPX extraction (${zipName})`
                    }
                  >
                    {zipSource === 'garmin' && (
                      <Text size="xs">
                        Activities will be tagged <Code>provider=garmin</Code> using their Garmin
                        activity ID. Re-running this import, or connecting Garmin later, won't
                        produce duplicates.
                      </Text>
                    )}
                    {zipSource === 'strava' && (
                      <Text size="xs">
                        Activity names will be pulled from <Code>activities.csv</Code>. Duplicates
                        of existing rides are detected by date + distance.
                      </Text>
                    )}
                    {zipSource === 'unknown' && (
                      <Text size="xs">
                        We couldn't identify the export shape. FIT/GPX files at any path will be
                        imported as generic uploads.
                      </Text>
                    )}
                  </Alert>
                ))}
              </Stack>
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
