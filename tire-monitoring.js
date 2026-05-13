'use strict';

const TIRE_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzjNvohEpqR8_X-UwJrI5yZQFn4sKJwv5ctzc2wj38VPK76yrfNE4skX-zLgMRJmntB/exec";
const TIRE_SYNC_KEY       = "vns-tire-sync-2026-Jay";

function tirePost(payload) {
  return fetch(TIRE_APP_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ syncKey: TIRE_SYNC_KEY, ...payload })
  }).then(r => r.json());
}

function syncTireRecord(action, record, statusEl) {
  tirePost({ action, record })
    .then(res => {
      if (!statusEl) return;
      statusEl.textContent = (res && res.ok) ? 'Saved and synced.' : 'Saved locally. Sync failed.';
      statusEl.className   = (res && res.ok) ? 'tire-form-status' : 'tire-form-status error';
    })
    .catch(() => {
      if (!statusEl) return;
      statusEl.textContent = 'Saved locally. Sync failed.';
      statusEl.className   = 'tire-form-status error';
    });
}

function syncTireBatch(action, records, statusEl) {
  tirePost({ action, records })
    .then(res => {
      if (!statusEl) return;
      statusEl.textContent = (res && res.ok) ? 'Saved and synced.' : 'Saved locally. Sync failed.';
      statusEl.className   = (res && res.ok) ? 'tire-form-status' : 'tire-form-status error';
    })
    .catch(() => {
      if (!statusEl) return;
      statusEl.textContent = 'Saved locally. Sync failed.';
      statusEl.className   = 'tire-form-status error';
    });
}

function toTireInventoryRecord(t) {
  return {
    Tire_ID: t.id,
    Purchase_Date: t.dateAdded || '',
    Supplier: t.supplier || '',
    Invoice_No: '',
    Tire_Serial: t.serial || '',
    Brand: t.brand || '',
    Tire_Size: t.size || '',
    Cost: String(t.cost || ''),
    Quantity: String(t.qty || 1),
    Storage_Location: t.location || '',
    Status: t.status || '',
    Linked_Plate_Number: t.assignedPlate || '',
    Linked_Tire_Position: '',
    Remarks: t.remarks || '',
    Created_At: t.createdAt || '',
    Updated_At: t.createdAt || ''
  };
}

function toTireChangeLogRecord(r) {
  return {
    Change_ID: r.id,
    Change_Date: r.date || '',
    Plate_Number: r.plate || '',
    IMEI: '',
    Truck_Type: '',
    Truck_Make: '',
    Tire_Position: r.position || '',
    Action_Type: r.action || '',
    Old_Tire_Serial: '',
    New_Tire_Serial: r.serial || '',
    Brand: r.brand || '',
    Tire_Size: r.size || '',
    Reason: r.condition || '',
    Driver_Name: '',
    Signature_By: r.performedBy || '',
    Odometer: r.odometer || '',
    Remarks: r.remarks || '',
    Encoded_At: r.createdAt || ''
  };
}

function toTireDisposalRecord(r) {
  return {
    Disposal_ID: r.id,
    Disposal_Date: r.date || '',
    Tire_Serial: r.serial || '',
    Brand: r.brand || '',
    Tire_Size: r.size || '',
    Last_Plate_Number: r.plate || '',
    Last_Tire_Position: '',
    Disposal_Status: 'Disposed',
    Disposal_Method: r.reason || '',
    Disposal_Destination: r.recycler || '',
    Receiver_Contact: '',
    Disposal_Receipt_No: '',
    Disposal_Certificate_No: r.certNo || '',
    Estimated_Scrap_Value: '',
    Disposed_By: r.disposedBy || '',
    Remarks: r.remarks || '',
    Encoded_At: r.createdAt || ''
  };
}

/* ══════════════════════════════════════════════════
   TIRE MONITORING — tire-monitoring.js
   localStorage keys:
     vnsTruckMaster        (read-only, owned by Master Data)
     vnsTireInventory      (array of tire stock records)
     vnsTireChangeLogs     (array of change/install events)
     vnsTirePositionStatus (map: plate -> positionCode -> {serial,brand,size,status})
     vnsTireDisposalLogs   (array of disposal records)
══════════════════════════════════════════════════ */

/* ─── Truck Type Definitions ───────────────────── */
const TRUCK_TYPE_DEFS = {
  '6W_40FT_3AX': {
    label: 'Tractor Head (6W) + 40 ft Flatbed (3 Axle)',
    tractor: ['1','2','3','4','5','6'],
    trailer: ['A','B','C','D','E','F','G','H','I','J','K','L'],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive', positions: [['3','5'],['4','6']] },
      ],
      trailer: [
        { label: 'T1', positions: [['A','C'],['B','D']] },
        { label: 'T2', positions: [['E','G'],['F','H']] },
        { label: 'T3', positions: [['I','K'],['J','L']] },
      ],
    },
  },
  '10W_40FT_4AX': {
    label: 'Tractor Head (10W) + 40 ft Flatbed (4 Axle)',
    tractor: ['1','2','3','4','5','6','7','8','9','10'],
    trailer: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive1', positions: [['3','5'],['4','6']] },
        { label: 'Drive2', positions: [['7','9'],['8','10']] },
      ],
      trailer: [
        { label: 'T1', positions: [['A','C'],['B','D']] },
        { label: 'T2', positions: [['E','G'],['F','H']] },
        { label: 'T3', positions: [['I','K'],['J','L']] },
        { label: 'T4', positions: [['M','O'],['N','P']] },
      ],
    },
  },
  '10W_SHORT_FB_3AX': {
    label: 'Tractor Head (10W) + 26/28/32/34/36 Trailer Flatbed (3 Axle)',
    tractor: ['1','2','3','4','5','6','7','8','9','10'],
    trailer: ['A','B','C','D','E','F','G','H','I','J','K','L'],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive1', positions: [['3','5'],['4','6']] },
        { label: 'Drive2', positions: [['7','9'],['8','10']] },
      ],
      trailer: [
        { label: 'T1', positions: [['A','C'],['B','D']] },
        { label: 'T2', positions: [['E','G'],['F','H']] },
        { label: 'T3', positions: [['I','K'],['J','L']] },
      ],
    },
  },
  '10W_SHORT_WV_3AX': {
    label: 'Tractor Head (10W) + 26/28/32/34/36 Trailer Wing Van (3 Axle)',
    tractor: ['1','2','3','4','5','6','7','8','9','10'],
    trailer: ['A','B','C','D','E','F','G','H','I','J','K','L'],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive1', positions: [['3','5'],['4','6']] },
        { label: 'Drive2', positions: [['7','9'],['8','10']] },
      ],
      trailer: [
        { label: 'T1', positions: [['A','C'],['B','D']] },
        { label: 'T2', positions: [['E','G'],['F','H']] },
        { label: 'T3', positions: [['I','K'],['J','L']] },
      ],
    },
  },
  '10W_WV': {
    label: '10W Wingvan',
    tractor: ['1','2','3','4','5','6','7','8','9','10'],
    trailer: [],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive1', positions: [['3','5'],['4','6']] },
        { label: 'Drive2', positions: [['7','9'],['8','10']] },
      ],
      trailer: [],
    },
  },
  '12W_WV': {
    label: '12W Wingvan',
    tractor: ['1','2','3','4','5','6','7','8','9','10','11','12'],
    trailer: [],
    axles: {
      tractor: [
        { label: 'Steer', positions: [['1'],['2']] },
        { label: 'Drive1', positions: [['3','5'],['4','6']] },
        { label: 'Drive2', positions: [['7','9'],['8','10']] },
        { label: 'Drive3', positions: [['11'],['12']] },
      ],
      trailer: [],
    },
  },
};

