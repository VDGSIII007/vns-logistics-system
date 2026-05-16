const PAYROLL_RECORDS_KEY = "vnsPayrollRecords";
const PAYROLL_RULES_KEY = "vnsPayrollRules";
const PEOPLE_BALANCES_KEY = "vnsPeopleBalances";
const PAYROLL_LEDGER_KEY = "vnsPayrollLedger";
const PAYROLL_LIQUIDATION_API_URL = "https://script.google.com/macros/s/AKfycbx2JOUTm1ESJ8Ce6zGu7PzqDLBaPTjNoHeRskU-Akc5JipoUJXXPQ1BibY04paConwM/exec";
const PAYROLL_LIQUIDATION_SYNC_KEY = "vns-payroll-liquidation-sync-2026-Jay";
const PAYROLL_TRUCK_MASTER_KEY = "vnsTruckMaster";
const PAYROLL_MASTER_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySWpFu-ZwtsC4uGK4uNgZSRlHUzS4bAMX4X0vAQjt-iuF7pbgT3loFGU2fU2YL4rq6pQ/exec";
const PAYROLL_MASTER_SYNC_KEY = "vns-truck-sync-2026-Jay";

const payrollState = {
  currentId: null,
  lines: [],
  rules: [],
  records: [],
  ledger: [],
  balances: {},
  totals: {},
  warnings: [],
  hasCalculatedPayroll: false,
  hasSubmittedPayroll: false,
  sheetSelection: null,
  isSelectingSheetRange: false,
  truckMaster: [],
  selectedTruckType: ""
};

const amountFields = [
  "diesel", "driverSalary", "helperSalary", "driverAllowance", "helperAllowance", "tollFee",
  "passway", "parking", "vulcanize", "otherExpenses", "lagayLoaded", "lagayEmpty", "budgetReleased"
];

const lineColumns = [
  ["tripDate", "date"], ["diesel", "number"], ["poNumber", "text"], ["shipmentNumber", "text"],
  ["vanNumber", "text"], ["containerType", "text"], ["source", "text"], ["destination", "text"],
  ["commodity", "text"], ["driverSalary", "number"], ["helperSalary", "number"],
  ["driverAllowance", "number"], ["helperAllowance", "number"], ["tollFee", "number"],
  ["passway", "number"], ["parking", "number"], ["vulcanize", "number"], ["otherExpenses", "number"],
  ["lagayLoaded", "number"], ["lagayEmpty", "number"], ["budgetReleased", "number"], ["remarks", "text"]
];

const deductionFields = ["ca", "sss", "pagibig", "philhealth", "atm", "short", "other1", "other2", "other3"];

const ruleColumns = [
  ["groupCategory", "select"], ["source", "text"], ["destination", "text"], ["client", "text"], ["tripType", "text"],
  ["driverSalary", "number"], ["helperSalary", "number"], ["driverAllowance", "number"], ["helperAllowance", "number"],
  ["allowedDiesel", "number"], ["allowedToll", "number"], ["allowedParking", "number"], ["allowedPassway", "number"],
  ["notes", "text"], ["status", "select"]
];

function $(id) {
  return document.getElementById(id);
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not read ${key}`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key}`, error);
    setStatus("Local storage is full or unavailable.", "error");
    return false;
  }
}

function initPayrollPage() {
  bindPayrollMenu();
  payrollState.records = readJson(PAYROLL_RECORDS_KEY, []);
  payrollState.ledger = readJson(PAYROLL_LEDGER_KEY, []);
  payrollState.balances = readJson(PEOPLE_BALANCES_KEY, {});
  payrollState.rules = readJson(PAYROLL_RULES_KEY, []);

  if (!payrollState.rules.length) {
    payrollState.rules = getSampleRules();
    writeJson(PAYROLL_RULES_KEY, payrollState.rules);
  }
  if (!payrollState.records.length) seedSampleRecord();

  bindPayrollEvents();
  loadRules();
  loadPayrollRecords();
  loadPayrollTruckMaster();
  renderBalanceLedger();
  newPayroll();
  loadPayrollRecordsFromCloud();
}

function bindPayrollMenu() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function bindPayrollEvents() {
  document.querySelectorAll(".payroll-tab-btn, .payroll-tab-button").forEach(button => {
    button.addEventListener("click", () => switchPayrollTab(button.dataset.payrollTab));
  });
  $("new-payroll-button").addEventListener("click", newPayroll);
  $("save-draft-button").addEventListener("click", savePayrollRecord);
  $("submit-payroll-button").addEventListener("click", submitPayrollForApproval);
  $("clear-form-button").addEventListener("click", newPayroll);
  $("add-line-button").addEventListener("click", () => addPayrollLine());
  $("add-10-lines-button").addEventListener("click", addTenPayrollLines);
  $("clear-blank-lines-button").addEventListener("click", clearBlankRows);
  $("duplicate-line-button").addEventListener("click", duplicateSelectedLine);
  $("delete-line-button").addEventListener("click", deleteSelectedLine);
  $("calculate-payroll-button").addEventListener("click", () => calculatePayroll({ showWarnings: true }));
  $("apply-rule-button").addEventListener("click", applyMatchingRulesToLines);
  $("approve-payroll-button").addEventListener("click", approvePayroll);
  $("return-payroll-button").addEventListener("click", returnPayrollForRevision);
  $("reject-payroll-button").addEventListener("click", rejectPayroll);
  $("mark-paid-button").addEventListener("click", markPayrollPaid);
  $("generate-viber-button").addEventListener("click", generateViberMessage);
  $("copy-viber-button").addEventListener("click", copyViberMessage);
  $("add-rule-button").addEventListener("click", () => addRule());
  $("save-rules-button").addEventListener("click", saveRules);
  $("delete-rule-button").addEventListener("click", deleteRule);
  $("load-sample-rules-button").addEventListener("click", loadSampleRules);

  ["filter-status", "filter-group", "filter-plate", "filter-driver", "filter-payroll-date"].forEach(id => {
    $(id).addEventListener("input", renderPayrollRecordsTable);
  });
  ["approval-filter-plate", "approval-filter-group", "approval-filter-status", "approval-filter-date-from", "approval-filter-date-to"].forEach(id => {
    if ($(id)) $(id).addEventListener("input", renderForApprovalQueue);
  });
  if ($("approval-details-close")) {
    $("approval-details-close").addEventListener("click", closeApprovalDetails);
  }
  if ($("approval-details-panel")) {
    $("approval-details-panel").addEventListener("click", event => {
      if (event.target === $("approval-details-panel")) closeApprovalDetails();
    });
  }

  ["group-category", "plate-number", "driver-name", "helper-name", "payroll-status"].forEach(id => {
    $(id).addEventListener("input", () => {
      if (id === "group-category") applyPayrollGroupToPlateOptions();
      if (id === "plate-number") applyPayrollTruckToHeader(false);
      calculatePayroll();
      updateLockState();
    });
  });
  $("group-category").addEventListener("change", applyPayrollGroupToPlateOptions);
  $("plate-number").addEventListener("change", () => applyPayrollTruckToHeader(true));
  $("plate-number").addEventListener("blur", () => applyPayrollTruckToHeader(true));

  ["override-driver-deduction", "override-helper-deduction", "approval-notes"].forEach(id => {
    $(id).addEventListener("input", calculatePayroll);
  });
  document.querySelectorAll(".driver-deduction-input, .helper-deduction-input").forEach(input => {
    input.addEventListener("input", calculatePayroll);
  });
}

function switchPayrollTab(tabId) {
  document.querySelectorAll(".payroll-tab-btn, .payroll-tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.payrollTab === tabId);
  });
  document.querySelectorAll(".payroll-tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === tabId);
  });
}

function generatePayrollId() {
  const date = new Date();
  const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
  const count = payrollState.records.filter(record => String(record.payrollNumber || "").includes(stamp)).length + 1;
  return `PAY-${stamp}-${String(count).padStart(3, "0")}`;
}

function newPayroll() {
  payrollState.currentId = createId("payroll");
  payrollState.lines = [];
  payrollState.totals = getEmptyTotals();
  payrollState.warnings = [];
  payrollState.hasCalculatedPayroll = false;
  payrollState.hasSubmittedPayroll = false;
  payrollState.selectedTruckType = "";

  $("payroll-number").value = generatePayrollId();
  $("payroll-date").value = today();
  $("cutoff-start").value = "";
  $("cutoff-end").value = "";
  $("group-category").value = "";
  $("plate-number").value = "";
  $("driver-name").value = "";
  $("helper-name").value = "";
  $("encoder-name").value = "";
  $("payroll-status").value = "Draft";
  $("general-remarks").value = "";
  $("approver-name").value = "";
  $("approval-notes").value = "";
  $("override-driver-deduction").value = "";
  $("override-helper-deduction").value = "";
  $("final-driver-net-pay").value = "";
  $("final-helper-net-pay").value = "";
  $("revision-reason").value = "";
  $("payment-reference").value = "";
  $("payment-date").value = "";
  $("viber-message").value = "";
  setDeductionInputs("driver", {});
  setDeductionInputs("helper", {});

  addPayrollLine();
  renderWarnings();
  renderCalculationSummary();
  updateLockState();
  switchPayrollTab("encode-payroll-tab");
  setStatus("New payroll ready.", "info");
  renderPayrollTruckPlateOptions();
}

function loadPayrollRecords() {
  payrollState.records = readJson(PAYROLL_RECORDS_KEY, []);
  renderPayrollRecordsTable();
  renderForApprovalQueue();
}

function loadPayrollTruckMaster() {
  const localTrucks = readJson(PAYROLL_TRUCK_MASTER_KEY, []);
  payrollState.truckMaster = Array.isArray(localTrucks) ? localTrucks : [];
  renderPayrollTruckPlateOptions();

  const query = new URLSearchParams({
    action: "getAllMasterData",
    syncKey: PAYROLL_MASTER_SYNC_KEY
  });
  fetch(`${PAYROLL_MASTER_APP_SCRIPT_URL}?${query.toString()}`)
    .then(response => response.json())
    .then(result => {
      const trucks = result?.trucks || result?.Truck_Master || [];
      if (!result?.ok || !Array.isArray(trucks) || !trucks.length) return;
      payrollState.truckMaster = trucks;
      writeJson(PAYROLL_TRUCK_MASTER_KEY, trucks);
      renderPayrollTruckPlateOptions();
      applyPayrollTruckToHeader(false);
    })
    .catch(error => {
      console.warn("Payroll truck master cloud load failed", error);
      renderPayrollTruckPlateOptions();
    });
}

function renderPayrollTruckPlateOptions() {
  const list = $("payroll-truck-plates");
  if (!list) return;
  const group = normalizePayrollGroup($("group-category")?.value || "");
  const trucks = getPayrollTrucksForGroup(group);
  const plates = [...new Set(trucks.map(getPayrollTruckPlate).filter(Boolean))].sort();
  list.innerHTML = plates.map(plate => `<option value="${escapeAttr(plate)}"></option>`).join("");
}

function applyPayrollGroupToPlateOptions() {
  const selectedGroup = normalizePayrollGroup($("group-category")?.value || "");
  setPayrollGroupValue(selectedGroup);
  renderPayrollTruckPlateOptions();

  const plate = normalizePlateForCloud($("plate-number")?.value || "");
  if (!plate) return;
  const truck = getPayrollTruckInfoByPlate(plate);
  if (truck && selectedGroup && getPayrollTruckGroup(truck) !== selectedGroup) {
    $("plate-number").value = "";
    payrollState.selectedTruckType = "";
  }
}

