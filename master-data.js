const TRUCK_KEY = "vnsTruckMaster";
const DRIVER_KEY = "vnsDriverMaster";
const HELPER_KEY = "vnsHelperMaster";

const BOTTLE_TRUCK_DEFAULTS = [
  { Plate_Number: "NII3082", Trailer_Plate: "NUB6094", Truck_Type: "", Body_Type: "FLAT BED 36PALLETS" },
  { Plate_Number: "CCM7089", Trailer_Plate: "NUB1060", Truck_Type: "", Body_Type: "FLAT BED 34PALLETS" },
  { Plate_Number: "NEG9655", Trailer_Plate: "NUB1062", Truck_Type: "", Body_Type: "PALLETIZED 34PALLETS" },
  { Plate_Number: "CDA1497", Trailer_Plate: "NUB1016", Truck_Type: "", Body_Type: "PALLETIZED 34PALLETS" },
  { Plate_Number: "CDI8153", Trailer_Plate: "NUB1018", Truck_Type: "", Body_Type: "FLAT BED 34PALLETS" },
  { Plate_Number: "NBT6825", Trailer_Plate: "NUB6029", Truck_Type: "", Body_Type: "FLAT BED 32PALLETS" },
  { Plate_Number: "CAL6557", Trailer_Plate: "1301-982152", Truck_Type: "", Body_Type: "FLAT BED 32PALLETS" },
  { Plate_Number: "CAD2629", Trailer_Plate: "NUB6089", Truck_Type: "", Body_Type: "PALLETIZED 32PALLETS" },
  { Plate_Number: "ADJ1241", Trailer_Plate: "NUB1026", Truck_Type: "", Body_Type: "FLAT BED 32PALLETS" },
  { Plate_Number: "CAD2631", Trailer_Plate: "NUB6088", Truck_Type: "", Body_Type: "PALLETIZED 32PALLETS" },
  { Plate_Number: "CAA5020", Trailer_Plate: "NUB6047", Truck_Type: "", Body_Type: "WINGVAN 28PALLETS" },
  { Plate_Number: "NIU1171", Trailer_Plate: "NUB6097", Truck_Type: "", Body_Type: "FLAT BED 28PALLETS" },
  { Plate_Number: "ADJ1122", Trailer_Plate: "NUB6050", Truck_Type: "", Body_Type: "FLAT BED 28PALLETS" },
  { Plate_Number: "CAL6559", Trailer_Plate: "NUB6039", Truck_Type: "", Body_Type: "WINGVAN 26PALLETS" },
  { Plate_Number: "NBQ7400", Trailer_Plate: "CUW994", Truck_Type: "", Body_Type: "WINGVAN 26PALLETS" },
  { Plate_Number: "CCM4932", Trailer_Plate: "AUC2429", Truck_Type: "", Body_Type: "WINGVAN 26PALLETS" },
  { Plate_Number: "NDQ4591", Trailer_Plate: "NUB6095", Truck_Type: "", Body_Type: "FLAT BED 34PALLETS" },
  { Plate_Number: "NIH9288", Trailer_Plate: "NUB6020", Truck_Type: "", Body_Type: "FLAT BED 32PALLETS" }
];

const truckFields = [
  "Truck_ID", "Plate_Number", "IMEI", "Truck_Type", "Truck_Make", "Body_Type",
  "Trailer_Plate", "Group_Category", "Current_Driver_ID", "Current_Helper_ID",
  "Current_Driver_Name", "Current_Helper_Name", "Dispatcher", "Status", "Remarks",
  "Created_At", "Updated_At"
];
const driverFields = [
  "Driver_ID", "Driver_Name", "GCash_Number", "Contact_Number", "License_Number",
  "Address", "Status", "Remarks", "Created_At", "Updated_At"
];
const helperFields = [
  "Helper_ID", "Helper_Name", "GCash_Number", "Contact_Number", "Address",
  "Status", "Remarks", "Created_At", "Updated_At"
];

function $(id) { return document.getElementById(id); }

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch { return []; }
}

function writeJson(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function todayStamp() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("");
}

function randomCode() {
  return Math.random().toString(36).slice(2,6).toUpperCase().padEnd(4,"0");
}

function makeId(prefix) { return `${prefix}-${todayStamp()}-${randomCode()}`; }
function nowIso() { return new Date().toISOString(); }
function norm(value) { return String(value || "").trim().toLowerCase(); }
function normalizePlate(value) { return String(value || "").trim().toUpperCase().replace(/\s+/g," "); }

function normalizeGroup(value) {
  const n = norm(value).replace(/\s+/g," ");
  if (!n) return "";
  if (n === "bottle" || n === "bottles") return "Bottle";
  if (n === "sugar") return "Sugar";
  if (n === "preform" || n === "resin" || n === "preform / resin") return "Preform / Resin";
  if (n === "caps" || n === "crown" || n === "crowns" || n === "caps / crown" || n === "caps / crowns") return "Caps / Crown";
  return String(value || "").trim();
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function displayValue(value, important = false) {
  return String(value || "").trim()
    ? esc(value)
    : `<span class="needs-update${important ? " important" : ""}">Needs Update</span>`;
}

function statusValue(value) {
  return `<span class="status-pill">${esc(value || "Needs Update")}</span>`;
}

function formatDate(value) {
  if (!value) return '<span class="needs-update">Needs Update</span>';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) : esc(d.toLocaleString("en-PH"));
}

