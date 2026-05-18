// Pure prompt-rendering helpers for the route-builder AI prompt.
// All inputs are WorkoutDefinition-shaped (see src/types/training.ts:550).
// Durations are numeric minutes per WorkoutSegment.duration.

const TRAINING_ZONE_LABEL = {
  1: 'Z1',
  2: 'Z2',
  3: 'Z3',
  4: 'Z4',
  5: 'Z5',
  6: 'Z6',
  7: 'Z7',
};

function zoneLabel(zone) {
  if (zone == null) return '';
  return TRAINING_ZONE_LABEL[zone] ?? `Z${zone}`;
}

function fmtMin(min) {
  if (min == null) return '';
  // Durations < 1 min in the library are decimal minutes (0.5 = 30s).
  if (min > 0 && min < 1) {
    const sec = Math.round(min * 60);
    return `${sec}s`;
  }
  return `${Math.round(min)} min`;
}

function describeSegment(seg) {
  const parts = [];
  parts.push(fmtMin(seg.duration));
  const z = zoneLabel(seg.zone);
  if (z) parts.push(z);
  if (seg.powerPctFTP) parts.push(`@ ${seg.powerPctFTP}% FTP`);
  let line = parts.join(' ');
  if (seg.description) line += ` — ${seg.description}`;
  return line;
}

function isInterval(node) {
  return node && typeof node === 'object' && node.type === 'repeat';
}

function describeWorkRest(node, depth = 0) {
  // node can be: WorkoutSegment, WorkoutInterval, or an array of them.
  if (Array.isArray(node)) {
    return node.map(n => describeWorkRest(n, depth)).join(' → ');
  }
  if (isInterval(node)) {
    const work = describeWorkRest(node.work, depth + 1);
    const rest = describeWorkRest(node.rest, depth + 1);
    return `${node.sets}× (${work} / ${rest})`;
  }
  // It's a segment-shaped object.
  return describeSegment(node);
}

/**
 * One-line summary suitable for steady workouts. Collapses warmup/main/cooldown.
 *
 * @param {object} structure - WorkoutStructure
 * @returns {string}
 */
export function renderStructureSummary(structure) {
  const parts = [];
  if (structure.warmup) {
    const wu = describeSegment(structure.warmup);
    parts.push(`${fmtMin(structure.warmup.duration)} warmup ${zoneLabel(structure.warmup.zone)}`.trim());
    // describeSegment already includes duration+zone; use it for the description suffix only
    if (structure.warmup.description) parts[parts.length - 1] = wu;
  }
  if (Array.isArray(structure.main) && structure.main.length > 0) {
    const mainParts = structure.main.map(seg =>
      isInterval(seg) ? describeWorkRest(seg) : describeSegment(seg)
    );
    parts.push(`main: ${mainParts.join(', ')}`);
  }
  if (structure.cooldown) {
    parts.push(`${fmtMin(structure.cooldown.duration)} cooldown ${zoneLabel(structure.cooldown.zone)}`.trim());
  }
  return parts.join(' / ');
}

/**
 * Bulleted segment-by-segment block suitable for structured/interval workouts.
 * Multi-line; caller is responsible for surrounding whitespace.
 *
 * @param {object} structure - WorkoutStructure
 * @returns {string}
 */
export function renderStructureDetailed(structure) {
  const lines = [];
  if (structure.warmup) {
    lines.push(`  • Warmup: ${describeSegment(structure.warmup)}`);
  }
  if (Array.isArray(structure.main)) {
    for (const seg of structure.main) {
      if (isInterval(seg)) {
        lines.push(`  • Main: ${describeWorkRest(seg)}`);
      } else {
        lines.push(`  • Main: ${describeSegment(seg)}`);
      }
    }
  }
  if (structure.cooldown) {
    lines.push(`  • Cooldown: ${describeSegment(structure.cooldown)}`);
  }
  return lines.join('\n');
}

/**
 * Does the main block contain any 'repeat' intervals?
 *
 * @param {object} structure - WorkoutStructure
 * @returns {boolean}
 */
export function hasIntervals(structure) {
  if (!structure || !Array.isArray(structure.main)) return false;
  return structure.main.some(isInterval);
}

/**
 * Total minutes of the longest interval block in main, including all sets
 * (work + rest). Used to derive how long an uninterrupted road segment
 * needs to be. Returns 0 if no intervals.
 *
 * @param {object} structure - WorkoutStructure
 * @returns {number} minutes
 */
function longestIntervalBlockMin(structure) {
  if (!structure || !Array.isArray(structure.main)) return 0;
  let max = 0;
  for (const seg of structure.main) {
    if (!isInterval(seg)) continue;
    const total = intervalTotalMin(seg);
    if (total > max) max = total;
  }
  return max;
}

function intervalTotalMin(node) {
  if (Array.isArray(node)) {
    return node.reduce((sum, n) => sum + intervalTotalMin(n), 0);
  }
  if (isInterval(node)) {
    const work = intervalTotalMin(node.work);
    const rest = intervalTotalMin(node.rest);
    return node.sets * (work + rest);
  }
  return Number(node?.duration) || 0;
}

/**
 * Find the longest single 'work' segment duration in an interval block.
 * Used to decide whether efforts are "long sustained" or "short repeating."
 */
function longestWorkSegmentMin(structure) {
  if (!structure || !Array.isArray(structure.main)) return 0;
  let max = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (isInterval(node)) {
      visit(node.work);
      return;
    }
    const d = Number(node?.duration) || 0;
    if (d > max) max = d;
  };
  for (const seg of structure.main) {
    if (isInterval(seg)) visit(seg.work);
  }
  return max;
}

/**
 * Produce a one-paragraph "routing implications" string from a structured
 * workout. Returns empty string if the workout has no intervals.
 *
 * @param {object} structure - WorkoutStructure
 * @returns {string}
 */
export function deriveRoutingImplications(structure) {
  if (!hasIntervals(structure)) return '';
  const blockMin = Math.ceil(longestIntervalBlockMin(structure));
  const longestWork = longestWorkSegmentMin(structure);
  const isLongEffort = longestWork >= 3; // 3+ minute sustained work

  const base = `main block needs a sustained ${blockMin}+ minute uninterrupted section. ` +
    `Avoid stop signs, traffic signals, and intersections during the interval window.`;
  const geo = isLongEffort
    ? `Long efforts — straight road or wide-radius bend preferred over technical turns.`
    : `Short, repeating efforts — out-and-back or loop with a U-turn-friendly endpoint at the start of the main block is ideal.`;
  return `${base} ${geo}`;
}

/**
 * Format a Date as "Tuesday, May 19" — used in the PRESCRIBED WORKOUT
 * block header. Falls back to ISO date on environments without Intl.
 */
export function formatDateHuman(d) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
