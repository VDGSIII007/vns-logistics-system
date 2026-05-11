const DIESEL_KEY = "vnsDieselPOEntries";
const BUDGET_KEY = "vnsTripBudgets";
const BALI_KEY = "vnsBaliCashAdvances";

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
  if (!data.date || !data.plateNumber || !data.fuelStation || !data.amount || !data.poNumber) return "Date, Plate Number, Fuel Station, Diesel Amount, and PO Number are required.";
  if (data.depositNeeded === "Yes" && (!data.receiverName || !data.depositNumber)) return "Receiver Name and Account / Number are required when Deposit Needed is Yes.";
  return "";
}

function saveDieselPO() {
  const data = getDieselPOFormData();
  const error = validateDieselPO(data);
  if (error) return setStatus("diesel-status", error, "warning");
  const records = readJson(DIESEL_KEY);
  writeJson(DIESEL_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("diesel-form").dataset.recordId = data.id;
  $("diesel-form").dataset.createdAt = data.createdAt;
  setStatus("diesel-status", "Diesel PO saved locally.", "success");
  refreshAllCashData();
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
  applyDieselDepositState();
}

function generateDieselPOViberMessage() {
  const d = getDieselPOFormData();
  $("diesel-message").value = [
    `Plate: ${d.plateNumber}`,
    "Diesel PO Request",
    "",
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
  if (!data.date || !data.plateNumber || !data.budgetAmount || !data.depositTo || !data.receiverName || !data.depositNumber) return "Date, Plate Number, Budget Amount, Deposit To, Receiver Name, and Number are required.";
  return "";
}

function saveBudget() {
  const data = getBudgetFormData();
  const error = validateBudget(data);
  if (error) return setStatus("budget-status", error, "warning");
  const records = readJson(BUDGET_KEY);
  writeJson(BUDGET_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("budget-form").dataset.recordId = data.id;
  $("budget-form").dataset.createdAt = data.createdAt;
  setStatus("budget-status", "Trip Budget saved locally.", "success");
  refreshAllCashData();
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
  ["date","plateNumber","driverName","helperName","source","destination","shipmentNumber","depositTo","receiverName","depositNumber","status","reference","remarks"].forEach(key => {
    const id = `budget-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;
    if ($(id)) $(id).value = record[key] || "";
  });
  $("budget-amount").value = record.budgetAmount || "";
  $("budget-type").value = record.budgetType || "Trip Budget";
  $("budget-status-field").value = record.status || "Draft";
}

function generateBudgetViberMessage() {
  const d = getBudgetFormData();
  $("budget-message").value = [
    `Plate: ${d.plateNumber}`,
    "Trip Budget Request",
    "",
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
  if (!data.date || !data.plateNumber || !data.personType || !data.personName || !data.amount || !data.depositTo || !data.receiverName || !data.depositNumber) return "Date, Plate Number, Person Type, Person Name, Bali Amount, Deposit To, Receiver Name, and Number are required.";
  return "";
}

function saveBali() {
  const data = getBaliFormData();
  const error = validateBali(data);
  if (error) return setStatus("bali-status", error, "warning");
  const records = readJson(BALI_KEY);
  writeJson(BALI_KEY, [data].concat(records.filter(item => item.id !== data.id)));
  $("bali-form").dataset.recordId = data.id;
  $("bali-form").dataset.createdAt = data.createdAt;
  setStatus("bali-status", "Bali / Cash Advance saved locally.", "success");
  refreshAllCashData();
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
  $("bali-status-field").value = record.status || "Draft";
}

function generateBaliViberMessage() {
  const d = getBaliFormData();
  $("bali-message").value = [
    `Plate: ${d.plateNumber}`,
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
  return readJson(DIESEL_KEY).concat(readJson(BUDGET_KEY), readJson(BALI_KEY));
}

function applySavedRecordFilters(records) {
  const from = $("filter-date-from").value;
  const to = $("filter-date-to").value;
  const type = $("filter-type").value;
  const plate = normalizePlate($("filter-plate").value);
  return records.filter(record => (!from || record.date >= from) && (!to || record.date <= to) && (!type || record.type === type) && (!plate || normalizePlate(record.plateNumber).includes(plate)));
}

function renderSavedCashRecords() {
  const body = $("saved-records-body");
  const rows = applySavedRecordFilters(getAllSavedCashRecords()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  body.innerHTML = rows.length ? rows.map(record => {
    const amount = record.type === "Diesel PO" ? record.amount : record.type === "Trip Budget" ? record.budgetAmount : record.amount;
    return `<tr><td>${escapeHtml(record.date || "")}</td><td>${escapeHtml(record.type)}</td><td>${escapeHtml(record.plateNumber || "")}</td><td>${formatCurrency(amount)}</td><td>${escapeHtml(record.receiverName || "")}</td><td>${escapeHtml(record.status || "")}</td><td class="cash-row-actions"><button data-action="load" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Load</button><button data-action="message" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Message</button><button data-action="delete" data-type="${escapeHtml(record.type)}" data-id="${escapeHtml(record.id)}">Delete</button></td></tr>`;
  }).join("") : '<tr><td colspan="7" class="empty">No saved local records found.</td></tr>';
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
  writeJson(key, records.filter(item => item.id !== id));
  refreshAllCashData();
}

function generateSavedCashRecordMessage(type, id) {
  const [, records, loader, generator] = getRecordStore(type);
  const record = records.find(item => item.id === id);
  if (!record) return;
  loader(record);
  generator();
}

function updateCashSummary() {
  const diesel = readJson(DIESEL_KEY);
  const budgets = readJson(BUDGET_KEY);
  const bali = readJson(BALI_KEY);
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
  ["filter-date-from", "filter-date-to", "filter-type", "filter-plate"].forEach(id => $(id).addEventListener("input", renderSavedCashRecords));
  $("saved-records-body").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "load") loadSavedCashRecord(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "delete") deleteSavedCashRecord(button.dataset.type, button.dataset.id);
    if (button.dataset.action === "message") generateSavedCashRecordMessage(button.dataset.type, button.dataset.id);
  });
}

wireEvents();
applyDieselDepositState();
refreshAllCashData();