function setStatus(id, message, type = "") {
  const el = $(id);
  el.textContent = message;
  el.className = `master-status ${type}`.trim();
}

/* ── Top scrollbar mirror ─────────────────────── */
function initTopScrollbar(topId, wrapId) {
  const top  = $(topId);
  const wrap = $(wrapId);
  if (!top || !wrap) return;
  const inner = top.querySelector('.master-table-top-scroll-inner');

  function syncWidth() {
    const table = wrap.querySelector('table');
    if (table) inner.style.width = table.scrollWidth + 'px';
  }
  syncWidth();

  let syncingFromTop = false, syncingFromWrap = false;
  top.addEventListener('scroll', () => {
    if (syncingFromWrap) return;
    syncingFromTop = true;
    wrap.scrollLeft = top.scrollLeft;
    syncingFromTop = false;
  });
  wrap.addEventListener('scroll', () => {
    if (syncingFromTop) return;
    syncingFromWrap = true;
    top.scrollLeft = wrap.scrollLeft;
    syncingFromWrap = false;
  });

  // Update width whenever table content changes
  const obs = new MutationObserver(syncWidth);
  obs.observe(wrap, { childList: true, subtree: true });
}

/* ── Save feedback helpers ────────────────────── */
function flashRow(tr) {
  if (!tr) return;
  tr.classList.remove('row-flash');
  void tr.offsetWidth;
  tr.classList.add('row-flash');
}

function flashCell(el) {
  if (!el) return;
  el.classList.remove('cell-saved');
  void el.offsetWidth;
  el.classList.add('cell-saved');
  setTimeout(() => el.classList.remove('cell-saved'), 1500);
}

/* ═══════════════════════════════════════════════
   TRUCK MASTER
═══════════════════════════════════════════════ */
function getDrivers() { return readJson(DRIVER_KEY); }
function getHelpers() { return readJson(HELPER_KEY); }

function getTrucks() {
  return readJson(TRUCK_KEY).map(row => ({
    ...row,
    Truck_ID:            row.Truck_ID || makeId("TRK"),
    Plate_Number:        normalizePlate(row.Plate_Number),
    IMEI:                row.IMEI || "",
    Truck_Type:          row.Truck_Type || "",
    Truck_Make:          row.Truck_Make || "",
    Body_Type:           row.Body_Type || "",
    Trailer_Plate:       normalizePlate(row.Trailer_Plate),
    Group_Category:      normalizeGroup(row.Group_Category),
    Current_Driver_ID:   row.Current_Driver_ID || "",
    Current_Helper_ID:   row.Current_Helper_ID || "",
    Current_Driver_Name: row.Current_Driver_Name || resolveDriverName(row.Current_Driver_ID),
    Current_Helper_Name: row.Current_Helper_Name || resolveHelperName(row.Current_Helper_ID),
    Dispatcher:          row.Dispatcher || "",
    Status:              row.Status || "Active",
    Remarks:             row.Remarks || "",
    Created_At:          row.Created_At || row.Updated_At || nowIso(),
    Updated_At:          row.Updated_At || nowIso()
  }));
}

function populateAssignmentSelects() {
  const drivers = getDrivers();
  const helpers = getHelpers();
  $("truck-driver-id").innerHTML = '<option value="">Unassigned</option>' +
    drivers.map(d => `<option value="${esc(d.Driver_ID)}">${esc(d.Driver_Name || d.Driver_ID)}</option>`).join("");
  $("truck-helper-id").innerHTML = '<option value="">Unassigned</option>' +
    helpers.map(h => `<option value="${esc(h.Helper_ID)}">${esc(h.Helper_Name || h.Helper_ID)}</option>`).join("");
}

function resolveDriverName(id) {
  return getDrivers().find(d => d.Driver_ID === id)?.Driver_Name || "";
}
function resolveHelperName(id) {
  return getHelpers().find(h => h.Helper_ID === id)?.Helper_Name || "";
}
function getTruckDriverName(row) {
  return row.Current_Driver_Name || resolveDriverName(row.Current_Driver_ID);
}
function getTruckHelperName(row) {
  return row.Current_Helper_Name || resolveHelperName(row.Current_Helper_ID);
}
function getTruckGroup(record) {
  return normalizeGroup(record.Group_Category) || "Unknown / Needs Update";
}

function getGroupCounts(records) {
  const counts = { total: records.length, Bottle: 0, Sugar: 0, "Preform / Resin": 0, "Caps / Crown": 0, "Unknown / Needs Update": 0 };
  records.forEach(r => { const g = getTruckGroup(r); counts[g] = (counts[g] || 0) + 1; });
  return counts;
}

function renderGroupSummaryCards(records) {
  const counts = getGroupCounts(records);
  const cards = [
    ["Total Trucks", counts.total], ["Bottle", counts.Bottle], ["Sugar", counts.Sugar],
    ["Preform / Resin", counts["Preform / Resin"]], ["Caps / Crown", counts["Caps / Crown"]],
    ["Needs Update / Unknown", counts["Unknown / Needs Update"]]
  ];
  $("truck-summary-cards").innerHTML = cards.map(([label, value]) =>
    `<div class="truck-summary-card"><span>${esc(label)}</span><strong>${value}</strong></div>`
  ).join("");
}

