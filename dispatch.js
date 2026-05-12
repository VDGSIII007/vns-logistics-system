/* ═══════════════════════════════════════════════════════════════════
   VNS DISPATCH MODULE — dispatch.js
   ---------------------------------------------------------------
   Apps Script connection: set DISPATCH_APP_SCRIPT_URL to a deployed
   doGet/doPost Web App URL to enable live data.
   Falls back to localStorage when URL is empty or fetch fails.
═══════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────
   APPS SCRIPT CONNECTION
────────────────────────────────────────── */
const DISPATCH_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwkA_gMbqPvtW3kEDsCKAkgylrakQwRHlPNPYENT2GYvjH1AGAsmusUuPUvWrB_KakH/exec";
const VNS_SYNC_KEY = "vns-dispatch-sync-2026-Jay";

/*
  Expected doGet actions:
    ?action=getDispatchDashboard
    ?action=getDispatchTrucks
    ?action=getDispatchTrips
    ?action=getDispatchLogs
    ?action=getTruckLocations

  Expected doPost actions (payload.action):
    saveDispatchTrip
    batchSaveDispatchTrips
    markDelivered
    addToLogs
    ensureTabs
    health
*/

/* ──────────────────────────────────────────
   STORAGE KEYS
────────────────────────────────────────── */
const LS_TRIPS    = 'vnsDispatchTrips';
const LS_LOGS     = 'vnsDispatchLogs';
const LS_TRUCKS   = 'vnsDispatchTruckMaster';
const LS_ACTIVITY = 'vnsDispatchActivity';
const LS_GEOFENCES_VISIBLE = 'vnsDispatchGeofencesVisible';

/* ──────────────────────────────────────────
   CONSTANTS
────────────────────────────────────────── */
const COMMODITIES = ['Bottles', 'Sugar', 'Preform', 'Resin', 'Caps', 'Crowns'];

const COMMODITY_META = {
  Bottles: { cls: 'bottles', icon: '🍼', color: '#2563eb' },
  Sugar:   { cls: 'sugar',   icon: '🍬', color: '#d97706' },
  Preform: { cls: 'preform', icon: '🏗️', color: '#7c3aed' },
  Resin:   { cls: 'resin',   icon: '🧪', color: '#059669' },
  Caps:    { cls: 'caps',    icon: '🔩', color: '#ea580c' },
  Crowns:  { cls: 'crowns',  icon: '👑', color: '#db2777' },
};

const STATUS_BADGE = {
  'Scheduled':  'badge-scheduled',
  'In Transit': 'badge-intransit',
  'Loaded':     'badge-loaded',
  'Unloaded':   'badge-unloaded',
  'Delivered':  'badge-delivered',
  'Cancelled':  'badge-cancelled',
  'On Hold':    'badge-onhold',
  'At Garage':  'badge-at-garage',
};

const DISPATCH_GROUPS = ['Bottle', 'Sugar', 'Preform / Resin', 'Caps / Crown', 'All'];

// Demo geofences removed — real geofences come from raw.geofences in the API response.

/* ──────────────────────────────────────────
   DATA MODELS (used for Apps Script mapping)

   Truck object:
   { id, plateNumber, driverName, helperName, status, commodity,
     source, destination, latitude, longitude, lastUpdated }

   Trip object:
   { id, plateNumber, driverName, helperName, commodity, source,
     destination, status, dateAssigned, deliveredAt, remarks,
     bookingDate, planPickup, actualPickup, lsp, supplier,
     packaging, qty, refNumber, shipmentNumber, atw, eta,
     truckType, latitude, longitude, lastUpdated, timestamp }

   Log object:
   { id, date, time, plateNumber, action, status, remarks,
     commodity, source, destination, loggedAt }
────────────────────────────────────────── */

/* ──────────────────────────────────────────
   MAP STATE
────────────────────────────────────────── */
let dispatchMap           = null;
let dispatchMarkers       = [];
let dispatchGeofenceLayer = null;
let dispatchGeofencesVisible = localStorage.getItem(LS_GEOFENCES_VISIBLE) !== 'false';
let dispatchLiveGeofences = [];
let selectedDispatchGroup = 'Bottle';
let sheetGroupBy          = 'None';
let selectedDispatchCells = new Set();
let dispatchSheetSelection = null;
let isSelectingDispatchRange = false;
let dispatchUndoStack = [];
let dispatchRedoStack = [];
let dispatchHistoryBatch = null;
let isApplyingDispatchHistory = false;
let dispatchSyncTimer = null;
let dispatchLastSyncError = '';

const DISPATCH_STATUS_OPTIONS = ['Scheduled','Needs Dispatch','At Garage','Inactive / No Trip','In Transit','Loaded','Unloaded','Delivered','On Hold','Cancelled'];
const DISPATCH_EDITABLE_FIELDS = ['driver','helper','source','destination','status','bookingDate','planPickup','actualPickup','lsp','supplier','packaging','qty','refNumber','shipmentNumber','atw','eta','remarks','materialCode','materialDescription','poReference','drInvoice','sto','doNumber','palletQty','typeOfPallet','truckType'];

const DISPATCH_BASE_COLUMNS = [
  { key: 'select', label: '', kind: 'select', always: true },
  { key: 'plate', label: 'Plate', readOnly: true, always: true },
  { key: 'driver', label: 'Driver', editable: true, always: true },
  { key: 'helper', label: 'Helper', editable: true, always: true },
  { key: 'source', label: 'Source', editable: true, always: true },
  { key: 'destination', label: 'Destination', editable: true, always: true },
  { key: 'location', label: 'Location', readOnly: true, always: true },
  { key: 'status', label: 'Status', editable: true, always: true },
  { key: 'bookingDate', label: 'Booking Date', editable: true, dateLike: true, always: true },
  { key: 'planPickup', label: 'Plan Pickup', editable: true, dateLike: true, always: true },
  { key: 'actualPickup', label: 'Actual Pickup', editable: true, dateLike: true, always: true },
  { key: 'lsp', label: 'LSP', editable: true, always: true },
  { key: 'supplier', label: 'Supplier', editable: true, always: true },
  { key: 'packaging', label: 'Packaging', editable: true, always: true },
  { key: 'qty', label: 'Qty', editable: true, always: true },
  { key: 'refNumber', label: 'Ref #', editable: true, always: true },
  { key: 'shipmentNumber', label: 'Shipment #', editable: true, always: true },
  { key: 'atw', label: 'ATW', editable: true, always: true },
  { key: 'eta', label: 'ETA', editable: true, dateLike: true, always: true },
  { key: 'remarks', label: 'Remarks', editable: true, always: true },
  { key: 'gpsTimestamp', label: 'GPS Timestamp', readOnly: true, always: true },
  { key: 'actions', label: 'Actions', kind: 'actions', always: true },
];

const DISPATCH_EXTRA_COLUMNS = [
  { key: 'materialCode', label: 'Material Code', editable: true },
  { key: 'materialDescription', label: 'Material Description', editable: true },
  { key: 'poReference', label: 'PO Reference', editable: true },
  { key: 'drInvoice', label: 'DR / Invoice', editable: true },
  { key: 'sto', label: 'STO', editable: true },
  { key: 'doNumber', label: 'DO', editable: true },
  { key: 'palletQty', label: 'Pallet Qty', editable: true },
  { key: 'typeOfPallet', label: 'Type of Pallet', editable: true },
  { key: 'truckType', label: 'Truck Type', editable: true },
];

/* ══════════════════════════════════════════════════════
   APPS SCRIPT FETCH FUNCTIONS
   Each function falls back to local data on failure.
══════════════════════════════════════════════════════ */

async function fetchDispatchDashboardData() {
  if (!DISPATCH_APP_SCRIPT_URL) return buildLocalDashboardData();
  try {
    const res  = await fetch(`${DISPATCH_APP_SCRIPT_URL}?action=getDispatchDashboard`);
    const data = await res.json();
    if (data.ok === false) throw new Error(data.error || 'API returned ok: false');
    return data;
  } catch (err) {
    console.warn('[VNS Dispatch] fetchDispatchDashboardData failed, using local data:', err.message);
    return buildLocalDashboardData();
  }
}

