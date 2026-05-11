/* ═══════════════════════════════════════════════════════════════════
   VNS DISPATCH MODULE — dispatch.js
   ---------------------------------------------------------------
   Apps Script connection: set DISPATCH_APP_SCRIPT_URL to a deployed
   doGet/doPost Web App URL to enable live data.
   Falls back to localStorage when URL is empty or fetch fails.
═══════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────
   APPS SCRIPT CONNECTION (set URL when ready)
────────────────────────────────────────── */
const DISPATCH_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwkA_gMbqPvtW3kEDsCKAkgylrakQwRHlPNPYENT2GYvjH1AGAsmusUuPUvWrB_KakH/exec";

/*
  Expected doGet actions:
    ?action=getDispatchDashboard
    ?action=getDispatchTrucks
    ?action=getDispatchTrips
    ?action=getDispatchLogs
    ?action=getTruckLocations

  Expected doPost actions (payload.action):
    updateDispatchTrip
    saveDispatchLog
    updateTruckStatus
*/

/* ──────────────────────────────────────────
   STORAGE KEYS
────────────────────────────────────────── */
const LS_TRIPS    = 'vnsDispatchTrips';
const LS_LOGS     = 'vnsDispatchLogs';
const LS_TRUCKS   = 'vnsDispatchTruckMaster';
const LS_ACTIVITY = 'vnsDispatchActivity';

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
};

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
let dispatchMap     = null;
let dispatchMarkers = [];

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

function loadTrips()    { try { return JSON.parse(localStorage.getItem(LS_TRIPS))    || []; } catch { return []; } }
function loadLogs()     { try { return JSON.parse(localStorage.getItem(LS_LOGS))     || []; } catch { return []; } }
function loadTrucks()   { try { return JSON.parse(localStorage.getItem(LS_TRUCKS))   || defaultTrucks(); } catch { return defaultTrucks(); } }
function loadActivity() { try { return JSON.parse(localStorage.getItem(LS_ACTIVITY)) || []; } catch { return []; } }

function saveTrips(d)    { localStorage.setItem(LS_TRIPS,    JSON.stringify(d)); }
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
    plateNumber:   t.plateNumber   || t.plate  || '',
    driverName:    t.driverName    || t.driver || '',
    helperName:    t.helperName    || t.helper || '',
    groupCategory: t.groupCategory || '',
    fullAddress:   t.fullAddress   || '',
    mapLink:       t.mapLink       || '',
    imei:          t.imei          || '',
  };
}

function normalizeLiveTrip(t) {
  return {
    // local field names
    id:             t.id             || null,
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
    latitude:       t.latitude       ?? null,
    longitude:      t.longitude      ?? null,
    lastUpdated:    t.lastUpdated    || null,
    timestamp:      t.lastUpdated    || t.timestamp || new Date().toLocaleString('en-PH'),
    // original API fields
    plateNumber:    t.plateNumber    || t.plate  || '',
    driverName:     t.driverName     || t.driver || '',
    helperName:     t.helperName     || t.helper || '',
    groupCategory:  t.groupCategory  || '',
    fullAddress:    t.fullAddress    || '',
    mapLink:        t.mapLink        || '',
    etaAta:         t.etaAta         || '',
    dateAssigned:   t.dateAssigned   || '',
    deliveredAt:    t.deliveredAt    || '',
    imei:           t.imei           || '',
  };
}

function normalizeLiveLog(t) {
  const entry = normalizeLiveTrip(t);
  entry.loggedAt = t.deliveredAt || t.lastUpdated || new Date().toISOString();
  return entry;
}

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */

async function refreshDispatchDashboard() {
  setDataStatus('loading');
  try {
    const raw = await fetchDispatchDashboardData();

    let trucks, trips, logs;

    if (DISPATCH_APP_SCRIPT_URL && raw.ok !== false) {
      // Live API data — normalize field names and cache to localStorage
      trucks = (raw.trucks || []).map(normalizeLiveTruck);
      trips  = (raw.trips  || []).map(normalizeLiveTrip);
      logs   = (raw.logs   || []).map(normalizeLiveLog);
      saveTrucks(trucks);
      saveTrips(trips);
      saveLogs(logs);
      if (raw.warnings && raw.warnings.length) {
        console.warn('[VNS Dispatch] API warnings:', raw.warnings);
      }
    } else {
      // Local fallback — use stored data as-is
      trucks = raw.trucks || loadTrucks();
      trips  = raw.trips  || loadTrips();
      logs   = loadLogs();
    }

    const todayStr = today();
    renderDispatchKPIs({
      activeTrips:    trips.filter(t => !['Delivered', 'Cancelled'].includes(t.status)).length,
      inTransit:      trips.filter(t => t.status === 'In Transit').length,
      deliveredToday: logs.filter(l => (l.loggedAt || l.deliveredAt || '').startsWith(todayStr)).length,
      totalLogs:      logs.length,
    });

    renderDispatchTruckCards(trucks, trips);
    renderCommodityBreakdown(trips);
    renderRecentActivity(raw.recentActivity || null);
    populateTruckFilter(trucks);

    // GPS markers come from trucks with lat/lng in the dashboard response
    renderTruckMarkers(trucks.filter(t => t.latitude && t.longitude));

    renderSheet();
    renderLogs();

    setDataStatus(DISPATCH_APP_SCRIPT_URL ? 'live' : 'local');
  } catch (err) {
    console.error('[VNS Dispatch] refreshDispatchDashboard failed:', err);
    setDataStatus('error');
    toast('Could not load live data. Showing local data.', '#dc2626');
  }
}