/* ── Inline truck row ─────────────────────────── */
function truckTypeOpts(selected) {
  const opts = [
    ['', '— Select type —'],
    ['6W_40FT_3AX',      'Tractor Head (6W) + 40 ft Flatbed (3 Axle)'],
    ['10W_40FT_4AX',     'Tractor Head (10W) + 40 ft Flatbed (4 Axle)'],
    ['10W_SHORT_FB_3AX', 'Tractor Head (10W) + 26/28/32/34/36 Trailer Flatbed (3 Axle)'],
    ['10W_SHORT_WV_3AX', 'Tractor Head (10W) + 26/28/32/34/36 Trailer Wing Van (3 Axle)'],
    ['10W_WV',           '10W Wingvan'],
    ['12W_WV',           '12W Wingvan'],
  ];
  return opts.map(([v, l]) => `<option value="${esc(v)}"${v===selected?' selected':''}>${esc(l)}</option>`).join('');
}

function groupOpts(selected) {
  const opts = ['', 'Bottle', 'Sugar', 'Preform / Resin', 'Caps / Crown'];
  return opts.map(v => `<option value="${esc(v)}"${v===selected?' selected':''}>${v || '— Select —'}</option>`).join('');
}

function statusOpts(selected, options = ['Active','Inactive','For Review']) {
  return options.map(v => `<option value="${esc(v)}"${v===selected?' selected':''}>${esc(v)}</option>`).join('');
}

function renderTruckRowInline(row) {
  const id = esc(row.Truck_ID);
  const v  = f => esc(row[f] || '');
  return `
    <tr data-truck-id="${id}">
      <td class="truck-id-cell" title="${id}">${esc(row.Truck_ID)}</td>
      <td class="edit-cell"><input class="cell-input" data-field="Plate_Number"        value="${v('Plate_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="IMEI"                value="${v('IMEI')}" /></td>
      <td class="edit-cell"><select class="cell-select" data-field="Truck_Type"        style="min-width:160px;">${truckTypeOpts(row.Truck_Type)}</select></td>
      <td class="edit-cell"><input class="cell-input" data-field="Truck_Make"          value="${v('Truck_Make')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Body_Type"           value="${v('Body_Type')}" style="min-width:130px;" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Trailer_Plate"       value="${v('Trailer_Plate')}" /></td>
      <td class="edit-cell"><select class="cell-select" data-field="Group_Category"   style="min-width:120px;">${groupOpts(row.Group_Category)}</select></td>
      <td class="edit-cell"><input class="cell-input" data-field="Current_Driver_Name" value="${v('Current_Driver_Name')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Current_Helper_Name" value="${v('Current_Helper_Name')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Dispatcher"          value="${v('Dispatcher')}" /></td>
      <td class="edit-cell"><select class="cell-select" data-field="Status">${statusOpts(row.Status)}</select></td>
      <td class="edit-cell"><input class="cell-input" data-field="Remarks"             value="${v('Remarks')}" style="min-width:140px;" /></td>
      <td class="ts-cell">${formatDate(row.Updated_At)}</td>
      <td><div class="row-actions"><button type="button" data-delete-truck="${id}">Delete</button></div></td>
    </tr>
  `;
}

/* ── Save a single truck cell ─────────────────── */
function saveTruckCell(truckId, field, rawValue, triggerEl) {
  const rows = getTrucks();
  const idx  = rows.findIndex(r => r.Truck_ID === truckId);
  if (idx === -1) return;

  let value = rawValue;
  if (field === 'Plate_Number')   value = normalizePlate(value);
  if (field === 'Trailer_Plate')  value = normalizePlate(value);
  if (field === 'Group_Category') value = normalizeGroup(value);

  if (rows[idx][field] === value) return;

  rows[idx][field]     = value;
  rows[idx].Updated_At = nowIso();
  writeJson(TRUCK_KEY, rows);

  const tr = document.querySelector(`[data-truck-id="${CSS.escape(truckId)}"]`);
  if (tr) {
    const tsCell = tr.querySelector('.ts-cell');
    if (tsCell) tsCell.innerHTML = formatDate(rows[idx].Updated_At);
    const input = tr.querySelector(`[data-field="${field}"]`);
    if (input && input.tagName === 'INPUT' && input.value !== value) input.value = value;
    flashRow(tr);
  }
  flashCell(triggerEl);
  renderGroupSummaryCards(getTrucks());
}

/* ── Event delegation for truck table ─────────── */
function bindTruckTableEvents() {
  const tbody = $('truck-table-body');

  // Blur on text inputs → save
  tbody.addEventListener('blur', e => {
    const el = e.target;
    if (!el.matches('.cell-input')) return;
    const tr = el.closest('[data-truck-id]');
    if (tr) saveTruckCell(tr.dataset.truckId, el.dataset.field, el.value, el);
  }, true);

  // Change on selects → save immediately
  tbody.addEventListener('change', e => {
    const el = e.target;
    if (!el.matches('.cell-select')) return;
    const tr = el.closest('[data-truck-id]');
    if (tr) saveTruckCell(tr.dataset.truckId, el.dataset.field, el.value, el);
  });

  // Keyboard: Enter saves, Tab navigates cells
  tbody.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const all = Array.from(tbody.querySelectorAll('.cell-input, .cell-select'));
      const idx = all.indexOf(e.target);
      if (idx !== -1) {
        const next = all[e.shiftKey ? idx - 1 : idx + 1];
        if (next) next.focus();
      }
    }
  });

  // Delete button
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-truck]');
    if (btn) deleteTruck(btn.dataset.deleteTruck);
  });
}