async function fetchDispatchTrucks() {
  if (!DISPATCH_APP_SCRIPT_URL) return loadTrucks();
  try {
    const res  = await fetch(`${DISPATCH_APP_SCRIPT_URL}?action=getDispatchTrucks`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.trucks || [];
  } catch (err) {
    console.warn('[VNS Dispatch] fetchDispatchTrucks failed:', err.message);
    return loadTrucks();
  }
}

async function fetchDispatchTrips() {
  if (!DISPATCH_APP_SCRIPT_URL) return loadTrips();
  try {
    const res  = await fetch(`${DISPATCH_APP_SCRIPT_URL}?action=getDispatchTrips`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.trips || [];
  } catch (err) {
    console.warn('[VNS Dispatch] fetchDispatchTrips failed:', err.message);
    return loadTrips();
  }
}

async function fetchDispatchLogs() {
  if (!DISPATCH_APP_SCRIPT_URL) return loadLogs();
  try {
    const res  = await fetch(`${DISPATCH_APP_SCRIPT_URL}?action=getDispatchLogs`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.logs || [];
  } catch (err) {
    console.warn('[VNS Dispatch] fetchDispatchLogs failed:', err.message);
    return loadLogs();
  }
}

async function fetchTruckLocations() {
  if (!DISPATCH_APP_SCRIPT_URL) return [];
  try {
    const res  = await fetch(`${DISPATCH_APP_SCRIPT_URL}?action=getTruckLocations`);
    const data = await res.json();
    if (data && data.error) throw new Error(data.error);
    return data.locations || [];
  } catch (err) {
    console.warn('[VNS Dispatch] fetchTruckLocations failed:', err.message);
    return [];
  }
}

async function postDispatchUpdate(payload) {
  if (!DISPATCH_APP_SCRIPT_URL) {
    return { success: false, message: 'No Apps Script URL configured.' };
  }
  try {
    const res  = await fetch(DISPATCH_APP_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.warn('[VNS Dispatch] postDispatchUpdate failed:', err.message);
    return { success: false, message: err.message };
  }
}

/* ══════════════════════════════════════════════════════
   LOCAL DATA STORE
══════════════════════════════════════════════════════ */

function isDispatchGoogleSyncConfigured() {
  return Boolean(DISPATCH_APP_SCRIPT_URL && VNS_SYNC_KEY);
}

function setDispatchSyncStatus(state, detail = '') {
  const label = {
    local: 'Local only',
    syncing: 'Saving...',
    synced: 'Saved to Google Sheets',
    failed: 'Save failed',
  }[state] || state;
  const el = document.getElementById('dispatch-sync-status');
  if (el) {
    el.textContent = detail ? `${label}: ${detail}` : label;
    el.className = `dispatch-sync-status sync-${state}`;
  }
  if (state === 'failed' && detail) toast(`Google Sheets save failed: ${detail}`, '#d97706');
}

async function dispatchSheetsRequest(payload, method = 'POST') {
  if (!isDispatchGoogleSyncConfigured()) {
    setDispatchSyncStatus('local');
    return { ok: false, localOnly: true, error: 'Google Sheets save is not configured.' };
  }
  const url = method === 'GET'
    ? `${DISPATCH_APP_SCRIPT_URL}?${new URLSearchParams({ ...payload, syncKey: VNS_SYNC_KEY }).toString()}`
    : DISPATCH_APP_SCRIPT_URL;
  const options = method === 'GET'
    ? { method: 'GET' }
    : {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, syncKey: VNS_SYNC_KEY }),
      };
  const response = await fetch(url, options);
  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

function queueDispatchTripSync(trip, action = 'saveDispatchTrip') {
  if (!trip) return Promise.resolve({ ok: false, error: 'No trip to sync.' });
  const record = dispatchTripToSheetRecord(trip);
  if (!record.Record_ID) return Promise.resolve({ ok: false, error: 'Missing Record_ID.' });
  if (!isDispatchGoogleSyncConfigured()) {
    setDispatchSyncStatus('local');
    return Promise.resolve({ ok: false, localOnly: true });
  }
  setDispatchSyncStatus('syncing');
  return dispatchSheetsRequest({ action, commodity: getDispatchGroup(trip), record })
    .then(result => {
      setDispatchSyncStatus('synced');
      return result;
    })
    .catch(error => {
      dispatchLastSyncError = error.message;
      setDispatchSyncStatus('failed', error.message);
      return { ok: false, error: error.message };
    });
}

function queueDispatchTripsSync(trips) {
  const records = (trips || []).map(trip => dispatchTripToSheetRecord(trip)).filter(record => record.Record_ID);
  if (!records.length) return Promise.resolve({ ok: true, skipped: true });
  if (!isDispatchGoogleSyncConfigured()) {
    setDispatchSyncStatus('local');
    return Promise.resolve({ ok: false, localOnly: true });
  }
  setDispatchSyncStatus('syncing');
  return dispatchSheetsRequest({ action: 'batchSaveDispatchTrips', records })
    .then(result => {
      setDispatchSyncStatus('synced');
      return result;
    })
    .catch(error => {
      dispatchLastSyncError = error.message;
      setDispatchSyncStatus('failed', error.message);
      return { ok: false, error: error.message };
    });
}

function debounceDispatchTripSync(id) {
  window.clearTimeout(dispatchSyncTimer);
  dispatchSyncTimer = window.setTimeout(() => {
    const trip = loadTrips().find(t => t.id === id);
    if (trip) queueDispatchTripSync(trip);
  }, 800);
}

async function fetchAndMergeDispatchSheetTrips() {
  if (!isDispatchGoogleSyncConfigured()) {
    setDispatchSyncStatus('local');
    return;
  }
  setDispatchSyncStatus('syncing');
  try {
    const result = await dispatchSheetsRequest({ action: 'getAllTrips' }, 'GET');
    const remoteTrips = Array.isArray(result.data) ? result.data.map(sheetRecordToDispatchTrip) : [];
    if (!remoteTrips.length) {
      setDispatchSyncStatus('synced');
      return;
    }
    const localTrips = loadTrips();
    const byId = new Map(localTrips.map(trip => [trip.recordId || trip.id, trip]));
    remoteTrips.forEach(remoteTrip => {
      const key = remoteTrip.recordId || remoteTrip.id;
      if (!key) return;
      const localTrip = byId.get(key);
      if (!localTrip) {
        byId.set(key, remoteTrip);
        return;
      }
      const localUpdated = Date.parse(localTrip.updatedAt || localTrip.lastUpdated || localTrip.timestamp || '') || 0;
      const remoteUpdated = Date.parse(remoteTrip.updatedAt || remoteTrip.lastUpdated || remoteTrip.timestamp || '') || 0;
      if (remoteUpdated > localUpdated) byId.set(key, { ...localTrip, ...remoteTrip });
    });
    saveTrips(Array.from(byId.values()));
    renderSheet();
    renderDashboardIfActive();
    setDispatchSyncStatus('synced');
  } catch (error) {
    dispatchLastSyncError = error.message;
    setDispatchSyncStatus('failed', error.message);
  }
}

function loadTrips()    { try { return ensureDispatchTripRecordIds(JSON.parse(localStorage.getItem(LS_TRIPS)) || []); } catch { return []; } }
function loadLogs()     { try { return JSON.parse(localStorage.getItem(LS_LOGS))     || []; } catch { return []; } }
function loadTrucks()   { try { return JSON.parse(localStorage.getItem(LS_TRUCKS))   || defaultTrucks(); } catch { return defaultTrucks(); } }
function loadActivity() { try { return JSON.parse(localStorage.getItem(LS_ACTIVITY)) || []; } catch { return []; } }

function saveTrips(d)    { localStorage.setItem(LS_TRIPS,    JSON.stringify(ensureDispatchTripRecordIds(d || []))); }
function saveLogs(d)     { localStorage.setItem(LS_LOGS,     JSON.stringify(d)); }
function saveTrucks(d)   { localStorage.setItem(LS_TRUCKS,   JSON.stringify(d)); }
function saveActivity(d) { localStorage.setItem(LS_ACTIVITY, JSON.stringify(d)); }

function defaultTrucks() {
  return [
    { id: uid(), plate: 'GO-001', driver: '', helper: '', truckType: '10-Wheeler GO', notes: '', latitude: null, longitude: null, lastUpdated: null },
    { id: uid(), plate: 'GO-002', driver: '', helper: '', truckType: '10-Wheeler GO', notes: '', latitude: null, longitude: null, lastUpdated: null },
  ];
}

function buildLocalDashboardData() {
  const trips   = loadTrips();
  const logs    = loadLogs();
  const todayStr = today();
  return {
    activeTrips:    trips.length,
    inTransit:      trips.filter(t => t.status === 'In Transit').length,
    deliveredToday: logs.filter(l => l.loggedAt && l.loggedAt.startsWith(todayStr)).length,
    totalLogs:      logs.length,
    trucks:         loadTrucks(),
    trips,
    recentActivity: loadActivity().slice(0, 15),
  };
}

function logActivity(msg, color = '#2563eb') {
  const acts = loadActivity();
  acts.unshift({ msg, color, time: new Date().toLocaleString('en-PH') });
  saveActivity(acts.slice(0, 50));
}

/* ──────────────────────────────────────────
   LIVE DATA NORMALIZATION
   Maps API field names → local field names.
   Keeps original API fields alongside so map
   popups and truck cards can read either.
────────────────────────────────────────── */

function normalizeCommodity(groupCategory, commodity) {
  const map = {
    'Bottle':          'Bottles',
    'Preform / Resin': 'Preform',
    'Caps / Crown':    'Caps',
  };
  return map[groupCategory] || map[commodity] || commodity || groupCategory || '';
}

function normalizeLiveTruck(t) {
  return {
    // local field names
    id:          t.id            || null,
    plate:       t.plateNumber   || t.plate   || '',
    driver:      t.driverName    || t.driver  || '',
    helper:      t.helperName    || t.helper  || '',
    truckType:   t.truckType     || '',
    notes:       t.notes         || '',
    status:      t.status        || '',
    commodity:   normalizeCommodity(t.groupCategory, t.commodity),
    source:      t.source        || '',
    destination: t.destination   || '',
    latitude:    t.latitude      ?? null,
    longitude:   t.longitude     ?? null,
    lastUpdated: t.lastUpdated   || null,
    // original API fields (kept for map popup)
    plateNumber:      t.plateNumber      || t.plate  || '',
    driverName:       t.driverName       || t.driver || '',
    helperName:       t.helperName       || t.helper || '',
    groupCategory:    t.groupCategory    || '',
    fullAddress:      t.fullAddress      || '',
    mapLink:          t.mapLink          || '',
    imei:             t.imei             || '',
    // geofence fields from GPS API
    geofenceName:     t.geofenceName     || '',
    geofenceCategory: t.geofenceCategory || '',
    isInsideGeofence: t.isInsideGeofence ?? false,
    friendlyLocation: t.friendlyLocation || '',
  };
}

function normalizeLiveTrip(t) {
  const stableIdParts = [
    t.plateNumber || t.plate || '',
    t.dateAssigned || t.bookingDate || '',
    t.source || '',
    t.destination || '',
    t.shipmentNumber || t.refNumber || '',
  ].filter(Boolean);
  return {
    // local field names
    id:             t.id || t.tripId || (stableIdParts.length ? stableIdParts.join('-').replace(/\s+/g, '-') : uid()),
    plate:          t.plateNumber    || t.plate    || '',
    driver:         t.driverName     || t.driver   || '',
    helper:         t.helperName     || t.helper   || '',
    truckType:      t.truckType      || '',
    commodity:      normalizeCommodity(t.groupCategory, t.commodity),
    status:         t.status         || '',
    source:         t.source         || '',
    destination:    t.destination    || '',
    bookingDate:    t.dateAssigned   || t.bookingDate   || '',
    planPickup:     t.planPickup     || '',
    actualPickup:   t.actualPickup   || '',
    eta:            t.etaAta         || t.eta           || '',
    lsp:            t.lsp            || '',
    supplier:       t.supplier       || '',
    packaging:      t.packaging      || '',
    qty:            t.qty            || '',
    refNumber:      t.refNumber      || '',
    shipmentNumber: t.shipmentNumber || '',
    atw:            t.atw            || '',
    remarks:        t.remarks        || '',
    materialCode:   t.materialCode || t.material_code || t['Material Code'] || '',
    materialDescription: t.materialDescription || t.material_description || t['Material Description'] || '',
    poReference:    t.poReference || t.po_reference || t['PO Reference'] || '',
    drInvoice:      t.drInvoice || t.dr_invoice || t['DR / Invoice'] || t.drNo || t.invoiceNo || '',
    sto:            t.sto || t.STO || '',
    doNumber:       t.doNumber || t.do || t.DO || '',
    palletQty:      t.palletQty || t.pallet_qty || t['Pallet Qty'] || '',
    typeOfPallet:   t.typeOfPallet || t.type_of_pallet || t['Type of Pallet'] || '',
    latitude:       t.latitude       ?? null,
    longitude:      t.longitude      ?? null,
    lastUpdated:    t.lastUpdated    || null,
    timestamp:      t.lastUpdated    || t.timestamp || new Date().toLocaleString('en-PH'),
    // original API fields
    plateNumber:      t.plateNumber      || t.plate  || '',
    driverName:       t.driverName       || t.driver || '',
    helperName:       t.helperName       || t.helper || '',
    groupCategory:    t.groupCategory    || '',
    fullAddress:      t.fullAddress      || '',
    mapLink:          t.mapLink          || '',
    etaAta:           t.etaAta           || '',
    dateAssigned:     t.dateAssigned     || '',
    deliveredAt:      t.deliveredAt      || '',
    imei:             t.imei             || '',
    // geofence fields from GPS API
    geofenceName:     t.geofenceName     || '',
    geofenceCategory: t.geofenceCategory || '',
    isInsideGeofence: t.isInsideGeofence ?? false,
    friendlyLocation: t.friendlyLocation || '',
  };
}

function normalizeLiveLog(t) {
  const entry = normalizeLiveTrip(t);
  entry.loggedAt = t.deliveredAt || t.lastUpdated || new Date().toISOString();
  return entry;
}

function mergeLocalDispatchEdits(liveTrips) {
  const localTrips = loadTrips();
  const byId = new Map(localTrips.map(trip => [trip.id, trip]));
  return liveTrips.map(liveTrip => {
    const localTrip = byId.get(liveTrip.id);
    if (!localTrip || !localTrip.updatedAt) return liveTrip;
    const merged = { ...liveTrip };
    DISPATCH_EDITABLE_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(localTrip, field)) {
        merged[field] = localTrip[field];
      }
    });
    merged.updatedAt = localTrip.updatedAt;
    return merged;
  });
}

/* ══════════════════════════════════════════════════════
   GROUP FILTER HELPERS
══════════════════════════════════════════════════════ */

function getDispatchGroup(record) {
  const gc = (record.groupCategory || '').trim();
  if (gc) {
    if (gc === 'Bottle' || gc === 'Bottles') return 'Bottle';
    if (gc === 'Sugar') return 'Sugar';
    if (gc === 'Preform / Resin' || gc === 'Preform' || gc === 'Resin') return 'Preform / Resin';
    if (gc === 'Caps / Crown' || gc === 'Caps' || gc === 'Crowns' || gc === 'Crown') return 'Caps / Crown';
    return gc;
  }
  const c = (record.commodity || '').trim();
  if (c === 'Bottles' || c === 'Bottle') return 'Bottle';
  if (c === 'Sugar') return 'Sugar';
  if (c === 'Preform' || c === 'Resin') return 'Preform / Resin';
  if (c === 'Caps' || c === 'Crowns' || c === 'Crown') return 'Caps / Crown';
  return c;
}

function getSheetCommodityName(recordOrCommodity) {
  const group = typeof recordOrCommodity === 'string'
    ? getDispatchGroup({ commodity: recordOrCommodity, groupCategory: recordOrCommodity })
    : getDispatchGroup(recordOrCommodity || {});
  if (group === 'Bottle') return 'Bottle';
  if (group === 'Sugar') return 'Sugar';
  if (group === 'Preform / Resin') return 'Preform / Resin';
  if (group === 'Caps / Crown') return 'Caps / Crown';
  return group || 'Bottle';
}

function ensureDispatchTripRecordIds(trips) {
  return (trips || []).map(trip => {
    if (!trip) return trip;
    if (trip.recordId) return trip;
    return { ...trip, recordId: createDispatchRecordId(getSheetCommodityName(trip)) };
  });
}

function createDispatchRecordId(commodity) {
  const code = String(commodity || 'TRIP').replace(/[^a-z0-9]/gi, '').toUpperCase() || 'TRIP';
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
  const random = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `VNS-${code}-${stamp}-${random}`;
}

function dispatchTripToSheetRecord(trip) {
  const commodity = getSheetCommodityName(trip);
  const now = new Date().toISOString();
  const recordId = trip.recordId || trip.Record_ID || trip.id || createDispatchRecordId(commodity);
  return {
    Record_ID: recordId,
    Commodity: commodity,
    Group: commodity,
    Plate: trip.plate || trip.plateNumber || '',
    Driver: trip.driver || trip.driverName || '',
    Helper: trip.helper || trip.helperName || '',
    Source: trip.source || '',
    Destination: trip.destination || '',
    Location: getFriendlyLocation(trip),
    Status: trip.status || getTruckOperationalStatus(trip) || '',
    Booking_Date: trip.bookingDate || trip.dateAssigned || '',
    Plan_Pickup: trip.planPickup || '',
    Actual_Pickup: trip.actualPickup || '',
    LSP: trip.lsp || '',
    Supplier: trip.supplier || '',
    Shipment_Number: trip.shipmentNumber || '',
    Container_Number: trip.refNumber || trip.containerNumber || '',
    Pallet_Size: trip.typeOfPallet || trip.packaging || '',
    Loaded: trip.qty || trip.loaded || '',
    Remarks: trip.remarks || '',
    Created_At: trip.createdAt || trip.timestamp || now,
    Updated_At: trip.updatedAt || now,
    Delivered_At: trip.deliveredAt || '',
    Logged_At: trip.loggedAt || '',
  };
}

function sheetRecordToDispatchTrip(record) {
  const commodity = sheetCommodityToDispatchCommodity(record.Commodity || record.Group);
  const recordId = record.Record_ID || createDispatchRecordId(record.Commodity || record.Group);
  return {
    id: recordId,
    recordId,
    plate: record.Plate || '',
    driver: record.Driver || '',
    helper: record.Helper || '',
    truckType: '',
    commodity,
    groupCategory: getSheetCommodityName(record.Commodity || record.Group),
    status: record.Status || 'Scheduled',
    source: record.Source || '',
    destination: record.Destination || '',
    bookingDate: record.Booking_Date || '',
    planPickup: record.Plan_Pickup || '',
    actualPickup: record.Actual_Pickup || '',
    eta: '',
    lsp: record.LSP || '',
    supplier: record.Supplier || '',
    packaging: record.Pallet_Size || '',
    qty: record.Loaded || '',
    refNumber: record.Container_Number || '',
    shipmentNumber: record.Shipment_Number || '',
    atw: '',
    remarks: record.Remarks || '',
    latitude: null,
    longitude: null,
    friendlyLocation: record.Location || '',
    deliveredAt: record.Delivered_At || '',
    loggedAt: record.Logged_At || '',
    createdAt: record.Created_At || '',
    updatedAt: record.Updated_At || '',
    timestamp: record.Created_At || record.Updated_At || new Date().toLocaleString('en-PH'),
  };
}