function applyPayrollTruckToHeader(fillEmptyPeopleOnly) {
  const plateInput = $("plate-number");
  if (!plateInput) return;
  const normalizedPlate = normalizePlateForCloud(plateInput.value);
  if (!normalizedPlate) {
    payrollState.selectedTruckType = "";
    return;
  }

  plateInput.value = normalizedPlate;
  const truck = getPayrollTruckInfoByPlate(normalizedPlate);
  if (!truck) {
    payrollState.selectedTruckType = "";
    if (!$("group-category").value) setPayrollGroupValue("Needs Update / Unknown");
    renderPayrollTruckPlateOptions();
    return;
  }

  const group = getPayrollTruckGroup(truck);
  if (group) setPayrollGroupValue(group);
  const driver = getPayrollTruckDriver(truck);
  const helper = getPayrollTruckHelper(truck);
  if (driver && (!fillEmptyPeopleOnly || !$("driver-name").value.trim())) $("driver-name").value = driver;
  if (helper && (!fillEmptyPeopleOnly || !$("helper-name").value.trim())) $("helper-name").value = helper;
  payrollState.selectedTruckType = getPayrollTruckType(truck);
  renderPayrollTruckPlateOptions();
}

function getPayrollTrucksForGroup(group) {
  if (!group) return payrollState.truckMaster;
  if (group === "Needs Update / Unknown") {
    return payrollState.truckMaster.filter(truck => getPayrollTruckGroup(truck) === group);
  }
  return payrollState.truckMaster.filter(truck => getPayrollTruckGroup(truck) === group);
}

function getPayrollTruckInfoByPlate(plate) {
  const normalized = normalizePlateForCloud(plate);
  return payrollState.truckMaster.find(truck => getPayrollTruckPlate(truck) === normalized) || null;
}

function getPayrollTruckPlate(truck) {
  return normalizePlateForCloud(truck?.Plate_Number || truck?.plateNumber || truck?.plate || "");
}

function getPayrollTruckGroup(truck) {
  return normalizePayrollGroup(truck?.Group_Category || truck?.groupCategory || truck?.Group || "");
}

function getPayrollTruckDriver(truck) {
  return String(truck?.Current_Driver_Name || truck?.Current_Driver || truck?.Driver || truck?.driverName || "").trim();
}

function getPayrollTruckHelper(truck) {
  return String(truck?.Current_Helper_Name || truck?.Current_Helper || truck?.Helper || truck?.helperName || "").trim();
}

function getPayrollTruckType(truck) {
  return String(truck?.Truck_Type || truck?.truckType || truck?.Body_Type || truck?.bodyType || "").trim();
}

function normalizePayrollGroup(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (key === "bottle" || key === "bottles") return "Bottle";
  if (key === "sugar") return "Sugar";
  if (key === "preform" || key === "resin" || key === "preform / resin" || compact === "preformresin") return "Preform / Resin";
  if (key === "caps" || key === "crown" || key === "crowns" || key === "caps / crown" || key === "caps / crowns" || compact === "capscrown" || compact === "capscrowns") return "Caps / Crown";
  if (key.includes("unknown") || key.includes("update")) return "Needs Update / Unknown";
  return raw;
}

function setPayrollGroupValue(value) {
  const select = $("group-category");
  if (!select) return;
  const normalized = normalizePayrollGroup(value);
  const option = Array.from(select.options).find(item => item.value === normalized || item.textContent === normalized);
  select.value = option ? option.value || option.textContent : "";
}

function savePayrollRecord() {
  syncLinesFromTable();
  const headerWarnings = validatePayrollHeader();
  calculatePayroll();

  const existing = payrollState.records.find(record => record.id === payrollState.currentId);
  const now = new Date().toISOString();
  const record = buildPayrollRecord(existing);
  record.status = $("payroll-status").value || "Draft";
  record.updatedAt = now;
  if (!record.createdAt) record.createdAt = now;

  payrollState.records = payrollState.records.filter(item => item.id !== record.id);
  payrollState.records.unshift(record);
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
  renderPayrollRecordsTable();
  renderForApprovalQueue();
  renderWarnings(headerWarnings.concat(payrollState.warnings));
  setStatus("Saved locally. Syncing to cloud...", "info");
  syncPayrollRecordToCloud(record)
    .then(() => setStatus("Saved locally and synced to cloud.", "success"))
    .catch(error => {
      console.warn("Payroll cloud sync failed", error);
      setStatus("Saved locally. Cloud sync failed.", "warning");
    });
  return record;
}

function submitPayrollForApproval() {
  payrollState.hasSubmittedPayroll = true;
  const headerWarnings = validatePayrollHeader();
  if (headerWarnings.length) {
    renderWarnings(headerWarnings);
    setStatus("Complete required header fields before submitting.", "warning");
    return;
  }
  $("payroll-status").value = "Submitted";
  calculatePayroll({ showWarnings: true });
  const record = savePayrollRecord();
  updateLockState();
  setStatus(`${record.payrollNumber} submitted for approval.`, "success");
}

function approvePayroll() {
  calculatePayroll();
  if (!$("approver-name").value.trim()) {
    setStatus("Approver name is required.", "warning");
    return;
  }
  if (hasDeductionOverride() && !$("approval-notes").value.trim()) {
    setStatus("Deduction override requires approval notes.", "warning");
    return;
  }
  $("payroll-status").value = "Approved";
  const record = savePayrollRecord();
  updateBalanceLedger(record, "Approved");
  generateViberMessage();
  updateLockState();
  setStatus(`${record.payrollNumber} approved.`, "success");
}

function returnPayrollForRevision() {
  if (!$("revision-reason").value.trim() && !$("approval-notes").value.trim()) {
    setStatus("Add a revision reason or approval note before returning.", "warning");
    return;
  }
  $("payroll-status").value = "Returned";
  const record = savePayrollRecord();
  updateLockState();
  setStatus(`${record.payrollNumber} returned for revision.`, "warning");
}

function rejectPayroll() {
  if (!$("revision-reason").value.trim() && !$("approval-notes").value.trim()) {
    setStatus("Add a rejection reason before rejecting.", "warning");
    return;
  }
  $("payroll-status").value = "Rejected";
  const record = savePayrollRecord();
  updateLockState();
  setStatus(`${record.payrollNumber} rejected and saved.`, "error");
}

function markPayrollPaid() {
  if ($("payroll-status").value !== "Approved" && $("payroll-status").value !== "Paid") {
    setStatus("Only approved payrolls can be marked as paid.", "warning");
    return;
  }
  if (!$("payment-reference").value.trim() || !$("payment-date").value) {
    setStatus("Payment reference and payment date are required.", "warning");
    return;
  }
  $("payroll-status").value = "Paid";
  const record = savePayrollRecord();
  updateBalanceLedger(record, "Paid");
  generateViberMessage();
  updateLockState();
  setStatus(`${record.payrollNumber} marked as paid.`, "success");
}

function addPayrollLine(line = {}) {
  const status = $("payroll-status") ? $("payroll-status").value : "Draft";
  if (isLockedStatus(status)) return;
  payrollState.lines.push(createBlankPayrollLine(line));
  renderLinesTable();
  calculatePayroll();
}

function createBlankPayrollLine(line = {}) {
  return {
    id: line.id || createId("line"),
    tripDate: line.tripDate || "",
    shipmentNumber: line.shipmentNumber || "",
    poNumber: line.poNumber || "",
    vanNumber: line.vanNumber || "",
    containerType: line.containerType || "",
    source: line.source || "",
    destination: line.destination || "",
    commodity: line.commodity || "",
    tripType: line.tripType || "",
    driverSalary: amountValue(line.driverSalary),
    helperSalary: amountValue(line.helperSalary),
    driverAllowance: amountValue(line.driverAllowance),
    helperAllowance: amountValue(line.helperAllowance),
    diesel: amountValue(line.diesel),
    tollFee: amountValue(line.tollFee),
    passway: amountValue(line.passway),
    parking: amountValue(line.parking),
    lagayLoaded: amountValue(line.lagayLoaded),
    lagayEmpty: amountValue(line.lagayEmpty),
    luna: amountValue(line.luna),
    mano: amountValue(line.mano),
    vulcanize: amountValue(line.vulcanize),
    hugasTruck: amountValue(line.hugasTruck),
    checkpoint: amountValue(line.checkpoint),
    otherExpenses: amountValue(line.otherExpenses),
    budgetReleased: amountValue(line.budgetReleased),
    remarks: line.remarks || "",
    warnings: line.warnings || []
  };
}

function addTenPayrollLines() {
  if (isLockedStatus($("payroll-status").value)) return;
  for (let index = 0; index < 10; index += 1) {
    payrollState.lines.push(createBlankPayrollLine());
  }
  renderLinesTable();
  calculatePayroll();
}

function clearBlankRows() {
  if (isLockedStatus($("payroll-status").value)) return;
  syncLinesFromTable();
  payrollState.lines = payrollState.lines.filter(line => !isLineBlank(line));
  if (!payrollState.lines.length) payrollState.lines.push(createBlankPayrollLine());
  renderLinesTable();
  calculatePayroll();
  setStatus("Blank rows cleared.", "success");
}

function duplicateSelectedLine() {
  if (isLockedStatus($("payroll-status").value)) return;
  syncLinesFromTable();
  const selectedIds = getSelectedLineIds();
  const selected = payrollState.lines.filter(line => selectedIds.includes(line.id));
  selected.forEach(line => addPayrollLine({ ...line, id: createId("line") }));
}

function deleteSelectedLine() {
  if (isLockedStatus($("payroll-status").value)) return;
  const selectedIds = getSelectedLineIds();
  payrollState.lines = payrollState.lines.filter(line => !selectedIds.includes(line.id));
  if (!payrollState.lines.length) addPayrollLine();
  renderLinesTable();
  calculatePayroll();
}

function calculatePayroll(options = {}) {
  if (options.showWarnings) payrollState.hasCalculatedPayroll = true;
  syncLinesFromTable();
  const totals = getEmptyTotals();
  payrollState.warnings = [];

  payrollState.lines.forEach(line => {
    if (isLineBlank(line)) {
      line.warnings = [];
      return;
    }
    line.warnings = validatePayrollLine(line);
    payrollState.warnings.push(...line.warnings.map(warning => `${line.tripDate || "No date"} ${line.source || ""}-${line.destination || ""}: ${warning}`));
    totals.totalDriverSalary += parseNumber(line.driverSalary);
    totals.totalHelperSalary += parseNumber(line.helperSalary);
    totals.totalDriverAllowance += parseNumber(line.driverAllowance);
    totals.totalHelperAllowance += parseNumber(line.helperAllowance);
    totals.totalDiesel += parseNumber(line.diesel);
    totals.totalToll += parseNumber(line.tollFee);
    totals.totalPassway += parseNumber(line.passway);
    totals.totalParking += parseNumber(line.parking);
    totals.totalOtherExpenses += getOtherExpenseTotal(line);
    totals.totalBudgetReleased += parseNumber(line.budgetReleased);
  });

  totals.totalExpenses = totals.totalDiesel + totals.totalToll + totals.totalPassway + totals.totalParking + totals.totalOtherExpenses;
  totals.budgetDifference = totals.totalBudgetReleased - totals.totalExpenses;
  const grossDriver = totals.totalDriverSalary + totals.totalDriverAllowance;
  const grossHelper = totals.totalHelperSalary + totals.totalHelperAllowance;
  totals.suggestedDriverDeduction = totals.budgetDifference > 0 ? totals.budgetDifference / 2 : 0;
  totals.suggestedHelperDeduction = totals.budgetDifference > 0 ? totals.budgetDifference / 2 : 0;
  totals.driverDeduction = getPersonDeductionTotal("driver");
  totals.helperDeduction = getPersonDeductionTotal("helper");
  if (hasValue($("override-driver-deduction").value)) totals.driverDeduction = parseNumber($("override-driver-deduction").value);
  if (hasValue($("override-helper-deduction").value)) totals.helperDeduction = parseNumber($("override-helper-deduction").value);
  totals.driverNetPay = grossDriver - totals.driverDeduction;
  totals.helperNetPay = grossHelper - totals.helperDeduction;

  if (totals.budgetDifference > 0) payrollState.warnings.push("Budget released is higher than expenses and creates balance.");
  if (totals.budgetDifference < 0) payrollState.warnings.push("Expenses exceed budget. Needs approval.");

  payrollState.totals = totals;
  renderLinesTable(false);
  renderCalculationSummary();
  renderDriverHelperSummary();
  renderApprovalSection();
  renderWarnings(validatePayrollHeader().concat(payrollState.warnings));
  return totals;
}

