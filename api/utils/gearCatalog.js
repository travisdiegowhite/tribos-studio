/**
 * Gear Catalog — the parts inventory reference.
 *
 * One module answers three questions for every part we track on a bike:
 *   1. What is it, and where on the bike does it live?          (taxonomy)
 *   2. How does it wear, and what multiplies that wear?          (wear model)
 *   3. What can a photo tell us, and what must the rider tell us? (capture)
 *
 * It is the single source of truth for the vision extraction schema
 * (api/gear-vision.js), the coach's gear tool, the check-in copy, and the
 * component picker in the UI. `gearDefaults.js` keeps its exports for existing
 * callers but reads its thresholds from here.
 *
 * Units: every distance is METERS, per the T1.1 unit contract. Thresholds are
 * authored in miles for readability and converted once at module load.
 */

export const METERS_PER_MILE = 1609.344;
const mi = (n) => Math.round(n * METERS_PER_MILE);

/**
 * How each part's wear is measured.
 *   distance — accrues effective wear from ride distance (× factors below)
 *   time     — ages from installed_date regardless of riding
 *   hours    — accrues from moving time (suspension, dropper)
 *   none     — tracked for identity/specs only (wheels, frame parts)
 */
export const WEAR_MODELS = ['distance', 'time', 'hours', 'none'];

/**
 * Ride conditions that multiply distance wear. A ride is bucketed by the wear
 * rollforward into exactly one surface (road / offroad / indoor) and a wet
 * flag from activity_conditions. Factors are rules of thumb, not measurements,
 * and are meant to be tuned per part — the point is that wet gravel miles stop
 * being invisible.
 *
 * factor keys: road, offroad, indoor, wet (wet multiplies on top of surface).
 */

/**
 * @typedef {object} CatalogPart
 * @property {string}   type          stable id, matches gear_components.component_type
 * @property {string}   label         rider-facing name
 * @property {string}   group         drivetrain | wheels_tires | brakes | cockpit | bearings | suspension | electronics | frame
 * @property {string[]} bikeTypes     which bike categories this part applies to
 * @property {string}   wearModel     see WEAR_MODELS
 * @property {number|null} warningMeters
 * @property {number|null} replaceMeters
 * @property {number|null} serviceMonths     for time-based parts
 * @property {number|null} serviceHours      for hours-based parts
 * @property {{road:number, offroad:number, indoor:number, wet:number}|null} wearFactors
 * @property {object}   metadataSchema      fields we store in gear_components.metadata
 * @property {string[]} photoReadable       metadata/identity fields vision can usually read
 * @property {string[]} riderSupplied       fields only the rider knows
 * @property {string}   photoHint           which shot shows this part best
 * @property {string[]} commonBrands        hints for the vision prompt and pickers
 * @property {string}   whyItMatters        one plain sentence for the UI/coach
 */