function sheetCommodityToDispatchCommodity(value) {
  const commodity = getSheetCommodityName(value);
  if (commodity === 'Bottle') return 'Bottles';
  if (commodity === 'Preform / Resin') return 'Preform';
  if (commodity === 'Caps / Crown') return 'Caps';
  return commodity;
}

function filterBySelectedGroup(records) {
  if (selectedDispatchGroup === 'All') return records;
  return records.filter(r => getDispatchGroup(r) === selectedDispatchGroup);
}

function setDispatchGroup(group) {
  selectedDispatchGroup = group;
  document.querySelectorAll('.dg-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.group === group);
  });
  refreshDispatchDashboard();
  renderDispatchGeofences();
  renderSheet();
}

function renderDispatchGroupTabs() {
  const html = DISPATCH_GROUPS.map(g =>
    `<button class="dg-tab-btn${g === selectedDispatchGroup ? ' active' : ''}" data-group="${esc(g)}" onclick="setDispatchGroup('${esc(g)}')">${esc(g)}</button>`
  ).join('');
  document.querySelectorAll('.dispatch-group-tabs').forEach(el => { el.innerHTML = html; });
}

function formatDispatchDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return String(value); }
}

function formatDispatchDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(value.includes('T') ? value : value + 'T00:00:00');
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return String(value); }
}

function getFriendlyLocation(record) {
  // Use API-provided location first; fall back to address-guessing only when absent
  if (record.friendlyLocation) return record.friendlyLocation;
  if (record.geofenceName)     return record.geofenceName;

  const haystack = [
    record.location    || '',
    record.fullAddress || '',
    record.source      || '',
    record.destination || '',
  ].join(' ').toLowerCase();

  if (haystack.includes('majada') || haystack.includes('garage'))                         return 'Majada Garage';
  if (haystack.includes('santa rosa') || haystack.includes('sta. rosa') ||
      haystack.includes('sta rosa'))                                                       return 'Sta Rosa Area';
  if (haystack.includes('manila port') || haystack.includes('north harbor') ||
      haystack.includes('south harbor'))                                                   return 'Manila Port';
  if (haystack.includes('batangas'))                                                       return 'Batangas Area';

  const addr = (record.fullAddress || '').trim();
  if (!addr) return 'Location unavailable';
  return addr.length > 45 ? addr.slice(0, 42) + '...' : addr;
}

function formatFriendlyDateTime(value) {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return String(value);
  }
}

function formatFriendlyDate(value) {
  if (!value) return '—';
  try {
    const d = new Date(String(value).includes('T') ? value : value + 'T00:00:00');
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return String(value);
  }
}

function getTruckOperationalStatus(record) {
  const status = (record.status || '').trim();
  if (status) return status;
  const hasRoute = Boolean((record.source || '').trim() || (record.destination || '').trim());
  if (getFriendlyLocation(record) === 'Majada Garage' && !hasRoute) return 'At Garage';
  return hasRoute ? 'Scheduled' : 'Needs Dispatch';
}

function isGpsOffline(record) {
  if (!record.lastUpdated) return true;
  try {
    const d = new Date(record.lastUpdated);
    if (isNaN(d.getTime())) return true;
    return (Date.now() - d.getTime()) > 24 * 60 * 60 * 1000;
  } catch { return true; }
}

function isAtGarage(record) {
  if (!record) return false;
  // Use API geofenceCategory as primary signal; only text-match when absent
  if (record.geofenceCategory) return record.geofenceCategory === 'Garage';
  const GARAGE_TERMS = ['majada garage', 'majada labas', 'majada', 'garage'];
  const haystack = [
    record.location         || '',
    record.friendlyLocation || '',
    record.fullAddress      || '',
    record.source           || '',
    record.destination      || '',
    record.status           || '',
    getFriendlyLocation(record),
  ].join(' ').toLowerCase();
  return GARAGE_TERMS.some(term => haystack.includes(term));
}

function isForRepair(record) {
  if (!record) return false;
  if (record.repairStatus) return true;
  return /repair/i.test(record.status || '');
}

/* ══════════════════════════════════════════════════════
   DISPATCHER SHEET HELPERS
══════════════════════════════════════════════════════ */

function setSheetGroupBy(val) {
  sheetGroupBy = val;
  renderSheet();
}

function getUniqueDispatchValues(records, field) {
  const seen = new Set();
  const vals = [];
  records.forEach(r => {
    const v = (field === 'location' ? getFriendlyLocation(r) : (field === 'group' ? getDispatchGroup(r) : (r[field] || ''))).trim();
    if (v && !seen.has(v)) { seen.add(v); vals.push(v); }
  });
  return vals.sort();
}

function applyDispatchSheetFilters(records) {
  let trips       = filterBySelectedGroup(records);
  const commodity = document.getElementById('filter-commodity')?.value || '';
  const status    = document.getElementById('filter-status')?.value    || '';
  const truck     = document.getElementById('filter-truck')?.value     || '';
  const src       = document.getElementById('filter-source')?.value    || '';
  const dest      = document.getElementById('filter-dest')?.value      || '';
  const location  = document.getElementById('filter-location')?.value  || '';
  const search    = (document.getElementById('filter-search')?.value   || '').toLowerCase();

  if (commodity) trips = trips.filter(t => getDispatchGroup(t)   === commodity);
  if (status)    trips = trips.filter(t => getTruckOperationalStatus(t) === status);
  if (truck)     trips = trips.filter(t => t.plate               === truck);
  if (src)       trips = trips.filter(t => (t.source      || '') === src);
  if (dest)      trips = trips.filter(t => (t.destination || '') === dest);
  if (location)  trips = trips.filter(t => getFriendlyLocation(t) === location);
  if (search)    trips = trips.filter(t =>
    [t.plate, t.driver, t.helper, t.source, t.destination, getDispatchGroup(t), getFriendlyLocation(t), t.remarks, t.refNumber, t.shipmentNumber]
      .some(v => (v || '').toLowerCase().includes(search))
  );
  return trips;
}

function groupDispatchRows(records, groupBy) {
  if (!groupBy || groupBy === 'None') return [{ label: null, rows: records }];
  const fieldMap = {
    'Source':            'source',
    'Destination':       'destination',
    'Commodity / Group': 'group',
    'Status':            'status',
    'Location':          'location',
  };
  const field = fieldMap[groupBy];
  if (!field) return [{ label: null, rows: records }];
  const groups = {};
  const order  = [];
  records.forEach(r => {
    const raw = field === 'location' ? getFriendlyLocation(r) : (field === 'group' ? getDispatchGroup(r) : (field === 'status' ? getTruckOperationalStatus(r) : r[field]));
    const key = ((raw || '').trim()) || '(Blank)';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(r);
  });
  return order.map(k => ({ label: `${groupBy}: ${k}`, count: groups[k].length, rows: groups[k] }));
}

function renderDispatchGroupHeader(label, count) {
  const colspan = document.querySelectorAll('#sheet-head-row th').length || 24;
  return `<tr class="sheet-group-header"><td colspan="${colspan}"><span class="sgh-label">${esc(label)}</span><span class="sgh-count">${count} trip${count !== 1 ? 's' : ''}</span></td></tr>`;
}

function updateDispatchRowLocal(id, field, value) {
  let trips = loadTrips();
  const idx = trips.findIndex(t => t.id === id);
  if (idx === -1) return;
  const oldValue = trips[idx][field] || '';
  if (String(oldValue) === String(value)) return;
  recordDispatchHistoryChange({ id, field, oldValue, newValue: value });
  trips[idx][field] = value;
  trips[idx].updatedAt = new Date().toISOString();
  if (field === 'status' && value === 'Delivered' && !trips[idx].deliveredAt) {
    trips[idx].deliveredAt = trips[idx].updatedAt;
  }
  saveTrips(trips);
  debounceDispatchTripSync(id);
}

function recordDispatchHistoryChange(change) {
  if (isApplyingDispatchHistory) return;
  if (dispatchHistoryBatch) {
    dispatchHistoryBatch.push(change);
    return;
  }
  dispatchUndoStack.push({ changes: [change] });
  if (dispatchUndoStack.length > 100) dispatchUndoStack.shift();
  dispatchRedoStack = [];
}

function beginDispatchHistoryBatch() {
  dispatchHistoryBatch = [];
}

function endDispatchHistoryBatch() {
  if (dispatchHistoryBatch && dispatchHistoryBatch.length) {
    dispatchUndoStack.push({ changes: dispatchHistoryBatch });
    if (dispatchUndoStack.length > 100) dispatchUndoStack.shift();
    dispatchRedoStack = [];
  }
  dispatchHistoryBatch = null;
}

function applyDispatchHistoryAction(action, direction) {
  if (!action || !action.changes?.length) return;
  let trips = loadTrips();
  isApplyingDispatchHistory = true;
  const changes = direction === 'undo' ? [...action.changes].reverse() : action.changes;
  changes.forEach(change => {
    const idx = trips.findIndex(t => t.id === change.id);
    if (idx === -1) return;
    const value = direction === 'undo' ? change.oldValue : change.newValue;
    trips[idx][change.field] = value;
    trips[idx].updatedAt = new Date().toISOString();
    const input = document.querySelector(`.dispatch-cell-input[data-id="${change.id}"][data-field="${change.field}"]`);
    if (input) input.value = value || '';
  });
  saveTrips(trips);
  isApplyingDispatchHistory = false;
  updateDispatchSelectionStyles();
}

function undoDispatchEdit() {
  const action = dispatchUndoStack.pop();
  if (!action) { toast('Nothing to undo.', '#6b7280'); return; }
  applyDispatchHistoryAction(action, 'undo');
  dispatchRedoStack.push(action);
}

function redoDispatchEdit() {
  const action = dispatchRedoStack.pop();
  if (!action) { toast('Nothing to redo.', '#6b7280'); return; }
  applyDispatchHistoryAction(action, 'redo');
  dispatchUndoStack.push(action);
}