/* ─── All positions for a truck type ─────────── */
function allPositions(typeKey) {
  const def = TRUCK_TYPE_DEFS[typeKey];
  if (!def) return [];
  return [...def.tractor, ...def.trailer];
}

/* ─── Storage helpers ─────────────────────────── */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getTrucks() {
  return loadJSON('vnsTruckMaster', []);
}
function normalizePlate(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}
function getTruckPlate(truck) {
  return normalizePlate(truck?.Plate_Number || truck?.plateNumber || truck?.plate || '');
}
function getTruckTypeKey(truck) {
  return String(truck?.Truck_Type || truck?.truckType || '').trim();
}
function getTruckGroup(truck) {
  return String(truck?.Group_Category || truck?.groupCategory || '').trim() || 'Unknown / Needs Update';
}
function findTruckByPlate(trucks, plate) {
  const normalizedPlate = normalizePlate(plate);
  return (trucks || getTrucks()).find(truck => getTruckPlate(truck) === normalizedPlate);
}
function getTireInventory() {
  return loadJSON('vnsTireInventory', []);
}
function saveTireInventory(data) {
  saveJSON('vnsTireInventory', data);
}
function getChangeLogs() {
  return loadJSON('vnsTireChangeLogs', []);
}
function saveChangeLogs(data) {
  saveJSON('vnsTireChangeLogs', data);
}
function getPositionStatus() {
  return loadJSON('vnsTirePositionStatus', {});
}
function savePositionStatus(data) {
  saveJSON('vnsTirePositionStatus', data);
}
function getDisposalLogs() {
  return loadJSON('vnsTireDisposalLogs', []);
}
function saveDisposalLogs(data) {
  saveJSON('vnsTireDisposalLogs', data);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ─── Status badge HTML ───────────────────────── */
const STATUS_CSS = {
  'Good':        'tsb-good',
  'Monitor':     'tsb-monitor',
  'Replace':     'tsb-replace',
  'Spare':       'tsb-spare',
  'Removed':     'tsb-removed',
  'For Disposal':'tsb-disposal',
  'New':         'tsb-new',
  'Installed':   'tsb-installed',
  'Returned':    'tsb-returned',
};
function statusBadge(status) {
  const cls = STATUS_CSS[status] || 'tsb-removed';
  return `<span class="tire-status-badge ${cls}">${esc(status || '—')}</span>`;
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─── Toast ────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('tire-toast');
  el.textContent = msg;
  el.className = 'visible' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

/* ─── Tab routing ─────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.tire-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tire-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tire-tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
      if (btn.dataset.tab === 'layout')    renderLayoutTab();
      if (btn.dataset.tab === 'change')    renderChangeTab();
      if (btn.dataset.tab === 'inventory') renderInventoryTab();
      if (btn.dataset.tab === 'history')   renderHistoryTab();
      if (btn.dataset.tab === 'disposal')  renderDisposalTab();
    });
  });
}

/* ══════════════════════════════════════════════════
   TAB 1 — TIRE LAYOUT
══════════════════════════════════════════════════ */
function renderLayoutTab() {
  const trucks = getTrucks();
  const selectedGroup = document.getElementById('layout-group-select')?.value || '';
  const visibleTrucks = selectedGroup
    ? trucks.filter(truck => getTruckGroup(truck) === selectedGroup)
    : trucks;
  const sel = document.getElementById('layout-truck-select');
  const currentVal = sel.value;

  sel.innerHTML = '<option value="">— Choose a truck —</option>';
  visibleTrucks.forEach(t => {
    const plate = getTruckPlate(t);
    const truckType = getTruckTypeKey(t);
    if (!plate) return;
    const opt = document.createElement('option');
    opt.value = plate;
    opt.textContent = plate + (truckType ? ' — ' + (TRUCK_TYPE_DEFS[truckType]?.label || truckType) : '');
    sel.appendChild(opt);
  });

  // Restore selection or show empty state
  if (currentVal) sel.value = currentVal;

  const hasPlate = sel.value;
  document.getElementById('layout-empty').style.display = visibleTrucks.length === 0 ? '' : 'none';
  document.getElementById('layout-no-truck').style.display = (!hasPlate && visibleTrucks.length > 0) ? '' : 'none';
  document.getElementById('layout-panel').style.display  = hasPlate ? '' : 'none';

  if (hasPlate) renderSchematic(hasPlate, visibleTrucks);
}

function renderSchematic(plate, trucks) {
  const truck = findTruckByPlate(trucks, plate);
  if (!truck) return;
  const typeKey = getTruckTypeKey(truck);
  const typeDef = TRUCK_TYPE_DEFS[typeKey];
  const displayPlate = getTruckPlate(truck) || normalizePlate(plate);
  document.getElementById('layout-panel-title').textContent = displayPlate + (typeDef ? ' — ' + typeDef.label : '');
  document.getElementById('layout-truck-type').textContent  = typeDef ? typeDef.label : (typeKey || '');

  const posStatus = getPositionStatus();
  const truckPos  = posStatus[displayPlate] || {};

  const container = document.getElementById('tire-schematic-container');
  container.innerHTML = '';

  if (!typeDef) {
    container.innerHTML = '<p style="color:#9ca3af;font-weight:700;padding:1rem;">Truck type not set. Please update the truck in Master Data.</p>';
    return;
  }

  if (typeKey === '10W_SHORT_FB_3AX' || typeKey === '10W_SHORT_WV_3AX') {
    renderPaperTrailerChart(container, typeDef, truckPos, displayPlate);
    return;
  }

  // Tractor section
  if (typeDef.axles.tractor.length) {
    const tractorSection = document.createElement('div');
    tractorSection.className = 'tire-layout-block';

    const tractorHeading = document.createElement('div');
    tractorHeading.className = 'tire-layout-heading';
    tractorHeading.textContent = typeDef.label.includes('Wingvan') && !typeDef.trailer.length
      ? typeDef.label
      : typeDef.label.split('+')[0].trim();
    tractorSection.appendChild(tractorHeading);

    const axleRow = document.createElement('div');
    axleRow.className = 'tire-layout-row';

    typeDef.axles.tractor.forEach(axle => {
      axleRow.appendChild(buildAxleGroup(axle, truckPos, displayPlate));
    });
    tractorSection.appendChild(axleRow);
    container.appendChild(tractorSection);
  }

  // Connector between tractor and trailer
  if (typeDef.trailer.length) {
    const connector = document.createElement('div');
    connector.className = 'tire-connector';
    const line = document.createElement('div');
    line.className = 'tire-connector-line';
    connector.appendChild(line);
    const span = document.createElement('span');
    span.style.cssText = 'font-size:0.6rem;font-weight:800;color:#9ca3af;letter-spacing:0.08em;margin-top:4px;';
    span.textContent = '5TH WHEEL';
    connector.appendChild(span);
    container.appendChild(connector);

    // Trailer section
    const trailerSection = document.createElement('div');
    trailerSection.className = 'tire-layout-block';

    const trailerHeading = document.createElement('div');
    trailerHeading.className = 'tire-layout-heading';
    trailerHeading.textContent = typeDef.label.includes('+')
      ? typeDef.label.split('+').slice(1).join('+').trim()
      : 'Trailer';
    trailerSection.appendChild(trailerHeading);

    const axleRow2 = document.createElement('div');
    axleRow2.className = 'tire-layout-row';
    typeDef.axles.trailer.forEach(axle => {
      axleRow2.appendChild(buildAxleGroup(axle, truckPos, displayPlate));
    });
    trailerSection.appendChild(axleRow2);
    container.appendChild(trailerSection);
  }
}

function renderPaperTrailerChart(container, typeDef, truckPos, plate) {
  const chart = document.createElement('div');
  chart.className = 'paper-tire-chart';

  const tractorTitle = document.createElement('div');
  tractorTitle.className = 'paper-chart-title';
  tractorTitle.textContent = 'Tractor Head (10W)';
  chart.appendChild(tractorTitle);

  chart.appendChild(buildPaperSides(
    'Driver',
    [['1'], ['3', '4'], ['7', '8']],
    'Helper',
    [['2'], ['5', '6'], ['9', '10']],
    truckPos,
    plate
  ));

  const trailerTitle = document.createElement('div');
  trailerTitle.className = 'paper-trailer-title';
  trailerTitle.textContent = typeDef.label.includes('Wing Van')
    ? '26, 28, 32, 34, 36 Trailer WV (3 Axle)'
    : '26, 28, 32, 34, 36 Trailer Flatbed (3 Axle)';
  chart.appendChild(trailerTitle);

  chart.appendChild(buildPaperSides(
    '',
    [['A', 'B'], ['E', 'F'], ['I', 'J']],
    '',
    [['C', 'D'], ['G', 'H'], ['K', 'L']],
    truckPos,
    plate
  ));

  container.appendChild(chart);
}

function buildPaperSides(leftTitle, leftRows, rightTitle, rightRows, truckPos, plate) {
  const row = document.createElement('div');
  row.className = 'paper-chart-row';
  row.appendChild(buildPaperSide(leftTitle, leftRows, truckPos, plate));

  const gap = document.createElement('div');
  gap.className = 'paper-center-gap';
  row.appendChild(gap);

  row.appendChild(buildPaperSide(rightTitle, rightRows, truckPos, plate));
  return row;
}

function buildPaperSide(title, rows, truckPos, plate) {
  const side = document.createElement('div');
  side.className = 'paper-side';

  const sideTitle = document.createElement('div');
  sideTitle.className = 'paper-side-title';
  sideTitle.textContent = title;
  side.appendChild(sideTitle);

  rows.forEach(rowPositions => {
    const tireRow = document.createElement('div');
    tireRow.className = 'paper-tire-row' + (rowPositions.length === 1 ? ' single' : '');
    rowPositions.forEach(pos => tireRow.appendChild(buildPaperCell(pos, truckPos, plate)));
    side.appendChild(tireRow);
  });

  return side;
}

function buildPaperCell(pos, truckPos, plate) {
  const info = truckPos[pos] || {};
  const status = info.status || 'empty';
  const serial = info.serial || '';
  const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '');
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'paper-cell ' + statusClass;
  cell.title = `Position ${pos}${serial ? ' | ' + serial : ''}${status ? ' | ' + status : ''}`;
  cell.innerHTML = `<span>${esc(pos)}</span><span class="paper-cell-status"></span>`;
  cell.addEventListener('click', () => openChangeTabForPosition(plate, pos, info));
  return cell;
}

function openChangeTabForPosition(plate, pos, info = {}) {
  document.querySelectorAll('.tire-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tire-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab="change"]').classList.add('active');
  document.getElementById('tab-change').classList.add('active');
  renderChangeTab();
  setTimeout(() => {
    const plateSel = document.getElementById('chg-plate');
    plateSel.value = plate;
    populatePositionSelect('chg-position', plate);
    populatePositionSelect('chg-to-position', plate);
    document.getElementById('chg-position').value = pos;
    if (info.serial) document.getElementById('chg-serial').value = info.serial;
    if (info.brand) document.getElementById('chg-brand').value = info.brand;
    if (info.size) document.getElementById('chg-size').value = info.size;
  }, 50);
}

function buildAxleGroup(axle, truckPos, plate) {
  const group = document.createElement('div');
  group.className = 'tire-axle-group';

  const label = document.createElement('div');
  label.className = 'tire-axle-label';
  label.textContent = axle.label;
  group.appendChild(label);

  const row = document.createElement('div');
  row.className = 'tire-axle-row';

  // Each axle.positions is [[leftSide positions], [rightSide positions]]
  // leftSide may be a single position (steer) or pair (dual)
  const [leftPositions, rightPositions] = axle.positions;

  row.appendChild(buildSideBox(leftPositions, truckPos, plate, 'L'));

  const axleDiv = document.createElement('div');
  axleDiv.className = 'tire-axle-divider';
  const bar = document.createElement('div');
  bar.className = 'tire-axle-bar';
  axleDiv.appendChild(bar);
  row.appendChild(axleDiv);

  row.appendChild(buildSideBox(rightPositions, truckPos, plate, 'R'));

  group.appendChild(row);
  return group;
}

function buildSideBox(positions, truckPos, plate) {
  if (positions.length === 1) {
    return buildTireBox(positions[0], truckPos, plate);
  }
  // Dual tire pair
  const pair = document.createElement('div');
  pair.className = 'tire-pair';
  positions.forEach(pos => pair.appendChild(buildTireBox(pos, truckPos, plate)));
  return pair;
}

function buildTireBox(pos, truckPos, plate) {
  const info   = truckPos[pos] || {};
  const status = info.status || 'empty';
  const serial = info.serial || '';
  const brand  = info.brand  || '';

  const box = document.createElement('div');
  const statusClass = 'status-' + status.toLowerCase().replace(/\s+/g, '');
  box.className = 'tire-box ' + statusClass;
  box.title = `Position ${pos}${serial ? ' | ' + serial : ''}${brand ? ' | ' + brand : ''}${status ? ' | ' + status : ''}`;

  box.innerHTML = `
    <div class="tire-box-pos">${esc(pos)}</div>
    <div class="tire-box-status-dot"></div>
    <div class="tire-box-serial">${esc(serial || '—')}</div>
    <div class="tire-box-brand">${esc(brand || '')}</div>
  `;

  box.addEventListener('click', () => {
    // Switch to Change tab, pre-fill plate and position
    document.querySelectorAll('.tire-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tire-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-tab="change"]').classList.add('active');
    document.getElementById('tab-change').classList.add('active');
    renderChangeTab();
    setTimeout(() => {
      const plateSel = document.getElementById('chg-plate');
      plateSel.value = plate;
      populatePositionSelect('chg-position', plate);
      populatePositionSelect('chg-to-position', plate);
      document.getElementById('chg-position').value = pos;
      if (serial) document.getElementById('chg-serial').value = serial;
      if (brand)  document.getElementById('chg-brand').value  = brand;
      if (info.size) document.getElementById('chg-size').value = info.size;
    }, 50);
  });

  return box;
}

/* ══════════════════════════════════════════════════
   TAB 2 — TIRE CHANGE / INSTALLATION
══════════════════════════════════════════════════ */
function renderChangeTab() {
  populateTruckSelects();
  renderChangeLogTable();

  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('chg-date').value) {
    document.getElementById('chg-date').value = today;
  }
}

