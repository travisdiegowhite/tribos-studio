/**
 * Export Service
 * Handles exporting workouts to various formats (Zwift .zwo, TrainerRoad .mrc, generic .erg)
 */

/**
 * Export workout to Zwift .zwo format
 * @param {Object} workout - Workout template object
 * @returns {string} ZWO XML content
 */
export const exportToZwift = (workout) => {
  if (!workout || !workout.structure) {
    throw new Error('Invalid workout structure');
  }

  const { structure } = workout;
  let intervals = [];

  // Helper to add steady state interval
  const addSteadyState = (duration, powerPct, description = '') => {
    const durationSec = duration * 60;
    const power = powerPct / 100;
    intervals.push({
      type: 'SteadyState',
      duration: durationSec,
      power,
      description
    });
  };

  // Helper to add interval set
  const addIntervalSet = (sets, workDuration, workPower, restDuration, restPower) => {
    intervals.push({
      type: 'IntervalsT',
      repeat: sets,
      onDuration: workDuration * 60,
      offDuration: restDuration * 60,
      onPower: workPower / 100,
      offPower: restPower / 100
    });
  };

  // Warmup
  if (structure.warmup) {
    addSteadyState(
      structure.warmup.duration,
      structure.warmup.powerPctFTP,
      'Warmup'
    );
  }

  // Main intervals
  if (structure.main && structure.main.length > 0) {
    structure.main.forEach((interval) => {
      if (interval.type === 'repeat') {
        addIntervalSet(
          interval.sets,
          interval.work.duration,
          interval.work.powerPctFTP,
          interval.rest.duration,
          interval.rest.powerPctFTP
        );
      } else {
        addSteadyState(
          interval.duration,
          interval.powerPctFTP,
          interval.description || ''
        );
      }
    });
  }

  // Cooldown
  if (structure.cooldown) {
    addSteadyState(
      structure.cooldown.duration,
      structure.cooldown.powerPctFTP,
      'Cooldown'
    );
  }

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<workout_file>\n';
  xml += `  <name>${escapeXml(workout.name)}</name>\n`;
  xml += '  <author>tribos.studio</author>\n';
  xml += `  <description>${escapeXml(workout.description || '')}</description>\n`;
  xml += '  <sportType>bike</sportType>\n';
  xml += '  <tags>\n';
  if (workout.tags && workout.tags.length > 0) {
    workout.tags.forEach(tag => {
      xml += `    <tag name="${escapeXml(tag)}"/>\n`;
    });
  }
  xml += '  </tags>\n';
  xml += '  <workout>\n';

  intervals.forEach((interval) => {
    if (interval.type === 'SteadyState') {
      xml += `    <SteadyState Duration="${interval.duration}" Power="${interval.power.toFixed(2)}"`;
      if (interval.description) {
        xml += ` text="${escapeXml(interval.description)}"`;
      }
      xml += '/>\n';
    } else if (interval.type === 'IntervalsT') {
      xml += `    <IntervalsT Repeat="${interval.repeat}" OnDuration="${interval.onDuration}" OffDuration="${interval.offDuration}" OnPower="${interval.onPower.toFixed(2)}" OffPower="${interval.offPower.toFixed(2)}"/>\n`;
    }
  });

  xml += '  </workout>\n';
  xml += '</workout_file>';

  return xml;
};

/**
 * Export workout to TrainerRoad .mrc format
 * @param {Object} workout - Workout template object
 * @returns {string} MRC file content
 */