function populateSheetFilterDropdowns(allTrips) {
  const srcSel  = document.getElementById('filter-source');
  const destSel = document.getElementById('filter-dest');
  const locSel  = document.getElementById('filter-location');
  if (srcSel) {
    const cur  = srcSel.value;
    const vals = getUniqueDispatchValues(allTrips, 'source');
    srcSel.innerHTML = '<option value="">All Sources</option>' +
      vals.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
  if (destSel) {
    const cur  = destSel.value;
    const vals = getUniqueDispatchValues(allTrips, 'destination');
    destSel.innerHTML = '<option value="">All Destinations</option>' +
      vals.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
  if (locSel) {
    const cur  = locSel.value;
    const vals = getUniqueDispatchValues(allTrips, 'location');
    locSel.innerHTML = '<option value="">All Locations</option>' +
      vals.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
}

function handleDispatchTableCopy() {
  const checked = Array.from(document.querySelectorAll('.sheet-row-check:checked'));
  if (!checked.length) { toast('Select rows first to copy.', '#d97706'); return; }
  const fields = ['plate','driver','helper','source','destination','status',
                  'bookingDate','planPickup','actualPickup','lsp','supplier',
                  'packaging','qty','refNumber','shipmentNumber','atw','eta','remarks'];
  const trips  = loadTrips();
  const rows   = checked.map(cb => {
    const t = trips.find(x => x.id === cb.dataset.id);
    if (!t) return '';
    return fields.map(f => (t[f] || '')).join('\t');
  }).filter(Boolean);
  navigator.clipboard.writeText(rows.join('\n'))
    .then(() => toast(`${rows.length} row(s) copied to clipboard.`, '#2563eb'))
    .catch(() => toast('Copy failed. Select text manually and use Ctrl+C.', '#dc2626'));
}

function handleDispatchCellPaste(e, rowId, startField) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!text) return;
  const editableFields = ['driver','helper','source','destination','lsp','supplier',
                          'packaging','qty','refNumber','shipmentNumber','atw','eta','remarks'];
  const pasteRows  = text.split(/\r?\n/).filter(r => r.length).map(r => r.split('\t'));
  const startFIdx  = editableFields.indexOf(startField);

  if (startFIdx === -1 || (pasteRows.length === 1 && pasteRows[0].length === 1)) {
    const clean = text.trim();
    e.currentTarget.textContent = clean;
    updateDispatchRowLocal(rowId, startField, clean);
    return;
  }

  const allRowEls = Array.from(document.querySelectorAll('#sheet-body tr[data-id]'));
  let rowElIdx    = allRowEls.findIndex(tr => tr.dataset.id === rowId);

  pasteRows.forEach((cols, rOffset) => {
    const tr = allRowEls[rowElIdx + rOffset];
    if (!tr) return;
    const id = tr.dataset.id;
    cols.forEach((val, cOffset) => {
      const field = editableFields[startFIdx + cOffset];
      if (!field) return;
      const clean = val.trim();
      updateDispatchRowLocal(id, field, clean);
      const cell = tr.querySelector(`[data-field="${field}"]`);
      if (cell) cell.textContent = clean;
    });
  });
  toast(`Pasted ${pasteRows.length} row(s).`, '#2563eb');
}

function openTruckEditModal(plateOrId) {
  const trips = loadTrips();
  let t = trips.find(x => x.id === plateOrId);
  if (!t) {
    t = trips.find(x => (x.plate || x.plateNumber) === plateOrId && !['Delivered', 'Cancelled'].includes(x.status));
  }
  const modal = document.getElementById('truck-edit-modal');
  if (!modal) return;
  const plate = (t && (t.plate || t.plateNumber)) || (typeof plateOrId === 'string' ? plateOrId : '');
  document.getElementById('te-id').value            = t ? t.id : '';
  document.getElementById('te-plate').value         = plate;
  document.getElementById('te-group').value         = t ? (getDispatchGroup(t) || t.commodity || '') : '';
  document.getElementById('te-driver').value        = t ? (t.driver || '') : '';
  document.getElementById('te-helper').value        = t ? (t.helper || '') : '';
  document.getElementById('te-source').value        = t ? (t.source || '') : '';
  document.getElementById('te-destination').value   = t ? (t.destination || '') : '';
  document.getElementById('te-status').value        = t ? (t.status || 'Scheduled') : 'Scheduled';
  document.getElementById('te-eta').value           = t ? (t.eta || t.etaAta || '') : '';
  document.getElementById('te-remarks').value       = t ? (t.remarks || '') : '';
  document.getElementById('te-booking-date').value  = t ? (t.bookingDate || '') : '';
  document.getElementById('te-plan-pickup').value   = t ? (t.planPickup || '') : '';
  document.getElementById('te-actual-pickup').value = t ? (t.actualPickup || '') : '';
  const note = document.getElementById('te-save-note');
  if (note) note.style.display = 'none';
  modal.classList.add('open');
}

function closeTruckEditModal() {
  document.getElementById('truck-edit-modal')?.classList.remove('open');
}

function saveTruckEdit() {
  const id = document.getElementById('te-id').value;
  if (!id) { toast('No trip linked to this truck card.', '#dc2626'); return; }
  let trips = loadTrips();
  const idx = trips.findIndex(t => t.id === id);
  if (idx === -1) { toast('Trip not found.', '#dc2626'); return; }
  trips[idx] = {
    ...trips[idx],
    driver:       document.getElementById('te-driver').value.trim(),
    helper:       document.getElementById('te-helper').value.trim(),
    source:       document.getElementById('te-source').value.trim(),
    destination:  document.getElementById('te-destination').value.trim(),
    status:       document.getElementById('te-status').value,
    eta:          document.getElementById('te-eta').value.trim(),
    remarks:      document.getElementById('te-remarks').value.trim(),
    bookingDate:  document.getElementById('te-booking-date').value,
    planPickup:   document.getElementById('te-plan-pickup').value,
    actualPickup: document.getElementById('te-actual-pickup').value,
  };
  saveTrips(trips);
  const note = document.getElementById('te-save-note');
  if (note) note.style.display = 'block';
  logActivity(`Edited: ${trips[idx].plate} — ${trips[idx].commodity}`, '#7c3aed');
  renderSheet();
  renderDashboardIfActive();
  toast('Saved locally. Backend sync not enabled yet.', '#16a34a');
}

/* ══════════════════════════════════════════════════════
   API RESPONSE CACHE
══════════════════════════════════════════════════════ */

const LS_API_CACHE = 'vnsDispatchApiCache';

function loadDispatchApiCache() {
  try { return JSON.parse(localStorage.getItem(LS_API_CACHE)) || null; } catch { return null; }
}

function saveDispatchApiCache(data) {
  try {
    localStorage.setItem(LS_API_CACHE, JSON.stringify({ savedAt: new Date().toISOString(), dashboardData: data }));
  } catch {}
}

function isDispatchCacheStale(cache) {
  if (!cache || !cache.savedAt) return true;
  try { return (Date.now() - new Date(cache.savedAt).getTime()) > 30 * 60 * 1000; }
  catch { return true; }
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */

function applyDispatchDashboardData(raw, sourceLabel) {
  const shouldSaveLocal = sourceLabel === 'live';
  const todayStr        = today();
  const ACTIVE_STATUSES = ['In Transit', 'Loaded', 'Unloaded'];
  let trucks, trips, logs;

  const isApiData = raw && Array.isArray(raw.trucks) && raw.ok !== false && Array.isArray(raw.logs);
  if (isApiData) {
    trucks = raw.trucks.map(normalizeLiveTruck);
    trips  = mergeLocalDispatchEdits((raw.trips || []).map(normalizeLiveTrip));
    logs   = raw.logs.map(normalizeLiveLog);
    if (Array.isArray(raw.geofences)) dispatchLiveGeofences = raw.geofences;
    if (shouldSaveLocal) {
      saveTrucks(trucks);
      saveTrips(trips);
      saveLogs(logs);
      if (raw.warnings && raw.warnings.length) {
        console.warn('[VNS Dispatch] API warnings:', raw.warnings);
      }
    }
  } else {
    trucks = (raw && Array.isArray(raw.trucks)) ? raw.trucks : loadTrucks();
    trips  = (raw && Array.isArray(raw.trips))  ? raw.trips  : loadTrips();
    logs   = loadLogs();
  }

  const filteredTrips = filterBySelectedGroup(trips);
  const filteredLogs  = filterBySelectedGroup(logs);

  renderDispatchGroupTabs();
  renderDispatchKPIs({
    activeTrips: filteredTrips.filter(t => {
      if (['Delivered', 'Cancelled', 'At Garage', 'Inactive / No Trip'].includes(t.status)) return false;
      if (ACTIVE_STATUSES.includes(t.status)) return true;
      return (t.bookingDate || '').startsWith(todayStr)
          || (t.planPickup  || '').startsWith(todayStr)
          || (t.actualPickup|| '').startsWith(todayStr);
    }).length,
    inTransit:      filteredTrips.filter(t => t.status === 'In Transit').length,
    deliveredToday: filteredLogs.filter(l => (l.loggedAt || l.deliveredAt || '').startsWith(todayStr)).length,
    totalLogs:      filteredLogs.length,
  });

  renderDispatchTruckCards(trucks, trips);
  renderCommodityBreakdown(filteredTrips);
  renderRecentActivity(raw ? (raw.recentActivity || null) : null);
  populateTruckFilter(trucks);

  renderTruckMarkers(trucks.filter(t => {
    if (!t.latitude || !t.longitude) return false;
    return selectedDispatchGroup === 'All' || getDispatchGroup(t) === selectedDispatchGroup;
  }));

  renderDispatchGeofences();
  renderSheet();
  renderLogs();

  if (sourceLabel === 'live')  setDataStatus(DISPATCH_APP_SCRIPT_URL ? 'live' : 'local');
  if (sourceLabel === 'stale') setDataStatus('local');
}

async function refreshDispatchDashboard() {
  const cache = loadDispatchApiCache();

  if (cache && cache.dashboardData) {
    applyDispatchDashboardData(cache.dashboardData, isDispatchCacheStale(cache) ? 'stale' : 'cache');
    setDataStatus('loading');
  } else {
    setDataStatus('loading');
  }

  try {
    const raw = await fetchDispatchDashboardData();
    applyDispatchDashboardData(raw, 'live');
    if (Array.isArray(raw.trucks)) saveDispatchApiCache(raw);
  } catch (err) {
    console.error('[VNS Dispatch] refreshDispatchDashboard failed:', err);
    if (!cache || !cache.dashboardData) {
      setDataStatus('error');
      toast('Could not load live data. Showing local data.', '#dc2626');
    } else {
      setDataStatus('local');
      if (isDispatchCacheStale(cache)) {
        toast('Live data unavailable — showing cached data.', '#d97706');
      }
    }
  }
}

function renderDispatchKPIs(data) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
  set('sc-active',    data.activeTrips    ?? 0);
  set('sc-intransit', data.inTransit      ?? 0);
  set('sc-delivered', data.deliveredToday ?? 0);
  set('sc-logs',      data.totalLogs      ?? 0);
}

function truckSortTier(t, trips) {
  if (isGpsOffline(t)) return 4;
  const plate = t.plate || t.plateNumber || '';
  const trip = trips.find(tr => (tr.plate || tr.plateNumber) === plate && !['Delivered','Cancelled'].includes(tr.status));
  const record = trip || t;
  if (isForRepair(record)) return 3;
  if (isAtGarage(t)) return 2;
  const st = getTruckOperationalStatus(record);
  if (st === 'Inactive / No Trip') return 2;
  return 1;
}

function renderDispatchTruckCards(trucks, trips) {
  const row = document.getElementById('truck-cards-row');
  if (!row) return;

  let displayTrucks = trucks;
  if (selectedDispatchGroup !== 'All') {
    displayTrucks = trucks.filter(t => {
      const plate = t.plate || t.plateNumber || '';
      const activeTrip = trips.find(tr =>
        (tr.plate || tr.plateNumber) === plate &&
        !['Delivered', 'Cancelled'].includes(tr.status)
      );
      return activeTrip && getDispatchGroup(activeTrip) === selectedDispatchGroup;
    });
  }

  if (!displayTrucks.length) {
    row.innerHTML = selectedDispatchGroup === 'All'
      ? '<p class="no-trucks-note">No trucks configured. Go to the Truck Master tab to add trucks.</p>'
      : `<p class="no-trucks-note">No active ${esc(selectedDispatchGroup)} trips currently assigned.</p>`;
    renderFleetSummaryStrip(displayTrucks, trips);
    return;
  }

  displayTrucks = [...displayTrucks].sort((a, b) => {
    const tierDiff = truckSortTier(a, trips) - truckSortTier(b, trips);
    if (tierDiff !== 0) return tierDiff;
    const pa = (a.plate || a.plateNumber || '').toLowerCase();
    const pb = (b.plate || b.plateNumber || '').toLowerCase();
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });

  row.innerHTML = displayTrucks.map(t => {
    const plate  = t.plate || t.plateNumber || '';
    const driver = t.driver || t.driverName || '';
    const helper = t.helper || t.helperName || '';
    const activeTrip = trips.find(tr =>
      (tr.plate || tr.plateNumber) === plate &&
      !['Delivered', 'Cancelled'].includes(tr.status)
    );
    const status     = activeTrip ? getTruckOperationalStatus(activeTrip) : getTruckOperationalStatus(t);
    const commMeta   = activeTrip ? COMMODITY_META[activeTrip.commodity] : null;
    const hasGPS     = t.latitude && t.longitude;
    const gpsTime    = formatFriendlyDateTime(t.lastUpdated);
    const groupLabel = activeTrip ? (getDispatchGroup(activeTrip) || activeTrip.commodity || '') : '';

    const gpsOffline  = isGpsOffline(t);
    const truckRecord = activeTrip || t;
    const atGarage    = !gpsOffline && isAtGarage(t);
    const forRepair   = !gpsOffline && isForRepair(truckRecord);
    const cardClass   = gpsOffline ? 'tdc-gps-offline' : (forRepair ? 'tdc-for-repair' : (atGarage ? 'tdc-at-garage' : ''));

    let badgeLabel = status;
    let badgeCls   = STATUS_BADGE[status] || 'badge-idle';
    if (gpsOffline)     { badgeLabel = 'GPS Offline'; badgeCls = 'badge-gps-offline'; }
    else if (forRepair) { badgeLabel = 'For Repair';  badgeCls = 'badge-for-repair';  }
    else if (atGarage)  { badgeLabel = 'At Garage';   badgeCls = 'badge-at-garage';   }

    const locFriendly = getFriendlyLocation(t) || 'Location unavailable';
    const locLabel    = gpsOffline ? 'Last Known Loc' : 'Loc';

    return `
      <div class="truck-dispatch-card${cardClass ? ' ' + cardClass : ''}" data-plate="${esc(plate)}" onclick="openTruckEditModal('${esc(plate)}')" style="cursor:pointer;">
        <div class="tdc-header">
          <div class="tdc-plate-wrap">
            <span class="tdc-plate">${esc(plate)}</span>
          </div>
          <span class="badge ${esc(badgeCls)}">${esc(badgeLabel)}</span>
        </div>
        <div class="tdc-crew">
          <div class="tdc-crew-row">
            <span class="tdc-crew-label">Driver</span>
            <span class="tdc-crew-val">${esc(driver || '—')}</span>
          </div>
          <div class="tdc-crew-row">
            <span class="tdc-crew-label">Helper</span>
            <span class="tdc-crew-val">${esc(helper || '—')}</span>
          </div>
        </div>
        ${activeTrip ? `
          <div class="tdc-trip-info">
            ${groupLabel ? `<span class="badge badge-sm pill-${esc(commMeta?.cls || '')}">${esc(groupLabel)}</span>` : ''}
            <div class="tdc-route">${esc(activeTrip.source || 'Needs Input')} <span class="arrow">→</span> ${esc(activeTrip.destination || 'Needs Input')}</div>
            <div class="tdc-eta">ETA <strong>${esc(activeTrip.etaAta || activeTrip.eta || '—')}</strong></div>
          </div>
        ` : atGarage ? `
          <div class="tdc-garage-tag">🏠 Parked at Garage</div>
        ` : gpsOffline ? `
          <div class="tdc-idle" style="color:#dc2626;font-size:0.76rem;">GPS signal lost — check truck</div>
        ` : `<div class="tdc-idle">No active trip assigned</div>`}
        <div class="tdc-location">${esc(locLabel)}: <strong>${esc(locFriendly)}</strong></div>
        <div class="tdc-footer">
          ${hasGPS ? `
            <button class="dbtn dbtn-sm dbtn-map-btn" onclick="event.stopPropagation();focusMapOnTruck(${t.latitude},${t.longitude},'${esc(plate)}')">
              View on Map
            </button>
          ` : '<span></span>'}
          <span class="tdc-gps-time${gpsOffline ? ' tdc-gps-stale' : ''}">
            ${gpsOffline ? `Last GPS: ${gpsTime}` : `GPS: ${gpsTime}`}
          </span>
        </div>
      </div>
    `;
  }).join('');

  renderFleetSummaryStrip(displayTrucks, trips);
}

function renderFleetSummaryStrip(tabTrucks, trips) {
  const strip = document.getElementById('fleet-summary-strip');
  if (!strip) return;
  const todayStr = today();
  const total = tabTrucks.length;
  const activeCount = tabTrucks.filter(t => {
    const plate = t.plate || t.plateNumber || '';
    const trip = trips.find(tr => (tr.plate || tr.plateNumber) === plate && !['Delivered','Cancelled','At Garage','Inactive / No Trip'].includes(tr.status));
    if (!trip) return false;
    const st = getTruckOperationalStatus(trip);
    if (['In Transit','Loaded','Unloaded'].includes(st)) return true;
    return (trip.bookingDate||'').startsWith(todayStr) || (trip.planPickup||'').startsWith(todayStr) || (trip.actualPickup||'').startsWith(todayStr);
  }).length;
  const garageCount = tabTrucks.filter(t => {
    if (isGpsOffline(t)) return false;
    return isAtGarage(t);
  }).length;
  const offlineCount = tabTrucks.filter(t => isGpsOffline(t)).length;
  const repairCount = tabTrucks.filter(t => {
    const plate = t.plate || t.plateNumber || '';
    const trip = trips.find(tr => (tr.plate || tr.plateNumber) === plate && !['Delivered','Cancelled'].includes(tr.status));
    return isForRepair(trip || t);
  }).length;
  const pill = (cls, num, lbl) =>
    `<span class="fss-pill fss-pill-${cls}"><span class="fss-num">${num}</span><span class="fss-lbl">${lbl}</span></span>`;
  strip.innerHTML =
    pill('total',   total,        'trucks') +
    pill('active',  activeCount,  'active today') +
    pill('garage',  garageCount,  'at garage') +
    (offlineCount ? pill('offline', offlineCount, 'GPS offline') : '') +
    (repairCount  ? pill('repair',  repairCount,  'for repair')  : '');
}

function renderCommodityBreakdown(trips) {
  const grid = document.getElementById('commodity-grid');
  if (!grid) return;
  const allGroups = DISPATCH_GROUPS.filter(g => g !== 'All');
  const visibleGroups = selectedDispatchGroup === 'All'
    ? allGroups
    : allGroups.filter(g => g === selectedDispatchGroup);
  const counts = {};
  visibleGroups.forEach(g => (counts[g] = 0));
  trips.forEach(t => {
    const group = getDispatchGroup(t);
    if (counts[group] !== undefined) counts[group]++;
  });
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  grid.innerHTML = visibleGroups.map(c => {
    const metaKey = c === 'Bottle' ? 'Bottles' : (c === 'Preform / Resin' ? 'Preform' : (c === 'Caps / Crown' ? 'Caps' : c));
    const meta  = COMMODITY_META[metaKey] || { cls: '', color: '#6b7280' };
    const count = counts[c];
    const pct   = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="commodity-chip ${meta.cls}">
        <div class="cc-top">
          <span class="cc-count">${count}</span>
        </div>
        <div class="cc-name">${c}</div>
        <div class="cc-bar-wrap"><div class="cc-bar" style="width:${pct}%;background:${meta.color};"></div></div>
      </div>
    `;
  }).join('');
}

function renderRecentActivity(acts) {
  if (!acts || !acts.length) acts = loadActivity();
  const list = document.getElementById('activity-list');
  if (!list) return;
  if (!acts.length) {
    list.innerHTML = '<div class="act-empty">No recent activity yet.</div>';
    return;
  }
  list.innerHTML = acts.slice(0, 15).map(a => `
    <div class="activity-item">
      <div class="ai-dot" style="background:${esc(a.color || '#2563eb')}"></div>
      <div class="ai-text">${esc(a.msg)}</div>
      <div class="ai-time">${esc(a.time)}</div>
    </div>
  `).join('');
}

function populateTruckFilter(trucks) {
  const sel = document.getElementById('filter-truck');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Trucks</option>' +
    trucks.map(t => {
      const plate = t.plate || t.plateNumber || '';
      return `<option ${plate === current ? 'selected' : ''}>${esc(plate)}</option>`;
    }).join('');
}

/* ══════════════════════════════════════════════════════
   MAP
══════════════════════════════════════════════════════ */

function initDispatchMap() {
  if (dispatchMap) {
    dispatchMap.invalidateSize();
    return;
  }
  const mapEl = document.getElementById('dispatch-map');
  if (!mapEl || typeof L === 'undefined') return;

  dispatchMap = L.map('dispatch-map', { zoomControl: true }).setView([14.5995, 120.9842], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(dispatchMap);
  renderDispatchGeofences();

  const note = document.getElementById('map-no-data-note');
  if (note && !DISPATCH_APP_SCRIPT_URL) note.style.display = 'block';
}

function updateDispatchGeofenceToggle() {
  const btn = document.getElementById('geofence-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', dispatchGeofencesVisible);
  btn.textContent = dispatchGeofencesVisible ? 'Geofences' : 'Geofences Off';
}

const GEOFENCE_CATEGORY_COLOR = {
  'Garage':    '#d97706',
  'Plant':     '#16a34a',
  'Port':      '#2563eb',
  'Warehouse': '#7c3aed',
  'Warehouse / Pickup': '#7c3aed',
  'Pickup':    '#7c3aed',
  'Parking':   '#6b7280',
};

function geofenceCategoryColor(category) {
  return GEOFENCE_CATEGORY_COLOR[category] || '#64748b';
}

function getVisibleDispatchGeofences() {
  if (!Array.isArray(dispatchLiveGeofences)) return [];
  if (selectedDispatchGroup === 'All') return dispatchLiveGeofences;
  const filtered = dispatchLiveGeofences.filter(g => {
    const gc = (g.groupCategory || '').trim();
    return gc === selectedDispatchGroup;
  });
  if (!filtered.length && dispatchLiveGeofences.length > 0) {
    console.info('No group-specific geofences found; showing all geofences.');
    return dispatchLiveGeofences;
  }
  return filtered;
}

function normalizeGeofencePoint(point) {
  if (!point) return null;
  const lat = Array.isArray(point) ? parseFloat(point[0]) : parseFloat(point.lat);
  const lng = Array.isArray(point) ? parseFloat(point[1]) : parseFloat(point.lng);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

function normalizeGeofencePolygon(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon.map(normalizeGeofencePoint).filter(Boolean);
}

function getPolygonCenter(points) {
  if (!points.length) return null;
  const total = points.reduce((sum, point) => {
    sum.lat += point.lat;
    sum.lng += point.lng;
    return sum;
  }, { lat: 0, lng: 0 });
  return { lat: total.lat / points.length, lng: total.lng / points.length };
}

function fitDispatchMapBounds() {
  if (!dispatchMap || typeof L === 'undefined') return;

  let bounds = null;
  const extend = layer => {
    if (!layer) return;
    let layerBounds = null;
    if (typeof layer.getBounds === 'function') {
      layerBounds = layer.getBounds();
    } else if (typeof layer.getLatLng === 'function') {
      layerBounds = L.latLngBounds([layer.getLatLng()]);
    }
    if (!layerBounds || !layerBounds.isValid()) return;
    bounds = bounds ? bounds.extend(layerBounds) : layerBounds;
  };

  dispatchMarkers.forEach(extend);
  if (dispatchGeofencesVisible && dispatchGeofenceLayer) {
    dispatchGeofenceLayer.eachLayer(extend);
  }

  if (bounds && bounds.isValid()) {
    dispatchMap.fitBounds(bounds, { padding: [70, 70], maxZoom: dispatchGeofencesVisible ? 15 : 13 });
  }
}

function renderDispatchGeofences() {
  updateDispatchGeofenceToggle();
  if (!dispatchMap || typeof L === 'undefined') return;

  if (dispatchGeofenceLayer) {
    dispatchMap.removeLayer(dispatchGeofenceLayer);
    dispatchGeofenceLayer = null;
  }
  if (!dispatchGeofencesVisible) {
    fitDispatchMapBounds();
    return;
  }

  const visible = getVisibleDispatchGeofences();
  if (!visible.length) {
    console.warn('[VNS Dispatch] No geofences visible for selected group.', {
      selectedDispatchGroup,
      dispatchLiveGeofencesLength: dispatchLiveGeofences.length,
      filteredCount: visible.length,
    });
    fitDispatchMapBounds();
    return;
  }

  dispatchGeofenceLayer = L.featureGroup();
  let renderedCount = 0;

  visible.forEach(zone => {
    const color   = geofenceCategoryColor(zone.category);
    const name    = zone.name || '';
    const polygon = normalizeGeofencePolygon(zone.polygon);
    const hasPoly = polygon.length >= 3;
    const centerLat = parseFloat(zone.centerLat);
    const centerLng = parseFloat(zone.centerLng);
    const radiusMeters = parseFloat(zone.radiusMeters);
    const hasCirc = !isNaN(centerLat) && !isNaN(centerLng) && !isNaN(radiusMeters) && radiusMeters > 0;
    if (!hasPoly && !hasCirc) return;

    const shapeOpts = {
      color,
      weight:      1.5,
      opacity:     0.65,
      fillColor:   color,
      fillOpacity: 0.10,
      dashArray:   '5 5',
    };

    const popup = `
      <div class="map-popup">
        <div class="mp-title">${esc(name)}</div>
        ${zone.category     ? `<div class="mp-row"><b>Type:</b> ${esc(zone.category)}</div>`     : ''}
        ${zone.groupCategory ? `<div class="mp-row"><b>Group:</b> ${esc(zone.groupCategory)}</div>` : ''}
      </div>
    `;

    let shape;
    if (hasPoly) {
      shape = L.polygon(polygon.map(point => [point.lat, point.lng]), shapeOpts).bindPopup(popup);
    } else {
      shape = L.circle([centerLat, centerLng], { ...shapeOpts, radius: radiusMeters }).bindPopup(popup);
    }

    const polygonCenter = hasPoly ? getPolygonCenter(polygon) : null;
    const labelLat = !isNaN(centerLat) ? centerLat : polygonCenter?.lat;
    const labelLng = !isNaN(centerLng) ? centerLng : polygonCenter?.lng;

    dispatchGeofenceLayer.addLayer(shape);
    if (!isNaN(labelLat) && !isNaN(labelLng)) {
      const label = L.marker([labelLat, labelLng], {
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<div class="map-zone-label" style="color:${color};border-color:${color};">${esc(name)}</div>`,
          iconSize: [110, 20],
          iconAnchor: [55, 10],
        }),
      });
      dispatchGeofenceLayer.addLayer(label);
    }
    renderedCount += 1;
  });

  if (!renderedCount) {
    console.warn('[VNS Dispatch] No geofence shapes rendered for selected group.', {
      selectedDispatchGroup,
      dispatchLiveGeofencesLength: dispatchLiveGeofences.length,
      filteredCount: visible.length,
    });
    fitDispatchMapBounds();
    return;
  }

  dispatchGeofenceLayer.addTo(dispatchMap);
  fitDispatchMapBounds();
}