function populateTruckSelects() {
  const trucks = getTrucks();
  const plates = [...new Set(trucks.map(getTruckPlate).filter(Boolean))];

  ['chg-plate', 'chg-filter-plate', 'disp-plate'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const hasAll = id.includes('filter') || id.includes('disp');
    const cur = sel.value;
    sel.innerHTML = hasAll ? '<option value="">All Trucks</option>' : '<option value="">— Select Truck —</option>';
    if (id === 'disp-plate') sel.options[0].textContent = '— Select —';
    plates.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
  });
}

function populatePositionSelect(selId, plate) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select Position —</option>';
  const trucks = getTrucks();
  const truck   = findTruckByPlate(trucks, plate);
  const truckType = getTruckTypeKey(truck);
  if (!truck || !truckType) return;
  allPositions(truckType).forEach(pos => {
    const opt = document.createElement('option');
    opt.value = pos;
    opt.textContent = 'Position ' + pos;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

function renderChangeLogTable(filterPlate) {
  const logs = getChangeLogs();
  const tbody = document.getElementById('chg-log-tbody');
  const plate = filterPlate || document.getElementById('chg-filter-plate')?.value || '';
  const rows = plate ? logs.filter(r => r.plate === plate) : logs;
  const sorted = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!sorted.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">No change logs yet.</td></tr>';
    return;
  }
  tbody.innerHTML = sorted.map(r => `
    <tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.plate)}</td>
      <td>${esc(r.action)}</td>
      <td>${esc(r.position)}</td>
      <td>${esc(r.toPosition || '—')}</td>
      <td>${esc(r.serial || '—')}</td>
      <td>${esc(r.brand || '—')}</td>
      <td>${esc(r.size || '—')}</td>
      <td>${statusBadge(r.condition)}</td>
      <td>${r.odometer ? esc(r.odometer) + ' km' : '—'}</td>
      <td>${esc(r.performedBy || '—')}</td>
      <td>${esc(r.remarks || '—')}</td>
      <td>
        <div class="tire-row-actions">
          <button class="tire-row-btn danger" data-del-chg="${esc(r.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-del-chg]').forEach(btn => {
    btn.addEventListener('click', () => deleteChangeLog(btn.dataset.delChg));
  });
}

function deleteChangeLog(id) {
  if (!confirm('Delete this change log?')) return;
  const logs = getChangeLogs().filter(r => r.id !== id);
  saveChangeLogs(logs);
  renderChangeLogTable();
  renderHistoryTab();
  showToast('Change log deleted.', 'error');
}

function saveChangeLog() {
  const date       = document.getElementById('chg-date').value;
  const plate      = document.getElementById('chg-plate').value;
  const action     = document.getElementById('chg-action').value;
  const position   = document.getElementById('chg-position').value;
  const toPosition = document.getElementById('chg-to-position').value;
  const serial     = document.getElementById('chg-serial').value.trim();
  const brand      = document.getElementById('chg-brand').value.trim();
  const size       = document.getElementById('chg-size').value.trim();
  const condition  = document.getElementById('chg-condition').value;
  const odometer   = document.getElementById('chg-odometer').value.trim();
  const performedBy= document.getElementById('chg-by').value.trim();
  const remarks    = document.getElementById('chg-remarks').value.trim();
  const statusEl   = document.getElementById('chg-status');

  if (!date || !plate || !position) {
    statusEl.textContent = 'Date, Truck, and Position are required.';
    statusEl.className   = 'tire-form-status error';
    return;
  }

  const record = { id: uid(), date, plate: normalizePlate(plate), action, position,
    toPosition: toPosition || '',
    serial, brand, size, condition, odometer, performedBy, remarks,
    createdAt: new Date().toISOString() };

  // Persist change log
  const logs = getChangeLogs();
  logs.push(record);
  saveChangeLogs(logs);

  // Update position status
  updatePositionStatus(record);

  statusEl.textContent = 'Saved. Syncing…';
  statusEl.className   = 'tire-form-status';
  syncTireRecord('saveTireChangeLog', toTireChangeLogRecord(record), statusEl);
  renderChangeLogTable();
  renderHistoryTab();
  updateKPIs();
  showToast('Change log saved.', 'success');

  // Clear form (keep date and plate)
  ['chg-serial','chg-brand','chg-size','chg-odometer','chg-by','chg-remarks'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('chg-position').value   = '';
  document.getElementById('chg-to-position').value = '';
}

function updatePositionStatus(record) {
  const posStatus = getPositionStatus();
  const normalizedPlate = normalizePlate(record.plate);
  if (!posStatus[normalizedPlate]) posStatus[normalizedPlate] = {};

  const trucks   = getTrucks();
  const truck    = findTruckByPlate(trucks, normalizedPlate);

  if (record.action === 'Install') {
    posStatus[normalizedPlate][record.position] = {
      serial: record.serial, brand: record.brand,
      size: record.size, status: record.condition,
    };
    // Mark inventory tire as Installed
    markInventoryStatus(record.serial, 'Installed', normalizedPlate);
  } else if (record.action === 'Remove') {
    posStatus[normalizedPlate][record.position] = { serial: '', brand: '', size: '', status: 'empty' };
    // Mark inventory tire as Returned
    markInventoryStatus(record.serial, 'Returned', '');
  } else if (record.action === 'Rotate' || record.action === 'Swap') {
    const fromInfo = { ...posStatus[normalizedPlate][record.position] };
    if (record.toPosition && posStatus[normalizedPlate][record.toPosition]) {
      const toInfo = { ...posStatus[normalizedPlate][record.toPosition] };
      posStatus[normalizedPlate][record.position]   = toInfo;
      posStatus[normalizedPlate][record.toPosition] = fromInfo;
    }
    // Update condition
    if (record.position) {
      posStatus[normalizedPlate][record.position] = {
        ...(posStatus[normalizedPlate][record.position] || {}),
        status: record.condition,
      };
    }
  } else {
    // Generic update
    if (posStatus[record.plate][record.position]) {
      posStatus[record.plate][record.position].status = record.condition;
    } else {
      posStatus[record.plate][record.position] = {
        serial: record.serial, brand: record.brand,
        size: record.size, status: record.condition,
      };
    }
  }

  savePositionStatus(posStatus);
}

function markInventoryStatus(serial, status, assignedPlate) {
  if (!serial) return;
  const inv = getTireInventory();
  const idx = inv.findIndex(t => t.serial === serial);
  if (idx === -1) return;
  inv[idx].status = status;
  if (assignedPlate !== undefined) inv[idx].assignedPlate = assignedPlate;
  saveTireInventory(inv);
}

/* ══════════════════════════════════════════════════
   TAB 3 — INVENTORY / PURCHASE
══════════════════════════════════════════════════ */
function renderInventoryTab() {
  renderInventoryTable();
  renderInvSummary();
  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('inv-date').value) {
    document.getElementById('inv-date').value = today;
  }
}

function renderInvSummary() {
  const inv = getTireInventory();
  document.getElementById('inv-kpi-new').textContent     = inv.filter(t => t.status === 'New' || t.status === 'Good' || t.status === 'Spare').length;
  document.getElementById('inv-kpi-installed').textContent= inv.filter(t => t.status === 'Installed').length;
  document.getElementById('inv-kpi-returned').textContent = inv.filter(t => t.status === 'Returned').length;
  document.getElementById('inv-kpi-disposal').textContent  = inv.filter(t => t.status === 'For Disposal').length;
}

function renderInventoryTable() {
  const inv     = getTireInventory();
  const search  = (document.getElementById('inv-search')?.value || '').toLowerCase();
  const filter  = document.getElementById('inv-filter-status')?.value || '';
  const tbody   = document.getElementById('inv-tbody');

  let rows = inv;
  if (filter) rows = rows.filter(t => t.status === filter);
  if (search) rows = rows.filter(t =>
    (t.serial   || '').toLowerCase().includes(search) ||
    (t.brand    || '').toLowerCase().includes(search) ||
    (t.size     || '').toLowerCase().includes(search) ||
    (t.supplier || '').toLowerCase().includes(search)
  );
  rows = [...rows].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="13">No tires found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(t => `
    <tr>
      <td>${esc(t.dateAdded || '—')}</td>
      <td>${esc(t.serial || '—')}</td>
      <td>${esc(t.brand || '—')}</td>
      <td>${esc(t.size || '—')}</td>
      <td>${esc(t.type || '—')}</td>
      <td>${esc(t.supplier || '—')}</td>
      <td>${t.cost ? '₱' + parseFloat(t.cost).toLocaleString('en-PH', {minimumFractionDigits:2}) : '—'}</td>
      <td>${esc(t.qty || 1)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${esc(t.location || '—')}</td>
      <td>${esc(t.assignedPlate || '—')}</td>
      <td>${esc(t.remarks || '—')}</td>
      <td>
        <div class="tire-row-actions">
          <button class="tire-row-btn" data-inv-dispose="${esc(t.id)}">Mark Disposal</button>
          <button class="tire-row-btn danger" data-inv-del="${esc(t.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-inv-dispose]').forEach(btn => {
    btn.addEventListener('click', () => markInvForDisposal(btn.dataset.invDispose));
  });
  tbody.querySelectorAll('[data-inv-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteInvRecord(btn.dataset.invDel));
  });
}