export const exportToTrainerRoad = (workout) => {
  if (!workout || !workout.structure) {
    throw new Error('Invalid workout structure');
  }

  const { structure } = workout;
  let lines = [];
  let currentTime = 0;

  // Header
  lines.push('[COURSE HEADER]');
  lines.push(`FILE NAME = ${sanitizeFilename(workout.name)}`);
  lines.push('MINUTES WATTS');
  lines.push('[END COURSE HEADER]');
  lines.push('[COURSE DATA]');

  // Helper to add segment
  const addSegment = (duration, powerPct) => {
    const endTime = currentTime + duration;
    const power = powerPct;
    lines.push(`${currentTime.toFixed(2)}\t${power.toFixed(0)}`);
    lines.push(`${endTime.toFixed(2)}\t${power.toFixed(0)}`);
    currentTime = endTime;
  };

  // Warmup
  if (structure.warmup) {
    addSegment(structure.warmup.duration, structure.warmup.powerPctFTP);
  }

  // Main intervals
  if (structure.main && structure.main.length > 0) {
    structure.main.forEach((interval) => {
      if (interval.type === 'repeat') {
        for (let i = 0; i < interval.sets; i++) {
          addSegment(interval.work.duration, interval.work.powerPctFTP);
          addSegment(interval.rest.duration, interval.rest.powerPctFTP);
        }
      } else {
        addSegment(interval.duration, interval.powerPctFTP);
      }
    });
  }

  // Cooldown
  if (structure.cooldown) {
    addSegment(structure.cooldown.duration, structure.cooldown.powerPctFTP);
  }

  lines.push('[END COURSE DATA]');
  lines.push('');
  lines.push('[COURSE TEXT]');
  lines.push(`0\t${workout.name}`);
  if (workout.description) {
    lines.push(`0\t${workout.description}`);
  }
  lines.push('[END COURSE TEXT]');

  return lines.join('\n');
};

/**
 * Export workout to generic .erg format
 * @param {Object} workout - Workout template object
 * @returns {string} ERG file content
 */
export const exportToERG = (workout) => {
  if (!workout || !workout.structure) {
    throw new Error('Invalid workout structure');
  }

  const { structure } = workout;
  let lines = [];
  let currentTime = 0;

  // Header
  lines.push('[COURSE HEADER]');
  lines.push('VERSION = 2');
  lines.push('UNITS = ENGLISH');
  lines.push(`DESCRIPTION = ${workout.description || workout.name}`);
  lines.push(`FILE NAME = ${sanitizeFilename(workout.name)}`);
  lines.push('MINUTES PERCENT');
  lines.push('[END COURSE HEADER]');
  lines.push('[COURSE DATA]');

  // Helper to add segment
  const addSegment = (duration, powerPct) => {
    lines.push(`${currentTime.toFixed(2)}\t${powerPct.toFixed(0)}`);
    currentTime += duration;
    lines.push(`${currentTime.toFixed(2)}\t${powerPct.toFixed(0)}`);
  };

  // Warmup
  if (structure.warmup) {
    addSegment(structure.warmup.duration, structure.warmup.powerPctFTP);
  }

  // Main intervals
  if (structure.main && structure.main.length > 0) {
    structure.main.forEach((interval) => {
      if (interval.type === 'repeat') {
        for (let i = 0; i < interval.sets; i++) {
          addSegment(interval.work.duration, interval.work.powerPctFTP);
          addSegment(interval.rest.duration, interval.rest.powerPctFTP);
        }
      } else {
        addSegment(interval.duration, interval.powerPctFTP);
      }
    });
  }

  // Cooldown
  if (structure.cooldown) {
    addSegment(structure.cooldown.duration, structure.cooldown.powerPctFTP);
  }

  lines.push('[END COURSE DATA]');

  return lines.join('\n');
};

/**
 * Download file to user's computer
 * @param {string} content - File content
 * @param {string} filename - Filename with extension
 * @param {string} mimeType - MIME type
 */
export const downloadFile = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
};

// Helper functions
const escapeXml = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const sanitizeFilename = (str) => {
  if (!str) return 'workout';
  return str
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .toLowerCase();
};

export default {
  exportToZwift,
  exportToTrainerRoad,
  exportToERG,
  downloadFile,
  copyToClipboard
};