function createTruckSkeleton(source = {}) {
  const ts = source.Updated_At || nowIso();
  return {
    Truck_ID: source.Truck_ID || makeId("TRK"),
    Plate_Number: normalizePlate(source.Plate_Number),
    IMEI: source.IMEI || "",
    Truck_Type: source.Truck_Type || "",
    Truck_Make: source.Truck_Make || "",
    Body_Type: source.Body_Type || "",
    Trailer_Plate: normalizePlate(source.Trailer_Plate),
    Group_Category: normalizeGroup(source.Group_Category),
    Current_Driver_ID: source.Current_Driver_ID || "",
    Current_Helper_ID: source.Current_Helper_ID || "",
    Current_Driver_Name: source.Current_Driver_Name || "",
    Current_Helper_Name: source.Current_Helper_Name || "",
    Dispatcher: source.Dispatcher || "",
    Status: source.Status || "Active",
    Remarks: source.Remarks || "",
    Created_At: source.Created_At || ts,
    Updated_At: ts
  };
}

function mergeTruckRecord(existing, incoming) {
  const merged = { ...existing };
  Object.keys(incoming).forEach(key => {
    const next = incoming[key];
    if (!String(merged[key] || "").trim() && String(next || "").trim()) merged[key] = next;
  });
  merged.Plate_Number    = normalizePlate(existing.Plate_Number || incoming.Plate_Number);
  merged.Group_Category  = normalizeGroup(merged.Group_Category || incoming.Group_Category);
  merged.Status          = merged.Status || incoming.Status || "Active";
  merged.Updated_At      = incoming.Updated_At || nowIso();
  return merged;
}

function summarizeImport(imported, updated, skipped, total) {
  $("truck-import-result").textContent = `Imported: ${imported} | Updated: ${updated} | Skipped: ${skipped} | Total in Truck Master: ${total}`;
}

function seedBottleTruckDefaults() {
  const currentRows = getTrucks();
  const rowsByPlate = new Map(currentRows.map(row => [normalizePlate(row.Plate_Number), row]));
  let changed = false;
  BOTTLE_TRUCK_DEFAULTS.forEach(source => {
    const plate    = normalizePlate(source.Plate_Number);
    const existing = rowsByPlate.get(plate);
    const remark   = `Bottle source list: ${source.Body_Type}. Verify tractor wheel class later if needed.`;
    if (existing) {
      const next = { ...existing, Plate_Number: plate, Trailer_Plate: normalizePlate(existing.Trailer_Plate || source.Trailer_Plate), Truck_Type: source.Truck_Type, Body_Type: existing.Body_Type || source.Body_Type, Group_Category: normalizeGroup(existing.Group_Category || "Bottle"), Status: existing.Status || "Active", Remarks: existing.Remarks || remark, Updated_At: existing.Updated_At || nowIso() };
      if (JSON.stringify(next) !== JSON.stringify(existing)) { rowsByPlate.set(plate, next); changed = true; }
      return;
    }
    rowsByPlate.set(plate, createTruckSkeleton({ Plate_Number: plate, Trailer_Plate: source.Trailer_Plate, Truck_Type: source.Truck_Type, Body_Type: source.Body_Type, Group_Category: "Bottle", Status: "Active", Remarks: remark }));
    changed = true;
  });
  if (changed) writeJson(TRUCK_KEY, Array.from(rowsByPlate.values()));
}

function saveTruck(event) {
  event.preventDefault();
  const plate = normalizePlate($("truck-plate-number").value);
  if (!plate) { setStatus("truck-status-line", "Plate Number is required.", "warning"); return; }
  const rows     = getTrucks();
  const editId   = $("truck-edit-id").value;
  const existing = rows.find(r => r.Truck_ID === editId);
  const ts       = nowIso();
  const record   = {
    Truck_ID:            existing?.Truck_ID || makeId("TRK"),
    Plate_Number:        plate,
    IMEI:                $("truck-imei").value.trim(),
    Truck_Type:          $("truck-type").value.trim(),
    Truck_Make:          $("truck-make").value.trim(),
    Body_Type:           $("truck-body-type").value.trim(),
    Trailer_Plate:       normalizePlate($("truck-trailer-plate").value),
    Group_Category:      normalizeGroup($("truck-group-category").value),
    Current_Driver_ID:   $("truck-driver-id").value,
    Current_Helper_ID:   $("truck-helper-id").value,
    Current_Driver_Name: resolveDriverName($("truck-driver-id").value),
    Current_Helper_Name: resolveHelperName($("truck-helper-id").value),
    Dispatcher:          $("truck-dispatcher").value.trim(),
    Status:              $("truck-status").value,
    Remarks:             $("truck-remarks").value.trim(),
    Created_At:          existing?.Created_At || ts,
    Updated_At:          ts
  };
  const next = existing ? rows.map(r => r.Truck_ID === record.Truck_ID ? record : r) : [record, ...rows];
  writeJson(TRUCK_KEY, next);
  clearTruckForm();
  renderTrucks();
  setStatus("truck-status-line", existing ? "Truck updated." : "Truck saved.", "success");
}

function clearTruckForm() {
  $("truck-edit-id").value = "";
  $("truck-form").reset();
  $("truck-status").value = "Active";
}

