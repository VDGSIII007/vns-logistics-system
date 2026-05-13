const CASH_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyu1N444S_vthjIoxcy081CdDZJuy6EwHt5ktKU42U4qNY_HL4F2HHKEQl6HDSZZItf/exec";
const CASH_SYNC_KEY       = "vns-cash-sync-2026-Jay";
const MASTER_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySWpFu-ZwtsC4uGK4uNgZSRlHUzS4bAMX4X0vAQjt-iuF7pbgT3loFGU2fU2YL4rq6pQ/exec";
const MASTER_SYNC_KEY       = "vns-truck-sync-2026-Jay";

function cashPost(payload) {
  return fetch(CASH_APP_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ syncKey: CASH_SYNC_KEY, ...payload })
  }).then(r => r.json());
}

function toCashSheetRecord(record) {
  const clean = ensureNoPlateGroup({ ...record });
  return {
    Cash_ID: clean.id,
    Date: clean.date || '',
    Time: '',
    Sender: clean.plateNumber || '',
    Plate_Number: clean.plateNumber || '',
    Group_Category: clean.groupCategory || '',
    Transaction_Type: clean.type || '',
    Person_Name: resolveCashPerson(clean),
    Role: resolveCashRole(clean),
    GCash_Number: clean.depositNumber || '',
    Amount: String(clean.amount || clean.budgetAmount || 0),
    PO_Number: clean.poNumber || clean.shipmentNumber || '',
    Liters: String(clean.liters || ''),
    Fuel_Station: clean.fuelStation || '',
    Route: record.route || (record.source && record.destination ? record.source + ' → ' + record.destination : ''),
    Balance_After_Payroll: '',
    Review_Status: clean.status || '',
    Encoded_By: '',
    Remarks: clean.remarks || clean.reason || '',
    Created_At: clean.createdAt || '',
    Updated_At: clean.updatedAt || '',
    Deleted_At: clean.deletedAt || '',
    Deleted_By: clean.deletedBy || '',
    Is_Deleted: clean.isDeleted ? 'TRUE' : ''
  };
}

function syncCashSilent(record, statusId, action = 'saveEntry') {
  setStatus(statusId, 'Saved locally. Syncing…', 'success');
  cashPost({ action, record: toCashSheetRecord(record) })
    .then(res => setStatus(statusId, (res && res.ok) ? 'Saved and synced.' : 'Saved locally. Sync failed.', (res && res.ok) ? 'success' : 'warning'))
    .catch(() => setStatus(statusId, 'Saved locally. Sync failed.', 'warning'));
}

const DIESEL_KEY = "vnsDieselPOEntries";
const BUDGET_KEY = "vnsTripBudgets";
const BALI_KEY = "vnsBaliCashAdvances";
let truckMasterCache = [];
const CASH_ROLE_OPTIONS = ["Driver", "Helper", "Mechanic", "Tireman", "Dispatcher", "Shop / Supplier", "Office", "Other"];

function $(id) { return document.getElementById(id); }