function markInvForDisposal(id) {
  const inv = getTireInventory();
  const idx = inv.findIndex(t => t.id === id);
  if (idx === -1) return;
  inv[idx].status = 'For Disposal';
  saveTireInventory(inv);
  renderInventoryTable();
  renderInvSummary();
  updateKPIs();
  showToast('Marked as For Disposal.', '');
}

function deleteInvRecord(id) {
  if (!confirm('Delete this inventory record?')) return;
  saveTireInventory(getTireInventory().filter(t => t.id !== id));
  renderInventoryTable();
  renderInvSummary();
  updateKPIs();
  showToast('Inventory record deleted.', 'error');
}

function saveInventoryRecord() {
  const date     = document.getElementById('inv-date').value;
  const serial   = document.getElementById('inv-serial').value.trim();
  const brand    = document.getElementById('inv-brand').value.trim();
  const size     = document.getElementById('inv-size').value.trim();
  const type     = document.getElementById('inv-type').value;
  const supplier = document.getElementById('inv-supplier').value.trim();
  const cost     = document.getElementById('inv-cost').value.trim();
  const qty      = parseInt(document.getElementById('inv-qty').value) || 1;
  const status   = document.getElementById('inv-status').value;
  const location = document.getElementById('inv-location').value.trim();
  const remarks  = document.getElementById('inv-remarks').value.trim();
  const msgEl    = document.getElementById('inv-status-msg');

  if (!serial || !brand) {
    msgEl.textContent = 'Serial No. and Brand are required.';
    msgEl.className   = 'tire-form-status error';
    return;
  }

  const inv = getTireInventory();
  if (qty > 1) {
    for (let i = 0; i < qty; i++) {
      inv.push({ id: uid(), dateAdded: date, serial: serial + (qty > 1 ? '-' + (i + 1) : ''),
        brand, size, type, supplier, cost, qty: 1, status, location, remarks,
        assignedPlate: '', createdAt: new Date().toISOString() });
    }
  } else {
    inv.push({ id: uid(), dateAdded: date, serial, brand, size, type,
      supplier, cost, qty, status, location, remarks,
      assignedPlate: '', createdAt: new Date().toISOString() });
  }
  saveTireInventory(inv);

  if (qty > 1) {
    msgEl.textContent = qty + ' tires added. Syncing…';
    syncTireBatch('batchSaveTireInventory', inv.slice(inv.length - qty).map(toTireInventoryRecord), msgEl);
  } else {
    msgEl.textContent = 'Tire added. Syncing…';
    syncTireRecord('saveTireInventory', toTireInventoryRecord(inv[inv.length - 1]), msgEl);
  }
  msgEl.className = 'tire-form-status';
  renderInventoryTable();
  renderInvSummary();
  updateKPIs();
  showToast('Inventory record saved.', 'success');

  ['inv-serial','inv-brand','inv-size','inv-supplier','inv-cost','inv-location','inv-remarks'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('inv-qty').value = '1';
}

/* ══════════════════════════════════════════════════
   TAB 4 — HISTORY
══════════════════════════════════════════════════ */
function renderHistoryTab() {
  const trucks = getTrucks();
  const plates = [...new Set(trucks.map(getTruckPlate).filter(Boolean))];
  const filterSel = document.getElementById('hist-filter-plate');
  const cur = filterSel?.value || '';
  if (filterSel) {
    filterSel.innerHTML = '<option value="">All Trucks</option>';
    plates.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      filterSel.appendChild(opt);
    });
    if (cur) filterSel.value = cur;
  }
  filterHistoryTable();
}