function editTruck(id) {
  const truck = getTrucks().find(r => r.Truck_ID === id);
  if (!truck) return;
  $("truck-edit-id").value         = truck.Truck_ID;
  $("truck-plate-number").value    = truck.Plate_Number || "";
  $("truck-imei").value            = truck.IMEI || "";
  $("truck-type").value            = truck.Truck_Type || "";
  $("truck-make").value            = truck.Truck_Make || "";
  $("truck-body-type").value       = truck.Body_Type || "";
  $("truck-trailer-plate").value   = truck.Trailer_Plate || "";
  $("truck-group-category").value  = normalizeGroup(truck.Group_Category) || "";
  $("truck-driver-id").value       = truck.Current_Driver_ID || "";
  $("truck-helper-id").value       = truck.Current_Helper_ID || "";
  $("truck-dispatcher").value      = truck.Dispatcher || "";
  $("truck-status").value          = truck.Status || "Active";
  $("truck-remarks").value         = truck.Remarks || "";
  setStatus("truck-status-line", `Editing ${truck.Truck_ID}.`, "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteTruck(id) {
  if (!confirm("Delete this truck record?")) return;
  writeJson(TRUCK_KEY, getTrucks().filter(r => r.Truck_ID !== id));
  renderTrucks();
  setStatus("truck-status-line", "Truck deleted.", "warning");
}

function truckFilterRows(rows) {
  const plate  = norm($("truck-filter-plate").value);
  const imei   = norm($("truck-filter-imei").value);
  const driver = norm($("truck-filter-driver").value);
  const helper = norm($("truck-filter-helper").value);
  const group  = $("truck-filter-group").value;
  const status = $("truck-filter-status").value;
  return rows.filter(r => {
    if (plate  && !norm(r.Plate_Number).includes(plate))                return false;
    if (imei   && !norm(r.IMEI).includes(imei))                         return false;
    if (driver && !norm(getTruckDriverName(r)).includes(driver))        return false;
    if (helper && !norm(getTruckHelperName(r)).includes(helper))        return false;
    if (group  && getTruckGroup(r) !== group)                           return false;
    if (status && r.Status !== status)                                  return false;
    return true;
  });
}

function renderTrucks() {
  const allRows = getTrucks();
  const rows    = truckFilterRows(allRows);
  renderGroupSummaryCards(allRows);
  const selectedGroup  = $("truck-filter-group").value;
  const orderedGroups  = ["Bottle","Sugar","Preform / Resin","Caps / Crown","Unknown / Needs Update"];
  const sortedRows     = [...rows].sort((a, b) => {
    if (!selectedGroup) {
      const gd = orderedGroups.indexOf(getTruckGroup(a)) - orderedGroups.indexOf(getTruckGroup(b));
      if (gd !== 0) return gd;
    }
    return normalizePlate(a.Plate_Number).localeCompare(normalizePlate(b.Plate_Number));
  });
  $("truck-showing-label").textContent = selectedGroup
    ? `Showing: ${selectedGroup} - ${rows.length} truck${rows.length === 1 ? "" : "s"}`
    : `Showing: All Groups - ${rows.length} truck${rows.length === 1 ? "" : "s"}`;
  $("truck-table-body").innerHTML = !sortedRows.length
    ? '<tr><td colspan="15" class="empty-row">No truck records found.</td></tr>'
    : sortedRows.map(renderTruckRowInline).join("");
}

function importTrucks() {
  const text = $("truck-import").value.trim();
  if (!text) { setStatus("truck-status-line", "Paste truck rows before importing.", "warning"); return; }
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows  = getTrucks();
  let imported = 0, updated = 0, skipped = 0;
  lines.forEach((line, idx) => {
    const parts = line.split(/[\t,]+|\s+/).filter(Boolean);
    if (idx === 0 && norm(parts.join(" ")).includes("plate") && norm(parts.join(" ")).includes("imei")) return;
    const [plateRaw, imeiRaw = ""] = parts;
    const plate = normalizePlate(plateRaw);
    if (!plate) { skipped++; return; }
    const ts       = nowIso();
    const incoming = createTruckSkeleton({ Plate_Number: plate, IMEI: imeiRaw.trim(), Updated_At: ts, Created_At: ts });
    const existing = rows.find(r => normalizePlate(r.Plate_Number) === plate);
    if (existing) { Object.assign(existing, mergeTruckRecord(existing, incoming)); updated++; }
    else           { rows.unshift(incoming); imported++; }
  });
  writeJson(TRUCK_KEY, rows);
  renderTrucks();
  summarizeImport(imported, updated, skipped, rows.length);
  setStatus("truck-status-line", imported || updated ? "Truck import completed." : "No truck rows were imported.", imported || updated ? "success" : "warning");
}

function importFromDispatchList() {
  const dispatchRows = readJson("vnsDispatchTruckMaster");
  const rows = getTrucks();
  let imported = 0, updated = 0, skipped = 0;
  dispatchRows.forEach(d => {
    const plate = normalizePlate(d.plateNumber || d.plate || d.Plate || d.Plate_Number);
    if (!plate) { skipped++; return; }
    const incoming = createTruckSkeleton({ Plate_Number: plate, IMEI: d.imei || d.IMEI || "", Truck_Type: d.truckType || d.Truck_Type || "", Truck_Make: d.truckMake || d.Truck_Make || "", Current_Driver_Name: d.driverName || d.driver || d.Driver || "", Current_Helper_Name: d.helperName || d.helper || d.Helper || "", Group_Category: normalizeGroup(d.groupCategory || d.commodity || d.Group || d.Commodity || ""), Status: d.status || d.Status || "Active", Remarks: d.notes || d.remarks || d.Remarks || "", Updated_At: d.lastUpdated || d.updatedAt || nowIso() });
    const existing = rows.find(r => normalizePlate(r.Plate_Number) === plate);
    if (existing) { Object.assign(existing, mergeTruckRecord(existing, incoming)); updated++; }
    else           { rows.unshift(incoming); imported++; }
  });
  writeJson(TRUCK_KEY, rows);
  renderTrucks();
  summarizeImport(imported, updated, skipped, rows.length);
  setStatus("truck-status-line", dispatchRows.length ? "Dispatch truck import completed." : "No dispatch truck records found.", dispatchRows.length ? "success" : "warning");
}

/* ═══════════════════════════════════════════════
   DRIVER MASTER
═══════════════════════════════════════════════ */
function renderDriverRowInline(row) {
  const id = esc(row.Driver_ID);
  const v  = f => esc(row[f] || '');
  return `
    <tr data-driver-id="${id}">
      <td class="truck-id-cell" title="${id}">${esc(row.Driver_ID)}</td>
      <td class="edit-cell"><input class="cell-input" data-field="Driver_Name"    value="${v('Driver_Name')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="GCash_Number"   value="${v('GCash_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Contact_Number" value="${v('Contact_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="License_Number" value="${v('License_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Address"        value="${v('Address')}" style="min-width:150px;" /></td>
      <td class="edit-cell"><select class="cell-select" data-field="Status">${statusOpts(row.Status)}</select></td>
      <td class="edit-cell"><input class="cell-input" data-field="Remarks"        value="${v('Remarks')}" style="min-width:130px;" /></td>
      <td class="ts-cell">${formatDate(row.Updated_At)}</td>
      <td><div class="row-actions"><button type="button" data-delete-driver="${id}">Delete</button></div></td>
    </tr>
  `;
}

function saveDriverCell(driverId, field, value, triggerEl) {
  const rows = getDrivers();
  const idx  = rows.findIndex(r => r.Driver_ID === driverId);
  if (idx === -1) return;
  if (rows[idx][field] === value) return;
  rows[idx][field]     = value;
  rows[idx].Updated_At = nowIso();
  writeJson(DRIVER_KEY, rows);

  if (field === 'Driver_Name') {
    const trucks = getTrucks();
    let changed = false;
    trucks.forEach(t => { if (t.Current_Driver_ID === driverId) { t.Current_Driver_Name = value; changed = true; } });
    if (changed) writeJson(TRUCK_KEY, trucks);
  }

  const tr = document.querySelector(`[data-driver-id="${CSS.escape(driverId)}"]`);
  if (tr) {
    const tsCell = tr.querySelector('.ts-cell');
    if (tsCell) tsCell.innerHTML = formatDate(rows[idx].Updated_At);
    flashRow(tr);
  }
  flashCell(triggerEl);
}

function bindDriverTableEvents() {
  const tbody = $('driver-table-body');
  tbody.addEventListener('blur', e => {
    const el = e.target;
    if (!el.matches('.cell-input')) return;
    const tr = el.closest('[data-driver-id]');
    if (tr) saveDriverCell(tr.dataset.driverId, el.dataset.field, el.value, el);
  }, true);
  tbody.addEventListener('change', e => {
    const el = e.target;
    if (!el.matches('.cell-select')) return;
    const tr = el.closest('[data-driver-id]');
    if (tr) saveDriverCell(tr.dataset.driverId, el.dataset.field, el.value, el);
  });
  tbody.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const all = Array.from(tbody.querySelectorAll('.cell-input, .cell-select'));
      const idx = all.indexOf(e.target);
      if (idx !== -1) { const next = all[e.shiftKey ? idx-1 : idx+1]; if (next) next.focus(); }
    }
  });
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-driver]');
    if (btn) deleteDriver(btn.dataset.deleteDriver);
  });
}