/** @type {CatalogPart[]} */
export const CATALOG_PARTS = [
  // ── Drivetrain ─────────────────────────────────────────────────────────
  {
    type: 'chain',
    label: 'Chain',
    group: 'drivetrain',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(1200),
    replaceMeters: mi(1500),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.6, indoor: 0.8, wet: 2.0 },
    metadataSchema: {
      speeds: { type: 'integer', label: 'Speeds', options: [8, 9, 10, 11, 12, 13] },
      wax: { type: 'boolean', label: 'Waxed chain' },
    },
    photoReadable: ['speeds', 'brand'],
    riderSupplied: ['installed_date', 'wax'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'KMC', 'Campagnolo', 'YBN', 'Wippermann'],
    whyItMatters: 'A stretched chain chews through the cassette and chainrings, which cost far more.',
  },
  {
    type: 'cassette',
    label: 'Cassette',
    group: 'drivetrain',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(2400),
    replaceMeters: mi(3000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.4, indoor: 0.8, wet: 1.5 },
    metadataSchema: {
      speeds: { type: 'integer', label: 'Speeds', options: [8, 9, 10, 11, 12, 13] },
      range: { type: 'string', label: 'Range', placeholder: '11-34' },
    },
    photoReadable: ['speeds', 'range', 'brand'],
    riderSupplied: ['installed_date'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'Campagnolo', 'SunRace', 'Garbaruk'],
    whyItMatters: 'Usually lasts two or three chains if the chains are replaced on time.',
  },
  {
    type: 'chainrings',
    label: 'Chainrings',
    group: 'drivetrain',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(6000),
    replaceMeters: mi(8000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.3, indoor: 0.8, wet: 1.3 },
    metadataSchema: {
      teeth: { type: 'string', label: 'Teeth', placeholder: '50/34 or 40' },
      setup: { type: 'string', label: 'Setup', options: ['1x', '2x', '3x'] },
    },
    photoReadable: ['setup', 'teeth', 'brand'],
    riderSupplied: ['installed_date'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'Campagnolo', 'Wolf Tooth', 'absoluteBLACK', 'Rotor'],
    whyItMatters: 'Shark-fin teeth mean the ring is done and will skip under load.',
  },
  {
    type: 'derailleur_pulleys',
    label: 'Derailleur pulleys',
    group: 'drivetrain',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(8000),
    replaceMeters: mi(10000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.5, indoor: 0.8, wet: 1.5 },
    metadataSchema: {},
    photoReadable: [],
    riderSupplied: ['installed_date'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'CeramicSpeed', 'Kogel'],
    whyItMatters: 'Worn pulleys add drag and noise; cheap to replace, easy to forget.',
  },
  {
    type: 'bottom_bracket',
    label: 'Bottom bracket',
    group: 'bearings',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(8000),
    replaceMeters: mi(10000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.6, indoor: 0.9, wet: 2.0 },
    metadataSchema: {
      standard: { type: 'string', label: 'Standard', options: ['BSA', 'T47', 'BB30', 'PF30', 'BB86/92', 'BBright', 'other'] },
    },
    photoReadable: [],
    riderSupplied: ['standard', 'installed_date'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'Wheels Manufacturing', 'Chris King', 'Hope', 'CeramicSpeed'],
    whyItMatters: 'Creaking under power is usually this; wet miles kill the bearings.',
  },

  // ── Wheels & tires ─────────────────────────────────────────────────────
  {
    type: 'tires_road',
    label: 'Tires (road)',
    group: 'wheels_tires',
    bikeTypes: ['road', 'tt', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(2000),
    replaceMeters: mi(2500),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.8, indoor: 0.0, wet: 1.1 },
    metadataSchema: {
      width_mm: { type: 'integer', label: 'Width (mm)', min: 18, max: 40 },
      tubeless: { type: 'boolean', label: 'Tubeless' },
      max_pressure_psi: { type: 'integer', label: 'Max pressure (psi)' },
      position: { type: 'string', label: 'Position', options: ['front', 'rear', 'pair'] },
    },
    photoReadable: ['width_mm', 'tubeless', 'max_pressure_psi', 'brand', 'model'],
    riderSupplied: ['installed_date'],
    photoHint: 'front_wheel',
    commonBrands: ['Continental', 'Vittoria', 'Pirelli', 'Schwalbe', 'Michelin', 'Specialized', 'Goodyear', 'Panaracer'],
    whyItMatters: 'The rear squares off first; a worn tire flats more and grips less in the wet.',
  },
  {
    type: 'tires_gravel',
    label: 'Tires (gravel / MTB)',
    group: 'wheels_tires',
    bikeTypes: ['gravel', 'mtb'],
    wearModel: 'distance',
    warningMeters: mi(1200),
    replaceMeters: mi(1500),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.2, offroad: 1.0, indoor: 0.0, wet: 1.1 },
    metadataSchema: {
      width_mm: { type: 'integer', label: 'Width (mm)', min: 32, max: 80 },
      tubeless: { type: 'boolean', label: 'Tubeless' },
      max_pressure_psi: { type: 'integer', label: 'Max pressure (psi)' },
      position: { type: 'string', label: 'Position', options: ['front', 'rear', 'pair'] },
    },
    photoReadable: ['width_mm', 'tubeless', 'max_pressure_psi', 'brand', 'model'],
    riderSupplied: ['installed_date'],
    photoHint: 'front_wheel',
    commonBrands: ['Panaracer', 'WTB', 'Maxxis', 'Schwalbe', 'Pirelli', 'Continental', 'Vittoria', 'Teravail', 'Rene Herse'],
    whyItMatters: 'Knobs round off on pavement; a gravel tire ridden on road wears faster, not slower.',
  },
  {
    type: 'sealant',
    label: 'Tubeless sealant',
    group: 'wheels_tires',
    bikeTypes: ['road', 'gravel', 'mtb', 'commuter'],
    wearModel: 'time',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 4,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {},
    photoReadable: [],
    riderSupplied: ['installed_date'],
    photoHint: null,
    commonBrands: ['Stan\'s', 'Orange Seal', 'Muc-Off', 'Silca', 'Peaty\'s'],
    whyItMatters: 'Dries out in three to six months, faster in heat. A dry tire seals nothing.',
  },
  {
    type: 'wheels_road',
    label: 'Wheels (road)',
    group: 'wheels_tires',
    bikeTypes: ['road', 'tt', 'commuter'],
    wearModel: 'none',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: null,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {
      rim_width_mm: { type: 'integer', label: 'Internal rim width (mm)', min: 15, max: 30 },
      hookless: { type: 'boolean', label: 'Hookless' },
      depth_mm: { type: 'integer', label: 'Rim depth (mm)' },
      material: { type: 'string', label: 'Material', options: ['carbon', 'alloy'] },
    },
    photoReadable: ['brand', 'model', 'depth_mm', 'material'],
    riderSupplied: ['rim_width_mm', 'hookless'],
    photoHint: 'whole_bike',
    commonBrands: ['Zipp', 'Roval', 'ENVE', 'DT Swiss', 'Shimano', 'Mavic', 'Hunt', 'Reserve', 'Bontrager', 'Campagnolo', 'Fulcrum'],
    whyItMatters: 'Rim width and hookless decide safe tire pressure.',
  },
  {
    type: 'wheels_gravel',
    label: 'Wheels (gravel / MTB)',
    group: 'wheels_tires',
    bikeTypes: ['gravel', 'mtb'],
    wearModel: 'none',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: null,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {
      rim_width_mm: { type: 'integer', label: 'Internal rim width (mm)', min: 19, max: 40 },
      hookless: { type: 'boolean', label: 'Hookless' },
      material: { type: 'string', label: 'Material', options: ['carbon', 'alloy'] },
    },
    photoReadable: ['brand', 'model', 'material'],
    riderSupplied: ['rim_width_mm', 'hookless'],
    photoHint: 'whole_bike',
    commonBrands: ['DT Swiss', 'Zipp', 'ENVE', 'Reserve', 'Hunt', 'Roval', 'Stan\'s', 'Industry Nine', 'WTB'],
    whyItMatters: 'Rim width and hookless decide safe tire pressure.',
  },
  {
    type: 'hub_bearings',
    label: 'Hub bearings',
    group: 'bearings',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(8000),
    replaceMeters: mi(12000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.6, indoor: 0.5, wet: 2.0 },
    metadataSchema: {},
    photoReadable: [],
    riderSupplied: ['installed_date'],
    photoHint: null,
    commonBrands: [],
    whyItMatters: 'Grinding or play at the axle; wet miles are what wear them.',
  },

  // ── Brakes ─────────────────────────────────────────────────────────────
  {
    type: 'brake_pads_disc',
    label: 'Brake pads (disc)',
    group: 'brakes',
    bikeTypes: ['road', 'gravel', 'mtb', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(1600),
    replaceMeters: mi(2000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.5, indoor: 0.0, wet: 1.6 },
    metadataSchema: {
      compound: { type: 'string', label: 'Compound', options: ['resin', 'sintered', 'semi-metallic'] },
      position: { type: 'string', label: 'Position', options: ['front', 'rear', 'pair'] },
    },
    photoReadable: [],
    riderSupplied: ['compound', 'installed_date'],
    photoHint: 'front_wheel',
    commonBrands: ['Shimano', 'SRAM', 'SwissStop', 'Galfer', 'Kool-Stop', 'Jagwire'],
    whyItMatters: 'Wet grit is sandpaper; pads can go from fine to metal-on-metal in one rainy week.',
  },
  {
    type: 'brake_pads_rim',
    label: 'Brake pads (rim)',
    group: 'brakes',
    bikeTypes: ['road', 'tt', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(1200),
    replaceMeters: mi(1500),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 2.0, indoor: 0.0, wet: 2.5 },
    metadataSchema: {
      rim_material: { type: 'string', label: 'For', options: ['alloy', 'carbon'] },
    },
    photoReadable: [],
    riderSupplied: ['rim_material', 'installed_date'],
    photoHint: 'front_wheel',
    commonBrands: ['SwissStop', 'Shimano', 'Kool-Stop', 'Campagnolo'],
    whyItMatters: 'Wet rims eat pads; carbon rims need carbon-specific pads.',
  },
  {
    type: 'brake_rotors',
    label: 'Brake rotors',
    group: 'brakes',
    bikeTypes: ['road', 'gravel', 'mtb', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(6000),
    replaceMeters: mi(8000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.4, indoor: 0.0, wet: 1.5 },
    metadataSchema: {
      diameter_mm: { type: 'integer', label: 'Diameter (mm)', options: [140, 160, 180, 200, 203, 220] },
      mount: { type: 'string', label: 'Mount', options: ['centerlock', '6-bolt'] },
    },
    photoReadable: ['diameter_mm', 'mount', 'brand'],
    riderSupplied: ['installed_date'],
    photoHint: 'front_wheel',
    commonBrands: ['Shimano', 'SRAM', 'Galfer', 'Hope', 'Magura'],
    whyItMatters: 'Rotors have a minimum thickness stamped on them; below it they can crack.',
  },
  {
    type: 'brake_fluid',
    label: 'Brake fluid / bleed',
    group: 'brakes',
    bikeTypes: ['road', 'gravel', 'mtb', 'commuter'],
    wearModel: 'time',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 18,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {
      fluid: { type: 'string', label: 'Fluid', options: ['mineral', 'DOT'] },
    },
    photoReadable: [],
    riderSupplied: ['fluid', 'installed_date'],
    photoHint: null,
    commonBrands: [],
    whyItMatters: 'A spongy lever means a bleed is due; DOT fluid absorbs water and needs it sooner.',
  },

  // ── Cockpit ────────────────────────────────────────────────────────────
  {
    type: 'bar_tape',
    label: 'Bar tape',
    group: 'cockpit',
    bikeTypes: ['road', 'gravel', 'tt', 'commuter'],
    wearModel: 'time',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 12,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {},
    photoReadable: ['brand'],
    riderSupplied: ['installed_date'],
    photoHint: 'whole_bike',
    commonBrands: ['Supacaz', 'Lizard Skins', 'Fizik', 'Specialized', 'Silca', 'Cinelli'],
    whyItMatters: 'Cheap, and the thing you touch for every hour on the bike.',
  },
  {
    type: 'cables',
    label: 'Cables / housing',
    group: 'cockpit',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(2400),
    replaceMeters: mi(3000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.4, indoor: 0.5, wet: 1.8 },
    metadataSchema: {},
    photoReadable: [],
    riderSupplied: ['installed_date'],
    photoHint: null,
    commonBrands: ['Shimano', 'Jagwire', 'SRAM', 'Campagnolo'],
    whyItMatters: 'Sluggish shifting on a mechanical bike is almost always the cables, not the derailleur.',
  },
  {
    type: 'saddle',
    label: 'Saddle',
    group: 'cockpit',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'none',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: null,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {
      width_mm: { type: 'integer', label: 'Width (mm)' },
    },
    photoReadable: ['brand', 'model'],
    riderSupplied: ['width_mm'],
    photoHint: 'whole_bike',
    commonBrands: ['Specialized', 'Fizik', 'Selle Italia', 'Prologo', 'Ergon', 'WTB', 'Brooks', 'SQlab'],
    whyItMatters: 'Tracked for fit and identity, not wear.',
  },
  {
    type: 'pedals_cleats',
    label: 'Pedals / cleats',
    group: 'cockpit',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter', 'trainer'],
    wearModel: 'distance',
    warningMeters: mi(2500),
    replaceMeters: mi(3500),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.5, indoor: 1.0, wet: 1.2 },
    metadataSchema: {
      system: { type: 'string', label: 'System', options: ['SPD-SL', 'SPD', 'Look Keo', 'Speedplay', 'Time', 'Crankbrothers', 'flat'] },
    },
    photoReadable: ['system', 'brand'],
    riderSupplied: ['installed_date'],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'Look', 'Wahoo Speedplay', 'Time', 'Crankbrothers', 'Favero', 'Garmin'],
    whyItMatters: 'Worn cleats release unpredictably, which is how people fall over at lights.',
  },

  // ── Bearings & headset ─────────────────────────────────────────────────
  {
    type: 'headset',
    label: 'Headset bearings',
    group: 'bearings',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt', 'commuter'],
    wearModel: 'distance',
    warningMeters: mi(8000),
    replaceMeters: mi(12000),
    serviceMonths: null,
    serviceHours: null,
    wearFactors: { road: 1.0, offroad: 1.5, indoor: 0.2, wet: 2.5 },
    metadataSchema: {},
    photoReadable: [],
    riderSupplied: ['installed_date'],
    photoHint: null,
    commonBrands: ['Cane Creek', 'Chris King', 'FSA', 'Acros'],
    whyItMatters: 'Sweat and rain run straight into it; notchy steering means it is already rusted.',
  },

  // ── Suspension (MTB / gravel) ──────────────────────────────────────────
  {
    type: 'fork_service',
    label: 'Fork service',
    group: 'suspension',
    bikeTypes: ['mtb', 'gravel'],
    wearModel: 'hours',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 12,
    serviceHours: 50,
    wearFactors: null,
    metadataSchema: {
      travel_mm: { type: 'integer', label: 'Travel (mm)' },
    },
    photoReadable: ['brand', 'model', 'travel_mm'],
    riderSupplied: ['installed_date'],
    photoHint: 'whole_bike',
    commonBrands: ['RockShox', 'Fox', 'Manitou', 'Öhlins', 'DVO', 'Lauf'],
    whyItMatters: 'Lowers service every ~50 hours keeps the seals alive; full damper service yearly.',
  },
  {
    type: 'shock_service',
    label: 'Shock service',
    group: 'suspension',
    bikeTypes: ['mtb'],
    wearModel: 'hours',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 12,
    serviceHours: 50,
    wearFactors: null,
    metadataSchema: {},
    photoReadable: ['brand', 'model'],
    riderSupplied: ['installed_date'],
    photoHint: 'whole_bike',
    commonBrands: ['RockShox', 'Fox', 'Öhlins', 'DVO', 'Cane Creek'],
    whyItMatters: 'Air can service every ~50 hours; a full service yearly.',
  },
  {
    type: 'dropper_post',
    label: 'Dropper post',
    group: 'suspension',
    bikeTypes: ['mtb', 'gravel'],
    wearModel: 'hours',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: 12,
    serviceHours: 100,
    wearFactors: null,
    metadataSchema: {
      travel_mm: { type: 'integer', label: 'Travel (mm)' },
    },
    photoReadable: ['brand', 'travel_mm'],
    riderSupplied: ['installed_date'],
    photoHint: 'whole_bike',
    commonBrands: ['RockShox', 'Fox', 'OneUp', 'PNW', 'Bike Yoke', 'KS'],
    whyItMatters: 'Slow return or sag under weight means a service.',
  },

  // ── Electronics ────────────────────────────────────────────────────────
  {
    type: 'shifter_battery',
    label: 'Electronic shifting battery',
    group: 'electronics',
    bikeTypes: ['road', 'gravel', 'mtb', 'tt'],
    wearModel: 'none',
    warningMeters: null,
    replaceMeters: null,
    serviceMonths: null,
    serviceHours: null,
    wearFactors: null,
    metadataSchema: {
      system: { type: 'string', label: 'System', options: ['Di2', 'AXS', 'EPS', 'other'] },
    },
    photoReadable: ['system'],
    riderSupplied: [],
    photoHint: 'drivetrain',
    commonBrands: ['Shimano', 'SRAM', 'Campagnolo'],
    whyItMatters: 'Known so the coach can remind you to charge before a long day.',
  },
];