function renderDispatchKPIs(data) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
  set('sc-active',    data.activeTrips    ?? 0);
  set('sc-intransit', data.inTransit      ?? 0);
  set('sc-delivered', data.deliveredToday ?? 0);
  set('sc-logs',      data.totalLogs      ?? 0);
}

function renderDispatchTruckCards(trucks, trips) {
  const row = document.getElementById('truck-cards-row');
  if (!row) return;
  if (!trucks.length) {
    row.innerHTML = '<p class="no-trucks-note">No trucks configured. Go to the Truck Master tab to add trucks.</p>';
    return;
  }
  row.innerHTML = trucks.map(t => {
    const plate  = t.plate || t.plateNumber || '';
    const driver = t.driver || t.driverName || '';
    const helper = t.helper || t.helperName || '';
    const activeTrip = trips.find(tr =>
      (tr.plate || tr.plateNumber) === plate &&
      !['Delivered', 'Cancelled'].includes(tr.status)
    );
    const status   = activeTrip ? activeTrip.status : (t.status || 'Idle');
    const badgeCls = STATUS_BADGE[status] || 'badge-idle';
    const commMeta = activeTrip ? COMMODITY_META[activeTrip.commodity] : null;
    const hasGPS   = t.latitude && t.longitude;

    return `
      <div class="truck-dispatch-card" data-plate="${esc(plate)}">
        <div class="tdc-header">
          <div class="tdc-plate-wrap">
            <span class="tdc-plate">${esc(plate)}</span>
          </div>
          <span class="badge ${esc(badgeCls)}">${esc(status)}</span>
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
            <span class="badge badge-sm pill-${esc(commMeta?.cls || '')}">${esc(activeTrip.commodity)}</span>
            <div class="tdc-route">${esc(activeTrip.source || '?')} <span class="arrow">→</span> ${esc(activeTrip.destination || '?')}</div>
            <div class="tdc-eta">ETA <strong>${esc(activeTrip.etaAta || activeTrip.eta || '—')}</strong></div>
          </div>
        ` : `<div class="tdc-idle">No active trip assigned</div>`}
        <div class="tdc-footer">
          ${hasGPS ? `
            <button class="dbtn dbtn-sm dbtn-map-btn" onclick="focusMapOnTruck(${t.latitude},${t.longitude},'${esc(plate)}')">
              View on Map
            </button>
          ` : ''}
          ${t.lastUpdated ? `
            <span class="tdc-gps-time">GPS ${esc(new Date(t.lastUpdated).toLocaleTimeString('en-PH'))}</span>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderCommodityBreakdown(trips) {
  const grid = document.getElementById('commodity-grid');
  if (!grid) return;
  const counts = {};
  COMMODITIES.forEach(c => (counts[c] = 0));
  trips.forEach(t => { if (counts[t.commodity] !== undefined) counts[t.commodity]++; });
  grid.innerHTML = COMMODITIES.map(c => {
    const meta  = COMMODITY_META[c];
    const count = counts[c];
    const pct   = trips.length ? Math.round((count / trips.length) * 100) : 0;
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

  const note = document.getElementById('map-no-data-note');
  if (note && !DISPATCH_APP_SCRIPT_URL) note.style.display = 'block';
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
    const plate   = esc(t.plateNumber  || t.plate       || 'Unknown');
    const group   = esc(t.groupCategory || t.commodity  || '—');
    const driver  = esc(t.driverName   || t.driver      || '—');
    const helper  = esc(t.helperName   || t.helper      || '—');
    const status  = esc(t.status       || '—');
    const src     = esc(t.source       || '—');
    const dest    = esc(t.destination  || '—');
    const addr    = esc(t.fullAddress  || '');
    const updated = t.lastUpdated
      ? esc(new Date(t.lastUpdated).toLocaleString('en-PH'))
      : '—';

    const icon = L.divIcon({
      className: '',
      html: `<div class="truck-map-pin" title="${plate}">T</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -20],
    });

    const marker = L.marker([lat, lng], { icon }).addTo(dispatchMap);
    marker.bindPopup(`
      <div class="map-popup">
        <div class="mp-title">${plate}</div>
        <div class="mp-row"><b>Group:</b> ${group}</div>
        <div class="mp-row"><b>Driver:</b> ${driver}</div>
        <div class="mp-row"><b>Helper:</b> ${helper}</div>
        <div class="mp-row"><b>Status:</b> ${status}</div>
        <div class="mp-row"><b>From:</b> ${src}</div>
        <div class="mp-row"><b>To:</b> ${dest}</div>
        ${addr ? `<div class="mp-row"><b>Address:</b> ${addr}</div>` : ''}
        <div class="mp-time">Updated: ${updated}</div>
      </div>
    `);
    dispatchMarkers.push(marker);
  });

  if (dispatchMarkers.length && dispatchMap) {
    const group = L.featureGroup(dispatchMarkers);
    dispatchMap.fitBounds(group.getBounds(), { padding: [50, 50] });
  }
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
    dispatchMap.setView([lat, lng], 14);
    dispatchMarkers.forEach(m => {
      const el = m.getElement();
      if (el && el.title === plate) m.openPopup();
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
  let trips = loadTrips();
  const commodity = document.getElementById('filter-commodity')?.value || '';
  const status    = document.getElementById('filter-status')?.value    || '';
  const truck     = document.getElementById('filter-truck')?.value     || '';
  const search    = (document.getElementById('filter-search')?.value   || '').toLowerCase();

  if (commodity) trips = trips.filter(t => t.commodity === commodity);
  if (status)    trips = trips.filter(t => t.status    === status);
  if (truck)     trips = trips.filter(t => t.plate     === truck);
  if (search)    trips = trips.filter(t =>
    [t.plate, t.driver, t.source, t.destination, t.commodity, t.remarks, t.refNumber]
      .some(v => (v || '').toLowerCase().includes(search))
  );

  const tbody = document.getElementById('sheet-body');
  if (!tbody) return;

  if (!trips.length) {
    tbody.innerHTML = `<tr><td colspan="22"><div class="empty-state">No trips match the current filter.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = trips.map(t => {
    const badgeCls = STATUS_BADGE[t.status] || '';
    const commMeta = COMMODITY_META[t.commodity] || {};
    const pillCls  = commMeta.cls ? `badge pill-${commMeta.cls}` : 'badge';
    return `
      <tr data-id="${esc(t.id)}">
        <td><input type="checkbox" class="sheet-row-check" data-id="${esc(t.id)}"></td>
        <td><strong>${esc(t.plate)}</strong></td>
        <td>${esc(t.driver)}</td>
        <td>${esc(t.helper)}</td>
        <td><span class="${pillCls}">${esc(t.commodity)}</span></td>
        <td>${esc(t.source)}</td>
        <td>${esc(t.destination)}</td>
        <td><span class="badge ${badgeCls}">${esc(t.status)}</span></td>
        <td>${esc(t.bookingDate)}</td>
        <td>${esc(t.planPickup)}</td>
        <td>${esc(t.actualPickup)}</td>
        <td>${esc(t.lsp)}</td>
        <td>${esc(t.supplier)}</td>
        <td>${esc(t.packaging)}</td>
        <td>${esc(t.qty)}</td>
        <td>${esc(t.refNumber)}</td>
        <td>${esc(t.shipmentNumber)}</td>
        <td>${esc(t.atw)}</td>
        <td>${esc(t.eta)}</td>
        <td>${esc(t.remarks)}</td>
        <td class="ts-cell">${esc(t.timestamp || '')}</td>
        <td>
          <div class="actions-cell">
            <button class="dbtn dbtn-gray dbtn-sm" onclick="editTrip('${esc(t.id)}')">Edit</button>
            <button class="dbtn dbtn-primary dbtn-sm" onclick="markOneDelivered('${esc(t.id)}')">Delivered</button>
            <button class="dbtn dbtn-gray dbtn-sm" onclick="deleteOneTrip('${esc(t.id)}')">Del</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

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
  ids.forEach(id => {
    const t = trips.find(x => x.id === id);
    if (t) {
      logs.push({ ...t, loggedAt: new Date().toISOString() });
      logActivity(`Added to logs: ${t.plate} — ${t.commodity} → ${t.destination}`, '#7c3aed');
    }
  });
  saveLogs(logs);
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
      id: t.id, plate: t.plate,
      driver: trk ? trk.driver : t.driver,
      helper: trk ? trk.helper : t.helper,
      truckType: t.truckType,
      commodity: '', source: '', destination: '', status: 'Scheduled',
      bookingDate: '', planPickup: '', actualPickup: '', lsp: '', supplier: '',
      packaging: '', qty: '', refNumber: '', shipmentNumber: '', atw: '',
      eta: '', remarks: '', latitude: null, longitude: null, lastUpdated: null,
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
  if (idx === -1) return;
  const t = { ...trips[idx], status: finalStatus, loggedAt: new Date().toISOString() };
  logs.push(t);
  trips.splice(idx, 1);
  saveTrips(trips);
  saveLogs(logs);
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
  if (!confirm('Remove this trip from the dispatcher sheet?')) return;
  let trips = loadTrips();
  const t   = trips.find(x => x.id === id);
  trips     = trips.filter(x => x.id !== id);
  saveTrips(trips);
  if (t) logActivity(`Removed trip: ${t.plate} — ${t.commodity}`, '#dc2626');
  renderSheet();
  renderDashboardIfActive();
  toast('Trip removed.', '#dc2626');
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

function editTrip(id) { openTripModal(id); }

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

  // Init map then load dashboard
  setTimeout(() => {
    initDispatchMap();
    refreshDispatchDashboard();
  }, 150);

  renderSheet();
});