function saveDriver(event) {
  event.preventDefault();
  const name = $("driver-name").value.trim();
  if (!name) { setStatus("driver-status-line", "Driver name is required.", "warning"); return; }
  const rows     = getDrivers();
  const editId   = $("driver-edit-id").value;
  const existing = rows.find(r => r.Driver_ID === editId);
  const ts       = nowIso();
  const record   = {
    Driver_ID:      existing?.Driver_ID || makeId("DRV"),
    Driver_Name:    name,
    GCash_Number:   $("driver-gcash").value.trim(),
    Contact_Number: $("driver-contact").value.trim(),
    License_Number: $("driver-license").value.trim(),
    Address:        $("driver-address").value.trim(),
    Status:         $("driver-status").value,
    Remarks:        $("driver-remarks").value.trim(),
    Created_At:     existing?.Created_At || ts,
    Updated_At:     ts
  };
  const next = existing ? rows.map(r => r.Driver_ID === record.Driver_ID ? record : r) : [record, ...rows];
  writeJson(DRIVER_KEY, next);
  clearDriverForm();
  populateAssignmentSelects();
  renderDrivers();
  renderTrucks();
  setStatus("driver-status-line", existing ? "Driver updated." : "Driver saved.", "success");
}

function clearDriverForm() {
  $("driver-edit-id").value = "";
  $("driver-form").reset();
  $("driver-status").value = "Active";
}