function renderCalculationSummary() {
  const totals = payrollState.totals || getEmptyTotals();
  const quickItems = [
    ["Total Driver Salary", totals.totalDriverSalary],
    ["Total Helper Salary", totals.totalHelperSalary],
    ["Total Allowances", totals.totalDriverAllowance + totals.totalHelperAllowance],
    ["Total Expenses", totals.totalExpenses],
    ["Total Budget Released", totals.totalBudgetReleased],
    ["Balance / Shortage", totals.budgetDifference]
  ];
  const pasahodItems = [
    ["Total Budget Released", totals.totalBudgetReleased],
    ["Total Expenses", totals.totalExpenses],
    ["Remaining Balance", totals.budgetDifference],
    ["Suggested Driver Deduction", totals.suggestedDriverDeduction || 0],
    ["Suggested Helper Deduction", totals.suggestedHelperDeduction || 0],
    ["Suggested Deduction Total", (totals.suggestedDriverDeduction || 0) + (totals.suggestedHelperDeduction || 0)],
    ["Driver Net Pay", totals.driverNetPay],
    ["Helper Net Pay", totals.helperNetPay]
  ];
  const renderItems = items => items.map(([label, value]) => `
    <div class="payroll-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `).join("");
  $("calculation-summary").innerHTML = renderItems(quickItems);
  const pasahodBudgetSummary = $("pasahod-budget-summary");
  if (pasahodBudgetSummary) pasahodBudgetSummary.innerHTML = renderItems(pasahodItems);
}

function renderDriverHelperSummary() {
  const totals = payrollState.totals || getEmptyTotals();
  const driverGross = totals.totalDriverSalary + totals.totalDriverAllowance;
  const helperGross = totals.totalHelperSalary + totals.totalHelperAllowance;
  setText("driver-total-salary", formatCurrency(totals.totalDriverSalary));
  setText("driver-total-allowance", formatCurrency(totals.totalDriverAllowance));
  setText("driver-gross-pay", formatCurrency(driverGross));
  setText("driver-suggested-deduction", formatCurrency(totals.suggestedDriverDeduction || 0));
  setText("driver-total-deductions", formatCurrency(totals.driverDeduction));
  setText("driver-net-pay", formatCurrency(totals.driverNetPay));
  setText("helper-total-salary", formatCurrency(totals.totalHelperSalary));
  setText("helper-total-allowance", formatCurrency(totals.totalHelperAllowance));
  setText("helper-gross-pay", formatCurrency(helperGross));
  setText("helper-suggested-deduction", formatCurrency(totals.suggestedHelperDeduction || 0));
  setText("helper-total-deductions", formatCurrency(totals.helperDeduction));
  setText("helper-net-pay", formatCurrency(totals.helperNetPay));
}

function renderApprovalSection() {
  const totals = payrollState.totals || getEmptyTotals();
  $("final-driver-net-pay").value = formatCurrency(totals.driverNetPay);
  $("final-helper-net-pay").value = formatCurrency(totals.helperNetPay);
}

function loadRules() {
  payrollState.rules = readJson(PAYROLL_RULES_KEY, []);
  renderRulesTable();
}

function saveRules() {
  syncRulesFromTable();
  writeJson(PAYROLL_RULES_KEY, payrollState.rules);
  setStatus("Rules saved locally.", "success");
}

function addRule(rule = {}) {
  payrollState.rules.push({
    id: rule.id || createId("rule"),
    groupCategory: rule.groupCategory || "",
    source: rule.source || "",
    destination: rule.destination || "",
    client: rule.client || "",
    tripType: rule.tripType || "",
    driverSalary: parseNumber(rule.driverSalary),
    helperSalary: parseNumber(rule.helperSalary),
    driverAllowance: parseNumber(rule.driverAllowance),
    helperAllowance: parseNumber(rule.helperAllowance),
    allowedDiesel: parseNumber(rule.allowedDiesel),
    allowedToll: parseNumber(rule.allowedToll),
    allowedParking: parseNumber(rule.allowedParking),
    allowedPassway: parseNumber(rule.allowedPassway),
    notes: rule.notes || "",
    status: rule.status || "Active"
  });
  renderRulesTable();
}

function deleteRule() {
  const selected = [...document.querySelectorAll(".rule-select:checked")].map(input => input.dataset.id);
  payrollState.rules = payrollState.rules.filter(rule => !selected.includes(rule.id));
  renderRulesTable();
  saveRules();
}

function loadSampleRules() {
  payrollState.rules = getSampleRules();
  writeJson(PAYROLL_RULES_KEY, payrollState.rules);
  renderRulesTable();
  setStatus("Sample rules loaded.", "success");
}

function matchSalaryRule(line) {
  const group = normalize($("group-category").value);
  const source = normalize(line.source);
  const destination = normalize(line.destination);
  const tripType = normalize(line.tripType);
  const commodity = normalize(line.commodity);

  return payrollState.rules.find(rule => {
    if (normalize(rule.status || "Active") !== "active") return false;
    if (normalize(rule.groupCategory) !== group) return false;
    if (normalize(rule.source) !== source || normalize(rule.destination) !== destination) return false;
    if (rule.tripType && tripType && normalize(rule.tripType) !== tripType) return false;
    if (rule.client && commodity && normalize(rule.client) !== commodity) return false;
    return true;
  });
}

function validatePayrollLine(line) {
  const warnings = [];
  if (isLineBlank(line)) return warnings;
  if (!line.tripDate) warnings.push("Missing trip date");
  if (!line.source) warnings.push("Missing source");
  if (!line.destination) warnings.push("Missing destination");

  const rule = matchSalaryRule(line);
  if (!rule) {
    if (line.source || line.destination) warnings.push("No matching rule found.");
    return warnings;
  }

  compareRuleAmount(warnings, "Driver salary", line.driverSalary, rule.driverSalary);
  compareRuleAmount(warnings, "Helper salary", line.helperSalary, rule.helperSalary);
  compareRuleAmount(warnings, "Driver allowance", line.driverAllowance, rule.driverAllowance);
  compareRuleAmount(warnings, "Helper allowance", line.helperAllowance, rule.helperAllowance);
  compareAllowedAmount(warnings, "Diesel", line.diesel, rule.allowedDiesel);
  compareAllowedAmount(warnings, "Toll", line.tollFee, rule.allowedToll);
  compareAllowedAmount(warnings, "Parking", line.parking, rule.allowedParking);
  compareAllowedAmount(warnings, "Passway", line.passway, rule.allowedPassway);

  if (isDuplicateTrip(line)) warnings.push("Possible duplicate trip.");
  return warnings;
}

function validatePayrollHeader() {
  const warnings = [];
  if (!$("plate-number").value.trim()) warnings.push("Missing plate number");
  if (!$("driver-name").value.trim()) warnings.push("Missing driver/helper");
  if (!$("helper-name").value.trim()) warnings.push("Missing driver/helper");
  if (!$("payroll-date").value) warnings.push("Missing payroll date");
  return [...new Set(warnings)];
}

function isLineBlank(line) {
  const textFields = ["tripDate", "poNumber", "shipmentNumber", "vanNumber", "containerType", "source", "destination", "commodity", "tripType", "remarks"];
  const hasText = textFields.some(field => String(line[field] || "").trim() !== "");
  const hasAmount = amountFields.some(field => parseNumber(line[field]) !== 0);
  return !hasText && !hasAmount;
}

function renderWarnings(warnings = payrollState.warnings) {
  const panel = $("payroll-warning-panel");
  const content = $("payroll-warning-list");
  if (!panel || !content) return;
  if (!payrollState.hasCalculatedPayroll && !payrollState.hasSubmittedPayroll) {
    panel.hidden = true;
    content.innerHTML = "";
    return;
  }
  const unique = [...new Set(warnings.filter(Boolean))];
  panel.hidden = false;
  content.innerHTML = unique.length ? unique.map(warning => `<span class="warning-badge">${escapeHtml(warning)}</span>`).join("") : `<span class="ok-badge">No warnings.</span>`;
}

function renderPayrollRecordsTable() {
  const recordsBody = $("records-body");
  if (!recordsBody) {
    renderForApprovalQueue();
    return;
  }
  const filters = {
    status: $("filter-status").value,
    group: $("filter-group").value,
    plate: normalize($("filter-plate").value),
    driver: normalize($("filter-driver").value),
    payrollDate: $("filter-payroll-date").value
  };
  const rows = payrollState.records.filter(record => {
    if (filters.status && getSavedPayrollDisplayStatus(record) !== filters.status) return false;
    if (filters.group && record.groupCategory !== filters.group) return false;
    if (filters.plate && !normalize(record.plateNumber).includes(filters.plate)) return false;
    if (filters.driver && !normalize(record.driverName).includes(filters.driver)) return false;
    if (filters.payrollDate && record.payrollDate !== filters.payrollDate) return false;
    return true;
  });

  recordsBody.innerHTML = rows.length ? rows.map(record => `
    <tr>
      <td>${escapeHtml(record.payrollDate)}</td>
      <td>${escapeHtml(record.plateNumber)}</td>
      <td>${escapeHtml(record.driverName)}</td>
      <td>${escapeHtml(record.helperName)}</td>
      <td>${statusBadge(getSavedPayrollDisplayStatus(record))}</td>
      <td>${formatCurrency(record.totals?.totalExpenses)}</td>
      <td>${formatCurrency(record.totals?.driverNetPay)}</td>
      <td>${formatCurrency(record.totals?.helperNetPay)}</td>
      <td class="payroll-row-actions">
        <button type="button" data-action="edit" data-id="${record.id}">View/Edit</button>
        <button type="button" data-action="duplicate" data-id="${record.id}">Duplicate</button>
        <button type="button" data-action="delete" data-id="${record.id}">Delete</button>
        <button type="button" data-action="viber" data-id="${record.id}">Generate Message</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="9" class="empty-table">No payroll records yet.</td></tr>`;

  recordsBody.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const { action, id } = button.dataset;
      if (action === "edit") editPayrollRecord(id);
      if (action === "duplicate") duplicatePayrollRecord(id);
      if (action === "delete") deletePayrollRecord(id);
      if (action === "viber") {
        editPayrollRecord(id);
        generateViberMessage();
      }
    });
  });
  renderForApprovalQueue();
}

