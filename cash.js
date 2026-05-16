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
  const loggedBy = clean.loggedBy || clean.Logged_By || clean.encodedBy || clean.Encoded_By || '';
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
    Encoded_By: loggedBy,
    Logged_By: loggedBy,
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
let savedCashRecordsCache = [];
let savedCashRecordsSource = "local";
let savedCashRecordsStatus = "";
let savedCashRecordsStatusKind = "info";
let activeCashEditRecord = null;
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

function isNoPlateSelection(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "no plate" || normalized === "no plate / not available" || normalized === "not available" || normalized === "n/a";
}

function getPlateInputValue(id) {
  const value = $(id)?.value || "";
  return isNoPlateSelection(value) ? "" : normalizePlate(value);
}

function normalizeGroup(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compactKey = key.replace(/[^a-z0-9]/g, "");
  if (!key) return "Needs Update / Unknown";
  if (key === "general" || key === "general / no plate" || key === "no plate" || compactKey === "generalnoplate") return "General / No Plate";
  if (key === "bottle" || key === "bottles") return "Bottle";
  if (key === "sugar") return "Sugar";
  if (key === "preform" || key === "resin" || key === "preform / resin" || compactKey === "preformresin") return "Preform / Resin";
  if (key === "caps" || key === "crown" || key === "crowns" || key === "caps / crown" || key === "caps / crowns" || compactKey === "capscrown" || compactKey === "capscrowns") return "Caps / Crown";
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
  return String(truck?.Driver || truck?.Current_Driver_Name || truck?.Current_Driver || truck?.driverName || "").trim();
}

function getTruckHelper(truck) {
  return String(truck?.Helper || truck?.Current_Helper_Name || truck?.Current_Helper || truck?.helperName || "").trim();
}

function findTruckByPlate(plate) {
  const normalized = normalizePlate(plate);
  return truckMasterCache.find(truck => getTruckPlate(truck) === normalized);
}

function getTrucksForGroup(group) {
  if (!String(group || "").trim()) return truckMasterCache;
  const normalizedGroup = normalizeGroup(group);
  if (normalizedGroup === "General / No Plate") return [];
  return truckMasterCache.filter(truck => getTruckGroup(truck) === normalizedGroup);
}

function loadLocalTruckMaster() {
  const trucks = readJson("vnsTruckMaster", []);
  truckMasterCache = Array.isArray(trucks) ? trucks : [];
  renderTruckPlateDatalists();
  refreshVisiblePlateGroups();
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
        renderTruckPlateDatalists();
        refreshVisiblePlateGroups();
      }
    })
    .catch(loadLocalTruckMaster);
}

function refreshVisiblePlateGroups() {
  ["diesel", "budget", "bali"].forEach(prefix => {
    renderTruckPlateDatalistForPrefix(prefix);
    const input = $(`${prefix}-plate-number`);
    if (input && input.value) {
      if (isNoPlateSelection(input.value)) applyNoPlateToForm(prefix);
      else applyTruckToForm(prefix);
    }
  });
  renderTruckPlateDatalistForPrefix("filter");
  renderSavedCashRecords();
}

function buildPlateOptions(plates, includeNoPlate = false) {
  const options = plates.map(plate => `<option value="${escapeHtml(plate)}"></option>`);
  return (includeNoPlate ? ['<option value="No Plate / Not Available"></option>'] : []).concat(options).join("");
}

function renderTruckPlateDatalists() {
  ["diesel", "budget", "bali", "filter"].forEach(renderTruckPlateDatalistForPrefix);
}

function renderTruckPlateDatalistForPrefix(prefix) {
  const listId = prefix === "filter" ? "cash-truck-plates" : `${prefix}-truck-plates`;
  const list = $(listId);
  if (!list) return;
  const groupValue = prefix === "filter" ? "" : $(`${prefix}-group-category`)?.value || "";
  const plates = [...new Set(getTrucksForGroup(groupValue).map(getTruckPlate).filter(Boolean))].sort();
  list.innerHTML = buildPlateOptions(plates, prefix === "bali" && normalizeGroup(groupValue) === "General / No Plate");
}

function applyNoPlateToForm(prefix) {
  const plateInput = $(`${prefix}-plate-number`);
  if (plateInput && prefix === "bali") plateInput.value = "No Plate / Not Available";
  if (plateInput && prefix !== "bali") plateInput.value = "";
  setGroupSelectValue(`${prefix}-group-category`, "General / No Plate");
  renderTruckPlateDatalistForPrefix(prefix);
}

function applyGroupToPlateOptions(prefix) {
  const plateInput = $(`${prefix}-plate-number`);
  const groupEl = $(`${prefix}-group-category`);
  if (!plateInput || !groupEl) return;
  const selectedGroup = normalizeGroup(groupEl.value);
  renderTruckPlateDatalistForPrefix(prefix);
  if (isNoPlateSelection(plateInput.value) || selectedGroup === "General / No Plate") {
    applyNoPlateToForm(prefix);
    return;
  }
  const plate = normalizePlate(plateInput.value);
  if (!plate) return;
  const truck = findTruckByPlate(plate);
  if (!truck || getTruckGroup(truck) !== selectedGroup) plateInput.value = "";
}