function editDriver(id) {
  const row = getDrivers().find(r => r.Driver_ID === id);
  if (!row) return;
  $("driver-edit-id").value  = row.Driver_ID;
  $("driver-name").value     = row.Driver_Name || "";
  $("driver-gcash").value    = row.GCash_Number || "";
  $("driver-contact").value  = row.Contact_Number || "";
  $("driver-license").value  = row.License_Number || "";
  $("driver-address").value  = row.Address || "";
  $("driver-status").value   = row.Status || "Active";
  $("driver-remarks").value  = row.Remarks || "";
  setStatus("driver-status-line", `Editing ${row.Driver_ID}.`, "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteDriver(id) {
  if (!confirm("Delete this driver record?")) return;
  writeJson(DRIVER_KEY, getDrivers().filter(r => r.Driver_ID !== id));
  populateAssignmentSelects();
  renderDrivers();
  renderTrucks();
  setStatus("driver-status-line", "Driver deleted.", "warning");
}

function renderDrivers() {
  const name   = norm($("driver-filter-name").value);
  const status = $("driver-filter-status").value;
  const rows   = getDrivers().filter(r => {
    if (name   && !norm(r.Driver_Name).includes(name)) return false;
    if (status && r.Status !== status)                 return false;
    return true;
  });
  $("driver-table-body").innerHTML = rows.length
    ? rows.map(renderDriverRowInline).join("")
    : '<tr><td colspan="10" class="empty-row">No driver records found.</td></tr>';
}

/* ═══════════════════════════════════════════════
   HELPER MASTER
═══════════════════════════════════════════════ */
function renderHelperRowInline(row) {
  const id = esc(row.Helper_ID);
  const v  = f => esc(row[f] || '');
  return `
    <tr data-helper-id="${id}">
      <td class="truck-id-cell" title="${id}">${esc(row.Helper_ID)}</td>
      <td class="edit-cell"><input class="cell-input" data-field="Helper_Name"    value="${v('Helper_Name')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="GCash_Number"   value="${v('GCash_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Contact_Number" value="${v('Contact_Number')}" /></td>
      <td class="edit-cell"><input class="cell-input" data-field="Address"        value="${v('Address')}" style="min-width:150px;" /></td>
      <td class="edit-cell"><select class="cell-select" data-field="Status">${statusOpts(row.Status)}</select></td>
      <td class="edit-cell"><input class="cell-input" data-field="Remarks"        value="${v('Remarks')}" style="min-width:130px;" /></td>
      <td class="ts-cell">${formatDate(row.Updated_At)}</td>
      <td><div class="row-actions"><button type="button" data-delete-helper="${id}">Delete</button></div></td>
    </tr>
  `;
}

function saveHelperCell(helperId, field, value, triggerEl) {
  const rows = getHelpers();
  const idx  = rows.findIndex(r => r.Helper_ID === helperId);
  if (idx === -1) return;
  if (rows[idx][field] === value) return;
  rows[idx][field]     = value;
  rows[idx].Updated_At = nowIso();
  writeJson(HELPER_KEY, rows);

  if (field === 'Helper_Name') {
    const trucks = getTrucks();
    let changed = false;
    trucks.forEach(t => { if (t.Current_Helper_ID === helperId) { t.Current_Helper_Name = value; changed = true; } });
    if (changed) writeJson(TRUCK_KEY, trucks);
  }

  const tr = document.querySelector(`[data-helper-id="${CSS.escape(helperId)}"]`);
  if (tr) {
    const tsCell = tr.querySelector('.ts-cell');
    if (tsCell) tsCell.innerHTML = formatDate(rows[idx].Updated_At);
    flashRow(tr);
  }
  flashCell(triggerEl);
}

function bindHelperTableEvents() {
  const tbody = $('helper-table-body');
  tbody.addEventListener('blur', e => {
    const el = e.target;
    if (!el.matches('.cell-input')) return;
    const tr = el.closest('[data-helper-id]');
    if (tr) saveHelperCell(tr.dataset.helperId, el.dataset.field, el.value, el);
  }, true);
  tbody.addEventListener('change', e => {
    const el = e.target;
    if (!el.matches('.cell-select')) return;
    const tr = el.closest('[data-helper-id]');
    if (tr) saveHelperCell(tr.dataset.helperId, el.dataset.field, el.value, el);
  });
  tbody.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const all = Array.from(tbody.querySelectorAll('.cell-input, .cell-select'));
      const idx = all.indexOf(e.target);
      if (idx !== -1) { const next = all[e.shiftKey ? idx-1 : idx+1]; if (next) next.focus(); }
    }
  });
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-delete-helper]');
    if (btn) deleteHelper(btn.dataset.deleteHelper);
  });
}

function saveHelper(event) {
  event.preventDefault();
  const name = $("helper-name").value.trim();
  if (!name) { setStatus("helper-status-line", "Helper name is required.", "warning"); return; }
  const rows     = getHelpers();
  const editId   = $("helper-edit-id").value;
  const existing = rows.find(r => r.Helper_ID === editId);
  const ts       = nowIso();
  const record   = {
    Helper_ID:      existing?.Helper_ID || makeId("HLP"),
    Helper_Name:    name,
    GCash_Number:   $("helper-gcash").value.trim(),
    Contact_Number: $("helper-contact").value.trim(),
    Address:        $("helper-address").value.trim(),
    Status:         $("helper-status").value,
    Remarks:        $("helper-remarks").value.trim(),
    Created_At:     existing?.Created_At || ts,
    Updated_At:     ts
  };
  const next = existing ? rows.map(r => r.Helper_ID === record.Helper_ID ? record : r) : [record, ...rows];
  writeJson(HELPER_KEY, next);
  clearHelperForm();
  populateAssignmentSelects();
  renderHelpers();
  renderTrucks();
  setStatus("helper-status-line", existing ? "Helper updated." : "Helper saved.", "success");
}