/** Bike categories the catalogue understands. Mirrors gear_items.category. */
export const BIKE_CATEGORIES = [
  { value: 'road', label: 'Road' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'mtb', label: 'Mountain' },
  { value: 'tt', label: 'TT / triathlon' },
  { value: 'commuter', label: 'Commuter / city' },
  { value: 'trainer', label: 'Trainer-only' },
  { value: 'other', label: 'Other' },
];

/** Groups in display order. */
export const PART_GROUPS = [
  { value: 'drivetrain', label: 'Drivetrain' },
  { value: 'wheels_tires', label: 'Wheels & tires' },
  { value: 'brakes', label: 'Brakes' },
  { value: 'cockpit', label: 'Cockpit & contact points' },
  { value: 'bearings', label: 'Bearings' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'electronics', label: 'Electronics' },
];

/** The three guided shots and what each is for. */
export const PHOTO_SHOTS = [
  {
    id: 'whole_bike',
    label: 'Whole bike',
    instruction: 'Drive side, whole bike in frame, in daylight if you can.',
    reads: 'frame, wheels, saddle, bar tape, suspension, brake type',
    required: true,
  },
  {
    id: 'drivetrain',
    label: 'Drivetrain',
    instruction: 'Close on the cassette, chain and rear derailleur.',
    reads: 'speeds, cassette range, chain, chainrings, pedals, electronic shifting',
    required: false,
  },
  {
    id: 'front_wheel',
    label: 'Front wheel and tire',
    instruction: 'Close enough to read the writing on the tire sidewall.',
    reads: 'tire brand, model, width, tubeless, rotor size',
    required: false,
  },
];