function applyTruckToForm(prefix) {
  const plateInput = $(`${prefix}-plate-number`);
  if (!plateInput || !normalizePlate(plateInput.value) || isNoPlateSelection(plateInput.value)) {
    if (plateInput && isNoPlateSelection(plateInput.value)) {
      applyNoPlateToForm(prefix);
    }
    return;
  }
  plateInput.value = normalizePlate(plateInput.value);
  const truck = findTruckByPlate(plateInput?.value);
  if (!truck) {
    setGroupSelectValue(`${prefix}-group-category`, "Needs Update / Unknown");
    renderTruckPlateDatalistForPrefix(prefix);
    return;
  }
  const groupEl = $(`${prefix}-group-category`);
  const driverEl = $(`${prefix}-driver-name`);
  const helperEl = $(`${prefix}-helper-name`);
  if (groupEl) setGroupSelectValue(groupEl.id, getTruckGroup(truck));
  if (driverEl && getTruckDriver(truck)) driverEl.value = getTruckDriver(truck);
  if (helperEl && getTruckHelper(truck)) helperEl.value = getTruckHelper(truck);
  renderTruckPlateDatalistForPrefix(prefix);
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

function resolveRecordGroup(record) {
  if (!record.plateNumber) return "General / No Plate";
  const truck = findTruckByPlate(record.plateNumber);
  return truck ? getTruckGroup(truck) : normalizeGroup(record.groupCategory || "Needs Update / Unknown");
}

function resolveCashPerson(data) {
  return String(data.personName || data.loggedBy || data.driverName || data.receiverName || "").trim();
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
  const loggedBy = $("diesel-logged-by").value.trim();
  return {
    id: $("diesel-form").dataset.recordId || createId("diesel"),
    type: "Diesel PO",
    date: $("diesel-date").value,
    plateNumber: getPlateInputValue("diesel-plate-number"),
    groupCategory: resolveRecordGroup({ plateNumber: getPlateInputValue("diesel-plate-number"), groupCategory: $("diesel-group-category").value }),
    loggedBy,
    personName: loggedBy,
    personType: loggedBy ? "Logger" : "",
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
  if (!data.date) return "Please enter the Date before saving Diesel PO.";
  if (!data.groupCategory) return "Please select the Group before saving Diesel PO.";
  if (!data.plateNumber) return "Please enter the Plate Number before saving Diesel PO.";
  if (!data.fuelStation) return "Please enter the Fuel Station before saving Diesel PO.";
  if (!data.poNumber) return "Please enter the PO Number before saving Diesel PO.";
  if (!data.amount && !data.liters) return "Please enter either Diesel Amount or Diesel Liters before saving Diesel PO.";
  if (!data.status) return "Please select the Status before saving Diesel PO.";
  if (data.depositNeeded === "Yes" && (!data.receiverName || !data.depositTo || !data.depositNumber)) return "Receiver Name, Deposit To, and Account / Number are required when Deposit Needed is Yes.";
  return "";
}

function markCashError(id) {
  const el = $(id);
  if (el) el.classList.add("input-error");
}

function clearCashErrors(...ids) {
  ids.forEach(id => {
    const el = $(id);
    if (el) el.classList.remove("input-error");
  });
}

function saveDieselPO() {
  const isEditing = Boolean($("diesel-form").dataset.recordId);
  applyTruckToForm("diesel");
  const data = getDieselPOFormData();
  const error = validateDieselPO(data);
  if (error) {
    clearCashErrors("diesel-date","diesel-group-category","diesel-plate-number","diesel-logged-by","diesel-amount","diesel-liters","diesel-fuel-station","diesel-po-number","diesel-receiver-name","diesel-deposit-to","diesel-deposit-number","diesel-status-field");
    if (!data.date) markCashError("diesel-date");
    if (!data.groupCategory) markCashError("diesel-group-category");
    if (!data.plateNumber) markCashError("diesel-plate-number");
    if (!data.fuelStation) markCashError("diesel-fuel-station");
    if (!data.poNumber) markCashError("diesel-po-number");
    if (!data.amount && !data.liters) {
      markCashError("diesel-amount");
      markCashError("diesel-liters");
    }
    if (!data.status) markCashError("diesel-status-field");
    if (data.depositNeeded === "Yes" && !data.receiverName) markCashError("diesel-receiver-name");
    if (data.depositNeeded === "Yes" && !data.depositTo) markCashError("diesel-deposit-to");
    if (data.depositNeeded === "Yes" && !data.depositNumber) markCashError("diesel-deposit-number");
    return setStatus("diesel-status", error, "warning");
  }
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
  renderTruckPlateDatalistForPrefix("diesel");
  applyDieselDepositState();
}

function loadDieselPOToForm(record) {
  switchCashTab("diesel-tab");
  $("diesel-form").dataset.recordId = record.id;
  $("diesel-form").dataset.createdAt = record.createdAt || "";
  $("diesel-date").value = record.date || "";
  $("diesel-plate-number").value = record.plateNumber || "";
  setGroupSelectValue("diesel-group-category", record.groupCategory || "");
  $("diesel-logged-by").value = record.loggedBy || (record.personType === "Logger" ? record.personName : "") || "";
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
  renderTruckPlateDatalistForPrefix("diesel");
  applyDieselDepositState();
}

function generateDieselPOViberMessage() {
  const d = getDieselPOFormData();
  $("diesel-message").value = [
    `Plate: ${d.plateNumber || "No Plate"}`,
    "Diesel PO Request",
    "",
    `Logged By: ${d.loggedBy || "-"}`,
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
  ["diesel-receiver-name", "diesel-deposit-to", "diesel-deposit-number"].forEach(id => {
    const input = $(id);
    input.disabled = !depositNeeded;
    input.style.opacity = depositNeeded ? "1" : ".58";
  });
}

function applyDepositState(prefix) {
  const toggle = $(`${prefix}-deposit-needed`);
  if (!toggle) return;
  const depositNeeded = toggle.value === "Yes";
  [`${prefix}-receiver-name`, `${prefix}-deposit-to`, `${prefix}-deposit-number`].forEach(id => {
    const input = $(id);
    if (!input) return;
    input.disabled = !depositNeeded;
    input.style.opacity = depositNeeded ? "1" : ".58";
  });
}

function getBudgetFormData() {
  const now = new Date().toISOString();
  const loggedBy = $("budget-logged-by").value.trim();
  return {
    id: $("budget-form").dataset.recordId || createId("budget"),
    type: "Trip Budget",
    date: $("budget-date").value,
    plateNumber: getPlateInputValue("budget-plate-number"),
    groupCategory: resolveRecordGroup({ plateNumber: getPlateInputValue("budget-plate-number"), groupCategory: $("budget-group-category").value }),
    loggedBy,
    personName: loggedBy,
    personType: loggedBy ? "Logger" : "",
    driverName: $("budget-driver-name").value.trim(),
    helperName: $("budget-helper-name").value.trim(),
    budgetAmount: Number($("budget-amount").value) || 0,
    budgetType: $("budget-type").value,
    source: $("budget-source").value.trim(),
    destination: $("budget-destination").value.trim(),
    shipmentNumber: $("budget-shipment-number").value.trim(),
    depositNeeded: $("budget-deposit-needed").value,
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
  if (!data.date) return "Please enter the Date before saving Trip Budget.";
  if (!data.groupCategory) return "Please select the Group before saving Trip Budget.";
  if (!data.plateNumber) return "Please enter the Plate Number before saving Trip Budget.";
  if (!data.source || !data.destination) return "Please enter the Source and Destination before saving Trip Budget.";
  if (!data.budgetAmount) return "Please enter the Budget Amount before saving Trip Budget.";
  if (!data.status) return "Please select the Status before saving Trip Budget.";
  if (data.depositNeeded === "Yes" && (!data.receiverName || !data.depositTo || !data.depositNumber)) return "Receiver Name, Deposit To, and Account / Number are required when Deposit Needed is Yes.";
  return "";
}

function saveBudget() {
  const isEditing = Boolean($("budget-form").dataset.recordId);
  applyTruckToForm("budget");
  const data = getBudgetFormData();
  const error = validateBudget(data);
  if (error) {
    clearCashErrors("budget-date","budget-group-category","budget-plate-number","budget-logged-by","budget-amount","budget-source","budget-destination","budget-deposit-to","budget-receiver-name","budget-deposit-number","budget-status-field");
    if (!data.date) markCashError("budget-date");
    if (!data.groupCategory) markCashError("budget-group-category");
    if (!data.plateNumber) markCashError("budget-plate-number");
    if (!data.source) markCashError("budget-source");
    if (!data.destination) markCashError("budget-destination");
    if (!data.budgetAmount) markCashError("budget-amount");
    if (!data.status) markCashError("budget-status-field");
    if (data.depositNeeded === "Yes" && !data.receiverName) markCashError("budget-receiver-name");
    if (data.depositNeeded === "Yes" && !data.depositTo) markCashError("budget-deposit-to");
    if (data.depositNeeded === "Yes" && !data.depositNumber) markCashError("budget-deposit-number");
    return setStatus("budget-status", error, "warning");
  }
  const dataToSave = { ...data };
  delete dataToSave.depositNeeded;
  const records = readJson(BUDGET_KEY);
  writeJson(BUDGET_KEY, [dataToSave].concat(records.filter(item => item.id !== data.id)));
  $("budget-form").dataset.recordId = data.id;
  $("budget-form").dataset.createdAt = data.createdAt;
  refreshAllCashData();
  syncCashSilent(dataToSave, "budget-status", isEditing ? "updateEntry" : "saveEntry");
}

function clearBudgetForm() {
  $("budget-form").reset();
  delete $("budget-form").dataset.recordId;
  delete $("budget-form").dataset.createdAt;
  $("budget-message").value = "";
  setStatus("budget-status", "");
  renderTruckPlateDatalistForPrefix("budget");
  applyDepositState("budget");
}

function loadBudgetToForm(record) {
  switchCashTab("budget-tab");
  $("budget-form").dataset.recordId = record.id;
  $("budget-form").dataset.createdAt = record.createdAt || "";
  ["date","plateNumber","driverName","helperName","source","destination","shipmentNumber","depositTo","receiverName","depositNumber","status","reference","remarks"].forEach(key => {
    const id = `budget-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
    if ($(id)) $(id).value = record[key] || "";
  });
  $("budget-amount").value = record.budgetAmount || "";
  $("budget-logged-by").value = record.loggedBy || (record.personType === "Logger" ? record.personName : "") || "";
  $("budget-type").value = record.budgetType || "Trip Budget";
  $("budget-deposit-needed").value = record.depositNeeded || "No";
  setGroupSelectValue("budget-group-category", record.groupCategory || "");
  $("budget-status-field").value = record.status || "Draft";
  if (!record.groupCategory) applyTruckToForm("budget");
  renderTruckPlateDatalistForPrefix("budget");
  applyDepositState("budget");
}

function generateBudgetViberMessage() {
  const d = getBudgetFormData();
  $("budget-message").value = [
    `Plate: ${d.plateNumber || "No Plate"}`,
    "Trip Budget Request",
    "",
    `Logged By: ${d.loggedBy || "-"}`,
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
    plateNumber: getPlateInputValue("bali-plate-number"),
    groupCategory: resolveRecordGroup({ plateNumber: getPlateInputValue("bali-plate-number"), groupCategory: $("bali-group-category").value }),
    driverName: $("bali-driver-name").value.trim(),
    helperName: $("bali-helper-name").value.trim(),
    personType: $("bali-person-type").value,
    personName: $("bali-person-name").value.trim(),
    currentBalance: Number($("bali-current-balance").value) || 0,
    amount: Number($("bali-amount").value) || 0,
    reason: $("bali-reason").value.trim(),
    depositNeeded: $("bali-deposit-needed").value,
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
  if (!data.date) return "Please enter the Date before saving Bali / Cash Advance.";
  if (!data.personName) return "Please enter the Person Name before saving Bali / Cash Advance.";
  if (!data.personType) return "Please select the Role before saving Bali / Cash Advance.";
  if (!data.reason) return "Please enter the Reason before saving Bali / Cash Advance.";
  if (!data.amount) return "Please enter the Amount before saving Bali / Cash Advance.";
  if (!data.status) return "Please select the Status before saving Bali / Cash Advance.";
  if (data.depositNeeded === "Yes" && (!data.receiverName || !data.depositTo || !data.depositNumber)) return "Receiver Name, Deposit To, and Account / Number are required when Deposit Needed is Yes.";
  return "";
}

function saveBali() {
  const isEditing = Boolean($("bali-form").dataset.recordId);
  applyTruckToForm("bali");
  const data = getBaliFormData();
  const error = validateBali(data);
  if (error) {
    clearCashErrors("bali-date","bali-person-name","bali-person-type","bali-amount","bali-reason","bali-receiver-name","bali-deposit-to","bali-deposit-number","bali-status-field");
    if (!data.date) markCashError("bali-date");
    if (!data.personName) markCashError("bali-person-name");
    if (!data.personType) markCashError("bali-person-type");
    if (!data.amount) markCashError("bali-amount");
    if (!data.reason) markCashError("bali-reason");
    if (!data.status) markCashError("bali-status-field");
    if (data.depositNeeded === "Yes" && !data.receiverName) markCashError("bali-receiver-name");
    if (data.depositNeeded === "Yes" && !data.depositTo) markCashError("bali-deposit-to");
    if (data.depositNeeded === "Yes" && !data.depositNumber) markCashError("bali-deposit-number");
    return setStatus("bali-status", error, "warning");
  }
  const dataToSave = { ...data };
  delete dataToSave.depositNeeded;
  const records = readJson(BALI_KEY);
  writeJson(BALI_KEY, [dataToSave].concat(records.filter(item => item.id !== data.id)));
  $("bali-form").dataset.recordId = data.id;
  $("bali-form").dataset.createdAt = data.createdAt;
  refreshAllCashData();
  syncCashSilent(dataToSave, "bali-status", isEditing ? "updateEntry" : "saveEntry");
}

function clearBaliForm() {
  $("bali-form").reset();
  delete $("bali-form").dataset.recordId;
  delete $("bali-form").dataset.createdAt;
  $("bali-message").value = "";
  setStatus("bali-status", "");
  renderTruckPlateDatalistForPrefix("bali");
  applyDepositState("bali");
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
  $("bali-deposit-needed").value = record.depositNeeded || "No";
  $("bali-deposit-to").value = record.depositTo || "GCash";
  setGroupSelectValue("bali-group-category", record.groupCategory || "");
  $("bali-status-field").value = record.status || "Draft";
  if (!record.groupCategory) applyTruckToForm("bali");
  if (!record.plateNumber) {
    $("bali-plate-number").value = "No Plate / Not Available";
    setGroupSelectValue("bali-group-category", "General / No Plate");
  }
  renderTruckPlateDatalistForPrefix("bali");
  applyDepositState("bali");
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

function firstCashValue(record, keys, fallback = "") {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
}

function detectCashRecordType(record = {}) {
  const explicit = firstCashValue(record, ["Transaction_Type", "Type", "transactionType", "type"]);
  const blob = [
    explicit,
    record.PO_Number,
    record.poNumber,
    record.Fuel_Station,
    record.fuelStation,
    record.Route_Trip,
    record.Route,
    record.route,
    record.Budget_Amount,
    record.budgetAmount,
    record.Balance_After_Payroll,
    record.currentBalance,
    record.Source_Message,
    record.Remarks
  ].map(value => String(value || "").toLowerCase()).join(" ");

  if (blob.includes("diesel") || blob.includes("fuel") || record.PO_Number || record.poNumber || record.Fuel_Station || record.fuelStation || record.Liters || record.dieselLiters) return "Diesel PO";
  if (blob.includes("trip budget") || blob.includes("budget") || record.Route_Trip || record.Budget_Amount || record.budgetAmount || record.Shipment_Number || record.shipmentNumber) return "Trip Budget";
  if (blob.includes("bali") || blob.includes("bale") || blob.includes("cash advance") || record.Balance_After_Payroll || record.currentBalance) return "Bali / Cash Advance";
  return explicit || "Other Cash Request";
}

function normalizeCashRecordForTable(record = {}, index = 0) {
  const type = detectCashRecordType(record);
  const amountValue = firstCashValue(record, ["Amount", "amount", "Diesel_Amount", "dieselAmount", "Budget_Amount", "budgetAmount"]);
  const plate = firstCashValue(record, ["Plate_Number", "plateNumber"], "No Plate") || "No Plate";
  const group = firstCashValue(record, ["Group_Category", "Truck_Group", "groupCategory"], "General / No Plate") || "General / No Plate";
  const logger = firstCashValue(record, ["Logged_By", "loggedBy", "Encoded_By", "encodedBy"]);
  const person = firstCashValue(record, ["Person_Name", "personName"]);
  const driver = firstCashValue(record, ["Driver_Name", "driverName"]);
  const helper = firstCashValue(record, ["Helper_Name", "helperName"]);
  const receiver = type === "Bali / Cash Advance"
    ? firstCashValue(record, ["Person_Name", "personName", "Logged_By", "loggedBy", "Encoded_By", "encodedBy"], "-")
    : firstCashValue(record, ["Logged_By", "loggedBy", "Encoded_By", "encodedBy", "Person_Name", "personName", "Driver_Name", "driverName", "Helper_Name", "helperName"], "-");

  return {
    id: firstCashValue(record, ["Cash_ID", "Record_ID", "id", "recordId", "cashId"], `cash_${index + 1}`),
    date: firstCashValue(record, ["Date", "Message_Date", "Encoded_At", "Created_At", "createdAt"]),
    type,
    plate,
    group,
    amount: Number(String(amountValue || "").replace(/[^\d.-]/g, "")) || 0,
    receiver,
    status: firstCashValue(record, ["Review_Status", "Status", "status", "reviewStatus"], "Draft") || "Draft",
    raw: record,
    logger,
    person,
    driver,
    helper
  };
}

function cashRecordStatus(record = {}) {
  return firstCashValue(record, ["Review_Status", "Status", "status", "reviewStatus"], record.status || "");
}

function isCashDraftRecord(record = {}) {
  const status = String(cashRecordStatus(record) || "").trim().toLowerCase();
  return !status || status === "draft";
}

function normalizeSavedCashRecord(record = {}, index = 0, source = "local") {
  const display = normalizeCashRecordForTable(record, index);
  return {
    ...record,
    id: display.id,
    type: display.type,
    date: display.date,
    plateNumber: display.plate === "No Plate" ? "" : display.plate,
    groupCategory: display.group,
    loggedBy: display.logger,
    personName: display.person,
    driverName: display.driver,
    helperName: display.helper,
    amount: display.amount,
    budgetAmount: Number(String(firstCashValue(record, ["Budget_Amount", "budgetAmount", "Amount", "amount"]) || "").replace(/[^\d.-]/g, "")) || 0,
    poNumber: firstCashValue(record, ["PO_Number", "poNumber"]),
    liters: firstCashValue(record, ["Liters", "dieselLiters"]),
    fuelStation: firstCashValue(record, ["Fuel_Station", "fuelStation"]),
    route: firstCashValue(record, ["Route_Trip", "Route", "route"]),
    source: firstCashValue(record, ["Source", "source"]),
    destination: firstCashValue(record, ["Destination", "destination"]),
    shipmentNumber: firstCashValue(record, ["Shipment_Number", "shipmentNumber"]),
    budgetType: firstCashValue(record, ["Budget_Type", "budgetType"]),
    currentBalance: Number(String(firstCashValue(record, ["Balance_After_Payroll", "currentBalance"]) || "").replace(/[^\d.-]/g, "")) || 0,
    reason: firstCashValue(record, ["Reason", "reason", "Source_Message", "sourceMessage", "Remarks", "remarks"]),
    remarks: firstCashValue(record, ["Remarks", "remarks", "Source_Message", "sourceMessage"]),
    receiverName: display.receiver,
    status: display.status,
    paymentStatus: firstCashValue(record, ["Payment_Status", "paymentStatus", "Posted_Status", "postedStatus"], ""),
    tableDisplay: display,
    __cashRecordSource: source
  };
}

function normalizeCashListResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result)) return data.result;
  return [];
}

function getLocalSavedCashRecords() {
  return getAllSavedCashRecords().map((record, index) => normalizeSavedCashRecord(record, index, "local"));
}

function setSavedRecordsStatus(message, kind = "info") {
  savedCashRecordsStatus = message;
  savedCashRecordsStatusKind = kind;
  const body = $("saved-records-body");
  const tableWrap = body?.closest(".cash-table-wrap");
  if (!tableWrap) return;
  let status = $("saved-records-cloud-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "saved-records-cloud-status";
    status.className = "cash-status info";
    tableWrap.parentNode.insertBefore(status, tableWrap);
  }
  status.className = `cash-status ${kind}`;
  status.textContent = message;
}

async function loadSavedCashRecordsFromCloud() {
  try {
    const params = new URLSearchParams({ action: "listEntries", syncKey: CASH_SYNC_KEY });
    const response = await fetch(`${CASH_APP_SCRIPT_URL}?${params.toString()}`);
    if (!response.ok) throw new Error(`Cloud load failed: ${response.status}`);
    const data = await response.json();
    if (data && data.ok === false) throw new Error(data.error || "Cloud load failed.");
    const cloudRows = normalizeCashListResponse(data)
      .filter(record => record && typeof record === "object")
      .map((record, index) => normalizeSavedCashRecord(record, index, "cloud"));
    if (cloudRows.length) {
      savedCashRecordsCache = cloudRows;
      savedCashRecordsSource = "cloud";
      setSavedRecordsStatus("Loaded cloud records.", "success");
      renderSavedCashRecords();
      return;
    }
    savedCashRecordsCache = getLocalSavedCashRecords();
    savedCashRecordsSource = "local";
    setSavedRecordsStatus(savedCashRecordsCache.length ? "No cloud records found." : "No saved records found.", "info");
    renderSavedCashRecords();
  } catch (error) {
    console.warn("Cash cloud records unavailable; showing local records.", error);
    savedCashRecordsCache = getLocalSavedCashRecords();
    savedCashRecordsSource = "local";
    setSavedRecordsStatus(savedCashRecordsCache.length ? "Cloud load failed. Showing local records." : "No saved records found.", savedCashRecordsCache.length ? "warning" : "info");
    renderSavedCashRecords();
  }
}

function applySavedRecordFilters(records) {
  const from = $("filter-date-from").value;
  const to = $("filter-date-to").value;
  const type = $("filter-type").value;
  const group = $("filter-group")?.value || "";
  const plate = normalizePlate($("filter-plate").value);
  return records.filter(record => {
    const display = record.tableDisplay || normalizeCashRecordForTable(record);
    return (!from || display.date >= from) &&
      (!to || display.date <= to) &&
      (!type || display.type === type) &&
      (!group || display.group === group || resolveRecordGroup(record) === group) &&
      (!plate || normalizePlate(display.plate).includes(plate));
  });
}

function renderSavedCashRecords() {
  const body = $("saved-records-body");
  if (!savedCashRecordsCache.length) {
    savedCashRecordsCache = getLocalSavedCashRecords();
    if (!savedCashRecordsStatus) setSavedRecordsStatus("Loaded local records.", "info");
  } else if (savedCashRecordsStatus) {
    setSavedRecordsStatus(savedCashRecordsStatus, savedCashRecordsStatusKind);
  }
  const rows = applySavedRecordFilters(savedCashRecordsCache).sort((a, b) => {
    const aDisplay = a.tableDisplay || normalizeCashRecordForTable(a);
    const bDisplay = b.tableDisplay || normalizeCashRecordForTable(b);
    return String(bDisplay.date).localeCompare(String(aDisplay.date));
  });
  body.innerHTML = rows.length ? rows.map(record => {
    const display = record.tableDisplay || normalizeCashRecordForTable(record);
    const isCloud = record.__cashRecordSource === "cloud";
    const isDraft = isCashDraftRecord(record);
    const lockedTitle = "Only Draft records can be edited/deleted here. Ask Mother/Admin to return this request if changes are needed.";
    const editAttrs = isDraft ? "" : ` disabled title="${lockedTitle}"`;
    const deleteAttrs = isDraft ? "" : ` disabled title="${lockedTitle}"`;
    return `<tr><td>${escapeHtml(display.date || "")}</td><td>${escapeHtml(display.type)}</td><td>${escapeHtml(display.plate)}</td><td>${escapeHtml(display.group)}</td><td>${formatCurrency(display.amount)}</td><td>${escapeHtml(display.receiver)}</td><td>${escapeHtml(display.status)}</td><td class="cash-row-actions"><button data-action="edit" data-type="${escapeHtml(display.type)}" data-id="${escapeHtml(display.id)}"${editAttrs}>Edit</button><button data-action="message" data-type="${escapeHtml(display.type)}" data-id="${escapeHtml(display.id)}">Message</button><button data-action="delete" data-type="${escapeHtml(display.type)}" data-id="${escapeHtml(display.id)}"${deleteAttrs}>Delete</button></td></tr>`;
  }).join("") : '<tr><td colspan="8" class="empty">No saved records found.</td></tr>';
}

function getRecordStore(type) {
  if (type === "Diesel PO") return [DIESEL_KEY, readJson(DIESEL_KEY), loadDieselPOToForm, generateDieselPOViberMessage];
  if (type === "Trip Budget") return [BUDGET_KEY, readJson(BUDGET_KEY), loadBudgetToForm, generateBudgetViberMessage];
  return [BALI_KEY, readJson(BALI_KEY), loadBaliToForm, generateBaliViberMessage];
}

function loadSavedCashRecord(type, id) {
  const [, records, loader] = getRecordStore(type);
  const record = records.find(item => item.id === id) || savedCashRecordsCache.find(item => item.id === id);
  if (record) loader(record);
}

function findSavedCashRecord(id, type = "") {
  return savedCashRecordsCache.find(item => item.id === id && (!type || item.type === type)) ||
    getAllSavedCashRecords().find(item => item.id === id && (!type || detectCashRecordType(item) === type));
}

function cashEditTitle(type) {
  if (type === "Diesel PO") return "Edit Diesel PO";
  if (type === "Trip Budget") return "Edit Trip Budget";
  if (type === "Bali / Cash Advance") return "Edit Bali / Cash Advance";
  return "Edit Cash Request";
}

function cashEditInput(id, label, value = "", type = "text", extra = "") {
  return `<label><span>${escapeHtml(label)}</span><input id="${id}" type="${type}" value="${escapeHtml(value)}"${extra}></label>`;
}

function cashEditTextarea(id, label, value = "") {
  return `<label class="cash-edit-wide"><span>${escapeHtml(label)}</span><textarea id="${id}" rows="3">${escapeHtml(value)}</textarea></label>`;
}

function cashEditSelect(id, label, value, options) {
  return `<label><span>${escapeHtml(label)}</span><select id="${id}">${options.map(option => `<option${String(option) === String(value) ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
}

function cashEditSection(title, fields) {
  return `<section class="cash-edit-section"><h3>${escapeHtml(title)}</h3><div class="cash-edit-grid">${fields.join("")}</div></section>`;
}

function buildCashEditForm(record) {
  const type = detectCashRecordType(record);
  const status = cashRecordStatus(record) || "Draft";
  const groupOptions = ["Bottle", "Sugar", "Preform / Resin", "Caps / Crown", "General / No Plate", "Needs Update / Unknown"];
  const statusOptions = ["Draft", "For Approval", "Pending", "Pending Approval", "Submitted", "For Review", "Approved", "Returned", "Rejected", "Deposited", "Used", "Paid"];
  const commonTruck = [
    cashEditInput("cash-edit-date", "Date", record.date || firstCashValue(record, ["Date", "Message_Date", "Encoded_At"]), "date"),
    cashEditSelect("cash-edit-group", "Group", record.groupCategory || firstCashValue(record, ["Group_Category", "Truck_Group"], "General / No Plate"), groupOptions),
    cashEditInput("cash-edit-plate", "Plate Number", record.plateNumber || firstCashValue(record, ["Plate_Number"]), "text", ' list="cash-truck-plates"'),
    cashEditInput("cash-edit-driver", "Driver Name", record.driverName || firstCashValue(record, ["Driver_Name"])),
    cashEditInput("cash-edit-helper", "Helper Name", record.helperName || firstCashValue(record, ["Helper_Name"]))
  ];
  const deposit = [
    cashEditSelect("cash-edit-deposit-needed", "Deposit Needed", record.depositNeeded || "No", ["No", "Yes"]),
    cashEditInput("cash-edit-receiver", "Receiver Name", record.receiverName || firstCashValue(record, ["Receiver_Name"])),
    cashEditSelect("cash-edit-deposit-to", "Deposit To", record.depositTo || firstCashValue(record, ["Deposit_To"], "GCash"), ["GCash", "Bank", "Cash"]),
    cashEditInput("cash-edit-deposit-number", "Account / Number", record.depositNumber || firstCashValue(record, ["GCash_Number", "Deposit_Number"]))
  ];
  const statusFields = [
    cashEditSelect("cash-edit-status", "Status", status, statusOptions),
    cashEditTextarea("cash-edit-remarks", "Notes / Remarks", record.remarks || firstCashValue(record, ["Remarks", "Source_Message"]))
  ];

  if (type === "Diesel PO") {
    return [
      cashEditSection("Truck Details", commonTruck),
      cashEditSection("Diesel PO Details", [
        cashEditInput("cash-edit-logged-by", "Logged By", record.loggedBy || firstCashValue(record, ["Logged_By", "Encoded_By"])),
        cashEditInput("cash-edit-fuel-station", "Fuel Station", record.fuelStation || firstCashValue(record, ["Fuel_Station"])),
        cashEditInput("cash-edit-po-number", "PO Number", record.poNumber || firstCashValue(record, ["PO_Number"])),
        cashEditInput("cash-edit-amount", "Diesel Amount", record.amount || firstCashValue(record, ["Amount", "Diesel_Amount"]), "number", ' min="0" step="0.01"'),
        cashEditInput("cash-edit-liters", "Diesel Liters", record.liters || firstCashValue(record, ["Liters"]), "number", ' min="0" step="0.01"'),
        cashEditInput("cash-edit-route", "Route / Source / Destination", record.route || firstCashValue(record, ["Route_Trip", "Route"]))
      ]),
      cashEditSection("Deposit Details", deposit),
      cashEditSection("Status / Notes", statusFields)
    ].join("");
  }

  if (type === "Trip Budget") {
    return [
      cashEditSection("Truck Details", commonTruck),
      cashEditSection("Trip Budget Details", [
        cashEditInput("cash-edit-logged-by", "Logged By", record.loggedBy || firstCashValue(record, ["Logged_By", "Encoded_By"])),
        cashEditInput("cash-edit-source", "Source", record.source || firstCashValue(record, ["Source"])),
        cashEditInput("cash-edit-destination", "Destination", record.destination || firstCashValue(record, ["Destination"])),
        cashEditInput("cash-edit-shipment", "Shipment Number", record.shipmentNumber || firstCashValue(record, ["Shipment_Number"])),
        cashEditInput("cash-edit-budget-type", "Budget Type", record.budgetType || firstCashValue(record, ["Budget_Type"], "Trip Budget")),
        cashEditInput("cash-edit-budget-amount", "Budget Amount", record.budgetAmount || firstCashValue(record, ["Budget_Amount", "Amount"]), "number", ' min="0" step="0.01"')
      ]),
      cashEditSection("Deposit Details", deposit),
      cashEditSection("Status / Notes", statusFields)
    ].join("");
  }

  return [
    cashEditSection("Truck Details", commonTruck),
    cashEditSection("Bali / Cash Advance Details", [
      cashEditSelect("cash-edit-role", "Role", record.personType || firstCashValue(record, ["Role"], "Driver"), CASH_ROLE_OPTIONS),
      cashEditInput("cash-edit-person-name", "Person Name", record.personName || firstCashValue(record, ["Person_Name"])),
      cashEditInput("cash-edit-current-balance", "Current Balance", record.currentBalance || firstCashValue(record, ["Balance_After_Payroll"]), "number", ' min="0" step="0.01"'),
      cashEditInput("cash-edit-amount", "Amount", record.amount || firstCashValue(record, ["Amount"]), "number", ' min="0" step="0.01"'),
      cashEditTextarea("cash-edit-reason", "Reason", record.reason || firstCashValue(record, ["Reason", "Source_Message"]))
    ]),
    cashEditSection("Deposit Details", deposit),
    cashEditSection("Status / Notes", statusFields)
  ].join("");
}

function openCashEditModal(type, id) {
  const record = findSavedCashRecord(id, type);
  if (!record) return setSavedRecordsStatus("Draft record not found.", "warning");
  if (!isCashDraftRecord(record)) {
    return setSavedRecordsStatus("This request has already been submitted and cannot be edited here.", "warning");
  }
  activeCashEditRecord = record;
  $("cash-edit-title").textContent = cashEditTitle(type);
  $("cash-edit-subtitle").textContent = record.__cashRecordSource === "cloud" ? "Cloud draft record. Save will update the existing cloud row." : "Local draft record. Save will update the existing local record.";
  $("cash-edit-body").innerHTML = buildCashEditForm(record);
  $("cash-edit-modal").hidden = false;
  setSavedRecordsStatus("Draft loaded for editing.", "success");
}

function closeCashEditModal() {
  const modal = $("cash-edit-modal");
  if (modal) modal.hidden = true;
  activeCashEditRecord = null;
}

function editValue(id) {
  return $(id)?.value?.trim() || "";
}

function collectCashEditData() {
  const record = activeCashEditRecord || {};
  const type = detectCashRecordType(record);
  const updated = {
    ...record,
    id: record.id,
    type,
    date: editValue("cash-edit-date"),
    groupCategory: editValue("cash-edit-group"),
    plateNumber: getPlateInputValue("cash-edit-plate"),
    driverName: editValue("cash-edit-driver"),
    helperName: editValue("cash-edit-helper"),
    depositNeeded: editValue("cash-edit-deposit-needed"),
    receiverName: editValue("cash-edit-receiver"),
    depositTo: editValue("cash-edit-deposit-to"),
    depositNumber: editValue("cash-edit-deposit-number"),
    status: editValue("cash-edit-status") || "Draft",
    remarks: editValue("cash-edit-remarks"),
    updatedAt: new Date().toISOString()
  };

  if (type === "Diesel PO") {
    const loggedBy = editValue("cash-edit-logged-by");
    Object.assign(updated, {
      loggedBy,
      personName: loggedBy,
      personType: loggedBy ? "Logger" : "",
      fuelStation: editValue("cash-edit-fuel-station"),
      poNumber: editValue("cash-edit-po-number"),
      amount: Number(editValue("cash-edit-amount")) || 0,
      liters: Number(editValue("cash-edit-liters")) || 0,
      route: editValue("cash-edit-route")
    });
  } else if (type === "Trip Budget") {
    const loggedBy = editValue("cash-edit-logged-by");
    Object.assign(updated, {
      loggedBy,
      personName: loggedBy,
      personType: loggedBy ? "Logger" : "",
      source: editValue("cash-edit-source"),
      destination: editValue("cash-edit-destination"),
      shipmentNumber: editValue("cash-edit-shipment"),
      budgetType: editValue("cash-edit-budget-type"),
      budgetAmount: Number(editValue("cash-edit-budget-amount")) || 0,
      amount: Number(editValue("cash-edit-budget-amount")) || 0
    });
  } else {
    Object.assign(updated, {
      personType: editValue("cash-edit-role"),
      personName: editValue("cash-edit-person-name"),
      currentBalance: Number(editValue("cash-edit-current-balance")) || 0,
      amount: Number(editValue("cash-edit-amount")) || 0,
      reason: editValue("cash-edit-reason")
    });
  }

  return updated;
}

async function saveCashEditModal(event) {
  event.preventDefault();
  const original = activeCashEditRecord;
  if (!original) return;
  if (!isCashDraftRecord(original)) {
    setSavedRecordsStatus("This request has already been submitted and cannot be edited here.", "warning");
    return;
  }
  const updated = collectCashEditData();
  if (original.__cashRecordSource === "cloud") {
    const sheetRecord = toCashSheetRecord(updated);
    sheetRecord.Cash_ID = original.Cash_ID || original.cashId || original.id;
    const result = await cashPost({ action: "updateEntry", record: sheetRecord });
    if (!result || !result.ok) {
      setSavedRecordsStatus("Cloud edit is not connected yet. Please edit from the source form or ask Admin.", "warning");
      return;
    }
    closeCashEditModal();
    await loadSavedCashRecordsFromCloud();
    setSavedRecordsStatus("Draft changes saved.", "success");
    return;
  }

  const [key, records] = getRecordStore(updated.type);
  writeJson(key, records.map(item => item.id === updated.id ? updated : item));
  savedCashRecordsCache = getLocalSavedCashRecords();
  savedCashRecordsSource = "local";
  closeCashEditModal();
  setSavedRecordsStatus("Draft changes saved.", "success");
  refreshAllCashData();
}

function deleteSavedCashRecord(type, id) {
  const cached = savedCashRecordsCache.find(item => item.id === id);
  if (cached && !isCashDraftRecord(cached)) {
    setSavedRecordsStatus("Only Draft records can be deleted here.", "warning");
    return;
  }
  if (cached?.__cashRecordSource === "cloud") {
    if (!confirm("Delete this cloud Draft record?")) return;
    cashPost({ action: "deleteEntry", cashId: cached.Cash_ID || cached.cashId || cached.id, deletedBy: "" })
      .then(res => {
        if (res && res.ok) {
          loadSavedCashRecordsFromCloud().then(() => setSavedRecordsStatus("Record deleted. Records refreshed.", "success"));
        } else {
          setSavedRecordsStatus("Cloud records cannot be deleted here yet.", "warning");
        }
      })
      .catch(() => setSavedRecordsStatus("Cloud records cannot be deleted here yet.", "warning"));
    return;
  }
  if (!confirm("Delete this local Draft record?")) return;
  const [key, records] = getRecordStore(type);
  const now = new Date().toISOString();
  let deletedRecord = null;
  const updated = records.map(item => {
    if (item.id !== id) return item;
    if (!isCashDraftRecord(item)) return item;
    deletedRecord = { ...item, isDeleted: true, deletedAt: now, deletedBy: "", updatedAt: now };
    return deletedRecord;
  });
  if (!deletedRecord) {
    setSavedRecordsStatus("Only Draft records can be deleted here.", "warning");
    return;
  }
  writeJson(key, updated);
  savedCashRecordsCache = getLocalSavedCashRecords();
  savedCashRecordsSource = "local";
  refreshAllCashData();
  setSavedRecordsStatus("Record deleted. Records refreshed.", "success");
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
  const record = records.find(item => item.id === id) || savedCashRecordsCache.find(item => item.id === id);
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
  if (savedCashRecordsSource !== "cloud") {
    savedCashRecordsCache = getLocalSavedCashRecords();
    savedCashRecordsSource = "local";
    if (!savedCashRecordsStatus) savedCashRecordsStatus = "Loaded local records.";
  }
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
  $("budget-deposit-needed").addEventListener("change", () => applyDepositState("budget"));
  $("save-bali-button").addEventListener("click", saveBali); $("generate-bali-button").addEventListener("click", generateBaliViberMessage); $("copy-bali-button").addEventListener("click", copyBaliMessage); $("clear-bali-button").addEventListener("click", clearBaliForm);
  $("bali-deposit-needed").addEventListener("change", () => applyDepositState("bali"));
  ["diesel", "budget", "bali"].forEach(prefix => {
    const plateInput = $(`${prefix}-plate-number`);
    const groupInput = $(`${prefix}-group-category`);
    if (groupInput) groupInput.addEventListener("change", () => applyGroupToPlateOptions(prefix));
    if (plateInput) {
      plateInput.addEventListener("change", () => applyTruckToForm(prefix));
      plateInput.addEventListener("blur", () => applyTruckToForm(prefix));
    }
  });
  ["diesel-form", "budget-form", "bali-form"].forEach(formId => {
    $(formId)?.querySelectorAll("input, select, textarea").forEach(el => {
      el.addEventListener("input", () => el.classList.remove("input-error"));
      el.addEventListener("change", () => el.classList.remove("input-error"));
    });
  });
  ["filter-date-from", "filter-date-to", "filter-type", "filter-group", "filter-plate"].forEach(id => $(id).addEventListener("input", renderSavedCashRecords));
  $("saved-records-body").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.disabled) {
      setSavedRecordsStatus(button.title || "This action is not available for this record.", "warning");
      return;
    }
    if (button.dataset.action === "edit") openCashEditModal(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "delete") deleteSavedCashRecord(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "message") generateSavedCashRecordMessage(button.dataset.type, button.dataset.id);
  });
  $("cash-edit-form")?.addEventListener("submit", saveCashEditModal);
  $("cash-edit-close")?.addEventListener("click", closeCashEditModal);
  $("cash-edit-cancel")?.addEventListener("click", closeCashEditModal);
  $("cash-edit-modal")?.addEventListener("click", event => {
    if (event.target.id === "cash-edit-modal") closeCashEditModal();
  });
}

populateCashRoleSelects();
wireEvents();
applyDieselDepositState();
applyDepositState("budget");
applyDepositState("bali");
fetchTruckMaster();
refreshAllCashData();
loadSavedCashRecordsFromCloud();