function filterHistoryTable() {
  const logs    = getChangeLogs();
  const search  = (document.getElementById('hist-search')?.value || '').toLowerCase();
  const plate   = document.getElementById('hist-filter-plate')?.value || '';
  const action  = document.getElementById('hist-filter-action')?.value || '';
  const from    = document.getElementById('hist-from')?.value || '';
  const to      = document.getElementById('hist-to')?.value || '';
  const tbody   = document.getElementById('hist-tbody');

  let rows = logs;
  if (plate)  rows = rows.filter(r => r.plate === plate);
  if (action) rows = rows.filter(r => r.action === action);
  if (from)   rows = rows.filter(r => r.date >= from);
  if (to)     rows = rows.filter(r => r.date <= to);
  if (search) rows = rows.filter(r =>
    (r.plate    || '').toLowerCase().includes(search) ||
    (r.serial   || '').toLowerCase().includes(search) ||
    (r.position || '').toLowerCase().includes(search) ||
    (r.brand    || '').toLowerCase().includes(search)
  );
  rows = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="12">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.plate)}</td>
      <td>${esc(r.action)}</td>
      <td>${esc(r.position)}</td>
      <td>${esc(r.toPosition || '—')}</td>
      <td>${esc(r.serial || '—')}</td>
      <td>${esc(r.brand || '—')}</td>
      <td>${esc(r.size || '—')}</td>
      <td>${statusBadge(r.condition)}</td>
      <td>${r.odometer ? esc(r.odometer) + ' km' : '—'}</td>
      <td>${esc(r.performedBy || '—')}</td>
      <td>${esc(r.remarks || '—')}</td>
    </tr>
  `).join('');
}

/* ══════════════════════════════════════════════════
   TAB 5 — DISPOSAL / ECOVADIS
══════════════════════════════════════════════════ */
function renderDisposalTab() {
  populateTruckSelects();
  renderDisposalPendingTable();
  renderDisposalHistTable();
  const today = new Date().toISOString().split('T')[0];
  if (!document.getElementById('disp-date').value) {
    document.getElementById('disp-date').value = today;
  }
}

function renderDisposalPendingTable() {
  const inv   = getTireInventory().filter(t => t.status === 'For Disposal' || t.status === 'Removed');
  const tbody = document.getElementById('disp-pending-tbody');
  if (!inv.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No tires pending disposal.</td></tr>';
    return;
  }
  tbody.innerHTML = inv.map(t => `
    <tr>
      <td>${esc(t.serial || '—')}</td>
      <td>${esc(t.brand || '—')}</td>
      <td>${esc(t.size || '—')}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${esc(t.assignedPlate || '—')}</td>
      <td>${esc(t.location || '—')}</td>
      <td>${esc(t.remarks || '—')}</td>
      <td>
        <button class="tire-row-btn" data-prefill="${esc(t.id)}">Pre-fill Form</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-prefill]').forEach(btn => {
    btn.addEventListener('click', () => prefillDisposalForm(btn.dataset.prefill));
  });
}