function readJson(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `PHP ${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPeso(value) {
  return `\u20b1${(Number(value) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizePlate(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function normalizeGroup(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  if (!key) return "Needs Update / Unknown";
  if (key === "general" || key === "general / no plate" || key === "no plate") return "General / No Plate";
  if (key === "bottle" || key === "bottles") return "Bottle";
  if (key === "sugar") return "Sugar";
  if (key === "preform" || key === "resin" || key === "preform / resin") return "Preform / Resin";
  if (key === "caps" || key === "crown" || key === "crowns" || key === "caps / crown" || key === "caps / crowns") return "Caps / Crown";
  if (key.includes("unknown") || key.includes("update")) return "Needs Update / Unknown";
  return raw;
}

function getTruckPlate(truck) {
  return normalizePlate(truck?.Plate_Number || truck?.plateNumber || truck?.plate || "");
}

function getTruckGroup(truck) {
  return normalizeGroup(truck?.Group_Category || truck?.groupCategory || "");
}

function getTruckDriver(truck) {
  return String(truck?.Current_Driver_Name || truck?.Current_Driver || truck?.driverName || "").trim();
}

function getTruckHelper(truck) {
  return String(truck?.Current_Helper_Name || truck?.Current_Helper || truck?.helperName || "").trim();
}

function findTruckByPlate(plate) {
  const normalized = normalizePlate(plate);
  return truckMasterCache.find(truck => getTruckPlate(truck) === normalized);
}

function loadLocalTruckMaster() {
  const trucks = readJson("vnsTruckMaster", []);
  truckMasterCache = Array.isArray(trucks) ? trucks : [];
  renderTruckPlateDatalist();
}

function fetchTruckMaster() {
  loadLocalTruckMaster();
  const url = `${MASTER_APP_SCRIPT_URL}?action=getAllMasterData&syncKey=${encodeURIComponent(MASTER_SYNC_KEY)}`;
  fetch(url)
    .then(response => response.json())
    .then(result => {
      const trucks = result?.trucks || result?.Truck_Master || [];
      if (result && result.ok && Array.isArray(trucks) && trucks.length) {
        truckMasterCache = trucks;
        renderTruckPlateDatalist();
      }
    })
    .catch(loadLocalTruckMaster);
}

function renderTruckPlateDatalist() {
  const list = $("cash-truck-plates");
  if (!list) return;
  const plates = [...new Set(truckMasterCache.map(getTruckPlate).filter(Boolean))].sort();
  list.innerHTML = plates.map(plate => `<option value="${escapeHtml(plate)}"></option>`).join("");
}

function applyTruckToForm(prefix) {
  const plateInput = $(`${prefix}-plate-number`);
  if (!plateInput || !normalizePlate(plateInput.value)) {
    setGroupSelectValue(`${prefix}-group-category`, "General / No Plate");
    return;
  }
  const truck = findTruckByPlate(plateInput?.value);
  if (!truck) return;
  const groupEl = $(`${prefix}-group-category`);
  const driverEl = $(`${prefix}-driver-name`);
  const helperEl = $(`${prefix}-helper-name`);
  if (groupEl) setGroupSelectValue(groupEl.id, getTruckGroup(truck));
  if (driverEl && !driverEl.value.trim()) driverEl.value = getTruckDriver(truck);
  if (helperEl && !helperEl.value.trim()) helperEl.value = getTruckHelper(truck);
}

function setGroupSelectValue(id, value) {
  const el = $(id);
  if (!el) return;
  const normalized = normalizeGroup(value);
  const option = Array.from(el.options).find(opt => opt.value === normalized || opt.textContent === normalized);
  el.value = option ? option.value : "";
}

function populateCashRoleSelects() {
  document.querySelectorAll(".cash-role-select").forEach(select => {
    const current = select.value;
    select.innerHTML = CASH_ROLE_OPTIONS.map(role => `<option>${escapeHtml(role)}</option>`).join("");
    select.value = current && CASH_ROLE_OPTIONS.includes(current) ? current : "Driver";
  });
}

function ensureNoPlateGroup(data) {
  if (!data.plateNumber) data.groupCategory = normalizeGroup(data.groupCategory || "General / No Plate");
  return data;
}

function resolveCashPerson(data) {
  return String(data.personName || data.driverName || data.receiverName || "").trim();
}

function resolveCashRole(data) {
  return String(data.personType || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setStatus(id, message, type = "") {
  const el = $(id);
  if (!el) return;
  el.className = `cash-status${type ? ` ${type}` : ""}`;
  el.textContent = message;
}

function switchCashTab(tabId) {
  document.querySelectorAll(".cash-tab").forEach(button => button.classList.toggle("active", button.dataset.cashTab === tabId));
  document.querySelectorAll(".cash-tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
}

function getDieselPOFormData() {
  const now = new Date().toISOString();
  return {
    id: $("diesel-form").dataset.recordId || createId("diesel"),
    type: "Diesel PO",
    date: $("diesel-date").value,
    plateNumber: normalizePlate($("diesel-plate-number").value),
    groupCategory: normalizeGroup($("diesel-group-category").value),
    personName: $("diesel-person-name").value.trim(),
    personType: $("diesel-person-type").value,
    driverName: $("diesel-driver-name").value.trim(),
    helperName: $("diesel-helper-name").value.trim(),
    fuelStation: $("diesel-fuel-station").value.trim(),
    liters: Number($("diesel-liters").value) || 0,
    amount: Number($("diesel-amount").value) || 0,
    poNumber: $("diesel-po-number").value.trim(),
    route: $("diesel-route").value.trim(),
    source: $("diesel-source").value.trim(),
    destination: $("diesel-destination").value.trim(),
    depositNeeded: $("diesel-deposit-needed").value,
    depositTo: $("diesel-deposit-to").value.trim(),
    receiverName: $("diesel-receiver-name").value.trim(),
    depositNumber: $("diesel-deposit-number").value.trim(),
    status: $("diesel-status-field").value,
    reference: $("diesel-reference").value.trim(),
    remarks: $("diesel-remarks").value.trim(),
    createdAt: $("diesel-form").dataset.createdAt || now,
    updatedAt: now
  };
}

function validateDieselPO(data) {
  if (!data.date || !data.amount) return "Date and Diesel Amount are required.";
  if (!data.plateNumber && (!resolveCashPerson(data) || !resolveCashRole(data))) return "Person Name and Role are required when Plate Number is blank.";
  if (data.plateNumber && (!data.fuelStation || !data.poNumber)) return "Fuel Station and PO Number are required when Plate Number is selected.";
  if (data.depositNeeded === "Yes" && (!data.receiverName || !data.depositNumber)) return "Receiver Name and Account / Number are required when Deposit Needed is Yes.";
  return "";
}

function saveDieselPO() {
  const isEditing = Boolean($("diesel-form").dataset.recordId);
  applyTruckToForm("diesel");
  const data = getDieselPOFormData();
  const error = validateDieselPO(data);
  if (error) return setStatus("diesel-status", error, "warning");
  const records = readJson(DIESEL_KEY);
  writeJson(DIESEL_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("diesel-form").dataset.recordId = data.id;
  $("diesel-form").dataset.createdAt = data.createdAt;
  refreshAllCashData();
  syncCashSilent(data, "diesel-status", isEditing ? "updateEntry" : "saveEntry");
}

function clearDieselPOForm() {
  $("diesel-form").reset();
  delete $("diesel-form").dataset.recordId;
  delete $("diesel-form").dataset.createdAt;
  $("diesel-message").value = "";
  setStatus("diesel-status", "");
  applyDieselDepositState();
}

function loadDieselPOToForm(record) {
  switchCashTab("diesel-tab");
  $("diesel-form").dataset.recordId = record.id;
  $("diesel-form").dataset.createdAt = record.createdAt || "";
  $("diesel-date").value = record.date || "";
  $("diesel-plate-number").value = record.plateNumber || "";
  setGroupSelectValue("diesel-group-category", record.groupCategory || "");
  $("diesel-person-name").value = record.personName || "";
  $("diesel-person-type").value = record.personType || "Driver";
  $("diesel-driver-name").value = record.driverName || "";
  $("diesel-helper-name").value = record.helperName || "";
  $("diesel-fuel-station").value = record.fuelStation || "";
  $("diesel-liters").value = record.liters || "";
  $("diesel-amount").value = record.amount || "";
  $("diesel-po-number").value = record.poNumber || "";
  $("diesel-route").value = record.route || "";
  $("diesel-source").value = record.source || "";
  $("diesel-destination").value = record.destination || "";
  $("diesel-deposit-needed").value = record.depositNeeded || "No";
  $("diesel-deposit-to").value = record.depositTo || "";
  $("diesel-receiver-name").value = record.receiverName || "";
  $("diesel-deposit-number").value = record.depositNumber || "";
  $("diesel-status-field").value = record.status || "Draft";
  $("diesel-reference").value = record.reference || "";
  $("diesel-remarks").value = record.remarks || "";
  if (!record.groupCategory) applyTruckToForm("diesel");
  applyDieselDepositState();
}

function generateDieselPOViberMessage() {
  const d = getDieselPOFormData();
  $("diesel-message").value = [
    `Plate: ${d.plateNumber || "No Plate"}`,
    "Diesel PO Request",
    "",
    `Person: ${resolveCashPerson(d) || "-"}`,
    `Role: ${resolveCashRole(d) || "-"}`,
    `Driver: ${d.driverName || "-"}`,
    `Helper: ${d.helperName || "-"}`,
    "",
    `Fuel Station: ${d.fuelStation || "-"}`,
    `Liters: ${d.liters || "-"}`,
    `Amount: ${formatPeso(d.amount)}`,
    `PO Number: ${d.poNumber || "-"}`,
    `Route: ${d.source || "-"} to ${d.destination || "-"}`,
    "",
    `Deposit Needed: ${d.depositNeeded}`,
    `Deposit To: ${d.depositTo || "-"}`,
    `Receiver: ${d.receiverName || "-"}`,
    `Account / Number: ${d.depositNumber || "-"}`,
    "",
    `Status: ${d.status}`,
    `Reference: ${d.reference || "-"}`,
    `Remarks: ${d.remarks || "-"}`
  ].join("\n");
}

function copyDieselPOMessage() { navigator.clipboard?.writeText($("diesel-message").value); setStatus("diesel-status", "Diesel PO message copied.", "success"); }

function applyDieselDepositState() {
  const depositNeeded = $("diesel-deposit-needed").value === "Yes";
  ["diesel-receiver-name", "diesel-deposit-number"].forEach(id => {
    const input = $(id);
    input.disabled = !depositNeeded;
    input.style.opacity = depositNeeded ? "1" : ".58";
  });
}

function getBudgetFormData() {
  const now = new Date().toISOString();
  return {
    id: $("budget-form").dataset.recordId || createId("budget"),
    type: "Trip Budget",
    date: $("budget-date").value,
    plateNumber: normalizePlate($("budget-plate-number").value),
    groupCategory: normalizeGroup($("budget-group-category").value),
    personName: $("budget-person-name").value.trim(),
    personType: $("budget-person-type").value,
    driverName: $("budget-driver-name").value.trim(),
    helperName: $("budget-helper-name").value.trim(),
    budgetAmount: Number($("budget-amount").value) || 0,
    budgetType: $("budget-type").value,
    source: $("budget-source").value.trim(),
    destination: $("budget-destination").value.trim(),
    shipmentNumber: $("budget-shipment-number").value.trim(),
    depositTo: $("budget-deposit-to").value.trim(),
    receiverName: $("budget-receiver-name").value.trim(),
    depositNumber: $("budget-deposit-number").value.trim(),
    status: $("budget-status-field").value,
    reference: $("budget-reference").value.trim(),
    remarks: $("budget-remarks").value.trim(),
    createdAt: $("budget-form").dataset.createdAt || now,
    updatedAt: now
  };
}

function validateBudget(data) {
  if (!data.date || !data.budgetAmount) return "Date and Budget Amount are required.";
  if (!data.plateNumber && (!resolveCashPerson(data) || !resolveCashRole(data))) return "Person Name and Role are required when Plate Number is blank.";
  if (data.plateNumber && (!data.depositTo || !data.receiverName || !data.depositNumber)) return "Deposit To, Receiver Name, and Number are required when Plate Number is selected.";
  return "";
}

function saveBudget() {
  const isEditing = Boolean($("budget-form").dataset.recordId);
  applyTruckToForm("budget");
  const data = getBudgetFormData();
  const error = validateBudget(data);
  if (error) return setStatus("budget-status", error, "warning");
  const records = readJson(BUDGET_KEY);
  writeJson(BUDGET_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("budget-form").dataset.recordId = data.id;
  $("budget-form").dataset.createdAt = data.createdAt;
  refreshAllCashData();
  syncCashSilent(data, "budget-status", isEditing ? "updateEntry" : "saveEntry");
}

function clearBudgetForm() {
  $("budget-form").reset();
  delete $("budget-form").dataset.recordId;
  delete $("budget-form").dataset.createdAt;
  $("budget-message").value = "";
  setStatus("budget-status", "");
}

function loadBudgetToForm(record) {
  switchCashTab("budget-tab");
  $("budget-form").dataset.recordId = record.id;
  $("budget-form").dataset.createdAt = record.createdAt || "";
  ["date","plateNumber","personName","driverName","helperName","source","destination","shipmentNumber","depositTo","receiverName","depositNumber","status","reference","remarks"].forEach(key => {
    const id = `budget-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
    if ($(id)) $(id).value = record[key] || "";
  });
  $("budget-amount").value = record.budgetAmount || "";
  $("budget-type").value = record.budgetType || "Trip Budget";
  $("budget-person-type").value = record.personType || "Driver";
  setGroupSelectValue("budget-group-category", record.groupCategory || "");
  $("budget-status-field").value = record.status || "Draft";
  if (!record.groupCategory) applyTruckToForm("budget");
}

function generateBudgetViberMessage() {
  const d = getBudgetFormData();
  $("budget-message").value = [
    `Plate: ${d.plateNumber || "No Plate"}`,
    "Trip Budget Request",
    "",
    `Person: ${resolveCashPerson(d) || "-"}`,
    `Role: ${resolveCashRole(d) || "-"}`,
    `Driver: ${d.driverName || "-"}`,
    `Helper: ${d.helperName || "-"}`,
    "",
    `Budget Type: ${d.budgetType}`,
    `Amount: ${formatPeso(d.budgetAmount)}`,
    `Route: ${d.source || "-"} to ${d.destination || "-"}`,
    `Shipment / DR: ${d.shipmentNumber || "-"}`,
    "",
    `Deposit To: ${d.depositTo || "-"}`,
    `Receiver: ${d.receiverName || "-"}`,
    `Account / Number: ${d.depositNumber || "-"}`,
    "",
    `Status: ${d.status}`,
    `Reference: ${d.reference || "-"}`,
    `Remarks: ${d.remarks || "-"}`
  ].join("\n");
}

function copyBudgetMessage() { navigator.clipboard?.writeText($("budget-message").value); setStatus("budget-status", "Trip Budget message copied.", "success"); }

function getBaliFormData() {
  const now = new Date().toISOString();
  return {
    id: $("bali-form").dataset.recordId || createId("bali"),
    type: "Bali / Cash Advance",
    date: $("bali-date").value,
    plateNumber: normalizePlate($("bali-plate-number").value),
    groupCategory: normalizeGroup($("bali-group-category").value),
    driverName: $("bali-driver-name").value.trim(),
    helperName: $("bali-helper-name").value.trim(),
    personType: $("bali-person-type").value,
    personName: $("bali-person-name").value.trim(),
    currentBalance: Number($("bali-current-balance").value) || 0,
    amount: Number($("bali-amount").value) || 0,
    reason: $("bali-reason").value.trim(),
    depositTo: $("bali-deposit-to").value,
    receiverName: $("bali-receiver-name").value.trim(),
    depositNumber: $("bali-deposit-number").value.trim(),
    status: $("bali-status-field").value,
    approvedBy: $("bali-approved-by").value.trim(),
    reference: $("bali-reference").value.trim(),
    paymentDate: $("bali-payment-date").value,
    remarks: $("bali-remarks").value.trim(),
    createdAt: $("bali-form").dataset.createdAt || now,
    updatedAt: now
  };
}

function validateBali(data) {
  if (!data.date || !data.personType || !data.personName || !data.amount) return "Date, Person Type, Person Name, and Bali Amount are required.";
  if (data.plateNumber && (!data.depositTo || !data.receiverName || !data.depositNumber)) return "Deposit To, Receiver Name, and Number are required when Plate Number is selected.";
  return "";
}

function saveBali() {
  const isEditing = Boolean($("bali-form").dataset.recordId);
  applyTruckToForm("bali");
  const data = getBaliFormData();
  const error = validateBali(data);
  if (error) return setStatus("bali-status", error, "warning");
  const records = readJson(BALI_KEY);
  writeJson(BALI_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("bali-form").dataset.recordId = data.id;
  $("bali-form").dataset.createdAt = data.createdAt;
  refreshAllCashData();
  syncCashSilent(data, "bali-status", isEditing ? "updateEntry" : "saveEntry");
}

function clearBaliForm() {
  $("bali-form").reset();
  delete $("bali-form").dataset.recordId;
  delete $("bali-form").dataset.createdAt;
  $("bali-message").value = "";
  setStatus("bali-status", "");
}

function loadBaliToForm(record) {
  switchCashTab("bali-tab");
  $("bali-form").dataset.recordId = record.id;
  $("bali-form").dataset.createdAt = record.createdAt || "";
  ["date","plateNumber","driverName","helperName","personName","reason","receiverName","depositNumber","approvedBy","reference","paymentDate","remarks"].forEach(key => {
    const id = `bali-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
    if ($(id)) $(id).value = record[key] || "";
  });
  $("bali-person-type").value = record.personType || "Driver";
  $("bali-current-balance").value = record.currentBalance || "";
  $("bali-amount").value = record.amount || "";
  $("bali-deposit-to").value = record.depositTo || "GCash";
  setGroupSelectValue("bali-group-category", record.groupCategory || "");
  $("bali-status-field").value = record.status || "Draft";
  if (!record.groupCategory) applyTruckToForm("bali");
}

function generateBaliViberMessage() {
  const d = getBaliFormData();
  $("bali-message").value = [
    `Plate: ${d.plateNumber || "No Plate"}`,
    "Bali / Cash Advance Request",
    "",
    `Driver: ${d.driverName || "-"}`,
    `Helper: ${d.helperName || "-"}`,
    "",
    `Name: ${d.personName || "-"}`,
    `Role: ${d.personType}`,
    `Current Balance: ${formatPeso(d.currentBalance)}`,
    `New Bali Amount: ${formatPeso(d.amount)}`,
    "",
    `Deposit To: ${d.depositTo}`,
    `Receiver: ${d.receiverName || "-"}`,
    `Account / Number: ${d.depositNumber || "-"}`,
    "",
    `Status: ${d.status}`,
    `Approved By: ${d.approvedBy || "-"}`,
    `Reference: ${d.reference || "-"}`,
    `Payment Date: ${d.paymentDate || "-"}`,
    `Remarks: ${d.reason || d.remarks || "-"}`
  ].join("\n");
}

function copyBaliMessage() { navigator.clipboard?.writeText($("bali-message").value); setStatus("bali-status", "Bali message copied.", "success"); }

function getAllSavedCashRecords() {
  return readJson(DIESEL_KEY).concat(readJson(BUDGET_KEY), readJson(BALI_KEY)).filter(record => !record.isDeleted);
}

function applySavedRecordFilters(records) {
  const from = $("filter-date-from").value;
  const to = $("filter-date-to").value;
  const type = $("filter-type").value;
  const group = $("filter-group")?.value || "";
  const plate = normalizePlate($("filter-plate").value);
  return records.filter(record => (!from || record.date >= from) && (!to || record.date <= to) && (!type || record.type === type) && (!group || normalizeGroup(record.groupCategory) === group) && (!plate || normalizePlate(record.plateNumber).includes(plate)));
}

function renderSavedCashRecords() {
  const body = $("saved-records-body");
  const rows = applySavedRecordFilters(getAllSavedCashRecords()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  body.innerHTML = rows.length ? rows.map(record => {
    const amount = record.type === "Diesel PO" ? record.amount : record.type === "Trip Budget" ? record.budgetAmount : record.amount;
    return `<tr><td>${escapeHtml(record.date || "")}</td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.plateNumber || "No Plate")}</td><td>${escapeHtml(normalizeGroup(record.groupCategory || (record.plateNumber ? "" : "General / No Plate")))}</td><td>${formatCurrency(amount)}</td><td>${escapeHtml(record.receiverName || resolveCashPerson(record) || "")}</td><td>${escapeHtml(record.status || "")}</td><td class="cash-row-actions"><button data-action="load" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Load</button><button data-action="message" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Message</button><button data-action="delete" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Delete</button></td></tr>`;
  }).join("") : '<tr><td colspan="8" class="empty">No saved local records found.</td></tr>';
}

function getRecordStore(type) {
  if (type === "Diesel PO") return [DIESEL_KEY, readJson(DIESEL_KEY), loadDieselPOToForm, generateDieselPOViberMessage];
  if (type === "Trip Budget") return [BUDGET_KEY, readJson(BUDGET_KEY), loadBudgetToForm, generateBudgetViberMessage];
  return [BALI_KEY, readJson(BALI_KEY), loadBaliToForm, generateBaliViberMessage];
}

function loadSavedCashRecord(type, id) {
  const [, records, loader] = getRecordStore(type);
  const record = records.find(item => item.id === id);
  if (record) loader(record);
}

function deleteSavedCashRecord(type, id) {
  if (!confirm("Delete this local record?")) return;
  const [key, records] = getRecordStore(type);
  const now = new Date().toISOString();
  let deletedRecord = null;
  const updated = records.map(item => {
    if (item.id !== id) return item;
    deletedRecord = { ...item, isDeleted: true, deletedAt: now, deletedBy: "", updatedAt: now };
    return deletedRecord;
  });
  writeJson(key, updated);
  refreshAllCashData();
  if (!deletedRecord) return;
  const statusId = getStatusIdForType(type);
  cashPost({ action: "deleteEntry", cashId: deletedRecord.id, deletedBy: "" })
    .then(res => setStatus(statusId, (res && res.ok) ? "Deleted locally and synced." : "Deleted locally. Google Sheets delete sync failed.", (res && res.ok) ? "success" : "warning"))
    .catch(() => setStatus(statusId, "Deleted locally. Google Sheets delete sync failed.", "warning"));
}

function getStatusIdForType(type) {
  if (type === "Diesel PO") return "diesel-status";
  if (type === "Trip Budget") return "budget-status";
  return "bali-status";
}

function generateSavedCashRecordMessage(type, id) {
  const [, records, loader, generator] = getRecordStore(type);
  const record = records.find(item => item.id === id);
  if (!record) return;
  loader(record);
  generator();
}

function updateCashSummary() {
  const diesel = readJson(DIESEL_KEY).filter(item => !item.isDeleted);
  const budgets = readJson(BUDGET_KEY).filter(item => !item.isDeleted);
  const bali = readJson(BALI_KEY).filter(item => !item.isDeleted);
  $("summary-diesel-amount").textContent = formatCurrency(diesel.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  $("summary-diesel-count").textContent = String(diesel.length);
  $("summary-budget-amount").textContent = formatCurrency(budgets.reduce((sum, item) => sum + (Number(item.budgetAmount) || 0), 0));
  $("summary-budget-count").textContent = String(budgets.length);
  $("summary-bali-amount").textContent = formatCurrency(bali.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  $("summary-bali-count").textContent = String(bali.length);
}

function refreshAllCashData() {
  updateCashSummary();
  renderSavedCashRecords();
}

function wireEvents() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (toggle && nav) toggle.addEventListener("click", () => toggle.setAttribute("aria-expanded", String(nav.classList.toggle("open"))));
  document.querySelectorAll(".cash-tab").forEach(button => button.addEventListener("click", () => switchCashTab(button.dataset.cashTab)));
  $("save-diesel-button").addEventListener("click", saveDieselPO); $("generate-diesel-button").addEventListener("click", generateDieselPOViberMessage); $("copy-diesel-button").addEventListener("click", copyDieselPOMessage); $("clear-diesel-button").addEventListener("click", clearDieselPOForm);
  $("diesel-deposit-needed").addEventListener("change", applyDieselDepositState);
  $("save-budget-button").addEventListener("click", saveBudget); $("generate-budget-button").addEventListener("click", generateBudgetViberMessage); $("copy-budget-button").addEventListener("click", copyBudgetMessage); $("clear-budget-button").addEventListener("click", clearBudgetForm);
  $("save-bali-button").addEventListener("click", saveBali); $("generate-bali-button").addEventListener("click", generateBaliViberMessage); $("copy-bali-button").addEventListener("click", copyBaliMessage); $("clear-bali-button").addEventListener("click", clearBaliForm);
  ["diesel", "budget", "bali"].forEach(prefix => {
    const plateInput = $(`${prefix}-plate-number`);
    if (plateInput) {
      plateInput.addEventListener("change", () => applyTruckToForm(prefix));
      plateInput.addEventListener("blur", () => applyTruckToForm(prefix));
    }
  });
  ["filter-date-from", "filter-date-to", "filter-type", "filter-group", "filter-plate"].forEach(id => $(id).addEventListener("input", renderSavedCashRecords));
  $("saved-records-body").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "load") loadSavedCashRecord(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "delete") deleteSavedCashRecord(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "message") generateSavedCashRecordMessage(button.dataset.type, button.dataset.id);
  });
}

populateCashRoleSelects();
wireEvents();
applyDieselDepositState();
fetchTruckMaster();
refreshAllCashData();