function getSavedPayrollDisplayStatus(record) {
  const status = mapLiquidationStatusToPayroll(record?.status || record?.Approval_Status || record?.Workflow_Status || "Draft");
  const paymentStatus = String(record?.paymentStatus || record?.Payment_Status || record?.approval?.paymentStatus || "").trim();
  const normalizedPayment = normalize(paymentStatus);

  if (["paid", "released", "deposited", "used"].includes(normalizedPayment) || status === "Paid") return "Paid";
  if (status === "Submitted" || status === "For Review") return "Submitted / For Review";
  if (status === "Approved") return "Approved / For Payment";
  if (status === "Returned") return "Returned";
  if (status === "Rejected") return "Rejected";
  return status || "Draft";
}

function renderForApprovalQueue() {
  const body = $("approval-records-body");
  if (!body) return;
  const filters = {
    plate: normalize($("approval-filter-plate")?.value),
    group: $("approval-filter-group")?.value || "",
    status: $("approval-filter-status")?.value || "",
    dateFrom: $("approval-filter-date-from")?.value || "",
    dateTo: $("approval-filter-date-to")?.value || ""
  };
  const rows = payrollState.records.filter(record => {
    const status = getApprovalDisplayStatus(record.status);
    if (!isForApprovalStatus(status)) return false;
    if (filters.status && status !== filters.status) return false;
    if (filters.group && normalizePayrollGroup(record.groupCategory) !== filters.group) return false;
    if (filters.plate && !normalize(record.plateNumber).includes(filters.plate)) return false;
    if (filters.dateFrom && String(record.payrollDate || "") < filters.dateFrom) return false;
    if (filters.dateTo && String(record.payrollDate || "") > filters.dateTo) return false;
    return true;
  });

  body.innerHTML = rows.length ? rows.map(record => `
    <tr>
      <td>${escapeHtml(record.payrollNumber || record.id)}</td>
      <td>${escapeHtml(record.plateNumber)}</td>
      <td>${escapeHtml(normalizePayrollGroup(record.groupCategory))}</td>
      <td>${escapeHtml(record.driverName)}</td>
      <td>${escapeHtml(formatApprovalPeriod(record))}</td>
      <td>${formatCurrency(record.totals?.totalExpenses)}</td>
      <td>${statusBadge(getApprovalDisplayStatus(record.status))}</td>
      <td class="payroll-row-actions">
        <button type="button" data-action="details" data-id="${escapeAttr(record.id)}">View Details</button>
        <button type="button" data-action="approve" data-id="${escapeAttr(record.id)}">Approve</button>
        <button type="button" data-action="return" data-id="${escapeAttr(record.id)}">Ask to Revise</button>
        <button type="button" data-action="reject" data-id="${escapeAttr(record.id)}">Reject</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="empty-table">No payroll liquidations waiting for review.</td></tr>`;

  body.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const { action, id } = button.dataset;
      if (action === "details") showApprovalDetails(id);
      if (action === "approve") approveLiquidationFromQueue(id);
      if (action === "return") returnLiquidationFromQueue(id);
      if (action === "reject") rejectLiquidationFromQueue(id);
    });
  });
}

function getApprovalDisplayStatus(status) {
  const normalized = String(status || "").trim();
  if (normalized === "For Review") return "For Review";
  return mapLiquidationStatusToPayroll(normalized);
}

function isForApprovalStatus(status) {
  return status === "Submitted" || status === "For Review";
}

function formatApprovalPeriod(record) {
  const payrollDate = record.payrollDate || "";
  const cutoff = [record.cutoffStart, record.cutoffEnd].filter(Boolean).join(" to ");
  return cutoff ? `${payrollDate || "No date"} / ${cutoff}` : payrollDate;
}

function showApprovalDetails(id) {
  const record = payrollState.records.find(item => item.id === id);
  const panel = $("approval-details-panel");
  const content = $("approval-details-content");
  if (!record || !panel || !content) return;
  const totals = record.totals || getEmptyTotals();
  content.innerHTML = `
    <div class="detail-block approval-detail-grid">
      ${approvalDetailItem("Payroll Number", record.payrollNumber || record.id)}
      ${approvalDetailItem("Plate Number", record.plateNumber)}
      ${approvalDetailItem("Group", normalizePayrollGroup(record.groupCategory))}
      ${approvalDetailItem("Driver", record.driverName)}
      ${approvalDetailItem("Helper", record.helperName)}
      ${approvalDetailItem("Payroll Date", record.payrollDate)}
      ${approvalDetailItem("Cutoff Start", record.cutoffStart)}
      ${approvalDetailItem("Cutoff End", record.cutoffEnd)}
      ${approvalDetailItem("Encoder", record.encoderName || record.createdBy)}
      ${approvalDetailItem("Status", getApprovalDisplayStatus(record.status))}
      ${approvalDetailItem("Remarks", record.remarks, "wide")}
    </div>
    <div class="detail-block approval-totals-grid">
      ${approvalDetailItem("Total Diesel", formatCurrency(totals.totalDiesel))}
      ${approvalDetailItem("Total Driver Salary", formatCurrency(totals.totalDriverSalary))}
      ${approvalDetailItem("Total Helper Salary", formatCurrency(totals.totalHelperSalary))}
      ${approvalDetailItem("Total Toll", formatCurrency(totals.totalToll))}
      ${approvalDetailItem("Total Passway", formatCurrency(totals.totalPassway))}
      ${approvalDetailItem("Total Parking", formatCurrency(totals.totalParking))}
      ${approvalDetailItem("Total Other Expenses", formatCurrency(totals.totalOtherExpenses))}
      ${approvalDetailItem("Total Expenses", formatCurrency(totals.totalExpenses))}
    </div>
    <div class="detail-block">
      <h3>Trip Lines</h3>
      <div class="payroll-table-wrap approval-lines-wrap">
        <table class="payroll-table approval-lines-table">
          <thead>
            <tr><th>Trip Date</th><th>Source</th><th>Destination</th><th>Diesel</th><th>PO Number</th><th>Ref / Shipment Number</th><th>Driver Salary</th><th>Helper Salary</th><th>Toll</th><th>Parking</th><th>Remarks</th></tr>
          </thead>
          <tbody>${renderApprovalTripLines(record.lines || [])}</tbody>
        </table>
      </div>
    </div>
    <div class="payroll-row-actions approval-detail-actions">
      <button type="button" data-action="approve" data-id="${escapeAttr(record.id)}">Approve</button>
      <button type="button" data-action="return" data-id="${escapeAttr(record.id)}">Ask to Revise</button>
      <button type="button" data-action="reject" data-id="${escapeAttr(record.id)}">Reject</button>
    </div>
  `;
  content.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "approve") approveLiquidationFromQueue(button.dataset.id);
      if (button.dataset.action === "return") returnLiquidationFromQueue(button.dataset.id);
      if (button.dataset.action === "reject") rejectLiquidationFromQueue(button.dataset.id);
    });
  });
  panel.hidden = false;
}

function closeApprovalDetails() {
  if ($("approval-details-panel")) $("approval-details-panel").hidden = true;
}

function approvalDetailItem(label, value, className = "") {
  return `<div class="approval-detail-item ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "")}</strong></div>`;
}

function renderApprovalTripLines(lines) {
  const visibleLines = lines.filter(line => !isLineBlank(line));
  return visibleLines.length ? visibleLines.map(line => `
    <tr>
      <td>${escapeHtml(line.tripDate)}</td>
      <td>${escapeHtml(line.source)}</td>
      <td>${escapeHtml(line.destination)}</td>
      <td>${formatCurrency(line.diesel)}</td>
      <td>${escapeHtml(line.poNumber)}</td>
      <td>${escapeHtml(line.shipmentNumber || line.ref)}</td>
      <td>${formatCurrency(line.driverSalary)}</td>
      <td>${formatCurrency(line.helperSalary)}</td>
      <td>${formatCurrency(line.tollFee)}</td>
      <td>${formatCurrency(line.parking)}</td>
      <td>${escapeHtml(line.remarks)}</td>
    </tr>
  `).join("") : `<tr><td colspan="11" class="empty-table">No trip lines found.</td></tr>`;
}

function approveLiquidationFromQueue(id) {
  const record = payrollState.records.find(item => item.id === id);
  if (!record) return;
  if (!confirm("Approve this liquidation?")) return;
  setStatus("Approving liquidation...", "info");
  payrollCloudPost("approveLiquidationByMother", {
    Liquidation_ID: record.id,
    liquidationId: record.id,
    approvedBy: "Mother",
    reviewNotes: record.approval?.approvalNotes || ""
  })
    .then(result => {
      if (!result?.ok) throw new Error(result?.error || "Approval failed.");
      updateLocalApprovalRecord(id, "Approved", {
        approverName: "Mother",
        approvalNotes: record.approval?.approvalNotes || ""
      });
      closeApprovalDetails();
      setStatus("Approved and synced to cloud.", "success");
    })
    .catch(error => {
      console.warn("Approval failed", error);
      setStatus("Approval failed. Please try again.", "error");
    });
}

function returnLiquidationFromQueue(id) {
  const reason = prompt("Why should this be revised?");
  if (!reason || !reason.trim()) {
    setStatus("Revision reason is required.", "warning");
    return;
  }
  setStatus("Returning liquidation for revision...", "info");
  payrollCloudPost("returnLiquidationForRevision", {
    Liquidation_ID: id,
    liquidationId: id,
    returnedBy: "Mother",
    returnReason: reason.trim()
  })
    .then(result => {
      if (!result?.ok) throw new Error(result?.error || "Return failed.");
      updateLocalApprovalRecord(id, "Returned", {
        approverName: "Mother",
        revisionReason: reason.trim()
      });
      closeApprovalDetails();
      setStatus("Returned for revision and synced to cloud.", "success");
    })
    .catch(error => {
      console.warn("Return failed", error);
      setStatus("Return failed. Please try again.", "error");
    });
}

function rejectLiquidationFromQueue(id) {
  const reason = prompt("Reason for rejection?");
  if (!reason || !reason.trim()) {
    setStatus("Rejection reason is required.", "warning");
    return;
  }
  setStatus("Rejecting liquidation...", "info");
  payrollCloudPost("rejectLiquidation", {
    Liquidation_ID: id,
    liquidationId: id,
    rejectedBy: "Mother",
    rejectReason: reason.trim()
  })
    .then(result => {
      if (!result?.ok) throw new Error(result?.error || "Reject failed.");
      updateLocalApprovalRecord(id, "Rejected", {
        approverName: "Mother",
        revisionReason: reason.trim()
      });
      closeApprovalDetails();
      setStatus("Rejected and synced to cloud.", "success");
    })
    .catch(error => {
      console.warn("Reject failed", error);
      setStatus("Reject failed. Please try again.", "error");
    });
}

function updateLocalApprovalRecord(id, status, approvalPatch = {}) {
  const now = new Date().toISOString();
  payrollState.records = payrollState.records.map(record => {
    if (record.id !== id) return record;
    return {
      ...record,
      status,
      approval: {
        ...(record.approval || {}),
        ...approvalPatch
      },
      updatedAt: now
    };
  });
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
  renderPayrollRecordsTable();
  renderForApprovalQueue();
}