function toggleDispatchGeofences() {
  dispatchGeofencesVisible = !dispatchGeofencesVisible;
  localStorage.setItem(LS_GEOFENCES_VISIBLE, dispatchGeofencesVisible ? 'true' : 'false');
  renderDispatchGeofences();
}

function renderTruckMarkers(locations) {
  dispatchMarkers.forEach(m => { if (dispatchMap) dispatchMap.removeLayer(m); });
  dispatchMarkers = [];

  const note = document.getElementById('map-no-data-note');

  if (!locations || !locations.length) {
    if (note) {
      note.textContent = 'No live GPS data. Connect Apps Script to enable truck tracking.';
      note.style.display = 'block';
    }
    fitDispatchMapBounds();
    return;
  }

  if (note) note.style.display = 'none';

  const valid = locations.filter(t => {
    const lat = parseFloat(t.latitude || t.lat);
    const lng = parseFloat(t.longitude || t.lng);
    return !isNaN(lat) && !isNaN(lng);
  });

  valid.forEach(t => {
    const lat     = parseFloat(t.latitude  || t.lat);
    const lng     = parseFloat(t.longitude || t.lng);
    const plateRaw = t.plateNumber || t.plate || 'Unknown';
    const plate   = esc(plateRaw);
    const group   = esc(t.groupCategory || t.commodity  || '—');
    const driver  = esc(t.driverName   || t.driver      || '—');
    const helper  = esc(t.helperName   || t.helper      || '—');
    const status  = esc(t.status       || '—');
    const src     = esc(t.source       || '—');
    const dest    = esc(t.destination  || '—');
    const addr    = esc(t.fullAddress  || '');
    const updated = formatDispatchDateTime(t.lastUpdated);

    const icon = L.divIcon({
      className: '',
      html: `<div class="truck-map-pin" title="${plate}">${plate}</div>`,
      iconSize: [88, 30],
      iconAnchor: [44, 30],
      popupAnchor: [0, -30],
    });

    const location        = esc(getFriendlyLocation(t));
    const gpsOff          = isGpsOffline(t);
    const gpsStatusHtml   = gpsOff
      ? '<span style="color:#dc2626;font-weight:700;">Offline</span>'
      : '<span style="color:#16a34a;font-weight:700;">Online</span>';
    const locLabel        = gpsOff ? 'Last Known Loc' : 'Location';
    const gpsTimeLabel    = gpsOff ? 'Last GPS' : 'GPS';
    const geofenceName    = esc(t.geofenceName     || '');
    const geofenceCategory = esc(t.geofenceCategory || '');
    const marker = L.marker([lat, lng], { icon, dispatchPlate: plateRaw }).addTo(dispatchMap);
    marker.bindPopup(`
      <div class="map-popup">
        <div class="mp-title">${plate}</div>
        <div class="mp-row"><b>Status:</b> ${esc(getTruckOperationalStatus(t))}</div>
        <div class="mp-row"><b>GPS:</b> ${gpsStatusHtml}</div>
        <div class="mp-row"><b>${locLabel}:</b> ${location}</div>
        ${geofenceName     ? `<div class="mp-row"><b>Geofence:</b> ${geofenceName}</div>`     : ''}
        ${geofenceCategory ? `<div class="mp-row"><b>Zone:</b> ${geofenceCategory}</div>` : ''}
        ${addr ? `<div class="mp-row"><b>Address:</b> ${addr}</div>` : ''}
        <div class="mp-row"><b>Driver:</b> ${driver}</div>
        <div class="mp-row"><b>Group:</b> ${group}</div>
        <div class="mp-time">${gpsTimeLabel}: ${formatFriendlyDateTime(t.lastUpdated)}</div>
      </div>
    `);
    dispatchMarkers.push(marker);
  });

  fitDispatchMapBounds();
}

function updateDispatchMap() {
  if (dispatchMap) {
    dispatchMap.invalidateSize();
  } else {
    initDispatchMap();
  }
}