function clearHelperForm() {
  $("helper-edit-id").value = "";
  $("helper-form").reset();
  $("helper-status").value = "Active";
}

function editHelper(id) {
  const row = getHelpers().find(r => r.Helper_ID === id);
  if (!row) return;
  $("helper-edit-id").value  = row.Helper_ID;
  $("helper-name").value     = row.Helper_Name || "";
  $("helper-gcash").value    = row.GCash_Number || "";
  $("helper-contact").value  = row.Contact_Number || "";
  $("helper-address").value  = row.Address || "";
  $("helper-status").value   = row.Status || "Active";
  $("helper-remarks").value  = row.Remarks || "";
  setStatus("helper-status-line", `Editing ${row.Helper_ID}.`, "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteHelper(id) {
  if (!confirm("Delete this helper record?")) return;
  writeJson(HELPER_KEY, getHelpers().filter(r => r.Helper_ID !== id));
  populateAssignmentSelects();
  renderHelpers();
  renderTrucks();
  setStatus("helper-status-line", "Helper deleted.", "warning");
}

function renderHelpers() {
  const name   = norm($("helper-filter-name").value);
  const status = $("helper-filter-status").value;
  const rows   = getHelpers().filter(r => {
    if (name   && !norm(r.Helper_Name).includes(name)) return false;
    if (status && r.Status !== status)                 return false;
    return true;
  });
  $("helper-table-body").innerHTML = rows.length
    ? rows.map(renderHelperRowInline).join("")
    : '<tr><td colspan="9" class="empty-row">No helper records found.</td></tr>';
}

/* ═══════════════════════════════════════════════
   EXPORT / FILTERS / INIT
═══════════════════════════════════════════════ */
function exportCsv(filename, fields, rows) {
  const csvRows = [
    fields.join(","),
    ...rows.map(row => fields.map(f => `"${String(row[f] || "").replace(/"/g, '""')}"`).join(","))
  ];
  const blob = new Blob(["﻿" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href  = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const nav    = document.querySelector(".nav-links");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

function bindTabs() {
  document.querySelectorAll(".master-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".master-tab").forEach(t => t.classList.toggle("active", t === btn));
      document.querySelectorAll(".master-panel").forEach(p => p.classList.toggle("active", p.id === btn.dataset.tab));
    });
  });
}

function bindFilters() {
  ["truck-filter-plate","truck-filter-imei","truck-filter-driver","truck-filter-helper","truck-filter-group","truck-filter-status"].forEach(id => $(id).addEventListener("input", renderTrucks));
  ["driver-filter-name","driver-filter-status"].forEach(id => $(id).addEventListener("input", renderDrivers));
  ["helper-filter-name","helper-filter-status"].forEach(id => $(id).addEventListener("input", renderHelpers));
}

function init() {
  bindMenu();
  bindTabs();
  seedBottleTruckDefaults();
  populateAssignmentSelects();

  $("truck-form").addEventListener("submit", saveTruck);
  $("driver-form").addEventListener("submit", saveDriver);
  $("helper-form").addEventListener("submit", saveHelper);
  $("truck-clear-button").addEventListener("click", clearTruckForm);
  $("driver-clear-button").addEventListener("click", clearDriverForm);
  $("helper-clear-button").addEventListener("click", clearHelperForm);
  $("truck-import-button").addEventListener("click", importTrucks);
  $("truck-import-clear-button").addEventListener("click", () => $("truck-import").value = "");
  $("truck-bulk-toggle-button").addEventListener("click", () => $("truck-import-panel").classList.toggle("open"));
  $("truck-import-hide-button").addEventListener("click", () => $("truck-import-panel").classList.remove("open"));
  $("truck-dispatch-import-button").addEventListener("click", importFromDispatchList);
  $("truck-export-button").addEventListener("click", () => exportCsv("VNS_Truck_Master.csv", truckFields, getTrucks()));
  $("truck-export-filtered-button").addEventListener("click", () => exportCsv("VNS_Truck_Master_Filtered.csv", truckFields, truckFilterRows(getTrucks())));
  $("driver-export-button").addEventListener("click", () => exportCsv("VNS_Driver_Master.csv", driverFields, getDrivers()));
  $("helper-export-button").addEventListener("click", () => exportCsv("VNS_Helper_Master.csv", helperFields, getHelpers()));

  // Inline editing delegation (set up once, survives re-renders)
  bindTruckTableEvents();
  bindDriverTableEvents();
  bindHelperTableEvents();

  bindFilters();
  renderTrucks();
  renderDrivers();
  renderHelpers();

  // Top scrollbar mirrors (set up after initial render)
  initTopScrollbar('truck-top-scroll',  'truck-table-wrap');
  initTopScrollbar('driver-top-scroll', 'driver-table-wrap');
  initTopScrollbar('helper-top-scroll', 'helper-table-wrap');
}

document.addEventListener("DOMContentLoaded", init);