function prefillDisposalForm(id) {
  const tire = getTireInventory().find(t => t.id === id);
  if (!tire) return;
  document.getElementById('disp-serial').value = tire.serial || '';
  document.getElementById('disp-brand').value  = tire.brand  || '';
  document.getElementById('disp-size').value   = tire.size   || '';
  const plateSel = document.getElementById('disp-plate');
  if (tire.assignedPlate) plateSel.value = tire.assignedPlate;
  document.getElementById('disp-date').focus();
  showToast('Form pre-filled from inventory.', '');
}

function renderDisposalHistTable() {
  const logs  = [...getDisposalLogs()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const tbody = document.getElementById('disp-hist-tbody');
  if (!logs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="11">No disposal records yet.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(r => `
    <tr>
      <td>${esc(r.date)}</td>
      <td>${esc(r.serial || '—')}</td>
      <td>${esc(r.brand || '—')}</td>
      <td>${esc(r.size || '—')}</td>
      <td>${esc(r.plate || '—')}</td>
      <td>${esc(r.reason || '—')}</td>
      <td>${esc(r.recycler || '—')}</td>
      <td>${esc(r.certNo || '—')}</td>
      <td>${esc(r.disposedBy || '—')}</td>
      <td>${esc(r.remarks || '—')}</td>
      <td>
        <div class="tire-row-actions">
          <button class="tire-row-btn danger" data-del-disp="${esc(r.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-del-disp]').forEach(btn => {
    btn.addEventListener('click', () => deleteDisposalLog(btn.dataset.delDisp));
  });
}

function deleteDisposalLog(id) {
  if (!confirm('Delete this disposal record?')) return;
  saveDisposalLogs(getDisposalLogs().filter(r => r.id !== id));
  renderDisposalHistTable();
  updateKPIs();
  showToast('Disposal record deleted.', 'error');
}

function saveDisposalLog() {
  const date      = document.getElementById('disp-date').value;
  const serial    = document.getElementById('disp-serial').value.trim();
  const brand     = document.getElementById('disp-brand').value.trim();
  const size      = document.getElementById('disp-size').value.trim();
  const plate     = document.getElementById('disp-plate').value;
  const reason    = document.getElementById('disp-reason').value;
  const recycler  = document.getElementById('disp-recycler').value.trim();
  const certNo    = document.getElementById('disp-cert').value.trim();
  const disposedBy= document.getElementById('disp-by').value.trim();
  const remarks   = document.getElementById('disp-remarks').value.trim();
  const statusEl  = document.getElementById('disp-status');

  if (!date || !serial) {
    statusEl.textContent = 'Date and Serial No. are required.';
    statusEl.className   = 'tire-form-status error';
    return;
  }

  const record = { id: uid(), date, serial, brand, size, plate, reason,
    recycler, certNo, disposedBy, remarks, createdAt: new Date().toISOString() };

  const logs = getDisposalLogs();
  logs.push(record);
  saveDisposalLogs(logs);

  // Update inventory status to Disposed
  const inv = getTireInventory();
  const idx = inv.findIndex(t => t.serial === serial);
  if (idx !== -1) { inv[idx].status = 'Disposed'; saveTireInventory(inv); }

  statusEl.textContent = 'Disposal logged. Syncing…';
  statusEl.className   = 'tire-form-status';
  syncTireRecord('saveTireDisposal', toTireDisposalRecord(record), statusEl);
  renderDisposalPendingTable();
  renderDisposalHistTable();
  renderInventoryTable();
  renderInvSummary();
  updateKPIs();
  showToast('Disposal record saved.', 'success');

  ['disp-serial','disp-brand','disp-size','disp-recycler','disp-cert','disp-by','disp-remarks'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('disp-plate').value = '';
}

/* ══════════════════════════════════════════════════
   KPI DASHBOARD
══════════════════════════════════════════════════ */
function updateKPIs() {
  const posStatus  = getPositionStatus();
  const inv        = getTireInventory();
  const disposals  = getDisposalLogs();

  let good = 0, monitor = 0, replace = 0;
  Object.values(posStatus).forEach(truckPos => {
    Object.values(truckPos).forEach(pos => {
      if (pos.status === 'Good')    good++;
      if (pos.status === 'Monitor') monitor++;
      if (pos.status === 'Replace') replace++;
    });
  });

  const inInventory = inv.filter(t => t.status === 'New' || t.status === 'Good' || t.status === 'Spare').length;
  const forDisposal = inv.filter(t => t.status === 'For Disposal').length;

  document.getElementById('kpi-good').textContent      = good;
  document.getElementById('kpi-monitor').textContent   = monitor;
  document.getElementById('kpi-replace').textContent   = replace;
  document.getElementById('kpi-inventory').textContent = inInventory;
  document.getElementById('kpi-disposal').textContent  = forDisposal;
}

/* ══════════════════════════════════════════════════
   CSV EXPORT
══════════════════════════════════════════════════ */
function csvRow(arr) {
  return arr.map(v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}
function downloadCSV(filename, headers, rows) {
  const lines = [csvRow(headers), ...rows.map(csvRow)].join('\r\n');
  const blob  = new Blob([lines], { type: 'text/csv' });
  const a     = document.createElement('a');
  a.href      = URL.createObjectURL(blob);
  a.download  = filename;
  a.click();
}

function exportHistoryCSV() {
  const logs = getChangeLogs();
  downloadCSV('tire-history.csv',
    ['Date','Plate','Action','Position','To Position','Serial No.','Brand','Size','Condition','Odometer','Performed By','Remarks'],
    logs.map(r => [r.date,r.plate,r.action,r.position,r.toPosition||'',r.serial||'',r.brand||'',r.size||'',r.condition,r.odometer||'',r.performedBy||'',r.remarks||''])
  );
}
function exportInventoryCSV() {
  const inv = getTireInventory();
  downloadCSV('tire-inventory.csv',
    ['Date Added','Serial No.','Brand','Size','Type','Supplier','Unit Cost','Qty','Status','Location','Assigned Plate','Remarks'],
    inv.map(t => [t.dateAdded||'',t.serial||'',t.brand||'',t.size||'',t.type||'',t.supplier||'',t.cost||'',t.qty||1,t.status||'',t.location||'',t.assignedPlate||'',t.remarks||''])
  );
}
function exportDisposalCSV() {
  const logs = getDisposalLogs();
  downloadCSV('tire-disposals.csv',
    ['Date','Serial No.','Brand','Size','Plate','Reason','Recycler','Certificate No.','Disposed By','Remarks'],
    logs.map(r => [r.date,r.serial||'',r.brand||'',r.size||'',r.plate||'',r.reason||'',r.recycler||'',r.certNo||'',r.disposedBy||'',r.remarks||''])
  );
}

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  updateKPIs();
  renderLayoutTab();

  /* ── Layout tab ── */
  document.getElementById('layout-truck-select').addEventListener('change', function () {
    const plate = this.value;
    document.getElementById('layout-empty').style.display   = 'none';
    document.getElementById('layout-no-truck').style.display = plate ? 'none' : '';
    document.getElementById('layout-panel').style.display    = plate ? '' : 'none';
    if (plate) renderSchematic(plate, null);
  });
  document.getElementById('layout-refresh-btn').addEventListener('click', () => {
    const plate = document.getElementById('layout-truck-select').value;
    if (plate) renderSchematic(plate, null);
  });
  document.getElementById('layout-group-select').addEventListener('change', renderLayoutTab);

  /* ── Change tab ── */
  document.getElementById('chg-plate').addEventListener('change', function () {
    populatePositionSelect('chg-position', this.value);
    populatePositionSelect('chg-to-position', this.value);
  });
  document.getElementById('chg-action').addEventListener('change', function () {
    const showTo = this.value === 'Rotate' || this.value === 'Swap';
    document.getElementById('chg-to-position-wrap').style.display = showTo ? '' : 'none';
  });
  document.getElementById('chg-save-btn').addEventListener('click', saveChangeLog);
  document.getElementById('chg-clear-btn').addEventListener('click', () => {
    ['chg-plate','chg-position','chg-to-position','chg-serial','chg-brand','chg-size','chg-odometer','chg-by','chg-remarks'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('chg-status').textContent = '';
  });
  document.getElementById('chg-filter-plate').addEventListener('change', renderChangeLogTable);

  /* ── Inventory tab ── */
  document.getElementById('inv-save-btn').addEventListener('click', saveInventoryRecord);
  document.getElementById('inv-clear-btn').addEventListener('click', () => {
    ['inv-serial','inv-brand','inv-size','inv-supplier','inv-cost','inv-location','inv-remarks'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('inv-qty').value = '1';
    document.getElementById('inv-status-msg').textContent = '';
  });
  document.getElementById('inv-search').addEventListener('input', renderInventoryTable);
  document.getElementById('inv-filter-status').addEventListener('change', renderInventoryTable);
  document.getElementById('inv-export-btn').addEventListener('click', exportInventoryCSV);

  /* ── History tab ── */
  ['hist-search','hist-from','hist-to'].forEach(id => {
    document.getElementById(id).addEventListener('input', filterHistoryTable);
  });
  ['hist-filter-plate','hist-filter-action'].forEach(id => {
    document.getElementById(id).addEventListener('change', filterHistoryTable);
  });
  document.getElementById('hist-export-btn').addEventListener('click', exportHistoryCSV);

  /* ── Disposal tab ── */
  document.getElementById('disp-save-btn').addEventListener('click', saveDisposalLog);
  document.getElementById('disp-clear-btn').addEventListener('click', () => {
    ['disp-serial','disp-brand','disp-size','disp-recycler','disp-cert','disp-by','disp-remarks'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('disp-plate').value = '';
    document.getElementById('disp-status').textContent = '';
  });
  document.getElementById('disp-export-btn').addEventListener('click', exportDisposalCSV);
});