function focusMapOnTruck(lat, lng, plate) {
  switchTab('dashboard');
  setTimeout(() => {
    if (!dispatchMap) return;
    dispatchMap.invalidateSize();
    dispatchMap.setView([lat, lng], 16);
    dispatchMarkers.forEach(m => {
      if (m.options.dispatchPlate === plate) m.openPopup();
    });
  }, 120);
}

/* ══════════════════════════════════════════════════════
   DATA STATUS BADGE
══════════════════════════════════════════════════════ */

function setDataStatus(state) {
  const el = document.getElementById('data-status-badge');
  if (!el) return;
  const map = {
    loading: { text: 'Refreshing…',        cls: 'dsb-loading' },
    live:    { text: '● Live — Apps Script', cls: 'dsb-live'    },
    local:   { text: '● Local data mode',   cls: 'dsb-local'   },
    error:   { text: '✕ Error loading data', cls: 'dsb-error'  },
  };
  const s = map[state] || map.local;
  el.textContent = s.text;
  el.className   = `data-status-badge ${s.cls}`;
}

/* ══════════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════════ */

function switchTab(tabName) {
  document.querySelectorAll('.dispatch-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.dispatch-tab-panel').forEach(p => p.classList.remove('active'));
  const btn   = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = document.getElementById(`tab-${tabName}`);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

/* ══════════════════════════════════════════════════════
   DISPATCHER SHEET
══════════════════════════════════════════════════════ */

function renderSheet() {
  const allTrips = loadTrips();
  const trips    = applyDispatchSheetFilters(allTrips);

  populateSheetFilterDropdowns(allTrips);

  const tbody = document.getElementById('sheet-body');
  if (!tbody) return;

  if (!trips.length) {
    tbody.innerHTML = `<tr><td colspan="23"><div class="empty-state">No trips match the current filter.</div></td></tr>`;
    return;
  }

  const grouped       = groupDispatchRows(trips, sheetGroupBy);
  const statusOptions = ['Scheduled','In Transit','Loaded','Unloaded','Delivered','On Hold','Cancelled'];

  const editCell = (id, field, val) => {
    const safeVal = esc(val || '');
    return `<td class="sheet-cell-edit" contenteditable="true" data-id="${id}" data-field="${field}"
      onblur="updateDispatchRowLocal('${id}','${field}',this.textContent.trim())"
      onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
      onpaste="handleDispatchCellPaste(event,'${id}','${field}')"
      >${safeVal}</td>`;
  };

  const dateCell = (id, field, val) => {
    const raw = val || '';
    return `<td class="sheet-cell-date"><input type="date" class="sheet-date-input" value="${esc(raw)}"
      onchange="updateDispatchRowLocal('${id}','${field}',this.value)" /></td>`;
  };

  const statusCell = (id, val) => `<td class="sheet-cell-select"><select class="sheet-status-sel"
    onchange="updateDispatchRowLocal('${id}','status',this.value)">
    ${statusOptions.map(s => `<option${val === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
    </select></td>`;

  const renderRow = t => {
    const id         = t.id;
    const commMeta   = COMMODITY_META[t.commodity] || {};
    const pillCls    = commMeta.cls ? `badge badge-sm pill-${commMeta.cls}` : 'badge badge-sm';
    const groupLabel = getDispatchGroup(t) || t.commodity || '—';
    const location   = getFriendlyLocation(t);
    const lat        = t.latitude  ? String(t.latitude).slice(0, 9)  : '—';
    const lng        = t.longitude ? String(t.longitude).slice(0, 10) : '—';

    return `
      <tr data-id="${esc(id)}" class="sheet-row">
        <td class="sheet-cell-check"><input type="checkbox" class="sheet-row-check" data-id="${esc(id)}"></td>
        <td class="sheet-cell-ro"><strong>${esc(t.plate || '—')}</strong></td>
        ${editCell(id, 'driver',         t.driver)}
        ${editCell(id, 'helper',         t.helper)}
        <td class="sheet-cell-ro"><span class="${pillCls}">${esc(groupLabel)}</span></td>
        <td class="sheet-cell-ro ts-cell">${esc(t.imei || '—')}</td>
        ${editCell(id, 'source',         t.source)}
        ${editCell(id, 'destination',    t.destination)}
        ${statusCell(id, t.status)}
        ${dateCell(id, 'bookingDate',    t.bookingDate)}
        ${dateCell(id, 'planPickup',     t.planPickup)}
        ${dateCell(id, 'actualPickup',   t.actualPickup)}
        ${editCell(id, 'lsp',            t.lsp)}
        ${editCell(id, 'supplier',       t.supplier)}
        ${editCell(id, 'packaging',      t.packaging)}
        ${editCell(id, 'qty',            t.qty)}
        ${editCell(id, 'refNumber',      t.refNumber)}
        ${editCell(id, 'shipmentNumber', t.shipmentNumber)}
        ${editCell(id, 'atw',            t.atw)}
        ${editCell(id, 'eta',            t.eta)}
        ${editCell(id, 'remarks',        t.remarks)}
        <td class="sheet-cell-ro ts-cell">${formatDispatchDateTime(t.lastUpdated || t.timestamp)}</td>
        <td class="sheet-cell-ro sheet-cell-loc">${esc(location)}</td>
        <td class="sheet-cell-ro ts-cell">${lat}</td>
        <td class="sheet-cell-ro ts-cell">${lng}</td>
        <td class="sheet-cell-actions">
          <div class="actions-cell">
            <button class="dbtn dbtn-primary dbtn-sm" onclick="markOneDelivered('${esc(id)}')">Delivered</button>
            <button class="dbtn dbtn-outline-danger dbtn-sm" onclick="deleteOneTrip('${esc(id)}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  };

  let html = '';
  grouped.forEach(({ label, count, rows }) => {
    if (label) html += renderDispatchGroupHeader(label, count || rows.length);
    rows.forEach(t => { html += renderRow(t); });
  });
  tbody.innerHTML = html;

  document.querySelectorAll('.sheet-row-check').forEach(cb => {
    cb.addEventListener('change', () => cb.closest('tr').classList.toggle('row-selected', cb.checked));
  });
}

function toggleAllSheet(master) {
  document.querySelectorAll('.sheet-row-check').forEach(cb => {
    cb.checked = master.checked;
    cb.closest('tr').classList.toggle('row-selected', master.checked);
  });
}

function getSelectedSheetIds() {
  return Array.from(document.querySelectorAll('.sheet-row-check:checked')).map(cb => cb.dataset.id);
}

function markSelectedDelivered() {
  const ids = getSelectedSheetIds();
  if (!ids.length) { toast('Select at least one trip first.', '#d97706'); return; }
  if (!confirm(`Mark ${ids.length} trip(s) as Delivered and move to Logs?`)) return;
  ids.forEach(id => moveToLogs(id, 'Delivered'));
  renderSheet();
  renderDashboardIfActive();
  toast(`${ids.length} trip(s) marked Delivered.`, '#16a34a');
}

function addSelectedToLogs() {
  const ids = getSelectedSheetIds();
  if (!ids.length) { toast('Select at least one trip first.', '#d97706'); return; }
  const trips = loadTrips();
  const logs  = loadLogs();
  const synced = [];
  ids.forEach(id => {
    const idx = trips.findIndex(x => x.id === id);
    const t = trips[idx];
    if (t) {
      const loggedTrip = { ...t, loggedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      logs.push(loggedTrip);
      trips[idx] = loggedTrip;
      synced.push(loggedTrip);
      logActivity(`Added to logs: ${t.plate} — ${t.commodity} → ${t.destination}`, '#7c3aed');
    }
  });
  saveTrips(trips);
  saveLogs(logs);
  synced.forEach(trip => queueDispatchTripSync(trip, 'addToLogs'));
  toast(`${ids.length} trip(s) added to Logs (kept active).`, '#7c3aed');
}

function clearSelectedTrips() {
  const ids = getSelectedSheetIds();
  if (!ids.length) { toast('Select at least one trip first.', '#d97706'); return; }
  if (!confirm(`Clear trip details for ${ids.length} trip(s)? Plate and driver info is kept.`)) return;
  let trips  = loadTrips();
  const trks = loadTrucks();
  trips = trips.map(t => {
    if (!ids.includes(t.id)) return t;
    const trk = trks.find(tr => tr.plate === t.plate);
    return {
      id: t.id, recordId: t.recordId || createDispatchRecordId(getSheetCommodityName(t)), plate: t.plate,
      driver: trk ? trk.driver : t.driver,
      helper: trk ? trk.helper : t.helper,
      truckType: t.truckType,
      commodity: '', source: '', destination: '', status: 'Scheduled',
      bookingDate: '', planPickup: '', actualPickup: '', lsp: '', supplier: '',
      packaging: '', qty: '', refNumber: '', shipmentNumber: '', atw: '',
      eta: '', remarks: '', latitude: null, longitude: null, lastUpdated: null,
      createdAt: t.createdAt || t.timestamp || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deliveredAt: '',
      loggedAt: '',
      timestamp: t.timestamp,
    };
  });
  saveTrips(trips);
  renderSheet();
  toast(`${ids.length} trip(s) cleared.`, '#374151');
}

function moveToLogs(id, finalStatus) {
  let trips = loadTrips();
  const logs = loadLogs();
  const idx  = trips.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const t = { ...trips[idx], status: finalStatus, deliveredAt: now, loggedAt: now, updatedAt: now };
  logs.push(t);
  trips.splice(idx, 1);
  saveTrips(trips);
  saveLogs(logs);
  queueDispatchTripSync(t, finalStatus === 'Delivered' ? 'markDelivered' : 'addToLogs');
  logActivity(`Delivered: ${t.plate} — ${t.commodity} → ${t.destination}`, '#16a34a');
}

function markOneDelivered(id) {
  if (!confirm('Mark this trip as Delivered and move to Logs?')) return;
  moveToLogs(id, 'Delivered');
  renderSheet();
  renderDashboardIfActive();
  toast('Trip marked as Delivered.', '#16a34a');
}

function deleteOneTrip(id) {
  if (!confirm('Delete this trip from the local list? This does not affect Google Sheets.')) return;
  let trips = loadTrips();
  const t   = trips.find(x => x.id === id);
  trips     = trips.filter(x => x.id !== id);
  saveTrips(trips);
  if (t) logActivity(`Removed trip: ${t.plate} — ${t.commodity}`, '#dc2626');
  renderSheet();
  renderDashboardIfActive();
  toast('Trip removed.', '#dc2626');
}

function getDispatchSheetColumns(records) {
  const usefulExtras = DISPATCH_EXTRA_COLUMNS.filter(col =>
    records.some(r => String(r[col.key] || '').trim())
  );
  const beforeActions = DISPATCH_BASE_COLUMNS.filter(c => c.key !== 'actions');
  const actions = DISPATCH_BASE_COLUMNS.find(c => c.key === 'actions');
  return [...beforeActions, ...usefulExtras, actions];
}

function renderDispatchSheetHeader(columns) {
  const headRow = document.getElementById('sheet-head-row');
  if (!headRow) return;
  headRow.innerHTML = columns.map(col => {
    const cls = `sheet-col-${col.key}`;
    if (col.kind === 'select') return `<th class="${cls}" style="width:36px;"><input type="checkbox" id="sheet-select-all" onchange="toggleAllSheet(this)"></th>`;
    return `<th class="${cls}">${esc(col.label)}</th>`;
  }).join('');
}

function renderSheet() {
  const allTrips = loadTrips();
  const trips = applyDispatchSheetFilters(allTrips);
  const columns = getDispatchSheetColumns(trips);

  populateSheetFilterDropdowns(allTrips);
  renderDispatchSheetHeader(columns);

  const tbody = document.getElementById('sheet-body');
  if (!tbody) return;
  selectedDispatchCells.clear();

  if (!trips.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}"><div class="empty-state">No trips match the current filter.</div></td></tr>`;
    return;
  }

  const editCell = (id, field, value, rowIndex, colIndex) =>
    `<td class="sheet-cell-edit sheet-col-${esc(field)}" data-id="${esc(id)}" data-field="${esc(field)}" data-row-index="${rowIndex}" data-col-index="${colIndex}">
      <input class="dispatch-cell-input" data-id="${esc(id)}" data-field="${esc(field)}" data-row-index="${rowIndex}" data-col-index="${colIndex}" type="text" value="${esc(value || '')}">
    </td>`;

  const readCell = (value, extraCls = '', colKey = '') =>
    `<td class="sheet-cell-ro ${extraCls} ${colKey ? `sheet-col-${esc(colKey)}` : ''}">${value}</td>`;

  const statusCell = (id, value, rowIndex, colIndex) =>
    `<td class="sheet-cell-select sheet-cell-edit sheet-col-status" data-id="${esc(id)}" data-field="status" data-row-index="${rowIndex}" data-col-index="${colIndex}">
      <select class="sheet-status-sel dispatch-cell-input" data-id="${esc(id)}" data-field="status" data-row-index="${rowIndex}" data-col-index="${colIndex}">
        ${DISPATCH_STATUS_OPTIONS.map(s => `<option${value === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select>
    </td>`;

  const renderCell = (trip, col, rowIndex, colIndex) => {
    const id = trip.id;
    if (col.kind === 'select') {
      return `<td class="sheet-cell-check sheet-col-select"><input type="checkbox" class="sheet-row-check" data-id="${esc(id)}"></td>`;
    }
    if (col.kind === 'actions') {
      return `<td class="sheet-cell-actions sheet-col-actions">
        <div class="actions-cell">
          <button class="dbtn dbtn-primary dbtn-sm" onclick="markOneDelivered('${esc(id)}')">Delivered</button>
          <button class="dbtn dbtn-outline-danger dbtn-sm" onclick="deleteDispatchTripLocal('${esc(id)}')">Delete</button>
        </div>
      </td>`;
    }
    if (col.key === 'plate') return readCell(`<strong>${esc(trip.plate || '—')}</strong>`);
    if (col.key === 'group') {
      const groupLabel = getDispatchGroup(trip) || trip.commodity || '—';
      const meta = COMMODITY_META[trip.commodity] || {};
      const pillCls = meta.cls ? `badge badge-sm pill-${meta.cls}` : 'badge badge-sm';
      return readCell(`<span class="${pillCls}">${esc(groupLabel)}</span>`);
    }
    if (col.key === 'location') return readCell(esc(getFriendlyLocation(trip)), 'sheet-cell-loc');
    if (col.key === 'gpsTimestamp') return readCell(formatFriendlyDateTime(trip.lastUpdated || trip.timestamp), 'ts-cell');
    if (col.key === 'status') return statusCell(id, getTruckOperationalStatus(trip), rowIndex, colIndex);
    if (col.editable) {
      return editCell(id, col.key, trip[col.key], rowIndex, colIndex);
    }
    return readCell(esc(trip[col.key] || '—'));
  };

  const grouped = groupDispatchRows(trips, sheetGroupBy);
  let html = '';
  let displayRowIndex = 0;
  grouped.forEach(({ label, count, rows }) => {
    if (label) html += renderDispatchGroupHeader(label, count || rows.length);
    rows.forEach(trip => {
      const rowIndex = displayRowIndex;
      html += `<tr data-id="${esc(trip.id)}" data-row-index="${rowIndex}" class="sheet-row">${columns.map((col, idx) => renderCell(trip, col, rowIndex, idx)).join('')}</tr>`;
      displayRowIndex += 1;
    });
  });
  tbody.innerHTML = html;

  document.querySelectorAll('.sheet-row-check').forEach(cb => {
    cb.addEventListener('change', () => cb.closest('tr').classList.toggle('row-selected', cb.checked));
  });
  bindDispatchSheetCellEvents();
}

function bindDispatchSheetCellEvents() {
  const tbody = document.getElementById('sheet-body');
  if (!tbody) return;
  tbody.querySelectorAll('.dispatch-cell-input').forEach(input => {
    input.addEventListener('input', handleDispatchCellEdit);
    input.addEventListener('change', handleDispatchCellEdit);
    input.addEventListener('focus', event => handleDispatchCellSelect(event));
    input.addEventListener('mousedown', event => {
      if (event.button !== 0) return;
      isSelectingDispatchRange = true;
      handleDispatchCellSelect(event);
    });
    input.addEventListener('mouseover', event => {
      if (!isSelectingDispatchRange) return;
      extendDispatchCellSelection(event.currentTarget);
    });
    input.addEventListener('keydown', handleDispatchSpreadsheetKeydown);
    input.addEventListener('paste', handleDispatchTablePaste);
  });
  updateDispatchSelectionStyles();
}

function getSelectedDispatchCellElements() {
  return Array.from(document.querySelectorAll('.sheet-cell-selected'));
}

function extendDispatchCellSelection(input) {
  if (!dispatchSheetSelection || !input?.classList?.contains('dispatch-cell-input')) return;
  dispatchSheetSelection.focusRow = Number(input.dataset.rowIndex);
  dispatchSheetSelection.focusCol = Number(input.dataset.colIndex);
  updateDispatchSelectionStyles();
}

function updateDispatchSelectionStyles() {
  document.querySelectorAll('.sheet-cell-selected, .sheet-cell-active').forEach(cell => {
    cell.classList.remove('sheet-cell-selected', 'sheet-cell-active');
  });
  if (!dispatchSheetSelection) return;
  const minRow = Math.min(dispatchSheetSelection.anchorRow, dispatchSheetSelection.focusRow);
  const maxRow = Math.max(dispatchSheetSelection.anchorRow, dispatchSheetSelection.focusRow);
  const minCol = Math.min(dispatchSheetSelection.anchorCol, dispatchSheetSelection.focusCol);
  const maxCol = Math.max(dispatchSheetSelection.anchorCol, dispatchSheetSelection.focusCol);
  document.querySelectorAll('.dispatch-cell-input').forEach(input => {
    const row = Number(input.dataset.rowIndex);
    const col = Number(input.dataset.colIndex);
    const cell = input.closest('td');
    if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
      cell?.classList.add('sheet-cell-selected');
    }
    if (row === dispatchSheetSelection.focusRow && col === dispatchSheetSelection.focusCol) {
      cell?.classList.add('sheet-cell-active');
    }
  });
}

function getSelectedDispatchSpreadsheetText() {
  if (!dispatchSheetSelection) return '';
  const minRow = Math.min(dispatchSheetSelection.anchorRow, dispatchSheetSelection.focusRow);
  const maxRow = Math.max(dispatchSheetSelection.anchorRow, dispatchSheetSelection.focusRow);
  const minCol = Math.min(dispatchSheetSelection.anchorCol, dispatchSheetSelection.focusCol);
  const maxCol = Math.max(dispatchSheetSelection.anchorCol, dispatchSheetSelection.focusCol);
  const rows = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    const values = [];
    for (let col = minCol; col <= maxCol; col += 1) {
      const input = document.querySelector(`.dispatch-cell-input[data-row-index="${row}"][data-col-index="${col}"]`);
      if (input) values.push(input.value || '');
    }
    if (values.length) rows.push(values.join('\t'));
  }
  return rows.join('\n');
}

function hasDispatchRangeSelection() {
  return Boolean(dispatchSheetSelection &&
    (dispatchSheetSelection.anchorRow !== dispatchSheetSelection.focusRow ||
     dispatchSheetSelection.anchorCol !== dispatchSheetSelection.focusCol));
}

function focusDispatchCell(row, col) {
  const input = document.querySelector(`.dispatch-cell-input[data-row-index="${row}"][data-col-index="${col}"]`);
  if (input) input.focus();
}

function handleDispatchSpreadsheetKeydown(event) {
  if (!event.currentTarget.classList.contains('dispatch-cell-input')) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) redoDispatchEdit();
    else undoDispatchEdit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    redoDispatchEdit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'a') {
    event.preventDefault();
    selectAllDispatchCells();
    return;
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (event.key === 'Backspace' && !hasDispatchRangeSelection()) return;
    event.preventDefault();
    handleDispatchCellDelete(event);
    return;
  }
  const moves = {
    ArrowRight: [0, 1],
    ArrowLeft: [0, -1],
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
    Enter: [1, 0],
  };
  if (!moves[event.key]) return;
  event.preventDefault();
  const row = Number(event.currentTarget.dataset.rowIndex) + moves[event.key][0];
  const col = Number(event.currentTarget.dataset.colIndex) + moves[event.key][1];
  focusDispatchCell(row, col);
}

function selectAllDispatchCells() {
  const inputs = Array.from(document.querySelectorAll('.dispatch-cell-input'));
  if (!inputs.length) return;
  const rows = inputs.map(input => Number(input.dataset.rowIndex));
  const cols = inputs.map(input => Number(input.dataset.colIndex));
  dispatchSheetSelection = {
    anchorRow: Math.min(...rows),
    anchorCol: Math.min(...cols),
    focusRow: Math.max(...rows),
    focusCol: Math.max(...cols),
  };
  updateDispatchSelectionStyles();
}

function handleDispatchCellSelect(event) {
  const input = event.currentTarget;
  if (!input?.classList?.contains('dispatch-cell-input')) return;
  const row = Number(input.dataset.rowIndex);
  const col = Number(input.dataset.colIndex);
  if (!event.shiftKey || !dispatchSheetSelection) {
    dispatchSheetSelection = { anchorRow: row, anchorCol: col, focusRow: row, focusCol: col };
  } else {
    dispatchSheetSelection.focusRow = row;
    dispatchSheetSelection.focusCol = col;
  }
  updateDispatchSelectionStyles();
}

function handleDispatchCellEdit(event) {
  const input = event.currentTarget.closest('.dispatch-cell-input');
  if (!input) return;
  const id = input.dataset.id;
  const field = input.dataset.field;
  const value = input.value.trim();
  if (!id || !field || !DISPATCH_EDITABLE_FIELDS.includes(field)) return;
  updateDispatchRowLocal(id, field, value);
}

function handleDispatchTablePaste(event, rowId, startField) {
  const input = event.currentTarget.closest('.dispatch-cell-input');
  const text = (event.clipboardData || window.clipboardData).getData('text/plain');
  if (!text.includes('\t') && !text.includes('\n')) return;
  event.preventDefault();
  if (!text || (!input && (!rowId || !startField))) return;

  const startId = rowId || input.dataset.id;
  const startKey = startField || input.dataset.field;
  const rows = text.replace(/\r/g, '').split('\n').filter(Boolean).map(row => row.split('\t'));
  const rowEls = Array.from(document.querySelectorAll('#sheet-body tr[data-id]'));
  const startRow = rowEls.findIndex(row => row.dataset.id === startId);
  const columns = getDispatchSheetColumns(applyDispatchSheetFilters(loadTrips()));
  const editableColumns = columns.filter(col => col.editable && col.key !== 'status');
  const startCol = editableColumns.findIndex(col => col.key === startKey);
  if (startRow === -1 || startCol === -1) return;

  beginDispatchHistoryBatch();
  rows.forEach((cols, rOffset) => {
    const tr = rowEls[startRow + rOffset];
    if (!tr) return;
    const id = tr.dataset.id;
    cols.forEach((value, cOffset) => {
      const col = editableColumns[startCol + cOffset];
      if (!col) return;
      const clean = value.trim();
      updateDispatchRowLocal(id, col.key, clean);
    });
  });
  endDispatchHistoryBatch();
  renderSheet();
  toast(`Pasted ${rows.length} row(s) locally.`, '#2563eb');
}

function handleDispatchTableCopy() {
  const copied = getSelectedDispatchSpreadsheetText();
  if (copied) {
    navigator.clipboard.writeText(copied)
      .then(() => toast('Selected cells copied.', '#2563eb'))
      .catch(() => toast('Copy failed. Use Ctrl+C after selecting cells.', '#dc2626'));
    return;
  }

  const checked = Array.from(document.querySelectorAll('.sheet-row-check:checked'));
  if (!checked.length) { toast('Select cells or rows first to copy.', '#d97706'); return; }
  const columns = getDispatchSheetColumns(applyDispatchSheetFilters(loadTrips()))
    .filter(col => col.key !== 'select' && col.key !== 'actions');
  const trips = loadTrips();
  const lines = checked.map(cb => {
    const trip = trips.find(t => t.id === cb.dataset.id);
    if (!trip) return '';
    return columns.map(col => {
      if (col.key === 'group') return getDispatchGroup(trip);
      if (col.key === 'location') return getFriendlyLocation(trip);
      if (col.key === 'gpsTimestamp') return formatFriendlyDateTime(trip.lastUpdated || trip.timestamp);
      if (col.key === 'status') return getTruckOperationalStatus(trip);
      return trip[col.key] || '';
    }).join('\t');
  }).filter(Boolean);
  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => toast(`${lines.length} row(s) copied.`, '#2563eb'))
    .catch(() => toast('Copy failed. Use Ctrl+C after selecting rows.', '#dc2626'));
}

function handleDispatchCellDelete(event) {
  if (event && !['Delete', 'Backspace'].includes(event.key)) return;
  const selected = Array.from(document.querySelectorAll('.sheet-cell-selected .dispatch-cell-input'));
  if (!selected.length) return;
  if (event) event.preventDefault();
  beginDispatchHistoryBatch();
  selected.forEach(input => {
    const field = input.dataset.field;
    const id = input.dataset.id;
    if (!DISPATCH_EDITABLE_FIELDS.includes(field)) return;
    input.value = '';
    updateDispatchRowLocal(id, field, '');
  });
  endDispatchHistoryBatch();
  updateDispatchSelectionStyles();
  toast(`${selected.length} cell(s) cleared locally.`, '#374151');
}

function deleteDispatchTripLocal(id) {
  if (!confirm('Delete this trip from the current local/frontend trip list only? This will not delete the truck or Google Sheets data.')) return;
  let trips = loadTrips();
  const trip = trips.find(t => t.id === id);
  trips = trips.filter(t => t.id !== id);
  saveTrips(trips);
  if (trip) logActivity(`Removed local trip: ${trip.plate} - ${getDispatchGroup(trip) || trip.commodity}`, '#dc2626');
  renderSheet();
  renderDashboardIfActive();
  toast('Local trip removed.', '#dc2626');
}

function exportSheetCSV() {
  const trips = loadTrips();
  if (!trips.length) { toast('No trips to export.', '#d97706'); return; }
  const cols    = ['plate','driver','helper','commodity','source','destination','status','bookingDate','planPickup','actualPickup','lsp','supplier','packaging','qty','refNumber','shipmentNumber','atw','eta','remarks','timestamp'];
  const headers = ['Plate','Driver','Helper','Commodity','Source','Destination','Status','Booking Date','Plan Pickup','Actual Pickup','LSP','Supplier','Packaging','Qty','Ref #','Shipment #','ATW','ETA','Remarks','Timestamp'];
  downloadCSV(headers, cols, trips, `VNS_Dispatch_Sheet_${today()}.csv`);
  toast('CSV exported.', '#2563eb');
}

/* ══════════════════════════════════════════════════════
   LOGS
══════════════════════════════════════════════════════ */

function renderLogs() {
  let logs = loadLogs();
  const commodity = document.getElementById('log-filter-commodity')?.value || '';
  const status    = document.getElementById('log-filter-status')?.value    || '';
  const search    = (document.getElementById('log-search')?.value          || '').toLowerCase();

  if (commodity) logs = logs.filter(l => l.commodity === commodity);
  if (status)    logs = logs.filter(l => l.status    === status);
  if (search)    logs = logs.filter(l =>
    [l.plate, l.driver, l.destination, l.source, l.commodity, l.remarks]
      .some(v => (v || '').toLowerCase().includes(search))
  );

  logs = [...logs].sort((a, b) => ((b.loggedAt || '') > (a.loggedAt || '') ? 1 : -1));

  const tbody = document.getElementById('logs-body');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="17"><div class="empty-state">No log entries found.</div></td></tr>`;
    return;
  }

  const allLogs = loadLogs();
  tbody.innerHTML = logs.map(l => {
    const badgeCls = STATUS_BADGE[l.status] || '';
    const commMeta = COMMODITY_META[l.commodity] || {};
    const pillCls  = commMeta.cls ? `badge pill-${commMeta.cls}` : 'badge';
    return `
      <tr data-log-id="${esc(l.id)}" data-log-at="${esc(l.loggedAt || '')}">
        <td><input type="checkbox" class="log-row-check" data-id="${esc(l.id)}" data-at="${esc(l.loggedAt || '')}"></td>
        <td><strong>${esc(l.plate)}</strong></td>
        <td>${esc(l.driver)}</td>
        <td>${esc(l.helper)}</td>
        <td><span class="${pillCls}">${esc(l.commodity)}</span></td>
        <td>${esc(l.source)}</td>
        <td>${esc(l.destination)}</td>
        <td><span class="badge ${badgeCls}">${esc(l.status)}</span></td>
        <td>${esc(l.bookingDate)}</td>
        <td>${esc(l.actualPickup)}</td>
        <td>${esc(l.lsp)}</td>
        <td>${esc(l.supplier)}</td>
        <td>${esc(l.qty)}</td>
        <td>${esc(l.refNumber)}</td>
        <td>${esc(l.shipmentNumber)}</td>
        <td>${esc(l.remarks)}</td>
        <td class="ts-cell">${esc(l.loggedAt ? new Date(l.loggedAt).toLocaleString('en-PH') : '')}</td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.log-row-check').forEach(cb => {
    cb.addEventListener('change', () => cb.closest('tr').classList.toggle('row-selected', cb.checked));
  });
}

function toggleAllLogs(master) {
  document.querySelectorAll('.log-row-check').forEach(cb => {
    cb.checked = master.checked;
    cb.closest('tr').classList.toggle('row-selected', master.checked);
  });
}

function deleteSelectedLogs() {
  const checks = Array.from(document.querySelectorAll('.log-row-check:checked'));
  if (!checks.length) { toast('Select at least one log entry.', '#d97706'); return; }
  if (!confirm(`Permanently delete ${checks.length} log entry/entries?`)) return;
  let logs = loadLogs();
  checks.forEach(cb => {
    const idx = logs.findIndex(l => l.id === cb.dataset.id && (l.loggedAt || '') === cb.dataset.at);
    if (idx !== -1) logs.splice(idx, 1);
  });
  saveLogs(logs);
  renderLogs();
  toast(`${checks.length} log entry/entries deleted.`, '#dc2626');
}

function exportLogsCSV() {
  const logs = loadLogs();
  if (!logs.length) { toast('No logs to export.', '#d97706'); return; }
  const cols    = ['plate','driver','helper','commodity','source','destination','status','bookingDate','actualPickup','lsp','supplier','qty','refNumber','shipmentNumber','remarks','loggedAt'];
  const headers = ['Plate','Driver','Helper','Commodity','Source','Destination','Status','Booking Date','Actual Pickup','LSP','Supplier','Qty','Ref #','Shipment #','Remarks','Logged At'];
  downloadCSV(headers, cols, logs, `VNS_Dispatch_Logs_${today()}.csv`);
  toast('Logs CSV exported.', '#2563eb');
}

/* ══════════════════════════════════════════════════════
   TRUCK MASTER
══════════════════════════════════════════════════════ */

function renderTruckMaster() {
  const trucks = loadTrucks();
  const tbody  = document.getElementById('truck-master-body');
  if (!tbody) return;
  if (!trucks.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">No trucks. Click + Add Truck above.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = trucks.map((t, i) => `
    <tr>
      <td class="ts-cell" style="text-align:center;">${i + 1}</td>
      <td><input type="text" value="${esc(t.plate)}"     data-tid="${esc(t.id)}" data-field="plate"     class="truck-field" /></td>
      <td><input type="text" value="${esc(t.driver)}"    data-tid="${esc(t.id)}" data-field="driver"    class="truck-field" /></td>
      <td><input type="text" value="${esc(t.helper)}"    data-tid="${esc(t.id)}" data-field="helper"    class="truck-field" /></td>
      <td><input type="text" value="${esc(t.truckType)}" data-tid="${esc(t.id)}" data-field="truckType" class="truck-field" /></td>
      <td><input type="text" value="${esc(t.notes)}"     data-tid="${esc(t.id)}" data-field="notes"     class="truck-field" /></td>
      <td>
        <div class="actions-cell">
          <button class="dbtn dbtn-gray dbtn-sm" onclick="saveTruckRow('${esc(t.id)}')">Save</button>
          <button class="dbtn dbtn-gray dbtn-sm" onclick="deleteTruckRow('${esc(t.id)}')">Del</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function saveTruckRow(tid) {
  const trucks = loadTrucks();
  const truck  = trucks.find(t => t.id === tid);
  if (!truck) return;
  document.querySelectorAll(`.truck-field[data-tid="${tid}"]`).forEach(inp => {
    truck[inp.dataset.field] = inp.value.trim();
  });
  saveTrucks(trucks);
  toast(`Truck ${truck.plate} saved.`, '#16a34a');
  renderDashboardIfActive();
}

function deleteTruckRow(tid) {
  if (!confirm('Remove this truck from the fleet?')) return;
  saveTrucks(loadTrucks().filter(t => t.id !== tid));
  renderTruckMaster();
  toast('Truck removed.', '#dc2626');
}

function addTruckRow() {
  const trucks = loadTrucks();
  trucks.push({ id: uid(), plate: '', driver: '', helper: '', truckType: '10-Wheeler GO', notes: '', latitude: null, longitude: null, lastUpdated: null });
  saveTrucks(trucks);
  renderTruckMaster();
}

function openTruckMasterTab() {
  switchTab('trucks');
  renderTruckMaster();
}

/* ══════════════════════════════════════════════════════
   TRIP MODAL
══════════════════════════════════════════════════════ */

function openTripModal(tripId = null) {
  const trucks   = loadTrucks();
  const plateSel = document.getElementById('f-plate');
  if (!plateSel) return;

  plateSel.innerHTML = '<option value="">— Select Truck —</option>' +
    trucks.map(t => `<option value="${esc(t.plate)}">${esc(t.plate)}</option>`).join('');

  plateSel.onchange = () => {
    const t = trucks.find(tr => tr.plate === plateSel.value);
    if (!t) return;
    const d = document.getElementById('f-driver');
    const h = document.getElementById('f-helper');
    const y = document.getElementById('f-truck-type');
    if (d && !d.value) d.value = t.driver;
    if (h && !h.value) h.value = t.helper;
    if (y && !y.value) y.value = t.truckType;
  };

  clearTripForm();
  document.getElementById('trip-edit-id').value = '';
  document.getElementById('trip-modal-title').textContent = 'Add Trip';

  if (tripId) {
    const trips = loadTrips();
    const t     = trips.find(x => x.id === tripId);
    if (t) {
      document.getElementById('trip-modal-title').textContent  = 'Edit Trip';
      document.getElementById('trip-edit-id').value            = t.id;
      plateSel.value                                           = t.plate;
      document.getElementById('f-driver').value                = t.driver        || '';
      document.getElementById('f-helper').value                = t.helper        || '';
      document.getElementById('f-truck-type').value            = t.truckType     || '';
      document.getElementById('f-commodity').value             = t.commodity     || '';
      document.getElementById('f-status').value                = t.status        || 'Scheduled';
      document.getElementById('f-source').value                = t.source        || '';
      document.getElementById('f-destination').value           = t.destination   || '';
      document.getElementById('f-booking-date').value          = t.bookingDate   || '';
      document.getElementById('f-plan-pickup').value           = t.planPickup    || '';
      document.getElementById('f-actual-pickup').value         = t.actualPickup  || '';
      document.getElementById('f-eta').value                   = t.eta           || '';
      document.getElementById('f-lsp').value                   = t.lsp           || '';
      document.getElementById('f-supplier').value              = t.supplier      || '';
      document.getElementById('f-packaging').value             = t.packaging     || '';
      document.getElementById('f-qty').value                   = t.qty           || '';
      document.getElementById('f-ref-number').value            = t.refNumber     || '';
      document.getElementById('f-shipment-number').value       = t.shipmentNumber|| '';
      document.getElementById('f-atw').value                   = t.atw           || '';
      document.getElementById('f-remarks').value               = t.remarks       || '';
    }
  }

  document.getElementById('trip-modal').classList.add('open');
}

function editTrip(id) { openTruckEditModal(id); }

function closeTripModal() {
  document.getElementById('trip-modal').classList.remove('open');
}

function clearTripForm() {
  ['f-plate','f-driver','f-helper','f-truck-type','f-commodity','f-status','f-source',
   'f-destination','f-booking-date','f-plan-pickup','f-actual-pickup','f-eta','f-lsp',
   'f-supplier','f-packaging','f-qty','f-ref-number','f-shipment-number','f-atw','f-remarks']
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = el.tagName === 'SELECT' ? el.options[0].value : '';
    });
  const s = document.getElementById('f-status');
  if (s) s.value = 'Scheduled';
}

function saveTrip() {
  const plate     = document.getElementById('f-plate').value.trim();
  const commodity = document.getElementById('f-commodity').value.trim();
  if (!plate)     { toast('Plate number is required.', '#dc2626'); return; }
  if (!commodity) { toast('Commodity is required.',    '#dc2626'); return; }

  const editId = document.getElementById('trip-edit-id').value;
  let trips    = loadTrips();
  const prev   = editId ? trips.find(t => t.id === editId) : null;

  const tripData = {
    id:             editId || uid(),
    recordId:       prev?.recordId || createDispatchRecordId(commodity),
    plate,
    driver:         document.getElementById('f-driver').value.trim(),
    helper:         document.getElementById('f-helper').value.trim(),
    truckType:      document.getElementById('f-truck-type').value.trim(),
    commodity,
    status:         document.getElementById('f-status').value.trim(),
    source:         document.getElementById('f-source').value.trim(),
    destination:    document.getElementById('f-destination').value.trim(),
    bookingDate:    document.getElementById('f-booking-date').value,
    planPickup:     document.getElementById('f-plan-pickup').value,
    actualPickup:   document.getElementById('f-actual-pickup').value,
    eta:            document.getElementById('f-eta').value.trim(),
    lsp:            document.getElementById('f-lsp').value.trim(),
    supplier:       document.getElementById('f-supplier').value.trim(),
    packaging:      document.getElementById('f-packaging').value.trim(),
    qty:            document.getElementById('f-qty').value.trim(),
    refNumber:      document.getElementById('f-ref-number').value.trim(),
    shipmentNumber: document.getElementById('f-shipment-number').value.trim(),
    atw:            document.getElementById('f-atw').value.trim(),
    remarks:        document.getElementById('f-remarks').value.trim(),
    latitude:       prev?.latitude    || null,
    longitude:      prev?.longitude   || null,
    lastUpdated:    prev?.lastUpdated || null,
    createdAt:      prev?.createdAt || new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
    deliveredAt:    prev?.deliveredAt || '',
    loggedAt:       prev?.loggedAt || '',
    timestamp:      prev?.timestamp   || new Date().toLocaleString('en-PH'),
  };

  if (editId) {
    const idx = trips.findIndex(t => t.id === editId);
    if (idx !== -1) trips[idx] = tripData;
    logActivity(`Updated: ${plate} — ${commodity} → ${tripData.destination || '?'}`, '#7c3aed');
  } else {
    trips.push(tripData);
    logActivity(`New trip: ${plate} — ${commodity} → ${tripData.destination || '?'}`, '#2563eb');
  }

  saveTrips(trips);
  closeTripModal();
  renderSheet();
  renderDashboardIfActive();
  queueDispatchTripSync(tripData);
  toast(editId ? 'Trip updated.' : 'Trip added.', '#16a34a');
}

/* ══════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════ */

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function toast(msg, bg = '#2563eb') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.style.background = bg;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function downloadCSV(headers, cols, data, filename) {
  const rows = [headers, ...data.map(d => cols.map(c => `"${String(d[c] || '').replace(/"/g, '""')}"`))];
  const csv  = '﻿' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function renderDashboardIfActive() {
  if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
    refreshDispatchDashboard();
  }
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Seed default trucks if first load
  if (!localStorage.getItem(LS_TRUCKS)) saveTrucks(defaultTrucks());
  saveTrips(loadTrips());

  // Tab switching
  document.querySelectorAll('.dispatch-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === 'dashboard') {
        setTimeout(updateDispatchMap, 60);
        refreshDispatchDashboard();
      }
      if (btn.dataset.tab === 'dispatcher-sheet') renderSheet();
      if (btn.dataset.tab === 'logs')             renderLogs();
      if (btn.dataset.tab === 'trucks')           renderTruckMaster();
    });
  });

  // Modal overlay close
  const modal = document.getElementById('trip-modal');
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeTripModal(); });

  const teModal = document.getElementById('truck-edit-modal');
  if (teModal) teModal.addEventListener('click', e => { if (e.target === teModal) closeTruckEditModal(); });

  renderDispatchGroupTabs();

  // Init map then load dashboard
  setTimeout(async () => {
    initDispatchMap();
    await refreshDispatchDashboard();
    fetchAndMergeDispatchSheetTrips();
  }, 150);

  renderSheet();
});

document.addEventListener('mouseup', () => {
  isSelectingDispatchRange = false;
});

document.addEventListener('copy', event => {
  if (!document.activeElement?.classList?.contains('dispatch-cell-input')) return;
  const selectedText = window.getSelection()?.toString();
  if (selectedText) return;
  const copied = getSelectedDispatchSpreadsheetText();
  if (!copied) return;
  event.preventDefault();
  event.clipboardData.setData('text/plain', copied);
});