function editPayrollRecord(id) {
  const record = payrollState.records.find(item => item.id === id);
  if (!record) return;
  payrollState.currentId = record.id;
  payrollState.lines = (record.lines || []).map(line => ({ ...line, warnings: line.warnings || [] }));
  if (!payrollState.lines.length) payrollState.lines.push(createBlankPayrollLine());
  $("payroll-number").value = record.payrollNumber || record.id;
  $("payroll-date").value = record.payrollDate || "";
  $("cutoff-start").value = record.cutoffStart || "";
  $("cutoff-end").value = record.cutoffEnd || "";
  setPayrollGroupValue(record.groupCategory || "");
  $("plate-number").value = record.plateNumber || "";
  payrollState.selectedTruckType = record.truckType || "";
  $("driver-name").value = record.driverName || "";
  $("helper-name").value = record.helperName || "";
  $("encoder-name").value = record.encoderName || record.createdBy || "";
  $("payroll-status").value = record.status || "Draft";
  $("general-remarks").value = record.remarks || "";
  $("approver-name").value = record.approval?.approverName || "";
  $("approval-notes").value = record.approval?.approvalNotes || "";
  $("override-driver-deduction").value = hasValue(record.approval?.overrideDriverDeduction) ? record.approval.overrideDriverDeduction : "";
  $("override-helper-deduction").value = hasValue(record.approval?.overrideHelperDeduction) ? record.approval.overrideHelperDeduction : "";
  $("revision-reason").value = record.approval?.revisionReason || "";
  $("payment-reference").value = record.approval?.paymentReference || "";
  $("payment-date").value = record.approval?.paymentDate || "";
  setDeductionInputs("driver", record.deductions?.driver || {});
  setDeductionInputs("helper", record.deductions?.helper || {});
  renderLinesTable();
  calculatePayroll();
  generateViberMessage();
  updateLockState();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function duplicatePayrollRecord(id) {
  const record = payrollState.records.find(item => item.id === id);
  if (!record) return;
  payrollState.currentId = createId("payroll");
  payrollState.lines = (record.lines || []).map(line => ({ ...line, id: createId("line"), warnings: [] }));
  if (!payrollState.lines.length) payrollState.lines.push(createBlankPayrollLine());
  $("payroll-number").value = generatePayrollId();
  $("payroll-date").value = today();
  $("cutoff-start").value = record.cutoffStart || "";
  $("cutoff-end").value = record.cutoffEnd || "";
  setPayrollGroupValue(record.groupCategory || "");
  $("plate-number").value = record.plateNumber || "";
  payrollState.selectedTruckType = record.truckType || "";
  $("driver-name").value = record.driverName || "";
  $("helper-name").value = record.helperName || "";
  $("encoder-name").value = record.encoderName || "";
  $("payroll-status").value = "Draft";
  $("general-remarks").value = record.remarks || "";
  $("approver-name").value = "";
  $("approval-notes").value = "";
  $("override-driver-deduction").value = "";
  $("override-helper-deduction").value = "";
  $("revision-reason").value = "";
  $("payment-reference").value = "";
  $("payment-date").value = "";
  setDeductionInputs("driver", record.deductions?.driver || {});
  setDeductionInputs("helper", record.deductions?.helper || {});
  renderLinesTable();
  calculatePayroll();
  updateLockState();
  setStatus("Payroll duplicated as a draft.", "success");
}

function deletePayrollRecord(id) {
  const record = payrollState.records.find(item => item.id === id);
  if (!record) return;
  if (!confirm(`Delete ${record.payrollNumber || record.id}? This only removes the local record.`)) return;
  payrollState.records = payrollState.records.filter(item => item.id !== id);
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
  renderPayrollRecordsTable();
  setStatus("Payroll record deleted.", "warning");
}

function updateBalanceLedger(record, eventType) {
  const existingEvent = payrollState.ledger.some(entry => entry.payrollId === record.id && entry.notes.includes(eventType));
  if (existingEvent) return;

  const entries = [];
  if (eventType === "Approved") {
    entries.push(createLedgerEntry(record, record.driverName, "Driver", "Deduction", record.totals.driverDeduction, 0, "Approved deduction"));
    entries.push(createLedgerEntry(record, record.helperName, "Helper", "Deduction", record.totals.helperDeduction, 0, "Approved deduction"));
  }
  if (eventType === "Paid") {
    entries.push(createLedgerEntry(record, record.driverName, "Driver", "Payment", 0, record.totals.driverNetPay, "Paid payroll"));
    entries.push(createLedgerEntry(record, record.helperName, "Helper", "Payment", 0, record.totals.helperNetPay, "Paid payroll"));
  }
  payrollState.ledger.push(...entries);
  rebuildBalances();
  writeJson(PAYROLL_LEDGER_KEY, payrollState.ledger);
  writeJson(PEOPLE_BALANCES_KEY, payrollState.balances);
  renderBalanceLedger();
}

function renderBalanceLedger() {
  payrollState.ledger = readJson(PAYROLL_LEDGER_KEY, []);
  rebuildBalances();
  const balanceItems = Object.values(payrollState.balances);
  $("balance-summary").innerHTML = balanceItems.length ? balanceItems.map(item => `
    <div class="payroll-stat">
      <span>${escapeHtml(item.personName)} (${escapeHtml(item.role)})</span>
      <strong>${formatCurrency(item.runningBalance)}</strong>
    </div>
  `).join("") : `<div class="payroll-stat"><span>Current Balances</span><strong>${formatCurrency(0)}</strong></div>`;

  $("ledger-body").innerHTML = payrollState.ledger.length ? payrollState.ledger.slice().reverse().map(entry => `
    <tr>
      <td>${formatDateTime(entry.createdAt)}</td>
      <td>${escapeHtml(entry.id)}</td>
      <td>${escapeHtml(entry.payrollId)}</td>
      <td>${escapeHtml(entry.personName)}</td>
      <td>${escapeHtml(entry.role)}</td>
      <td>${escapeHtml(entry.plateNumber)}</td>
      <td>${escapeHtml(entry.transactionType)}</td>
      <td>${formatCurrency(entry.debit)}</td>
      <td>${formatCurrency(entry.credit)}</td>
      <td>${formatCurrency(entry.runningBalance)}</td>
      <td>${escapeHtml(entry.notes)}</td>
    </tr>
  `).join("") : `<tr><td colspan="11" class="empty-table">No ledger entries yet.</td></tr>`;
}

function generateViberMessage() {
  calculatePayroll();
  const totals = payrollState.totals || getEmptyTotals();
  const grossDriver = totals.totalDriverSalary + totals.totalDriverAllowance;
  const grossHelper = totals.totalHelperSalary + totals.totalHelperAllowance;
  const message = [
    `Plate: ${$("plate-number").value || "-"}`,
    `Payroll Date: ${$("payroll-date").value || "-"}`,
    `Cutoff: ${$("cutoff-start").value || "-"} to ${$("cutoff-end").value || "-"}`,
    "",
    `Driver: ${$("driver-name").value || "-"}`,
    `Gross Salary: ${formatCurrency(grossDriver)}`,
    `Deductions: ${formatCurrency(totals.driverDeduction)}`,
    `Net Deposit: ${formatCurrency(totals.driverNetPay)}`,
    "",
    `Helper: ${$("helper-name").value || "-"}`,
    `Gross Salary: ${formatCurrency(grossHelper)}`,
    `Deductions: ${formatCurrency(totals.helperDeduction)}`,
    `Net Deposit: ${formatCurrency(totals.helperNetPay)}`,
    "",
    `Total Budget Released: ${formatCurrency(totals.totalBudgetReleased)}`,
    `Total Expenses: ${formatCurrency(totals.totalExpenses)}`,
    `Status: ${$("payroll-status").value || "Draft"}`,
    `Payment Ref: ${$("payment-reference").value || "-"}`,
    `Remarks: ${$("approval-notes").value || $("general-remarks").value || "-"}`
  ].join("\n");
  $("viber-message").value = message;
  return message;
}

function copyViberMessage() {
  const message = $("viber-message").value || generateViberMessage();
  navigator.clipboard?.writeText(message).then(() => {
    $("copy-viber-status").textContent = "Viber message copied.";
  }).catch(() => {
    $("viber-message").select();
    document.execCommand("copy");
    $("copy-viber-status").textContent = "Viber message selected/copied.";
  });
}

function formatCurrency(value) {
  const number = parseNumber(value);
  return `₱${number.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function amountValue(value) {
  return hasValue(value) ? parseNumber(value) : "";
}

function payrollCloudGet(action, params = {}) {
  const query = new URLSearchParams({
    action,
    syncKey: PAYROLL_LIQUIDATION_SYNC_KEY,
    ...params
  });
  return fetch(`${PAYROLL_LIQUIDATION_API_URL}?${query.toString()}`).then(response => response.json());
}

function payrollCloudPost(action, payload = {}) {
  return fetch(PAYROLL_LIQUIDATION_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      syncKey: PAYROLL_LIQUIDATION_SYNC_KEY,
      action,
      ...payload
    })
  }).then(response => response.json());
}

function syncPayrollRecordToCloud(record) {
  const batch = payrollRecordToLiquidationBatch(record);
  const tripLines = payrollRecordToLiquidationTripLines(record);
  return payrollCloudPost("saveLiquidationBatch", { record: batch })
    .then(result => {
      if (!result?.ok) throw new Error(result?.error || "Batch sync failed.");
      return payrollCloudPost("saveLiquidationTripLines", {
        liquidationId: record.id,
        records: tripLines
      });
    })
    .then(result => {
      if (!result?.ok) throw new Error(result?.error || "Trip line sync failed.");
      return result;
    });
}

function loadPayrollRecordsFromCloud() {
  payrollCloudGet("listLiquidationBatches")
    .then(batchResult => {
      const cloudBatches = extractCloudArray(batchResult, ["batches", "records", "data"]);
      if (!batchResult?.ok || !cloudBatches.length) return null;
      return payrollCloudGet("listTripLines")
        .then(lineResult => ({
          batches: cloudBatches,
          tripLines: extractCloudArray(lineResult, ["tripLines", "lines", "records", "data"])
        }))
        .catch(error => {
          console.warn("Payroll cloud trip lines load failed", error);
          return { batches: cloudBatches, tripLines: [] };
        });
    })
    .then(payload => {
      if (!payload) return;
      const cloudRecords = cloudLiquidationToPayrollRecords(payload.batches, payload.tripLines);
      if (!cloudRecords.length) return;
      payrollState.records = mergePayrollRecords(payrollState.records, cloudRecords);
      writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
      renderPayrollRecordsTable();
      renderForApprovalQueue();
      setStatus("Loaded cloud payroll records.", "success");
    })
    .catch(error => {
      console.warn("Payroll cloud load failed", error);
      setStatus("Cloud records could not be loaded. Local records kept.", "warning");
    });
}

function extractCloudArray(response, keys) {
  if (Array.isArray(response)) return response;
  for (const key of keys) {
    const value = response?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const nestedKey of keys) {
        if (Array.isArray(value[nestedKey])) return value[nestedKey];
      }
    }
  }
  return [];
}

function payrollRecordToLiquidationBatch(record) {
  const totals = record.totals || {};
  const status = mapPayrollStatusToLiquidation(record.status);
  return {
    Liquidation_ID: record.id,
    Liquidation_Number: record.payrollNumber,
    Payroll_Number: record.payrollNumber,
    Liquidation_Date: record.payrollDate,
    Period_Start: record.cutoffStart,
    Period_End: record.cutoffEnd,
    Year_Tab: getRecordYear(record.payrollDate || record.cutoffEnd),
    Plate_Number: normalizePlateForCloud(record.plateNumber),
    Group_Category: record.groupCategory,
    Truck_Type: record.truckType || "",
    Driver_Name: record.driverName,
    Helper_Name: record.helperName,
    Encoded_By: record.encoderName || record.createdBy,
    Reviewed_By: record.approval?.approverName || "",
    Approved_By: record.status === "Approved" || record.status === "Paid" ? record.approval?.approverName || "" : "",
    Approval_Status: status,
    Workflow_Status: status,
    Review_Notes: record.approval?.approvalNotes || "",
    Return_Reason: record.status === "Returned" ? record.approval?.revisionReason || "" : "",
    Reject_Reason: record.status === "Rejected" ? record.approval?.revisionReason || "" : "",
    Submitted_At: record.status === "Submitted" ? record.updatedAt || "" : "",
    Approved_At: record.status === "Approved" || record.status === "Paid" ? record.updatedAt || "" : "",
    Posted_To_Truck_Sheet: "",
    Total_Diesel: totals.totalDiesel || "",
    Total_Driver_Salary: totals.totalDriverSalary || "",
    Total_Helper_Salary: totals.totalHelperSalary || "",
    Total_Toll: totals.totalToll || "",
    Total_Passway: totals.totalPassway || "",
    Total_Parking: totals.totalParking || "",
    Total_Lagay_Loaded: sumLineField(record.lines, "lagayLoaded"),
    Total_Lagay_Empty: sumLineField(record.lines, "lagayEmpty"),
    Total_Mano: sumLineField(record.lines, "mano"),
    Total_Vulcanize: sumLineField(record.lines, "vulcanize"),
    Total_Driver_Allowance: totals.totalDriverAllowance || "",
    Total_Helper_Allowance: totals.totalHelperAllowance || "",
    Total_Truck_Wash: sumLineField(record.lines, "hugasTruck"),
    Total_Checkpoint: sumLineField(record.lines, "checkpoint"),
    Total_Other_Expenses: totals.totalOtherExpenses || "",
    Total_Budget_Released: totals.totalBudgetReleased || "",
    Remarks: record.remarks,
    Created_At: record.createdAt,
    Updated_At: record.updatedAt
  };
}

function payrollRecordToLiquidationTripLines(record) {
  return (record.lines || []).filter(line => !isLineBlank(line)).map((line, index) => ({
    Line_ID: line.id || `${record.id}-line-${index + 1}`,
    Liquidation_ID: record.id,
    Line_No: index + 1,
    Trip_Date: line.tripDate || "",
    Plate_Number: normalizePlateForCloud(record.plateNumber),
    Group_Category: record.groupCategory || "",
    Driver_Name: record.driverName || "",
    Helper_Name: record.helperName || "",
    Diesel: line.diesel || "",
    Cost_Per_Liter: line.costPerLiter || "",
    PO_Number: line.poNumber || "",
    Source: line.source || "",
    Destination: line.destination || "",
    Ref: line.ref || line.shipmentNumber || "",
    Shipment_Number: line.shipmentNumber || "",
    Van_Number: line.vanNumber || "",
    Container_Type: line.containerType || "",
    Commodity: line.commodity || "",
    Driver_Salary: line.driverSalary || "",
    Helper_Salary: line.helperSalary || "",
    Toll: line.tollFee || "",
    Passway: line.passway || "",
    Parking: line.parking || "",
    Lagay_Loaded: line.lagayLoaded || "",
    Lagay_Empty: line.lagayEmpty || "",
    Mano: line.mano || "",
    Vulcanize: line.vulcanize || "",
    Driver_Allowance: line.driverAllowance || "",
    Helper_Allowance: line.helperAllowance || "",
    Truck_Wash: line.hugasTruck || "",
    Checkpoint: line.checkpoint || "",
    Other_Expenses: line.otherExpenses || "",
    Budget_Released: line.budgetReleased || "",
    Remarks: line.remarks || "",
    Created_At: record.createdAt || "",
    Updated_At: record.updatedAt || ""
  }));
}

function cloudLiquidationToPayrollRecords(batches, tripLines) {
  const linesByBatch = tripLines.reduce((map, line) => {
    const id = line.Liquidation_ID || "";
    if (!id) return map;
    if (!map[id]) map[id] = [];
    map[id].push(cloudTripLineToPayrollLine(line));
    return map;
  }, {});

  return batches.map(batch => ({
    id: batch.Liquidation_ID || createId("payroll"),
    payrollNumber: batch.Payroll_Number || batch.Liquidation_Number || "",
    payrollDate: toDateInputValue(batch.Liquidation_Date || batch.Date_Submitted || ""),
    cutoffStart: toDateInputValue(batch.Period_Start || ""),
    cutoffEnd: toDateInputValue(batch.Period_End || ""),
    groupCategory: normalizePayrollGroup(batch.Group_Category || ""),
    plateNumber: normalizePlateForCloud(batch.Plate_Number || ""),
    truckType: batch.Truck_Type || "",
    driverName: batch.Driver_Name || batch.Driver || "",
    helperName: batch.Helper_Name || batch.Helper || "",
    encoderName: batch.Encoded_By || "",
    status: mapLiquidationStatusToPayroll(batch.Approval_Status || batch.Workflow_Status),
    remarks: batch.Remarks || "",
    lines: (linesByBatch[batch.Liquidation_ID] || []).sort((a, b) => Number(a.lineNo || 0) - Number(b.lineNo || 0)),
    totals: cloudBatchToPayrollTotals(batch),
    approval: {
      approverName: batch.Approved_By || batch.Reviewed_By || "",
      approvalNotes: batch.Review_Notes || "",
      revisionReason: batch.Return_Reason || batch.Reject_Reason || "",
      paymentReference: "",
      paymentDate: ""
    },
    deductions: { driver: {}, helper: {} },
    createdBy: batch.Encoded_By || "",
    createdAt: batch.Created_At || "",
    updatedAt: batch.Updated_At || ""
  }));
}

function cloudTripLineToPayrollLine(line) {
  return {
    id: line.Line_ID || createId("line"),
    lineId: line.Line_ID || "",
    lineNo: line.Line_No || "",
    tripDate: toDateInputValue(line.Trip_Date || ""),
    diesel: amountValue(line.Diesel),
    costPerLiter: amountValue(line.Cost_Per_Liter),
    poNumber: line.PO_Number || "",
    shipmentNumber: line.Shipment_Number || line.Ref || "",
    vanNumber: line.Van_Number || "",
    containerType: line.Container_Type || "",
    source: line.Source || "",
    destination: line.Destination || "",
    commodity: line.Commodity || "",
    driverSalary: amountValue(line.Driver_Salary),
    helperSalary: amountValue(line.Helper_Salary),
    driverAllowance: amountValue(line.Driver_Allowance),
    helperAllowance: amountValue(line.Helper_Allowance),
    tollFee: amountValue(line.Toll),
    passway: amountValue(line.Passway),
    parking: amountValue(line.Parking),
    lagayLoaded: amountValue(line.Lagay_Loaded),
    lagayEmpty: amountValue(line.Lagay_Empty),
    mano: amountValue(line.Mano),
    vulcanize: amountValue(line.Vulcanize),
    hugasTruck: amountValue(line.Truck_Wash),
    checkpoint: amountValue(line.Checkpoint),
    otherExpenses: amountValue(line.Other_Expenses),
    budgetReleased: amountValue(line.Budget_Released),
    remarks: line.Remarks || "",
    warnings: []
  };
}

function cloudBatchToPayrollTotals(batch) {
  const totals = {
    ...getEmptyTotals(),
    totalDriverSalary: parseNumber(batch.Total_Driver_Salary),
    totalHelperSalary: parseNumber(batch.Total_Helper_Salary),
    totalDriverAllowance: parseNumber(batch.Total_Driver_Allowance),
    totalHelperAllowance: parseNumber(batch.Total_Helper_Allowance),
    totalDiesel: parseNumber(batch.Total_Diesel),
    totalToll: parseNumber(batch.Total_Toll),
    totalPassway: parseNumber(batch.Total_Passway),
    totalParking: parseNumber(batch.Total_Parking),
    totalOtherExpenses: parseNumber(batch.Total_Other_Expenses),
    totalBudgetReleased: parseNumber(batch.Total_Budget_Released)
  };
  totals.totalExpenses = totals.totalDiesel + totals.totalToll + totals.totalPassway + totals.totalParking + totals.totalOtherExpenses;
  totals.budgetDifference = totals.totalBudgetReleased - totals.totalExpenses;
  return totals;
}

function mergePayrollRecords(localRecords, cloudRecords) {
  const byId = new Map();
  localRecords.forEach(record => byId.set(record.id, record));
  cloudRecords.forEach(cloudRecord => {
    const localRecord = byId.get(cloudRecord.id);
    byId.set(cloudRecord.id, localRecord ? mergePayrollRecord(localRecord, cloudRecord) : cloudRecord);
  });
  return Array.from(byId.values()).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function mergePayrollRecord(localRecord, cloudRecord) {
  const merged = { ...cloudRecord, ...localRecord };
  Object.keys(cloudRecord).forEach(key => {
    const localValue = localRecord[key];
    const cloudValue = cloudRecord[key];
    if (isEmptyPayrollValue(localValue) && !isEmptyPayrollValue(cloudValue)) merged[key] = cloudValue;
  });
  if ((!localRecord.lines || !localRecord.lines.length) && cloudRecord.lines?.length) merged.lines = cloudRecord.lines;
  if (!localRecord.totals || !Object.values(localRecord.totals).some(value => parseNumber(value))) merged.totals = cloudRecord.totals;
  if (shouldUseCloudPayrollStatus(localRecord, cloudRecord)) {
    merged.status = cloudRecord.status;
    merged.approval = { ...(localRecord.approval || {}), ...(cloudRecord.approval || {}) };
    merged.updatedAt = cloudRecord.updatedAt || localRecord.updatedAt;
  }
  return merged;
}

function mapPayrollStatusToLiquidation(status) {
  const normalized = String(status || "Draft").trim();
  if (normalized === "Submitted") return "For Review";
  return normalized;
}

function mapLiquidationStatusToPayroll(status) {
  const normalized = String(status || "Draft").trim();
  if (normalized === "For Review") return "Submitted";
  if (normalized === "Approved by Mother") return "Approved";
  return normalized;
}

function shouldUseCloudPayrollStatus(localRecord, cloudRecord) {
  const localStatus = mapLiquidationStatusToPayroll(localRecord.status || "Draft");
  const cloudStatus = mapLiquidationStatusToPayroll(cloudRecord.status || "Draft");
  if (!cloudStatus || cloudStatus === localStatus) return false;
  if (localStatus === "Draft" && cloudStatus !== "Draft") return true;
  const localTime = Date.parse(localRecord.updatedAt || localRecord.createdAt || "");
  const cloudTime = Date.parse(cloudRecord.updatedAt || cloudRecord.createdAt || "");
  if (Number.isFinite(localTime) && Number.isFinite(cloudTime) && cloudTime > localTime) return true;
  return ["Approved", "Returned", "Rejected", "Paid", "Posted", "Deleted"].includes(cloudStatus) && ["Draft", "Submitted"].includes(localStatus);
}

function normalizePlateForCloud(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function getRecordYear(value) {
  const text = String(value || "").trim();
  return /^\d{4}/.test(text) ? text.slice(0, 4) : String(new Date().getFullYear());
}

function toDateInputValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
}

function sumLineField(lines = [], field) {
  return lines.reduce((sum, line) => sum + parseNumber(line[field]), 0);
}

function isEmptyPayrollValue(value) {
  if (Array.isArray(value)) return !value.length;
  if (value && typeof value === "object") return !Object.keys(value).length;
  return value === undefined || value === null || value === "";
}

function syncRulesToGoogleSheets() {
  console.info("Google Apps Script sync placeholder: salary/cost rules will be posted here later.");
  return Promise.resolve({ ok: false, placeholder: true });
}

function renderLinesTable(keepFocus = true) {
  const active = keepFocus ? document.activeElement : null;
  const activeId = active?.dataset?.id;
  const activeField = active?.dataset?.field;
  $("payroll-lines-body").innerHTML = payrollState.lines.map(line => `
    <tr>
      <td class="sticky-col sticky-col-1"><input class="line-select" type="checkbox" data-id="${line.id}"></td>
      ${lineColumns.map(([field, type], columnIndex) => `<td class="${getLineCellClass(field)}">${lineInput(line, field, type, columnIndex)}</td>`).join("")}
      <td class="warning-cell">${(line.warnings || []).map(warning => `<span class="warning-badge small">${escapeHtml(warning)}</span>`).join("")}</td>
    </tr>
  `).join("");
  $("payroll-lines-body").querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("input", () => {
      const line = payrollState.lines.find(item => item.id === input.dataset.id);
      if (!line) return;
      line[input.dataset.field] = input.type === "number" ? parseNumber(input.value) : input.value;
    });
    input.addEventListener("change", calculatePayroll);
  });
  bindSpreadsheetCells();
  updateSpreadsheetSelectionStyles();
  if (activeId && activeField) {
    const next = document.querySelector(`[data-id="${activeId}"][data-field="${activeField}"]`);
    if (next) next.focus();
  }
}

function renderTripTable() {
  renderLinesTable();
}

function getLineCellClass(field) {
  if (field === "tripDate") return "sticky-col sticky-col-2";
  if (field === "poNumber") return "sticky-col sticky-col-3";
  if (field === "vanNumber") return "sticky-col sticky-col-4";
  return "";
}

function lineInput(line, field, type, columnIndex) {
  const value = isLineBlank(line) && type === "number" ? "" : line[field] ?? "";
  const disabled = isLockedStatus($("payroll-status").value) ? "disabled" : "";
  const rowIndex = payrollState.lines.findIndex(item => item.id === line.id);
  return `<input class="payroll-cell-input" data-id="${line.id}" data-field="${field}" data-row-index="${rowIndex}" data-col-index="${columnIndex}" type="${type}" ${type === "number" ? 'step="0.01" min="0"' : ""} value="${escapeAttr(value)}" ${disabled}>`;
}

function syncLinesFromTable() {
  document.querySelectorAll("#payroll-lines-body [data-field]").forEach(input => {
    const line = payrollState.lines.find(item => item.id === input.dataset.id);
    if (!line) return;
    line[input.dataset.field] = input.type === "number" ? parseNumber(input.value) : input.value;
  });
}

function bindSpreadsheetCells() {
  const inputs = [...document.querySelectorAll(".payroll-cell-input")];
  inputs.forEach(input => {
    input.addEventListener("focus", event => selectSpreadsheetCell(event.currentTarget, event.shiftKey));
    input.addEventListener("mousedown", event => {
      if (event.button !== 0) return;
      payrollState.isSelectingSheetRange = true;
      selectSpreadsheetCell(event.currentTarget, event.shiftKey);
    });
    input.addEventListener("mouseover", event => {
      if (!payrollState.isSelectingSheetRange) return;
      extendSpreadsheetSelection(event.currentTarget);
    });
    input.addEventListener("keydown", handleSpreadsheetKeydown);
    input.addEventListener("paste", handleSpreadsheetPaste);
  });
}

document.addEventListener("mouseup", () => {
  payrollState.isSelectingSheetRange = false;
});

document.addEventListener("copy", event => {
  if (!document.activeElement?.classList?.contains("payroll-cell-input")) return;
  if (!payrollState.sheetSelection) return;
  const selectedText = window.getSelection()?.toString();
  if (selectedText) return;
  const copied = getSelectedSpreadsheetText();
  if (!copied) return;
  event.preventDefault();
  event.clipboardData.setData("text/plain", copied);
});

function selectSpreadsheetCell(input, extend = false) {
  const row = Number(input.dataset.rowIndex);
  const col = Number(input.dataset.colIndex);
  if (!extend || !payrollState.sheetSelection) {
    payrollState.sheetSelection = { anchorRow: row, anchorCol: col, focusRow: row, focusCol: col };
  } else {
    payrollState.sheetSelection.focusRow = row;
    payrollState.sheetSelection.focusCol = col;
  }
  updateSpreadsheetSelectionStyles();
}

function extendSpreadsheetSelection(input) {
  if (!payrollState.sheetSelection) return;
  payrollState.sheetSelection.focusRow = Number(input.dataset.rowIndex);
  payrollState.sheetSelection.focusCol = Number(input.dataset.colIndex);
  updateSpreadsheetSelectionStyles();
}

function updateSpreadsheetSelectionStyles() {
  document.querySelectorAll(".payroll-cell-selected, .payroll-cell-active").forEach(cell => {
    cell.classList.remove("payroll-cell-selected", "payroll-cell-active");
  });
  const selection = payrollState.sheetSelection;
  if (!selection) return;
  const minRow = Math.min(selection.anchorRow, selection.focusRow);
  const maxRow = Math.max(selection.anchorRow, selection.focusRow);
  const minCol = Math.min(selection.anchorCol, selection.focusCol);
  const maxCol = Math.max(selection.anchorCol, selection.focusCol);
  document.querySelectorAll(".payroll-cell-input").forEach(input => {
    const row = Number(input.dataset.rowIndex);
    const col = Number(input.dataset.colIndex);
    if (row >= minRow && row <= maxRow && col >= minCol && col <= maxCol) {
      input.closest("td")?.classList.add("payroll-cell-selected");
    }
    if (row === selection.focusRow && col === selection.focusCol) {
      input.closest("td")?.classList.add("payroll-cell-active");
    }
  });
}

function getSelectedSpreadsheetText() {
  const selection = payrollState.sheetSelection;
  if (!selection) return "";
  syncLinesFromTable();
  const minRow = Math.min(selection.anchorRow, selection.focusRow);
  const maxRow = Math.max(selection.anchorRow, selection.focusRow);
  const minCol = Math.min(selection.anchorCol, selection.focusCol);
  const maxCol = Math.max(selection.anchorCol, selection.focusCol);
  const rows = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const line = payrollState.lines[rowIndex] || {};
    const values = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex += 1) {
      const [field] = lineColumns[colIndex] || [];
      values.push(line[field] ?? "");
    }
    rows.push(values.join("\t"));
  }
  return rows.join("\n");
}

function handleSpreadsheetPaste(event) {
  const text = event.clipboardData?.getData("text/plain") || "";
  if (!text.includes("\t") && !text.includes("\n")) return;
  event.preventDefault();
  const input = event.currentTarget;
  pasteSpreadsheetText(text, Number(input.dataset.rowIndex), Number(input.dataset.colIndex));
}

function pasteSpreadsheetText(text, startRow, startCol) {
  if (isLockedStatus($("payroll-status").value)) return;
  syncLinesFromTable();
  const rows = text.replace(/\r/g, "").split("\n").filter((row, index, array) => row !== "" || index < array.length - 1);
  const parsed = rows.map(row => row.split("\t"));
  const rowsNeeded = startRow + parsed.length - payrollState.lines.length;
  for (let index = 0; index < rowsNeeded; index += 1) {
    payrollState.lines.push(createBlankPayrollLine());
  }
  parsed.forEach((rowValues, rowOffset) => {
    rowValues.forEach((value, colOffset) => {
      const colIndex = startCol + colOffset;
      if (colIndex >= lineColumns.length) return;
      const [field, type] = lineColumns[colIndex];
      const line = payrollState.lines[startRow + rowOffset];
      line[field] = type === "number" ? amountValue(value) : value.trim();
    });
  });
  const endRow = startRow + Math.max(parsed.length - 1, 0);
  const endCol = startCol + Math.max(...parsed.map(row => row.length), 1) - 1;
  payrollState.sheetSelection = {
    anchorRow: startRow,
    anchorCol: startCol,
    focusRow: endRow,
    focusCol: Math.min(endCol, lineColumns.length - 1)
  };
  renderLinesTable(false);
  calculatePayroll();
  focusSpreadsheetCell(startRow, startCol);
}

function handleSpreadsheetKeydown(event) {
  if (!event.currentTarget.classList.contains("payroll-cell-input")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllSpreadsheetCells();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (hasSpreadsheetRangeSelection()) {
      event.preventDefault();
      clearSelectedSpreadsheetCells();
    }
    return;
  }
  const navigation = {
    ArrowRight: [0, 1],
    ArrowLeft: [0, -1],
    ArrowDown: [1, 0],
    ArrowUp: [-1, 0],
    Enter: [event.shiftKey ? -1 : 1, 0],
    Tab: [0, event.shiftKey ? -1 : 1]
  };
  if (!navigation[event.key]) return;
  if (event.key.startsWith("Arrow") && !shouldNavigateWithArrow(event)) return;
  event.preventDefault();
  const [rowDelta, colDelta] = navigation[event.key];
  moveSpreadsheetFocus(event.currentTarget, rowDelta, colDelta, event.shiftKey && event.key !== "Enter");
}

function selectAllSpreadsheetCells() {
  payrollState.sheetSelection = {
    anchorRow: 0,
    anchorCol: 0,
    focusRow: Math.max(payrollState.lines.length - 1, 0),
    focusCol: lineColumns.length - 1
  };
  updateSpreadsheetSelectionStyles();
}

function hasSpreadsheetRangeSelection() {
  const selection = payrollState.sheetSelection;
  if (!selection) return false;
  return selection.anchorRow !== selection.focusRow || selection.anchorCol !== selection.focusCol;
}

function clearSelectedSpreadsheetCells() {
  if (isLockedStatus($("payroll-status").value)) return;
  const selection = payrollState.sheetSelection;
  if (!selection) return;
  const minRow = Math.min(selection.anchorRow, selection.focusRow);
  const maxRow = Math.max(selection.anchorRow, selection.focusRow);
  const minCol = Math.min(selection.anchorCol, selection.focusCol);
  const maxCol = Math.max(selection.anchorCol, selection.focusCol);
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    const line = payrollState.lines[rowIndex];
    if (!line) continue;
    for (let colIndex = minCol; colIndex <= maxCol; colIndex += 1) {
      const [field] = lineColumns[colIndex] || [];
      if (field) line[field] = "";
    }
    line.warnings = [];
  }
  renderLinesTable(false);
  calculatePayroll();
  focusSpreadsheetCell(minRow, minCol);
}

function shouldNavigateWithArrow(event) {
  const input = event.currentTarget;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  if (start !== end) return false;
  if (event.key === "ArrowLeft") return start === 0;
  if (event.key === "ArrowRight") return end === input.value.length;
  return true;
}

function moveSpreadsheetFocus(input, rowDelta, colDelta, extend) {
  let row = Number(input.dataset.rowIndex) + rowDelta;
  let col = Number(input.dataset.colIndex) + colDelta;
  if (col < 0) {
    col = lineColumns.length - 1;
    row -= 1;
  }
  if (col >= lineColumns.length) {
    col = 0;
    row += 1;
  }
  if (row < 0) row = 0;
  if (row >= payrollState.lines.length && !isLockedStatus($("payroll-status").value)) {
    payrollState.lines.push(createBlankPayrollLine());
    renderLinesTable(false);
  }
  focusSpreadsheetCell(row, col, extend);
}

function focusSpreadsheetCell(row, col, extend = false) {
  const input = document.querySelector(`.payroll-cell-input[data-row-index="${row}"][data-col-index="${col}"]`);
  if (!input) return;
  input.focus();
  input.select();
  selectSpreadsheetCell(input, extend);
}

function applyMatchingRulesToLines() {
  if (isLockedStatus($("payroll-status").value)) return;
  syncLinesFromTable();
  payrollState.lines.forEach(line => {
    if (isLineBlank(line)) return;
    const rule = matchSalaryRule(line);
    if (!rule) return;
    line.driverSalary = parseNumber(rule.driverSalary);
    line.helperSalary = parseNumber(rule.helperSalary);
    line.driverAllowance = parseNumber(rule.driverAllowance);
    line.helperAllowance = parseNumber(rule.helperAllowance);
  });
  renderLinesTable();
  calculatePayroll();
  setStatus("Matching salary rules applied where available.", "success");
}

function renderRulesTable() {
  $("rules-body").innerHTML = payrollState.rules.map(rule => `
    <tr>
      <td><input class="rule-select" type="checkbox" data-id="${rule.id}"></td>
      <td><input data-rule-id="${rule.id}" data-rule-field="id" type="text" value="${escapeAttr(rule.id)}" readonly></td>
      ${ruleColumns.map(([field, type]) => `<td>${ruleInput(rule, field, type)}</td>`).join("")}
    </tr>
  `).join("");
}

function ruleInput(rule, field, type) {
  const value = rule[field] ?? "";
  if (field === "groupCategory") {
    return `<select data-rule-id="${rule.id}" data-rule-field="${field}">${["", "Sugar", "Bottle", "Preform", "Resin", "Caps", "Crowns"].map(option => `<option ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select>`;
  }
  if (field === "status") {
    return `<select data-rule-id="${rule.id}" data-rule-field="${field}">${["Active", "Inactive"].map(option => `<option ${option === value ? "selected" : ""}>${option}</option>`).join("")}</select>`;
  }
  return `<input data-rule-id="${rule.id}" data-rule-field="${field}" type="${type}" ${type === "number" ? 'step="0.01" min="0"' : ""} value="${escapeAttr(value)}">`;
}

function syncRulesFromTable() {
  document.querySelectorAll("[data-rule-field]").forEach(input => {
    const rule = payrollState.rules.find(item => item.id === input.dataset.ruleId);
    if (!rule) return;
    const field = input.dataset.ruleField;
    rule[field] = input.type === "number" ? parseNumber(input.value) : input.value;
  });
}

function buildPayrollRecord(existing = {}) {
  const totals = calculatePayroll();
  return {
    id: payrollState.currentId,
    payrollNumber: $("payroll-number").value || generatePayrollId(),
    payrollDate: $("payroll-date").value,
    cutoffStart: $("cutoff-start").value,
    cutoffEnd: $("cutoff-end").value,
    groupCategory: normalizePayrollGroup($("group-category").value),
    plateNumber: $("plate-number").value.trim().toUpperCase(),
    truckType: payrollState.selectedTruckType || getPayrollTruckType(getPayrollTruckInfoByPlate($("plate-number").value)) || "",
    driverName: $("driver-name").value.trim(),
    helperName: $("helper-name").value.trim(),
    encoderName: $("encoder-name").value.trim(),
    status: $("payroll-status").value,
    remarks: $("general-remarks").value.trim(),
    lines: payrollState.lines.filter(line => !isLineBlank(line)),
    totals,
    approval: {
      approverName: $("approver-name").value.trim(),
      approvalNotes: $("approval-notes").value.trim(),
      overrideDriverDeduction: hasValue($("override-driver-deduction").value) ? parseNumber($("override-driver-deduction").value) : "",
      overrideHelperDeduction: hasValue($("override-helper-deduction").value) ? parseNumber($("override-helper-deduction").value) : "",
      finalDriverNetPay: totals.driverNetPay,
      finalHelperNetPay: totals.helperNetPay,
      revisionReason: $("revision-reason").value.trim(),
      paymentReference: $("payment-reference").value.trim(),
      paymentDate: $("payment-date").value
    },
    deductions: {
      driver: getPersonDeductions("driver"),
      helper: getPersonDeductions("helper")
    },
    createdBy: existing.createdBy || $("encoder-name").value.trim(),
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt
  };
}

function createLedgerEntry(record, personName, role, transactionType, debit, credit, notes) {
  const key = `${normalize(personName)}|${role}`;
  const current = payrollState.balances[key]?.runningBalance || 0;
  const runningBalance = current + parseNumber(debit) - parseNumber(credit);
  payrollState.balances[key] = { personName, role, runningBalance };
  return {
    id: createId("ledger"),
    payrollId: record.id,
    personName,
    role,
    plateNumber: record.plateNumber,
    transactionType,
    debit: parseNumber(debit),
    credit: parseNumber(credit),
    runningBalance,
    notes,
    createdAt: new Date().toISOString()
  };
}

function rebuildBalances() {
  payrollState.balances = {};
  payrollState.ledger.forEach(entry => {
    const key = `${normalize(entry.personName)}|${entry.role}`;
    const current = payrollState.balances[key]?.runningBalance || 0;
    payrollState.balances[key] = {
      personName: entry.personName,
      role: entry.role,
      runningBalance: current + parseNumber(entry.debit) - parseNumber(entry.credit)
    };
    entry.runningBalance = payrollState.balances[key].runningBalance;
  });
}

function updateLockState() {
  const status = $("payroll-status").value;
  $("header-status-badge").outerHTML = statusBadge(status, "header-status-badge");
  const locked = isLockedStatus(status);
  document.querySelectorAll("#payroll-header-form input:not(#payroll-number), #payroll-header-form select, #payroll-header-form textarea, #payroll-lines-body input").forEach(input => {
    if (input.id !== "payroll-status") input.disabled = locked;
  });
}

function isLockedStatus(status) {
  return ["Approved", "Rejected", "Paid"].includes(status);
}

function statusBadge(status, id = "") {
  return `<span ${id ? `id="${id}"` : ""} class="status-badge status-${statusSlug(status || "Draft")}">${escapeHtml(status || "Draft")}</span>`;
}

function statusSlug(status) {
  return normalize(status || "Draft").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getSelectedLineIds() {
  return [...document.querySelectorAll(".line-select:checked")].map(input => input.dataset.id);
}

function getOtherExpenseTotal(line) {
  return ["lagayLoaded", "lagayEmpty", "vulcanize", "otherExpenses"].reduce((sum, field) => sum + parseNumber(line[field]), 0);
}

function compareRuleAmount(warnings, label, actual, expected) {
  if (parseNumber(expected) > 0 && parseNumber(actual) !== parseNumber(expected)) warnings.push(`${label} does not match rule`);
}

function compareAllowedAmount(warnings, label, actual, allowed) {
  if (parseNumber(allowed) > 0 && parseNumber(actual) > parseNumber(allowed)) warnings.push(`${label} is above allowed amount`);
}

function isDuplicateTrip(line) {
  if (isLineBlank(line)) return false;
  const key = duplicateKey(line);
  return payrollState.lines.filter(item => !isLineBlank(item) && duplicateKey(item) === key && key !== "||||").length > 1;
}

function duplicateKey(line) {
  return [normalize($("plate-number").value), line.tripDate, normalize(line.shipmentNumber), normalize(line.source), normalize(line.destination)].join("|");
}

function getEmptyTotals() {
  return {
    totalDriverSalary: 0,
    totalHelperSalary: 0,
    totalDriverAllowance: 0,
    totalHelperAllowance: 0,
    totalDiesel: 0,
    totalToll: 0,
    totalPassway: 0,
    totalParking: 0,
    totalOtherExpenses: 0,
    totalExpenses: 0,
    totalBudgetReleased: 0,
    budgetDifference: 0,
    suggestedDriverDeduction: 0,
    suggestedHelperDeduction: 0,
    driverDeduction: 0,
    helperDeduction: 0,
    driverNetPay: 0,
    helperNetPay: 0
  };
}

function seedSampleRecord() {
  const sampleLine = {
    id: createId("line"),
    tripDate: today(),
    poNumber: "PO-001",
    shipmentNumber: "SMP-001",
    vanNumber: "VAN-01",
    containerType: "20-footer",
    source: "Valenzuela",
    destination: "Majada",
    commodity: "Bottle",
    tripType: "Round Trip",
    driverSalary: 1200,
    helperSalary: 800,
    driverAllowance: 150,
    helperAllowance: 100,
    diesel: 2500,
    tollFee: 450,
    passway: 100,
    parking: 50,
    lagayLoaded: 0,
    lagayEmpty: 0,
    luna: 0,
    mano: 0,
    vulcanize: 0,
    hugasTruck: 0,
    checkpoint: 0,
    otherExpenses: 0,
    budgetReleased: 3300,
    remarks: "Sample only",
    warnings: []
  };
  const sampleTotals = {
    ...getEmptyTotals(),
    totalDriverSalary: 1200,
    totalHelperSalary: 800,
    totalDriverAllowance: 150,
    totalHelperAllowance: 100,
    totalDiesel: 2500,
    totalToll: 450,
    totalPassway: 100,
    totalParking: 50,
    totalExpenses: 3100,
    totalBudgetReleased: 3300,
    budgetDifference: 200,
    driverDeduction: 100,
    helperDeduction: 100,
    driverNetPay: 1250,
    helperNetPay: 800
  };
  payrollState.records = [{
    id: createId("payroll"),
    payrollNumber: "PAY-SAMPLE-001",
    payrollDate: today(),
    cutoffStart: today(),
    cutoffEnd: today(),
    groupCategory: "Bottle",
    plateNumber: "ABC1234",
    driverName: "Sample Driver",
    helperName: "Sample Helper",
    encoderName: "Office",
    status: "Draft",
    remarks: "Sample local payroll record for testing.",
    lines: [sampleLine],
    totals: sampleTotals,
    approval: {},
    createdBy: "Office",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }];
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
}

function getSampleRules() {
  return [
    {
      id: "RULE-BOTTLE-001",
      groupCategory: "Bottle",
      source: "Valenzuela",
      destination: "Majada",
      client: "Bottle",
      tripType: "Round Trip",
      driverSalary: 1200,
      helperSalary: 800,
      driverAllowance: 150,
      helperAllowance: 100,
      allowedDiesel: 2600,
      allowedToll: 500,
      allowedParking: 100,
      allowedPassway: 150,
      notes: "Sample bottle route",
      status: "Active"
    },
    {
      id: "RULE-SUGAR-001",
      groupCategory: "Sugar",
      source: "Batangas",
      destination: "Valenzuela",
      client: "Sugar",
      tripType: "One Way",
      driverSalary: 1800,
      helperSalary: 1000,
      driverAllowance: 250,
      helperAllowance: 150,
      allowedDiesel: 4200,
      allowedToll: 900,
      allowedParking: 100,
      allowedPassway: 200,
      notes: "Sample sugar inbound",
      status: "Active"
    }
  ];
}

function setStatus(message, type = "info") {
  const target = $("payroll-save-status");
  target.textContent = message;
  target.className = `payroll-status-line ${type}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function hasDeductionOverride() {
  return hasValue($("override-driver-deduction").value) || hasValue($("override-helper-deduction").value);
}

function getPersonDeductions(person) {
  return deductionFields.reduce((deductions, field) => {
    deductions[field] = parseNumber($(`${person}-deduction-${field}`)?.value);
    return deductions;
  }, {});
}

function getPersonDeductionTotal(person) {
  return Object.values(getPersonDeductions(person)).reduce((sum, value) => sum + parseNumber(value), 0);
}

function setDeductionInputs(person, deductions) {
  deductionFields.forEach(field => {
    const input = $(`${person}-deduction-${field}`);
    if (input) input.value = hasValue(deductions[field]) && parseNumber(deductions[field]) !== 0 ? deductions[field] : "";
  });
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

document.addEventListener("DOMContentLoaded", initPayrollPage);