// ── Lookups ────────────────────────────────────────────────────────────

const BY_TYPE = new Map(CATALOG_PARTS.map((p) => [p.type, p]));

/** @param {string} type */
export function getCatalogPart(type) {
  return BY_TYPE.get(type) || null;
}

/** All part types as a plain array (used by schema enums and pickers). */
export const COMPONENT_TYPE_IDS = CATALOG_PARTS.map((p) => p.type);

/** Parts that apply to a bike category, in catalogue order. */
export function partsForBikeType(category) {
  if (!category) return CATALOG_PARTS;
  return CATALOG_PARTS.filter((p) => p.bikeTypes.includes(category));
}

/**
 * Default thresholds for a component type, in the shape gearDefaults.js has
 * always exported: { warning, replace } meters, nulls for non-distance parts.
 */
export function getCatalogThresholds(type) {
  const part = BY_TYPE.get(type);
  if (!part) return { warning: null, replace: null };
  return { warning: part.warningMeters, replace: part.replaceMeters };
}

/**
 * Effective wear for one ride on one part.
 *
 * @param {string} type        component_type
 * @param {number} distanceM   ride distance in meters
 * @param {{surface:'road'|'offroad'|'indoor', wet:boolean}} conditions
 * @returns {number} weighted meters (0 for parts that don't wear by distance)
 */
export function effectiveWearMeters(type, distanceM, conditions) {
  const part = BY_TYPE.get(type);
  if (!part || part.wearModel !== 'distance' || !part.wearFactors) return 0;
  if (!Number.isFinite(distanceM) || distanceM <= 0) return 0;
  const surface = conditions?.surface || 'road';
  const surfaceFactor = part.wearFactors[surface] ?? 1.0;
  const wetFactor = conditions?.wet ? part.wearFactors.wet : 1.0;
  return distanceM * surfaceFactor * wetFactor;
}

/**
 * Which surface bucket a ride falls into for the wear model.
 * Rider overrides (activity_gear.surface_override) win; then the ride's own
 * type; then the bike's category; then road.
 */
export function classifyRideSurface({ surfaceOverride, activityType, trainer, bikeCategory }) {
  if (surfaceOverride === 'indoor') return 'indoor';
  if (surfaceOverride === 'gravel' || surfaceOverride === 'mtb') return 'offroad';
  if (surfaceOverride === 'road') return 'road';
  if (trainer || activityType === 'VirtualRide') return 'indoor';
  if (activityType === 'GravelRide' || activityType === 'MountainBikeRide') return 'offroad';
  if (bikeCategory === 'trainer') return 'indoor';
  if (bikeCategory === 'gravel' || bikeCategory === 'mtb') return 'offroad';
  return 'road';
}
