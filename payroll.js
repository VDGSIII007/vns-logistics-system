const PAYROLL_RECORDS_KEY = "vnsPayrollRecords";
const PAYROLL_RULES_KEY = "vnsPayrollRules";
const PEOPLE_BALANCES_KEY = "vnsPeopleBalances";
const PAYROLL_LEDGER_KEY = "vnsPayrollLedger";
const PAYROLL_LIQUIDATION_API_URL = "https://script.google.com/macros/s/AKfycbx2JOUTm1ESJ8Ce6zGu7PzqDLBaPTjNoHeRskU-Akc5JipoUJXXPQ1BibY04paConwM/exec";
const PAYROLL_LIQUIDATION_SYNC_KEY = "vns-payroll-liquidation-sync-2026-Jay";
const PAYROLL_TRUCK_MASTER_KEY = "vnsTruckMaster";
const PAYROLL_MASTER_APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySWpFu-ZwtsC4uGK4uNgZSRlHUzS4bAMX4X0vAQjt-iuF7pbgT3loFGU2fU2YL4rq6pQ/exec";
const PAYROLL_MASTER_SYNC_KEY = "vns-truck-sync-2026-Jay";
const VNS_PAYROLL_WORKER_API_BASE = "https://vns-push-worker.santosvicenteiii.workers.dev";

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
  originalLineIds: [],
  truckMaster: [],
  truckMasterLoadFailed: false,
  selectedTruckType: "",
  personsMaster: [],
  baliSummary: {},
  supabaseSource: false,
  rateMatrix: []
};

const amountFields = [
  "diesel", "costPerLiter", "driverSalary", "helperSalary", "driverAllowance", "helperAllowance", "tollFee",
  "passway", "parking", "vulcanize", "otherExpenses", "lagayLoaded", "lagayEmpty", "mano", "timbang", "luna", "hugasTruck", "checkpoint", "budgetReleased"
];

const lineColumns = [
  ["tripDate", "date", "Date"], ["source", "text", "Source"], ["destination", "text", "Destination"],
  ["referenceNo", "text", "Reference No."], ["poNumber", "text", "PO Number"], ["shipmentNumber", "text", "Shipment Number"],
  ["containerNumber", "text", "Container Number"], ["tripType", "text", "Trip Type"], ["diesel", "number", "Diesel"],
  ["costPerLiter", "number", "Per Liter"],
  ["driverSalary", "number", "Driver Salary"], ["helperSalary", "number", "Helper Salary"], ["tollFee", "number", "Toll"],
  ["passway", "number", "Passway"], ["parking", "number", "Parking"], ["lagayLoaded", "number", "Lagay Loaded"],
  ["lagayEmpty", "number", "Lagay Empty"], ["mano", "number", "Mano"], ["timbang", "number", "Timbang"],
  ["luna", "number", "Luna"], ["vulcanize", "number", "Vulcanize"],
  ["driverAllowance", "number", "Allowance Driver"], ["helperAllowance", "number", "Allowance Helper"],
  ["hugasTruck", "number", "Hugas Truck"], ["checkpoint", "number", "Checkpoint"], ["otherExpenses", "number", "Other Expenses"],
  ["rowTotal", "number", "Row Total"], ["rateMatchStatus", "text", "Rate Match Status"], ["lineStatus", "text", "Status"],
  ["sourceFile", "text", "Source File"], ["remarks", "text", "Remarks"]
];

const rateAutoFillFields = new Set([
  "driverSalary", "helperSalary", "tollFee", "passway", "parking", "lagayLoaded",
  "lagayEmpty", "mano", "vulcanize", "driverAllowance", "helperAllowance", "hugasTruck", "checkpoint", "otherExpenses"
]);

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
  loadPayrollMasterData();
  loadPayrollRateMatrix();
  renderBalanceLedger();
  newPayroll();
  loadPayrollRecordsFromCloud();
  loadSavedPayrollRecordsFromSupabase();
  loadPersonBalancesFromWorker();
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
  $("save-draft-button").addEventListener("click", savePayrollDraft);
  if ($("pasahod-save-draft-button")) $("pasahod-save-draft-button").addEventListener("click", savePayrollDraft);
  if ($("review-pasahod-button")) $("review-pasahod-button").addEventListener("click", reviewPasahodSummary);
  if ($("back-to-trip-lines-button")) $("back-to-trip-lines-button").addEventListener("click", backToTripLines);
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

  if ($("refresh-bali-button")) {
    $("refresh-bali-button").addEventListener("click", () => {
      const driver = $("driver-name")?.value || "";
      const helper = $("helper-name")?.value || "";
      loadBaliSummaryFromSupabase(driver, helper);
    });
  }
  if ($("refresh-payroll-records-button")) {
    $("refresh-payroll-records-button").addEventListener("click", loadSavedPayrollRecordsFromSupabase);
  }
  if ($("refresh-approval-payment-button")) {
    $("refresh-approval-payment-button").addEventListener("click", loadSavedPayrollRecordsFromSupabase);
  }
  if ($("records-body") && !$("records-body").dataset.payrollActionsBound) {
    $("records-body").dataset.payrollActionsBound = "true";
    $("records-body").addEventListener("click", handleSavedPayrollRecordAction);
    $("records-body").addEventListener("keydown", handleSavedPayrollRecordKeydown);
  }

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
  if ($("payroll-details-close")) {
    $("payroll-details-close").addEventListener("click", closePayrollDetails);
  }
  if ($("payroll-details-panel")) {
    $("payroll-details-panel").addEventListener("click", event => {
      if (event.target === $("payroll-details-panel")) closePayrollDetails();
    });
  }
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closePayrollDetails();
      closeApprovalDetails();
    }
  });

  ["group-category", "plate-number", "driver-name", "helper-name", "payroll-status"].forEach(id => {
    $(id).addEventListener("input", () => {
      if (id === "group-category") {
        applyPayrollGroupToPlateOptions();
        renderPayrollLaneDatalists(getActivePayrollLaneSource());
      }
      if (id === "plate-number") applyPayrollTruckToHeader(false);
      calculatePayroll();
      updateLockState();
    });
  });
  $("group-category").addEventListener("change", () => {
    applyPayrollGroupToPlateOptions();
    renderPayrollLaneDatalists(getActivePayrollLaneSource());
    applyRateMatrixToAllLines();
  });
  $("plate-number").addEventListener("change", () => applyPayrollTruckToHeader(true));
  $("plate-number").addEventListener("blur", () => applyPayrollTruckToHeader(true));
  $("driver-name").addEventListener("change", () => updatePersonNoteVisibility("driver-name", "driver-name-note", "Driver"));
  $("driver-name").addEventListener("blur", () => updatePersonNoteVisibility("driver-name", "driver-name-note", "Driver"));
  $("helper-name").addEventListener("change", () => updatePersonNoteVisibility("helper-name", "helper-name-note", "Helper"));
  $("helper-name").addEventListener("blur", () => updatePersonNoteVisibility("helper-name", "helper-name-note", "Helper"));

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
  payrollState.originalLineIds = [];
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
  updatePayrollDraftSummary(null);
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
  payrollState.truckMasterLoadFailed = false;
  renderPayrollTruckPlateOptions();

  fetchPayrollTruckMasterFromSupabase()
    .catch(error => {
      console.warn("Payroll truck master Supabase load failed; trying Apps Script fallback", error);
      return fetchPayrollTruckMasterFromAppsScript();
    })
    .then(trucks => {
      if (!Array.isArray(trucks) || !trucks.length) throw new Error("Truck Master returned no trucks");
      applyPayrollTruckMaster(trucks);
    })
    .catch(error => {
      console.warn("Payroll truck master cloud load failed", error);
      payrollState.truckMasterLoadFailed = !payrollState.truckMaster.length;
      renderPayrollTruckPlateOptions();
    });
}

function fetchPayrollTruckMasterFromSupabase() {
  return fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/trucks/list?active=true&limit=5000`)
    .then(response => response.json())
    .then(result => {
      if (!result?.ok || !Array.isArray(result.trucks)) throw new Error(result?.error || "Supabase Truck Master unavailable");
      if (!result.trucks.length) throw new Error("Supabase Truck Master returned no trucks");
      return result.trucks;
    });
}

function fetchPayrollTruckMasterFromAppsScript() {
  const query = new URLSearchParams({
    action: "getAllMasterData",
    syncKey: PAYROLL_MASTER_SYNC_KEY
  });
  return fetch(`${PAYROLL_MASTER_APP_SCRIPT_URL}?${query.toString()}`)
    .then(response => response.json())
    .then(result => {
      const trucks = result?.trucks || result?.Truck_Master || [];
      if (!result?.ok || !Array.isArray(trucks)) throw new Error(result?.error || "Apps Script Truck Master unavailable");
      if (!trucks.length) throw new Error("Apps Script Truck Master returned no trucks");
      return trucks;
    });
}

function applyPayrollTruckMaster(trucks) {
  payrollState.truckMaster = trucks;
  payrollState.truckMasterLoadFailed = false;
  writeJson(PAYROLL_TRUCK_MASTER_KEY, trucks);
  console.info("Payroll truck master loaded count", trucks.length);
  renderPayrollTruckPlateOptions();
  updatePayrollPersonsFromSources();
  applyPayrollTruckToHeader(false);
}

function renderPayrollTruckPlateOptions() {
  const list = $("payroll-truck-plates");
  if (!list) return;
  const group = normalizePayrollGroup($("group-category")?.value || "");
  const trucks = getPayrollTrucksForGroup(group);
  const plates = [...new Set(trucks.map(getPayrollTruckPlate).filter(Boolean))].sort();
  list.innerHTML = plates.map(plate => `<option value="${escapeAttr(plate)}"></option>`).join("");
  console.info("Payroll truck plate filter", {
    loadedCount: payrollState.truckMaster.length,
    selectedGroup: group || "All",
    filteredTruckCount: trucks.length,
    first5MatchedPlates: plates.slice(0, 5)
  });
  updatePayrollTruckMasterStatus(group, trucks.length);
}

function updatePayrollTruckMasterStatus(group, filteredCount) {
  const status = $("payroll-truck-master-status");
  if (!status) return;
  if (payrollState.truckMasterLoadFailed) {
    status.textContent = "Truck Master failed to load. Using manual plate input.";
    status.hidden = false;
    return;
  }
  if (group && payrollState.truckMaster.length && filteredCount === 0) {
    status.textContent = `No trucks found for ${group} in Truck Master.`;
    status.hidden = false;
    return;
  }
  status.textContent = "";
  status.hidden = true;
}

// ── Master data: persons ──────────────────────────────────────────────────────

function loadPayrollMasterData() {
  console.info("Payroll master data endpoint not connected yet. Using truck master and Supabase balance records for person name suggestions.");
  updatePayrollPersonsFromSources();
}

function updatePayrollPersonsFromSources() {
  const seen = new Map();
  payrollState.truckMaster.forEach(truck => {
    const driver = getPayrollTruckDriver(truck);
    const helper = getPayrollTruckHelper(truck);
    if (driver) seen.set(`${normalize(driver)}|Driver`, { name: driver, role: "Driver" });
    if (helper) seen.set(`${normalize(helper)}|Helper`, { name: helper, role: "Helper" });
  });
  Object.values(payrollState.balances).forEach(entry => {
    if (entry.personName && entry.role) {
      seen.set(`${normalize(entry.personName)}|${entry.role}`, { name: entry.personName, role: entry.role });
    }
  });
  payrollState.personsMaster = [...seen.values()];
  renderPayrollPersonOptions();
}

function renderPayrollPersonOptions() {
  const driverList = $("payroll-driver-names");
  const helperList = $("payroll-helper-names");
  const namesForRole = role => [...new Set(
    payrollState.personsMaster.filter(p => p.role === role).map(p => p.name)
  )].sort();
  if (driverList) driverList.innerHTML = namesForRole("Driver").map(n => `<option value="${escapeAttr(n)}"></option>`).join("");
  if (helperList) helperList.innerHTML = namesForRole("Helper").map(n => `<option value="${escapeAttr(n)}"></option>`).join("");
}

function getPersonBalance(personName, role) {
  if (!personName || !String(personName).trim()) return { balance: 0, exists: false };
  const key = `${normalize(personName)}|${role}`;
  const entry = payrollState.balances[key];
  if (!entry) return { balance: 0, exists: false };
  return { balance: parseNumber(entry.runningBalance), exists: true };
}

function setBalancePrevText(id, balance, exists) {
  const el = $(id);
  if (!el) return;
  if (!exists) {
    el.textContent = "₱0.00";
    el.className = "balance-no-record";
    el.title = "No existing balance record found for this person.";
  } else {
    el.textContent = formatCurrency(balance);
    el.className = "";
    el.title = "";
  }
}

function updatePersonNoteVisibility(inputId, noteId, role) {
  const input = $(inputId);
  const note = $(noteId);
  if (!input || !note) return;
  const name = input.value.trim();
  if (!name) { note.hidden = true; return; }
  const isKnown = payrollState.personsMaster.some(
    p => normalize(p.name) === normalize(name) && p.role === role
  );
  note.hidden = isKnown;
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
  applyRateMatrixToAllLines();
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
  return normalizePlateForCloud(truck?.Plate_Number || truck?.plate_number || truck?.plateNumber || truck?.plate || truck?.raw_data?.Plate_Number || truck?.raw_data?.plate_number || "");
}

function getPayrollTruckGroup(truck) {
  return normalizePayrollGroup(
    truck?.Group_Category ||
    truck?.group_category ||
    truck?.groupCategory ||
    truck?.Group ||
    truck?.group ||
    truck?.Category ||
    truck?.category ||
    truck?.Product_Line ||
    truck?.product_line ||
    truck?.Commodity ||
    truck?.commodity ||
    truck?.raw_data?.Group_Category ||
    truck?.raw_data?.group_category ||
    truck?.raw_data?.Product_Line ||
    truck?.raw_data?.Commodity ||
    ""
  );
}

function getPayrollTruckDriver(truck) {
  return String(truck?.Current_Driver_Name || truck?.current_driver_name || truck?.Current_Driver || truck?.Driver || truck?.driverName || truck?.driver_name || "").trim();
}

function getPayrollTruckHelper(truck) {
  return String(truck?.Current_Helper_Name || truck?.current_helper_name || truck?.Current_Helper || truck?.Helper || truck?.helperName || truck?.helper_name || "").trim();
}

function getPayrollTruckType(truck) {
  return String(truck?.Truck_Type || truck?.truck_type || truck?.truckType || truck?.Body_Type || truck?.bodyType || "").trim();
}

function normalizePayrollGroup(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  const compact = key.replace(/[^a-z0-9]/g, "");
  if (!key) return "";
  if (key === "bottle" || key === "bottles") return "Bottle";
  if (key === "sugar") return "Sugar";
  if (key === "preform" || key === "resin" || key === "preform / resin" || compact === "preformresin") return "Preform / Resin";
  if (key === "caps" || key === "crown" || key === "crowns" || key === "caps / crown" || key === "caps / crowns" || key === "caps & crown" || key === "caps & crowns" || compact === "capscrown" || compact === "capscrowns") return "Caps / Crown";
  if (key === "2go" || key === "2 go" || compact === "2go" || compact.includes("2go")) return "2GO";
  if (key.includes("unknown") || key.includes("update") || key.includes("other")) return "Other / Needs Update";
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

  const existing = findExistingPayrollRecordForSave();
  if (existing.id) payrollState.currentId = existing.id;
  const now = new Date().toISOString();
  const record = buildPayrollRecord(existing);
  record.status = $("payroll-status").value || "Draft";
  record.updatedAt = now;
  if (!record.createdAt) record.createdAt = now;

  payrollState.currentId = record.id;
  payrollState.records = payrollState.records.filter(item => !samePayrollRecord(item, record));
  payrollState.records.unshift(record);
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
  renderPayrollRecordsTable();
  renderForApprovalQueue();
  renderWarnings(headerWarnings.concat(payrollState.warnings));
  setStatus("Saved locally. Syncing to Supabase...", "info");
  const savePromise = savePayrollToSupabase(record)
    .then(() => savePayrollTripLinesToSupabase(record))
    .then(() => {
      console.log("Payroll save result", {
        payroll_id: record.payrollNumber || record.id,
        status: record.status,
        approvalStatus: record.approvalStatus,
        paymentStatus: record.paymentStatus
      });
      setStatus("Saved and synced to Supabase.", "success");
      return record;
    })
    .catch(supabaseError => {
      console.warn("Payroll Supabase save failed; trying Google Sheets fallback", supabaseError);
      return syncPayrollRecordToCloud(record)
        .then(() => {
          setStatus("Saved locally and synced to Google Sheets.", "success");
          return record;
        })
        .catch(error => {
          console.warn("Payroll cloud sync also failed", error);
          setStatus("Payroll cloud sync failed. Saved locally only.", "warning");
          throw error;
        });
    });
  payrollState.lastSavePromise = savePromise;
  return record;
}

function findExistingPayrollRecordForSave() {
  const currentId = String(payrollState.currentId || "").trim();
  const payrollNumber = String($("payroll-number")?.value || "").trim();
  return payrollState.records.find(record => {
    if (currentId && String(record.id || "").trim() === currentId) return true;
    if (payrollNumber && payrollIdentity(record) === payrollIdentity({ payrollNumber })) return true;
    return false;
  }) || {};
}

function savePayrollDraft() {
  $("payroll-status").value = "Draft";
  const record = savePayrollRecord();
  updateLockState();
  return record;
}

function reviewPasahodSummary() {
  calculatePayroll({ showWarnings: true });
  switchPayrollTab("pasahod-summary-tab");
  $("pasahod-summary-tab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("Review the Pasahod Summary before saving or submitting for approval.", "info");
}

function backToTripLines() {
  calculatePayroll();
  switchPayrollTab("encode-payroll-tab");
  $("encode-payroll-tab")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function submitPayrollForApproval() {
  console.log("Submit for Approval clicked");
  payrollState.hasSubmittedPayroll = true;
  const headerWarnings = validatePayrollHeader();
  if (headerWarnings.length) {
    console.warn("Submit for Approval blocked by header warnings", headerWarnings);
    renderWarnings(headerWarnings);
    setStatus("Complete required header fields before submitting.", "warning");
    return;
  }
  $("payroll-status").value = "For Approval";
  calculatePayroll({ showWarnings: true });
  const record = savePayrollRecord();
  const payrollId = record.payrollNumber || record.payroll_id || record.payrollId || record.id;
  const statusPayload = {
    status: "For Approval",
    approval_status: "Pending",
    payment_status: "Unpaid"
  };
  console.log("Submit for Approval payroll_id", payrollId);
  console.log("Submit for Approval update-status payload", statusPayload);
  updateLockState();
  setPasahodSubmitStatus("Submitting payroll for approval...", "info");
  Promise.resolve(payrollState.lastSavePromise)
    .then(saveResult => {
      console.log("Submit for Approval save result", saveResult);
      return updatePayrollStatusInWorker(payrollId, statusPayload);
    })
    .then(response => {
      console.log("Submit for Approval update-status response", response);
      record.status = "For Approval";
      record.approvalStatus = "Pending";
      record.paymentStatus = "Unpaid";
      payrollState.records = payrollState.records.map(item => samePayrollRecord(item, record) ? { ...item, ...record } : item);
      writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
      renderPayrollRecordsTable();
      renderApprovalPaymentCenter();
      const approvalCount = dedupePayrollRecords(payrollState.records).filter(isMotherApprovalRecord).length;
      console.log("Submit for Approval final local record status", {
        payroll_id: payrollId,
        status: record.status,
        approvalStatus: record.approvalStatus,
        paymentStatus: record.paymentStatus
      });
      console.log("Submit for Approval approval queue count after refresh", approvalCount);
      const successMessage = record.payrollNumber
        ? `Payroll ${record.payrollNumber} submitted for approval.`
        : "Payroll submitted for approval successfully.";
      setStatus(successMessage, "success");
      setPasahodSubmitStatus(successMessage, "success");
    })
    .catch(error => {
      console.error("Submit for Approval failed", error);
      setStatus("Submit for Approval failed. Please check console/network.", "error");
      setPasahodSubmitStatus("Submit for Approval failed. Please check console/network.", "error");
    });
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

function getLineRowTotal(line = {}) {
  return [
    "driverSalary", "helperSalary", "driverAllowance", "helperAllowance", "diesel",
    "tollFee", "passway", "parking", "lagayLoaded", "lagayEmpty", "mano",
    "vulcanize", "hugasTruck", "checkpoint", "otherExpenses"
  ].reduce((sum, field) => sum + parseNumber(line[field]), 0);
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
    tripDate: firstPresent(line.tripDate, line.trip_date, line.date) || "",
    shipmentNumber: firstPresent(line.shipmentNumber, line.shipment_number) || "",
    poNumber: firstPresent(line.poNumber, line.po_number) || "",
    vanNumber: line.vanNumber || "",
    containerNumber: firstPresent(line.containerNumber, line.container_number, line.vanNumber) || "",
    containerType: line.containerType || "",
    source: line.source || "",
    destination: line.destination || "",
    referenceNo: firstPresent(line.referenceNo, line.reference_no, line.shipmentNumber, line.shipment_number) || "",
    commodity: firstPresent(line.commodity, line.groupCommodity, line.group_commodity) || "",
    tripType: firstPresent(line.tripType, line.trip_type) || "",
    driverSalary: amountValue(firstPresent(line.driverSalary, line.driver_salary, line.bayadSaDriver, line.bayad_sa_driver)),
    helperSalary: amountValue(firstPresent(line.helperSalary, line.helper_salary, line.bayadSaHelper, line.bayad_sa_helper)),
    driverAllowance: amountValue(firstPresent(line.driverAllowance, line.allowance_driver)),
    helperAllowance: amountValue(firstPresent(line.helperAllowance, line.allowance_helper)),
    diesel: amountValue(line.diesel),
    costPerLiter: amountValue(firstPresent(line.costPerLiter, line.cost_per_liter, line.perLiter, line.per_liter)),
    tollFee: amountValue(firstPresent(line.tollFee, line.toll, line.toll_fee)),
    passway: amountValue(firstPresent(line.passway, line.passWay, line.pass_way)),
    parking: amountValue(line.parking),
    lagayLoaded: amountValue(firstPresent(line.lagayLoaded, line.lagay_loaded)),
    lagayEmpty: amountValue(firstPresent(line.lagayEmpty, line.lagay_empty)),
    luna: amountValue(line.luna),
    mano: amountValue(line.mano),
    timbang: amountValue(line.timbang),
    vulcanize: amountValue(line.vulcanize),
    hugasTruck: amountValue(firstPresent(line.hugasTruck, line.truck_wash, line.hugas_truck)),
    checkpoint: amountValue(line.checkpoint),
    otherExpenses: amountValue(firstPresent(line.otherExpenses, line.other_expenses)),
    budgetReleased: amountValue(line.budgetReleased),
    rowTotal: amountValue(line.rowTotal),
    rateId: line.rateId || line.rate_id || "",
    rateMatchStatus: line.rateMatchStatus || line.rate_match_status || "No Match",
    lineStatus: firstPresent(line.lineStatus, line.status) || "",
    sourceModule: firstPresent(line.sourceModule, line.source_module) || "",
    sourceFile: firstPresent(line.sourceFile, line.source_file) || "",
    encodedBy: firstPresent(line.encodedBy, line.encoded_by) || "",
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
    line.rowTotal = getLineRowTotal(line);
    totals.totalTrips += 1;
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
    totals.totalRowAmount += parseNumber(line.rowTotal);
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
  renderPayrollBalanceSection();
  renderWarnings(validatePayrollHeader().concat(payrollState.warnings));
  return totals;
}

function renderCalculationSummary() {
  const totals = payrollState.totals || getEmptyTotals();
  const quickItems = [
    ["Total Trips", totals.totalTrips, "count"],
    ["Total Budget Released", getCurrentTotalBudgetReleased(totals)],
    ["Total Driver Salary", totals.totalDriverSalary],
    ["Total Helper Salary", totals.totalHelperSalary],
    ["Diesel Total", totals.totalDiesel],
    ["Total Bali", getCurrentTotalBali(totals)],
    ["Total Allowances", totals.totalDriverAllowance + totals.totalHelperAllowance],
    ["Total Expenses", totals.totalExpenses],
    ["Row Total", totals.totalRowAmount]
  ];
  const pasahodItems = [
    ["Driver Name", $("driver-name")?.value || "-", "text"],
    ["Helper Name", $("helper-name")?.value || "-", "text"],
    ["Driver Bali", totals.driverDeduction],
    ["Helper Bali", totals.helperDeduction],
    ["Total Bali", getCurrentTotalBali(totals)],
    ["Total Budget Released", getCurrentTotalBudgetReleased(totals)],
    ["Total Expenses", totals.totalExpenses],
    ["Total Payable", parseNumber(totals.driverNetPay) + parseNumber(totals.helperNetPay)]
  ];
  const renderItems = items => items.map(([label, value, kind]) => `
    <div class="payroll-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${kind === "count" || kind === "text" ? escapeHtml(String(value || (kind === "text" ? "-" : 0))) : formatCurrency(value)}</strong>
    </div>
  `).join("");
  $("calculation-summary").innerHTML = renderItems(quickItems);
  const pasahodBudgetSummary = $("pasahod-budget-summary");
  if (pasahodBudgetSummary) pasahodBudgetSummary.innerHTML = renderItems(pasahodItems);
}

function getCurrentTotalBali(totals = payrollState.totals || getEmptyTotals()) {
  return parseNumber(totals.driverDeduction) + parseNumber(totals.helperDeduction);
}

function getCurrentTotalBudgetReleased(totals = payrollState.totals || getEmptyTotals()) {
  return parseNumber(totals.totalBudgetReleased) ||
    (parseNumber(totals.totalExpenses) + parseNumber(totals.driverNetPay) + parseNumber(totals.helperNetPay));
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
  setText("driver-summary-name", $("driver-name")?.value ? `— ${$("driver-name").value}` : "");
  setText("helper-summary-name", $("helper-name")?.value ? `— ${$("helper-name").value}` : "");
  renderPayrollTripEarningsBreakdown();
}

function renderPayrollTripEarningsBreakdown() {
  const target = $("payroll-trip-earnings-breakdown");
  if (!target) return;
  const rows = buildPayrollRouteBreakdown(payrollState.lines);

  if (!rows.length) {
    target.innerHTML = '<p class="payroll-trip-empty">No trip earnings yet. Add trip lines in Encode Payroll / Pasahod 2.</p>';
    return;
  }

  const totals = rows.reduce((sum, row) => {
    sum.tripCount += row.tripCount;
    sum.driverSalary += row.driverSalary;
    sum.driverAllowance += row.driverAllowance;
    sum.helperSalary += row.helperSalary;
    sum.helperAllowance += row.helperAllowance;
    sum.diesel += row.diesel;
    sum.toll += row.toll;
    sum.otherExpenses += row.otherExpenses;
    sum.routeExpenses += row.routeExpenses;
    return sum;
  }, {
    tripCount: 0,
    driverSalary: 0,
    driverAllowance: 0,
    helperSalary: 0,
    helperAllowance: 0,
    diesel: 0,
    toll: 0,
    otherExpenses: 0,
    routeExpenses: 0
  });

  target.innerHTML = `
    <div class="payroll-trip-breakdown-table-wrap">
      <table class="payroll-trip-breakdown-table">
        <thead>
          <tr>
            <th>Route</th>
            <th>Trips</th>
            <th>Driver Salary Total</th>
            <th>Helper Salary Total</th>
            <th>Driver Allowance Total</th>
            <th>Helper Allowance Total</th>
            <th>Diesel Total</th>
            <th>Toll Total</th>
            <th>Other Expenses Total</th>
            <th>Total Route Expenses</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td data-label="Route">${escapeHtml(row.route)}</td>
              <td data-label="Trips">${escapeHtml(String(row.tripCount))}</td>
              <td data-label="Driver Salary Total">${formatCurrency(row.driverSalary)}</td>
              <td data-label="Helper Salary Total">${formatCurrency(row.helperSalary)}</td>
              <td data-label="Driver Allowance Total">${formatCurrency(row.driverAllowance)}</td>
              <td data-label="Helper Allowance Total">${formatCurrency(row.helperAllowance)}</td>
              <td data-label="Diesel Total">${formatCurrency(row.diesel)}</td>
              <td data-label="Toll Total">${formatCurrency(row.toll)}</td>
              <td data-label="Other Expenses Total">${formatCurrency(row.otherExpenses)}</td>
              <td data-label="Total Route Expenses"><strong>${formatCurrency(row.routeExpenses)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>${escapeHtml(String(totals.tripCount))}</td>
            <td>${formatCurrency(totals.driverSalary)}</td>
            <td>${formatCurrency(totals.helperSalary)}</td>
            <td>${formatCurrency(totals.driverAllowance)}</td>
            <td>${formatCurrency(totals.helperAllowance)}</td>
            <td>${formatCurrency(totals.diesel)}</td>
            <td>${formatCurrency(totals.toll)}</td>
            <td>${formatCurrency(totals.otherExpenses)}</td>
            <td>${formatCurrency(totals.routeExpenses)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function buildPayrollRouteBreakdown(lines = []) {
  const grouped = new Map();
  (lines || []).filter(line => !isLineBlank(line)).forEach(line => {
    const route = formatPayrollRoute(line);
    const tripType = String(line.tripType || "").trim();
    const key = [normalize(route), normalize(tripType)].join("|");
    if (!grouped.has(key)) {
      grouped.set(key, {
        route: tripType ? `${route} (${tripType})` : route,
        tripCount: 0,
        driverSalary: 0,
        helperSalary: 0,
        driverAllowance: 0,
        helperAllowance: 0,
        diesel: 0,
        toll: 0,
        otherExpenses: 0,
        routeExpenses: 0
      });
    }
    const row = grouped.get(key);
    const otherExpenses = parseNumber(line.passway) + parseNumber(line.parking) + getOtherExpenseTotal(line);
    row.tripCount += 1;
    row.driverSalary += parseNumber(line.driverSalary);
    row.helperSalary += parseNumber(line.helperSalary);
    row.driverAllowance += parseNumber(line.driverAllowance);
    row.helperAllowance += parseNumber(line.helperAllowance);
    row.diesel += parseNumber(line.diesel);
    row.toll += parseNumber(line.tollFee);
    row.otherExpenses += otherExpenses;
    row.routeExpenses += parseNumber(line.driverSalary) + parseNumber(line.helperSalary) +
      parseNumber(line.driverAllowance) + parseNumber(line.helperAllowance) +
      parseNumber(line.diesel) + parseNumber(line.tollFee) + otherExpenses;
  });
  return [...grouped.values()].sort((a, b) => a.route.localeCompare(b.route));
}

function formatPayrollRoute(line = {}) {
  const source = String(line.source || "").trim();
  const destination = String(line.destination || "").trim();
  if (source && destination) return `${source} → ${destination}`;
  return source || destination || "-";
}

function formatPayrollTripDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH");
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

function normalizeRateKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function findPayrollRateMatch(line = {}) {
  const group = normalizeRateKey($("group-category")?.value || "");
  const source = normalizeRateKey(line.source);
  const destination = normalizeRateKey(line.destination);
  const truckType = normalizeRateKey(payrollState.selectedTruckType || getPayrollTruckType(getPayrollTruckInfoByPlate($("plate-number")?.value || "")));
  if (!source || !destination) return null;
  return payrollState.rateMatrix.find(rate => {
    if (rate.active === false) return false;
    const rateGroup = normalizeRateKey(rate.groupCategory || rate.group_category);
    const rateSource = normalizeRateKey(rate.source);
    const rateDestination = normalizeRateKey(rate.destination);
    const rateTruckType = normalizeRateKey(rate.truckType || rate.truck_type);
    return (!rateGroup || !group || rateGroup === group) &&
      rateSource === source &&
      rateDestination === destination &&
      (!rateTruckType || !truckType || rateTruckType === truckType);
  }) || null;
}

function applyRateMatrixToLine(line = {}, options = {}) {
  if (line.rateMatchStatus === "Manual" && !options.force) return false;
  const rate = findPayrollRateMatch(line);
  if (!rate) {
    line.rateId = "";
    line.rateMatchStatus = line.source && line.destination ? "No Match" : "";
    line.rowTotal = getLineRowTotal(line);
    return false;
  }
  line.driverSalary = parseNumber(rate.driverSalary ?? rate.driver_salary);
  line.helperSalary = parseNumber(rate.helperSalary ?? rate.helper_salary);
  line.tollFee = parseNumber(rate.defaultToll ?? rate.default_toll);
  line.passway = parseNumber(rate.defaultPassway ?? rate.default_passway);
  line.parking = parseNumber(rate.defaultParking ?? rate.default_parking);
  line.lagayLoaded = parseNumber(rate.defaultLagayLoaded ?? rate.default_lagay_loaded);
  line.lagayEmpty = parseNumber(rate.defaultLagayEmpty ?? rate.default_lagay_empty);
  line.mano = parseNumber(rate.defaultMano ?? rate.default_mano);
  line.driverAllowance = parseNumber(rate.defaultAllowanceDriver ?? rate.default_allowance_driver);
  line.helperAllowance = parseNumber(rate.defaultAllowanceHelper ?? rate.default_allowance_helper);
  line.otherExpenses = parseNumber(rate.defaultOtherExpenses ?? rate.default_other_expenses);
  line.rateId = rate.rateId || rate.rate_id || "";
  line.rateMatchStatus = "Matched";
  line.rowTotal = getLineRowTotal(line);
  console.log("Payroll rate matched from lane input", { source: line.source, destination: line.destination, rate });
  return true;
}

function updateMatchedLineCells(line) {
  const matchFields = [
    "driverSalary", "helperSalary", "tollFee", "passway", "parking",
    "lagayLoaded", "lagayEmpty", "mano", "driverAllowance", "helperAllowance",
    "otherExpenses", "rateMatchStatus", "rowTotal"
  ];
  matchFields.forEach(field => {
    const el = document.querySelector(`[data-id="${line.id}"][data-field="${field}"]`);
    if (!el) return;
    const v = field === "rateMatchStatus"
      ? normalizePayrollRateMatchStatus(line[field])
      : (isLineBlank(line) && el.type === "number" ? "" : (line[field] ?? ""));
    if (String(el.value) !== String(v)) el.value = v;
  });
  const anyEl = document.querySelector(`[data-id="${line.id}"]`);
  const issuesCell = anyEl?.closest("tr")?.querySelector(".payroll-line-issues");
  if (issuesCell) issuesCell.innerHTML = renderPayrollLineIssues(line);
}

function applyRateMatrixToAllLines() {
  payrollState.lines.forEach(line => applyRateMatrixToLine(line));
  renderLinesTable(false);
  calculatePayroll();
}

function normalizePayrollRateRecord(rate = {}) {
  return {
    ...rate,
    rateId: rate.rateId || rate.rate_id || "",
    groupCategory: rate.groupCategory || rate.group_category || "",
    truckType: rate.truckType || rate.truck_type || "",
    driverSalary: parseNumber(rate.driverSalary ?? rate.driver_salary),
    helperSalary: parseNumber(rate.helperSalary ?? rate.helper_salary),
    defaultToll: parseNumber(rate.defaultToll ?? rate.default_toll),
    defaultPassway: parseNumber(rate.defaultPassway ?? rate.default_passway),
    defaultParking: parseNumber(rate.defaultParking ?? rate.default_parking),
    defaultLagayLoaded: parseNumber(rate.defaultLagayLoaded ?? rate.default_lagay_loaded),
    defaultLagayEmpty: parseNumber(rate.defaultLagayEmpty ?? rate.default_lagay_empty),
    defaultMano: parseNumber(rate.defaultMano ?? rate.default_mano),
    defaultAllowanceDriver: parseNumber(rate.defaultAllowanceDriver ?? rate.default_allowance_driver),
    defaultAllowanceHelper: parseNumber(rate.defaultAllowanceHelper ?? rate.default_allowance_helper),
    defaultOtherExpenses: parseNumber(rate.defaultOtherExpenses ?? rate.default_other_expenses),
    active: rate.active !== false
  };
}

function loadPayrollRateMatrix() {
  fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/rates?limit=1000`)
    .then(response => response.json())
    .then(data => {
      if (!data?.ok || !Array.isArray(data.rates)) throw new Error(data?.error || "Rate matrix unavailable");
      payrollState.rateMatrix = data.rates.map(normalizePayrollRateRecord);
      console.log("Payroll rates loaded", payrollState.rateMatrix);
      renderPayrollLaneDatalists(getActivePayrollLaneSource());
      applyRateMatrixToAllLines();
      setStatus(`Loaded ${payrollState.rateMatrix.length} payroll rate${payrollState.rateMatrix.length === 1 ? "" : "s"}.`, "success");
    })
    .catch(error => {
      console.warn("Payroll rate matrix load failed", error);
      payrollState.rateMatrix = [];
    });
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
  const warnings = getPayrollTripLineIssues(line, {
    showRequired: payrollState.hasCalculatedPayroll || payrollState.hasSubmittedPayroll
  });
  if (isLineBlank(line)) return warnings;

  const rateStatus = normalizePayrollRateMatchStatus(line.rateMatchStatus);
  if (isDuplicateTrip(line)) warnings.push("Possible duplicate trip.");
  if (rateStatus === "Matched" || rateStatus === "Manual") return warnings;
  const rule = matchSalaryRule(line);
  if (!rule) return warnings;

  compareRuleAmount(warnings, "Driver salary", line.driverSalary, rule.driverSalary);
  compareRuleAmount(warnings, "Helper salary", line.helperSalary, rule.helperSalary);
  compareRuleAmount(warnings, "Driver allowance", line.driverAllowance, rule.driverAllowance);
  compareRuleAmount(warnings, "Helper allowance", line.helperAllowance, rule.helperAllowance);
  compareAllowedAmount(warnings, "Diesel", line.diesel, rule.allowedDiesel);
  compareAllowedAmount(warnings, "Toll", line.tollFee, rule.allowedToll);
  compareAllowedAmount(warnings, "Parking", line.parking, rule.allowedParking);
  compareAllowedAmount(warnings, "Passway", line.passway, rule.allowedPassway);

  return warnings;
}

function getPayrollTripLineIssues(line = {}, options = {}) {
  const issues = [];
  const hasUserInput = !isLineBlank(line);
  const showRequired = Boolean(options.showRequired || hasUserInput);
  const rateStatus = normalizePayrollRateMatchStatus(line.rateMatchStatus);
  if (showRequired && !line.tripDate) issues.push("Missing date");
  if (showRequired && !String(line.source || "").trim()) issues.push("Missing source");
  if (showRequired && !String(line.destination || "").trim()) issues.push("Missing destination");
  if (String(line.source || "").trim() && String(line.destination || "").trim() && rateStatus === "No Match") issues.push("No rate");
  console.log("Payroll trip row issues", { lineId: line.id, issues });
  return issues;
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
  const textFields = ["tripDate", "poNumber", "referenceNo", "shipmentNumber", "containerNumber", "vanNumber", "containerType", "source", "destination", "commodity", "tripType", "lineStatus", "sourceFile", "remarks"];
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

function getBudgetBalanceDraftData(record = {}) {
  const raw = record.rawData || record.raw_data || {};
  if (raw?.source === "Budget Balance") return raw;
  if (raw?.raw_data?.source === "Budget Balance") return raw;
  if (record.source === "Budget Balance") return raw;
  return null;
}

function getBudgetBalanceDraftDetail(raw = {}) {
  return raw?.raw_data && typeof raw.raw_data === "object" ? raw.raw_data : raw;
}

function isBudgetBalanceDraft(record = {}) {
  const status = normalize(getSavedPayrollDisplayStatus(record) || record.status);
  return status === "draft" && !!getBudgetBalanceDraftData(record);
}

function formatDraftDate(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? escapeHtml(text) : escapeHtml(date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }));
}

function getDraftRouteLabel(line = {}) {
  const source = line.source || line.Source || "";
  const destination = line.destination || line.Destination || "";
  if (source && destination) return `${source} \u2192 ${destination}`;
  return line.route || line.Route || "No route data yet";
}

function getDraftRouteBreakdown(raw = {}) {
  const detail = getBudgetBalanceDraftDetail(raw);
  if (Array.isArray(detail.route_breakdown) && detail.route_breakdown.length) return detail.route_breakdown;
  const map = new Map();
  (detail.route_lines || raw.route_lines || []).forEach(line => {
    const route = getDraftRouteLabel(line);
    if (!map.has(route)) map.set(route, { route, count: 0, dates: [], driverTotal: 0, helperTotal: 0 });
    const item = map.get(route);
    item.count += 1;
    item.driverTotal += parseNumber(line.driverSalary ?? line.driver_salary);
    item.helperTotal += parseNumber(line.helperSalary ?? line.helper_salary);
    const date = line.tripDate || line.trip_date || line.date || "";
    const formatted = formatDraftDate(date);
    if (formatted !== "-" && !item.dates.includes(formatted)) item.dates.push(formatted);
  });
  return [...map.values()];
}

function renderDraftRouteBreakdown(raw = {}) {
  const allRows = getDraftRouteBreakdown(raw);
  const rows = allRows.filter(r => {
    const label = (r.route || "").trim();
    if (!label || label === "No route data yet" || label.toLowerCase().includes("route needed")) return false;
    if (parseNumber(r.driverTotal) === 0 && parseNumber(r.helperTotal) === 0) return false;
    return true;
  });
  return `
    <section class="payroll-budget-draft-section">
      <h4>Route Breakdown</h4>
      <div class="payroll-budget-route-list">
        ${rows.length ? rows.map(row => `
          <div>
            <strong>${escapeHtml(row.route || "No route data yet")}</strong>
            <span>${escapeHtml((row.dates || []).join(", ") || "-")} | ${parseNumber(row.count) || 0} ${(parseNumber(row.count) || 0) === 1 ? "trip" : "trips"} | Driver ${formatCurrency(row.driverTotal)} | Helper ${formatCurrency(row.helperTotal)}</span>
          </div>
        `).join("") : `<p>No route preview saved.</p>`}
      </div>
    </section>
  `;
}

function payrollDraftValue(record = {}, raw = {}, rawKey, recordKey) {
  const detail = getBudgetBalanceDraftDetail(raw);
  return raw[rawKey] ?? detail[rawKey] ?? record[recordKey] ?? 0;
}

function renderBudgetBalanceDraftComputation(title, rows) {
  return `
    <article class="payroll-budget-computation-card">
      <h4>${escapeHtml(title)}</h4>
      ${rows.map(row => `
        <div>
          <span>${escapeHtml(row.label)}</span>
          <strong>${formatCurrency(row.value)}</strong>
        </div>
      `).join("")}
    </article>
  `;
}

function renderBudgetBalanceDraftTruckMoney(raw = {}) {
  const detail = getBudgetBalanceDraftDetail(raw);
  const fmt = v => (v != null && v !== "") ? formatCurrency(parseNumber(v)) : "-";
  const pick = (...keys) => { for (const k of keys) { const v = raw[k] ?? detail[k]; if (v != null) return v; } return null; };
  const driverCA = parseNumber(raw.driver_cash_advance_balance ?? detail.driver_cash_advance_balance);
  const helperCA = parseNumber(raw.helper_cash_advance_balance ?? detail.helper_cash_advance_balance);
  const baliCA = pick("total_bali_cash_advance") ??
    ((raw.driver_cash_advance_balance ?? detail.driver_cash_advance_balance) != null ? driverCA + helperCA : null);
  const fields = [
    { label: "Total Trip Budget", value: pick("total_trip_budget", "open_trip_budget") },
    { label: "Total Diesel PO", value: pick("total_diesel_po", "open_diesel_po") },
    { label: "Total Bali / Cash Advance", value: baliCA },
    { label: "Total Released", value: pick("total_released") },
    { label: "Still For Clearing", value: pick("still_for_clearing") },
  ];
  return fields.map(f =>
    `<div class="payroll-budget-truck-money-card"><span>${escapeHtml(f.label)}</span><strong>${fmt(f.value)}</strong></div>`
  ).join("");
}

function updatePayrollDraftSummary(record = null) {
  const el = $("payroll-draft-money-summary");
  if (!el) return;
  if (!record || !isBudgetBalanceDraft(record)) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const raw = getBudgetBalanceDraftData(record) || {};
  const detail = getBudgetBalanceDraftDetail(raw);
  const pick = (...keys) => { for (const k of keys) { const v = raw[k] ?? detail[k]; if (v != null) return v; } return null; };
  const fmt = v => (v != null && v !== "") ? formatCurrency(parseNumber(v)) : "-";
  const driverCA = parseNumber(raw.driver_cash_advance_balance ?? detail.driver_cash_advance_balance);
  const helperCA = parseNumber(raw.helper_cash_advance_balance ?? detail.helper_cash_advance_balance);
  const baliCA = pick("total_bali_cash_advance") ??
    ((raw.driver_cash_advance_balance ?? detail.driver_cash_advance_balance) != null ? driverCA + helperCA : null);
  const cards = [
    { label: "Trip Budget", value: pick("total_trip_budget", "open_trip_budget") },
    { label: "Diesel PO", value: pick("total_diesel_po", "open_diesel_po") },
    { label: "Bali / CA", value: baliCA },
    { label: "Driver Take-home", value: pick("driver_take_home") },
    { label: "Helper Take-home", value: pick("helper_take_home") },
  ];
  el.innerHTML = `<span class="payroll-draft-summary-label">Budget Balance Draft</span>${
    cards.map(c => `<div class="payroll-draft-summary-card"><span>${escapeHtml(c.label)}</span><strong>${fmt(c.value)}</strong></div>`).join("")
  }`;
  el.hidden = false;
}

function renderBudgetBalanceDraftCard(record = {}) {
  const raw = getBudgetBalanceDraftData(record) || {};
  const detail = getBudgetBalanceDraftDetail(raw);
  const plate = detail.plate_number || raw.plate_number || record.plateNumber || "";
  const group = detail.group_category || raw.group_category || record.groupCategory || "";
  const driver = detail.driver_name || raw.driver_name || record.driverName || "";
  const helper = detail.helper_name || raw.helper_name || record.helperName || "";
  const payrollId = getPayrollRecordLookupId(record);
  return `
    <tr id="draft-card-${escapeAttr(payrollId)}" class="payroll-budget-draft-row" hidden>
      <td colspan="11">
        <article class="payroll-budget-draft-card">
          <div class="payroll-budget-draft-head">
            <div>
              <span>Payroll Draft</span>
              <h3>Plate: ${escapeHtml(plate || "-")}</h3>
              <p>Group: ${escapeHtml(group || "-")} | Driver: ${escapeHtml(driver || "-")} | Helper: ${escapeHtml(helper || "-")} | Status: Draft</p>
            </div>
            <div class="payroll-budget-draft-head-actions">
              <button type="button" data-action="toggle-draft" data-payroll-id="${escapeAttr(payrollId)}" class="payroll-draft-hide-btn">Hide Details</button>
              <button type="button" data-action="draft-finalize-placeholder" data-payroll-id="${escapeAttr(payrollId)}">Finalize Payroll</button>
            </div>
          </div>
          ${renderDraftRouteBreakdown(raw)}
          <div class="payroll-budget-truck-money-grid">
            ${renderBudgetBalanceDraftTruckMoney(raw)}
          </div>
          <div class="payroll-budget-computation-grid">
            ${renderBudgetBalanceDraftComputation("Driver Computation", [
              { label: "Gross", value: payrollDraftValue(record, raw, "driver_gross", "driver_gross") || record.totals?.totalDriverSalary },
              { label: "Cash Advance", value: payrollDraftValue(record, raw, "driver_cash_advance_balance", "driver_cash_advance_balance") },
              { label: "Suggested Deduction", value: payrollDraftValue(record, raw, "suggested_driver_deduction", "suggested_driver_deduction") },
              { label: "Take-home", value: payrollDraftValue(record, raw, "driver_take_home", "driver_take_home") || record.totals?.driverNetPay }
            ])}
            ${renderBudgetBalanceDraftComputation("Helper Computation", [
              { label: "Gross", value: payrollDraftValue(record, raw, "helper_gross", "helper_gross") || record.totals?.totalHelperSalary },
              { label: "Cash Advance", value: payrollDraftValue(record, raw, "helper_cash_advance_balance", "helper_cash_advance_balance") },
              { label: "Suggested Deduction", value: payrollDraftValue(record, raw, "suggested_helper_deduction", "suggested_helper_deduction") },
              { label: "Take-home", value: payrollDraftValue(record, raw, "helper_take_home", "helper_take_home") || record.totals?.helperNetPay }
            ])}
          </div>
          <p class="payroll-budget-draft-note">${escapeHtml(detail.preview_warning || "Draft only - review before finalizing.")}</p>
        </article>
      </td>
    </tr>
  `;
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
  const displayRecords = dedupePayrollRecords(payrollState.records);
  const rows = displayRecords.filter(record => {
    if (filters.status && getSavedPayrollDisplayStatus(record) !== filters.status) return false;
    if (filters.group && record.groupCategory !== filters.group) return false;
    if (filters.plate && !normalize(record.plateNumber).includes(filters.plate)) return false;
    if (filters.driver && !normalize(record.driverName).includes(filters.driver)) return false;
    if (filters.payrollDate && record.payrollDate !== filters.payrollDate) return false;
    return true;
  });

  recordsBody.innerHTML = rows.length ? rows.map(record => `
    <tr class="payroll-saved-record-row" data-payroll-id="${escapeAttr(getPayrollRecordLookupId(record))}" tabindex="0" aria-label="Open payroll details for ${escapeAttr(record.payrollNumber || record.id || "record")}">
      <td>${escapeHtml(record.payrollDate)}</td>
      <td>${escapeHtml(record.plateNumber)}</td>
      <td>${escapeHtml(record.driverName)}</td>
      <td>${escapeHtml(record.helperName)}</td>
      <td>${statusBadge(getSavedPayrollDisplayStatus(record))}</td>
      <td>${statusBadge(record.approvalStatus || getSavedPayrollDisplayStatus(record))}</td>
      <td>${statusBadge(record.paymentStatus || "Unpaid")}</td>
      <td>${formatCurrency(record.totals?.totalExpenses)}</td>
      <td>${formatCurrency(record.totals?.driverNetPay)}</td>
      <td>${formatCurrency(record.totals?.helperNetPay)}</td>
    </tr>
  `).join("") : `<tr><td colspan="10" class="empty-table">No payroll records yet.</td></tr>`;
  const localFallbackCount = rows.filter(isLocalFallbackPayrollRecord).length;
  const statusEl = $("payroll-records-load-status");
  if (statusEl) {
    statusEl.textContent = localFallbackCount
      ? `Showing ${rows.length} saved payroll records, including ${localFallbackCount} local fallback records.`
      : `Showing ${rows.length} saved payroll records.`;
  }
  renderForApprovalQueue();
  renderApprovalPaymentCenter();
}

function dedupePayrollRecords(records = []) {
  const byIdentity = new Map();
  records.forEach(record => {
    const identity = payrollIdentity(record);
    if (!identity) return;
    const current = byIdentity.get(identity);
    byIdentity.set(identity, pickPreferredPayrollRecord(current, record));
  });
  return [...byIdentity.values()];
}

function pickPreferredPayrollRecord(current, candidate) {
  if (!current) return candidate;
  const currentIsCloud = isSupabasePayrollRecord(current);
  const candidateIsCloud = isSupabasePayrollRecord(candidate);
  if (candidateIsCloud && !currentIsCloud) return candidate;
  if (currentIsCloud && !candidateIsCloud) return current;
  const currentTime = Date.parse(current.updatedAt || current.createdAt || "") || 0;
  const candidateTime = Date.parse(candidate.updatedAt || candidate.createdAt || "") || 0;
  return candidateTime >= currentTime ? candidate : current;
}

function isSupabasePayrollRecord(record = {}) {
  return Boolean(record.supabaseId || record.source === "supabase");
}

function isLocalFallbackPayrollRecord(record = {}) {
  return !isSupabasePayrollRecord(record);
}

function renderPayrollDetailsModal(record = {}, lines = []) {
  const payrollId = getPayrollRecordLookupId(record);
  const coverage = getPayrollCoverage(record);
  const totals = getPayrollDetailTotals(record, lines);
  const paymentStatus = record.paymentStatus || record.Payment_Status || record.approval?.paymentStatus || "Unpaid";
  return `
    <div class="detail-block approval-detail-grid payroll-details-summary-grid">
      ${approvalDetailItem("Payroll ID", record.payrollNumber || record.id)}
      ${approvalDetailItem("Plate Number", record.plateNumber)}
      ${approvalDetailItem("Driver", record.driverName)}
      ${approvalDetailItem("Helper", record.helperName)}
      ${approvalDetailItem("Group", record.groupCategory)}
      ${approvalDetailItem("Payroll Date", record.payrollDate)}
      ${approvalDetailItem("Coverage", coverage.summary)}
      ${approvalDetailItem("Status", getSavedPayrollDisplayStatus(record))}
      ${approvalDetailItem("Approval Status", record.approvalStatus || getSavedPayrollDisplayStatus(record))}
      ${approvalDetailItem("Payment Status", paymentStatus)}
      ${approvalDetailItem("Total Expenses", formatCurrency(totals.totalExpenses))}
      ${approvalDetailItem("Driver Net Pay", formatCurrency(totals.driverNetPay))}
      ${approvalDetailItem("Helper Net Pay", formatCurrency(totals.helperNetPay))}
      ${approvalDetailItem("Driver Bali", `${formatCurrency(totals.driverBaliBalance)}${totals.driverBaliRecorded ? "" : " / No recorded bali"}`)}
      ${approvalDetailItem("Helper Bali", `${formatCurrency(totals.helperBaliBalance)}${totals.helperBaliRecorded ? "" : " / No recorded bali"}`)}
      ${approvalDetailItem("Total Bali", formatCurrency(totals.totalBali))}
      ${approvalDetailItem("Total Budget Released", formatCurrency(totals.totalBudgetReleased))}
      ${approvalDetailItem("Total Payable", formatCurrency(totals.totalSalaryPayable))}
    </div>
    <div class="payroll-detail-tabs" role="tablist" aria-label="Payroll detail sections">
      <button type="button" class="payroll-detail-tab-button active" data-detail-tab="trip-lines" role="tab" aria-selected="true">Trip Lines / Budget</button>
      <button type="button" class="payroll-detail-tab-button" data-detail-tab="salary-summary" role="tab" aria-selected="false">Salary Summary</button>
    </div>
    <section class="payroll-detail-tab-panel active" data-detail-panel="trip-lines" role="tabpanel">
      ${renderPayrollRouteBreakdownForDetails(lines)}
      ${renderPayrollTripLineDetailsTable(lines)}
    </section>
    <section class="payroll-detail-tab-panel" data-detail-panel="salary-summary" role="tabpanel" hidden>
      ${renderPayrollSalarySummary(record, totals, coverage, paymentStatus)}
    </section>
    <div class="payroll-details-footer">
      <button type="button" data-modal-action="view" data-payroll-id="${escapeAttr(payrollId)}">View/Edit</button>
      <button type="button" data-modal-action="delete" data-payroll-id="${escapeAttr(payrollId)}" class="danger-outline">Delete</button>
      <button type="button" data-modal-action="close">Close</button>
    </div>
  `;
}

function renderPayrollTripLineDetailsTable(lines = []) {
  return `
    <div class="detail-block">
      <div class="payroll-table-wrap payroll-details-table-wrap">
        <table class="payroll-table payroll-record-details-table">
          <thead>
            <tr>
              <th>Date</th><th>Source</th><th>Destination</th><th>Reference No.</th><th>PO Number</th><th>Shipment Number</th><th>Container Number</th><th>Trip Type</th><th>Diesel</th><th>Per Liter</th><th>Driver Salary</th><th>Helper Salary</th><th>Toll Fee</th><th>Passway</th><th>Parking</th><th>Lagay Loaded</th><th>Lagay Empty</th><th>Mano</th><th>Timbang</th><th>Luna</th><th>Vulcanize</th><th>Driver Allowance</th><th>Helper Allowance</th><th>Hugas Truck</th><th>Checkpoint</th><th>Other Expenses</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>${renderSavedPayrollTripLines(lines)}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPayrollRouteBreakdownForDetails(lines = []) {
  const rows = buildPayrollRouteBreakdown(lines);
  if (!rows.length) return "";
  return `
    <div class="payroll-route-review-wrap">
      <table class="payroll-route-review-table">
        <thead>
          <tr>
            <th>Route</th><th>Trips</th><th>Driver Salary</th><th>Helper Salary</th><th>Driver Allowance</th><th>Helper Allowance</th><th>Diesel</th><th>Toll</th><th>Other Expenses</th><th>Total Route Expenses</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHtml(row.route)}</td>
              <td>${escapeHtml(String(row.tripCount))}</td>
              <td>${formatCurrency(row.driverSalary)}</td>
              <td>${formatCurrency(row.helperSalary)}</td>
              <td>${formatCurrency(row.driverAllowance)}</td>
              <td>${formatCurrency(row.helperAllowance)}</td>
              <td>${formatCurrency(row.diesel)}</td>
              <td>${formatCurrency(row.toll)}</td>
              <td>${formatCurrency(row.otherExpenses)}</td>
              <td><strong>${formatCurrency(row.routeExpenses)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPayrollBudgetCard(label, value, note = "") {
  return `
    <article class="payroll-details-budget-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Not set")}</strong>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </article>
  `;
}

function renderPayrollSalarySummary(record = {}, totals = {}, coverage = {}, paymentStatus = "Unpaid") {
  return `
    <div class="payroll-salary-summary-grid">
      ${renderPayrollSalaryTable("Driver", [
        ["Name", record.driverName || "Not set"],
        ["Gross Salary", formatCurrency(totals.totalDriverSalary)],
        ["Driver Allowance", formatCurrency(totals.totalDriverAllowance)],
        ["Bali / Deduction", formatCurrency(totals.driverDeduction || totals.driverBaliBalance), totals.driverBaliRecorded || totals.driverDeduction ? "" : "No recorded bali"],
        ["Net Pay", formatCurrency(totals.driverNetPay)]
      ])}
      ${renderPayrollSalaryTable("Helper", [
        ["Name", record.helperName || "Not set"],
        ["Gross Salary", formatCurrency(totals.totalHelperSalary)],
        ["Helper Allowance", formatCurrency(totals.totalHelperAllowance)],
        ["Bali / Deduction", formatCurrency(totals.helperDeduction || totals.helperBaliBalance), totals.helperBaliRecorded || totals.helperDeduction ? "" : "No recorded bali"],
        ["Net Pay", formatCurrency(totals.helperNetPay)]
      ])}
      ${renderPayrollSalaryTable("Combined Payment Summary", [
        ["Plate Number", record.plateNumber || "Not set"],
        ["Payroll ID", record.payrollNumber || record.id || "Not set"],
        ["Coverage", coverage.summary || "Not set"],
        ["Total Driver Net Pay", formatCurrency(totals.driverNetPay)],
        ["Total Helper Net Pay", formatCurrency(totals.helperNetPay)],
        ["Total Payable", formatCurrency(totals.totalSalaryPayable)],
        ["Payment Status", paymentStatus || "Unpaid"]
      ], "wide")}
    </div>
  `;
}

function renderPayrollSalaryTable(title, rows = [], extraClass = "") {
  return `
    <article class="payroll-salary-summary-table ${escapeAttr(extraClass)}">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <tbody>
          ${rows.map(([label, value, note]) => `
            <tr>
              <th>${escapeHtml(label)}</th>
              <td>${escapeHtml(String(value ?? "Not set"))}${note ? `<small>${escapeHtml(note)}</small>` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </article>
  `;
}

function getPayrollCoverage(record = {}) {
  const start = record.cutoffStart || record.cutoff_start || record.cutoffFrom || "";
  const end = record.cutoffEnd || record.cutoff_end || record.cutoffTo || "";
  const payrollDate = record.payrollDate || record.payroll_date || "";
  if (start && end) {
    const days = getInclusiveDayCount(start, end);
    return {
      summary: `Coverage: ${start} to ${end}${days ? ` | Duration: ${days} day(s)` : ""}`,
      days
    };
  }
  if (payrollDate) return { summary: `Payroll Date: ${payrollDate}`, days: 0 };
  return { summary: "Not set", days: 0 };
}

function getInclusiveDayCount(start, end) {
  const startDate = new Date(`${String(start).slice(0, 10)}T00:00:00`);
  const endDate = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diff = Math.round((endDate - startDate) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

function getPayrollDetailTotals(record = {}, lines = []) {
  const totals = record.totals || {};
  const driverBali = payrollDetailNumberWithMeta(record, "driverBaliBalance",
    "driver_bali", "driver_balance", "driver_deduction", "driver_deductions",
    "driver_cash_advance", "driver_ca", "driver_loan", "driver_balance_amount",
    "driver_cash_advance_balance", "driver_previous_balance", "driver_total_deductions"
  );
  const helperBali = payrollDetailNumberWithMeta(record, "helperBaliBalance",
    "helper_bali", "helper_balance", "helper_deduction", "helper_deductions",
    "helper_cash_advance", "helper_ca", "helper_loan", "helper_balance_amount",
    "helper_cash_advance_balance", "helper_previous_balance", "helper_total_deductions"
  );
  const detailTotals = {
    totalBudgetReleased: payrollDetailNumber(record, "totalBudgetReleased", "total_budget_released", "total_budget", "budget_released", "total_trip_budget", "total_released"),
    totalExpenses: payrollDetailNumber(record, "totalExpenses", "total_expenses") || sumPayrollLineTotal(lines, getLineExpenseTotalForDetails),
    totalDriverSalary: payrollDetailNumber(record, "totalDriverSalary", "driver_salary", "driver_gross") || sumPayrollLineTotal(lines, line => line.driverSalary),
    totalHelperSalary: payrollDetailNumber(record, "totalHelperSalary", "helper_salary", "helper_gross") || sumPayrollLineTotal(lines, line => line.helperSalary),
    totalDriverAllowance: payrollDetailNumber(record, "totalDriverAllowance", "driver_allowance") || sumPayrollLineTotal(lines, line => line.driverAllowance),
    totalHelperAllowance: payrollDetailNumber(record, "totalHelperAllowance", "helper_allowance") || sumPayrollLineTotal(lines, line => line.helperAllowance),
    driverDeduction: payrollDetailNumber(record, "driverDeduction", "driver_deduction", "suggested_driver_deduction"),
    helperDeduction: payrollDetailNumber(record, "helperDeduction", "helper_deduction", "suggested_helper_deduction"),
    driverNetPay: payrollDetailNumber(record, "driverNetPay", "driver_net_pay", "driver_take_home") || parseNumber(totals.driverNetPay),
    helperNetPay: payrollDetailNumber(record, "helperNetPay", "helper_net_pay", "helper_take_home") || parseNumber(totals.helperNetPay),
    driverBaliBalance: driverBali.value,
    helperBaliBalance: helperBali.value,
    driverBaliRecorded: driverBali.recorded,
    helperBaliRecorded: helperBali.recorded,
    totalSalaryPayable: payrollDetailNumber(record, "totalSalaryPayable", "total_salary_payable", "total_payable")
  };
  if (!detailTotals.totalSalaryPayable) {
    detailTotals.totalSalaryPayable = detailTotals.driverNetPay + detailTotals.helperNetPay;
  }
  detailTotals.totalBali = detailTotals.driverBaliBalance + detailTotals.helperBaliBalance;
  if (!detailTotals.totalBudgetReleased) {
    detailTotals.totalBudgetReleased = detailTotals.totalExpenses + detailTotals.driverNetPay + detailTotals.helperNetPay;
  }
  return detailTotals;
}

function payrollDetailNumberWithMeta(record = {}, totalsKey, ...rawKeys) {
  const totals = record.totals || {};
  if (hasValue(totals[totalsKey])) return { value: parseNumber(totals[totalsKey]), recorded: true };
  const raw = record.rawData || record.raw_data || {};
  const detail = getBudgetBalanceDraftDetail(raw);
  for (const key of rawKeys) {
    const value = raw[key] ?? detail[key] ?? record[key];
    if (hasValue(value)) return { value: parseNumber(value), recorded: true };
  }
  return { value: 0, recorded: false };
}

function payrollDetailNumber(record = {}, totalsKey, ...rawKeys) {
  const totals = record.totals || {};
  if (hasValue(totals[totalsKey])) return parseNumber(totals[totalsKey]);
  const raw = record.rawData || record.raw_data || {};
  const detail = getBudgetBalanceDraftDetail(raw);
  for (const key of rawKeys) {
    const value = raw[key] ?? detail[key] ?? record[key];
    if (hasValue(value)) return parseNumber(value);
  }
  return 0;
}

function sumPayrollLineTotal(lines = [], getter) {
  return (lines || []).reduce((sum, line) => sum + parseNumber(getter(createBlankPayrollLine(line))), 0);
}

function getLineExpenseTotalForDetails(line = {}) {
  return parseNumber(line.diesel) +
    parseNumber(line.tollFee) +
    parseNumber(line.passway) +
    parseNumber(line.parking) +
    getOtherExpenseTotal(line);
}

function renderSavedPayrollTripLines(lines = []) {
  const visibleLines = lines.map(line => createBlankPayrollLine(line)).filter(line => !isLineBlank(line));
  return visibleLines.length ? visibleLines.map(line => `
    <tr>
      <td>${escapeHtml(line.tripDate)}</td>
      <td>${escapeHtml(line.source)}</td>
      <td>${escapeHtml(line.destination)}</td>
      <td>${escapeHtml(line.referenceNo)}</td>
      <td>${escapeHtml(line.poNumber)}</td>
      <td>${escapeHtml(line.shipmentNumber)}</td>
      <td>${escapeHtml(line.containerNumber || line.vanNumber)}</td>
      <td>${escapeHtml(line.tripType)}</td>
      <td>${formatCurrency(line.diesel)}</td>
      <td>${formatCurrency(line.costPerLiter)}</td>
      <td>${formatCurrency(line.driverSalary)}</td>
      <td>${formatCurrency(line.helperSalary)}</td>
      <td>${formatCurrency(line.tollFee)}</td>
      <td>${formatCurrency(line.passway)}</td>
      <td>${formatCurrency(line.parking)}</td>
      <td>${formatCurrency(line.lagayLoaded)}</td>
      <td>${formatCurrency(line.lagayEmpty)}</td>
      <td>${formatCurrency(line.mano)}</td>
      <td>${formatCurrency(line.timbang)}</td>
      <td>${formatCurrency(line.luna)}</td>
      <td>${formatCurrency(line.vulcanize)}</td>
      <td>${formatCurrency(line.driverAllowance)}</td>
      <td>${formatCurrency(line.helperAllowance)}</td>
      <td>${formatCurrency(line.hugasTruck)}</td>
      <td>${formatCurrency(line.checkpoint)}</td>
      <td>${formatCurrency(line.otherExpenses)}</td>
      <td>${escapeHtml(line.remarks)}</td>
    </tr>
  `).join("") : `<tr><td colspan="27" class="empty-table">No trip lines found for this payroll record.</td></tr>`;
}

function getPayrollRecordLookupId(record = {}) {
  return record.payrollNumber || record.payroll_id || record.payrollId || record.id || "";
}

function payrollIdentity(record = {}) {
  return String(record.payrollNumber || record.payroll_id || record.payrollId || record.Payroll_Number || record.Liquidation_Number || record.id || "").trim();
}

function samePayrollRecord(a = {}, b = {}) {
  const aIdentity = payrollIdentity(a);
  const bIdentity = payrollIdentity(b);
  return Boolean(aIdentity && bIdentity && aIdentity === bIdentity);
}

function findPayrollRecordByLookupId(payrollId) {
  const normalizedId = String(payrollId || "").trim();
  const records = dedupePayrollRecords(payrollState.records).concat(payrollState.records);
  return records.find(record => [
    record.id,
    record.payrollNumber,
    record.payroll_id,
    record.payrollId,
    record.Liquidation_ID,
    record.Payroll_Number
  ].some(value => String(value || "").trim() === normalizedId)) || null;
}

function handleSavedPayrollRecordAction(event) {
  const row = event.target.closest(".payroll-saved-record-row");
  if (row && !event.target.closest("button, a, input, select, textarea")) {
    showSavedPayrollDetails(row.dataset.payrollId);
    return;
  }

  const button = event.target.closest("[data-action][data-payroll-id]");
  if (!button) return;
  const action = button.dataset.action;
  const payrollId = button.dataset.payrollId;
  console.log("Payroll button clicked", { action, payrollId });

  if (action === "view") {
    editPayrollRecord(payrollId);
  } else if (action === "delete") {
    deletePayrollRecord(payrollId);
  } else if (action === "show-details") {
    showSavedPayrollDetails(payrollId);
  } else if (action === "draft-finalize-placeholder") {
    setStatus("Finalize payroll will be added next. This draft has not applied deductions yet.", "info");
  } else if (action === "toggle-details" || action === "toggle-draft") {
    showSavedPayrollDetails(payrollId);
  }
}

function handleSavedPayrollRecordKeydown(event) {
  const row = event.target.closest(".payroll-saved-record-row");
  if (!row) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  showSavedPayrollDetails(row.dataset.payrollId);
}

async function showSavedPayrollDetails(payrollId) {
  const record = findPayrollRecordByLookupId(payrollId);
  const panel = $("payroll-details-panel");
  const content = $("payroll-details-content");
  if (!record || !panel || !content) return;

  const payrollLookup = getPayrollRecordLookupId(record);
  console.log("Saved payroll details clicked", {
    payroll_id: payrollLookup,
    existingRecordLinesCount: (record.lines || []).length
  });
  content.innerHTML = `
    <div class="detail-block">
      <p class="payroll-info-note" style="margin:0">Loading payroll trip lines...</p>
    </div>
  `;
  panel.hidden = false;
  const lines = await loadPayrollTripLinesForRecord(record, { updateEditor: false });
  console.log("Saved payroll details lines", {
    payroll_id: payrollLookup,
    fetchedTripLinesCount: lines.length,
    firstTripLineSample: lines[0] || null
  });
  content.innerHTML = renderPayrollDetailsModal(record, lines);
  bindPayrollDetailsModalActions(content);
}

function closePayrollDetails() {
  if ($("payroll-details-panel")) $("payroll-details-panel").hidden = true;
}

function bindPayrollDetailsModalActions(content) {
  content.querySelectorAll("[data-detail-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.detailTab;
      content.querySelectorAll("[data-detail-tab]").forEach(tabButton => {
        const active = tabButton.dataset.detailTab === tab;
        tabButton.classList.toggle("active", active);
        tabButton.setAttribute("aria-selected", active ? "true" : "false");
      });
      content.querySelectorAll("[data-detail-panel]").forEach(panel => {
        const active = panel.dataset.detailPanel === tab;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      });
    });
  });
  content.querySelectorAll("[data-modal-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.modalAction;
      const payrollId = button.dataset.payrollId;
      if (action === "close") {
        closePayrollDetails();
      } else if (action === "view") {
        closePayrollDetails();
        editPayrollRecord(payrollId);
      } else if (action === "delete") {
        closePayrollDetails();
        deletePayrollRecord(payrollId);
      }
    });
  });
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

async function editPayrollRecord(id) {
  const record = findPayrollRecordByLookupId(id);
  if (!record) return;
  const payrollId = getPayrollRecordLookupId(record);
  console.log("Opening payroll record", payrollId);
  payrollState.currentId = record.id || payrollId;
  payrollState.lines = (record.lines || []).map(line => createBlankPayrollLine({ ...line, warnings: line.warnings || [] }));
  payrollState.originalLineIds = payrollState.lines.map(line => line.id).filter(Boolean);
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
  const loadedLines = await loadPayrollTripLinesForRecord(record);
  if (loadedLines.length) {
    payrollState.lines = loadedLines.map(line => createBlankPayrollLine(line));
    payrollState.originalLineIds = payrollState.lines.map(line => line.id).filter(Boolean);
  }
  renderLinesTable();
  calculatePayroll();
  generateViberMessage();
  updateLockState();
  updatePayrollDraftSummary(record);
  switchPayrollTab("encode-payroll-tab");
  window.scrollTo({ top: 0, behavior: "smooth" });
  return record;
}

function duplicatePayrollRecord(id) {
  const record = findPayrollRecordByLookupId(id);
  if (!record) return;
  payrollState.currentId = createId("payroll");
  payrollState.originalLineIds = [];
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
  const record = findPayrollRecordByLookupId(id);
  if (!record) return;
  if (!confirm(`Delete ${record.payrollNumber || record.id}? This only removes the local record.`)) return;
  payrollState.records = payrollState.records.filter(item => item !== record);
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

function firstPresent(...values) {
  return values.find(value => value !== null && value !== undefined && value !== "");
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
  localRecords.forEach(record => byId.set(payrollIdentity(record), record));
  cloudRecords.forEach(cloudRecord => {
    const key = payrollIdentity(cloudRecord);
    const localRecord = byId.get(key);
    byId.set(key, localRecord ? mergePayrollRecord(localRecord, cloudRecord) : cloudRecord);
  });
  return Array.from(byId.values()).sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function mergePayrollRecord(localRecord, cloudRecord) {
  const merged = { ...cloudRecord, ...localRecord };
  merged.id = localRecord.id || cloudRecord.id;
  merged.supabaseId = cloudRecord.id || localRecord.supabaseId || "";
  merged.payrollNumber = localRecord.payrollNumber || cloudRecord.payrollNumber || cloudRecord.payroll_id || "";
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
  renderPayrollTripTableHeader();
  renderPayrollLaneDatalists();
  console.log("Payroll trip table columns", lineColumns.length + 3);
  payrollState.lines.forEach(line => {
    line.rowTotal = getLineRowTotal(line);
    line.rateMatchStatus = normalizePayrollRateMatchStatus(line.rateMatchStatus);
  });
  $("payroll-lines-body").innerHTML = payrollState.lines.map(line => `
    <tr>
      <td class="sticky-col sticky-col-1"><input class="line-select" type="checkbox" data-id="${line.id}"></td>
      ${renderPayrollTripLineCells(line)}
      <td class="payroll-line-actions">
        <button type="button" class="payroll-line-delete" data-delete-line-id="${line.id}">Delete</button>
      </td>
    </tr>
  `).join("");
  $("payroll-lines-body").querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("input", () => {
      const line = payrollState.lines.find(item => item.id === input.dataset.id);
      if (!line) return;
      if (input.dataset.readonly === "true") return;
      line[input.dataset.field] = input.type === "number" ? parseNumber(input.value) : input.value;
      if (input.dataset.field === "source") renderPayrollLaneDatalists(line.source);
      if (input.dataset.field === "destination") renderPayrollLaneDatalists(line.source);
      if (rateAutoFillFields.has(input.dataset.field)) {
        line.rateMatchStatus = "Manual";
      }
    });
    input.addEventListener("change", () => {
      const line = payrollState.lines.find(item => item.id === input.dataset.id);
      if (line && ["source", "destination"].includes(input.dataset.field)) {
        line.rateMatchStatus = "";
        applyRateMatrixToLine(line, { force: true });
        updateMatchedLineCells(line);
        renderPayrollLaneDatalists(line.source);
      }
      calculatePayroll();
    });
    input.addEventListener("focus", () => {
      const line = payrollState.lines.find(item => item.id === input.dataset.id);
      if (input.dataset.field === "source") renderPayrollLaneDatalists(line?.source || "");
      if (input.dataset.field === "destination") renderPayrollLaneDatalists(line?.source || "");
      openPayrollDatalist(input);
    });
  });
  $("payroll-lines-body").querySelectorAll("[data-delete-line-id]").forEach(button => {
    button.addEventListener("click", () => {
      if (isLockedStatus($("payroll-status").value)) return;
      payrollState.lines = payrollState.lines.filter(line => line.id !== button.dataset.deleteLineId);
      if (!payrollState.lines.length) payrollState.lines.push(createBlankPayrollLine());
      renderLinesTable();
      calculatePayroll();
    });
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

function renderPayrollTripTableHeader() {
  const headerRow = document.querySelector(".payroll-encoding-table thead tr");
  if (!headerRow) return;
  const visibleColumns = lineColumns.filter(([field]) => field !== "remarks");
  headerRow.innerHTML = [
    '<th class="sticky-col sticky-col-1">Select</th>',
    ...visibleColumns.map(([field, , label]) => `<th class="${getLineCellClass(field)}">${escapeHtml(label)}</th>`),
    '<th class="payroll-line-issues">Issues</th>',
    '<th class="remarks-cell">Remarks</th>',
    '<th class="payroll-line-actions">Actions</th>'
  ].join("");
}

function renderPayrollTripLineCells(line) {
  console.log("Rendering payroll trip row", line);
  const cells = lineColumns
    .filter(([field]) => field !== "remarks")
    .map(([field, type]) => {
      const columnIndex = lineColumns.findIndex(([columnField]) => columnField === field);
      return `<td class="${getLineCellClass(field)}">${lineInput(line, field, type, columnIndex)}</td>`;
    });
  const remarksColumnIndex = lineColumns.findIndex(([field]) => field === "remarks");
  const remarksCell = `<td class="remarks-cell">${lineInput(line, "remarks", "text", remarksColumnIndex)}</td>`;
  const cellCount = cells.length + 4;
  console.log("Payroll trip row cell count", cellCount);
  return `${cells.join("")}<td class="payroll-line-issues">${renderPayrollLineIssues(line)}</td>${remarksCell}`;
}

function renderPayrollLineIssues(line) {
  const issues = getPayrollTripLineIssues(line, {
    showRequired: payrollState.hasCalculatedPayroll || payrollState.hasSubmittedPayroll
  });
  if (!issues.length) return '<span class="payroll-issues-empty">-</span>';
  return issues.map(issue => `<span class="payroll-issue-chip">${escapeHtml(issue)}</span>`).join("");
}

function getUniquePayrollSources(group = $("group-category")?.value || "") {
  const normalizedGroup = normalizeRateKey(group);
  return [...new Set(payrollState.rateMatrix
    .filter(rate => rate.active !== false)
    .filter(rate => !normalizedGroup || !rate.groupCategory || normalizeRateKey(rate.groupCategory) === normalizedGroup)
    .map(rate => String(rate.source || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function getDestinationSuggestionsForSource(source = "", group = $("group-category")?.value || "") {
  const normalizedSource = normalizeRateKey(source);
  const normalizedGroup = normalizeRateKey(group);
  const destinations = [...new Set(payrollState.rateMatrix
    .filter(rate => rate.active !== false)
    .filter(rate => !normalizedSource || normalizeRateKey(rate.source) === normalizedSource)
    .filter(rate => !normalizedGroup || !rate.groupCategory || normalizeRateKey(rate.groupCategory) === normalizedGroup)
    .map(rate => String(rate.destination || "").trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  console.log("Payroll destination suggestions", { source, destinations });
  return destinations;
}

function getActivePayrollLaneSource() {
  const active = document.activeElement;
  if (active?.dataset?.field === "source" || active?.dataset?.field === "destination") {
    const line = payrollState.lines.find(item => item.id === active.dataset.id);
    return line?.source || active.value || "";
  }
  return payrollState.lines.find(line => String(line.source || "").trim())?.source || "";
}

function renderPayrollLaneDatalists(activeSource = "") {
  const sourceList = $("payroll-source-options");
  const destinationList = $("payroll-destination-options");
  if (sourceList) {
    sourceList.innerHTML = getUniquePayrollSources()
      .map(source => `<option value="${escapeAttr(source)}"></option>`)
      .join("");
  }
  const source = activeSource || getActivePayrollLaneSource();
  if (destinationList) {
    destinationList.innerHTML = getDestinationSuggestionsForSource(source)
      .map(destination => `<option value="${escapeAttr(destination)}"></option>`)
      .join("");
  }
}

function openPayrollDatalist(input) {
  if (!input?.getAttribute("list")) return;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch (error) {
    console.debug("Payroll datalist picker not opened", error);
  }
}

function getLineCellClass(field) {
  if (field === "tripDate") return "sticky-col sticky-col-2";
  if (field === "source") return "sticky-col sticky-col-3";
  if (field === "destination") return "sticky-col sticky-col-4";
  if (field === "rateMatchStatus") return "rate-status-cell";
  if (field === "remarks") return "remarks-cell";
  return "";
}

function normalizePayrollRateMatchStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "matched") return "Matched";
  if (normalized === "manual") return "Manual";
  if (normalized === "no match" || normalized === "no-rate" || normalized === "norate") return "No Match";
  return "";
}

function lineInput(line, field, type, columnIndex) {
  if (field === "rateMatchStatus") line[field] = normalizePayrollRateMatchStatus(line[field]);
  const value = isLineBlank(line) && type === "number" ? "" : line[field] ?? "";
  const readonly = field === "rowTotal" || field === "rateMatchStatus";
  const disabled = isLockedStatus($("payroll-status").value) || readonly ? "disabled" : "";
  const rowIndex = payrollState.lines.findIndex(item => item.id === line.id);
  const listAttr = field === "source"
    ? ' list="payroll-source-options"'
    : field === "destination"
      ? ' list="payroll-destination-options"'
      : "";
  return `<input class="payroll-cell-input ${readonly ? "payroll-readonly-cell" : ""}" data-id="${line.id}" data-field="${field}" data-readonly="${readonly ? "true" : "false"}" data-row-index="${rowIndex}" data-col-index="${columnIndex}" type="${type}"${listAttr} ${type === "number" ? 'step="0.01" min="0"' : ""} value="${escapeAttr(value)}" ${disabled}>`;
}

function syncLinesFromTable() {
  document.querySelectorAll("#payroll-lines-body [data-field]").forEach(input => {
    const line = payrollState.lines.find(item => item.id === input.dataset.id);
    if (!line) return;
    if (input.dataset.readonly === "true") return;
    line[input.dataset.field] = input.type === "number" ? parseNumber(input.value) : input.value;
  });
}

function bindSpreadsheetCells() {
  const inputs = [...document.querySelectorAll(".payroll-cell-input")];
  inputs.forEach(input => {
    input.addEventListener("focus", event => {
      selectSpreadsheetCell(event.currentTarget, event.shiftKey);
      if (event.currentTarget.dataset.readonly !== "true") {
        requestAnimationFrame(() => event.currentTarget.select?.());
      }
    });
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
  document.querySelectorAll("#payroll-lines-body td").forEach(cell => {
    cell.addEventListener("mousedown", event => {
      if (event.target.closest("button, input[type='checkbox']")) return;
      const input = cell.querySelector(".payroll-cell-input:not([disabled])");
      if (!input) return;
      event.preventDefault();
      focusSpreadsheetInput(input, { select: true });
    });
  });
}

function renderApprovalPaymentCenter() {
  const motherBody = $("mother-approval-records-body");
  const sisterBody = $("sister-payment-records-body");
  if (!motherBody && !sisterBody) return;
  const records = dedupePayrollRecords(payrollState.records);
  const motherRows = records.filter(isMotherApprovalRecord);
  const sisterRows = records.filter(isSisterPaymentRecord);

  if (motherBody) {
    motherBody.innerHTML = motherRows.length ? motherRows.map(record => {
      const totals = getPayrollDetailTotals(record, record.lines || []);
      return `
        <tr class="approval-center-row" data-payroll-id="${escapeAttr(getPayrollRecordLookupId(record))}" data-review-mode="approval" tabindex="0">
          <td>${escapeHtml(record.payrollNumber || record.id)}</td>
          <td>${escapeHtml(record.payrollDate || "")}</td>
          <td>${escapeHtml(record.plateNumber || "")}</td>
          <td>${escapeHtml(record.driverName || "")}</td>
          <td>${escapeHtml(record.helperName || "")}</td>
          <td>${escapeHtml(record.groupCategory || "")}</td>
          <td>${formatCurrency(totals.totalExpenses)}</td>
          <td>${formatCurrency(totals.driverNetPay)}</td>
          <td>${formatCurrency(totals.helperNetPay)}</td>
          <td>${formatCurrency(totals.totalBali)}</td>
          <td>${formatCurrency(totals.totalBudgetReleased)}</td>
          <td>${formatCurrency(totals.totalSalaryPayable)}</td>
          <td>${statusBadge(getSavedPayrollDisplayStatus(record))}</td>
          <td>${statusBadge(record.approvalStatus || record.approval_status || "Pending")}</td>
          <td>${statusBadge(record.paymentStatus || record.payment_status || "Unpaid")}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="15" class="empty-table">No payroll records waiting for mother approval.</td></tr>`;
  }

  if (sisterBody) {
    sisterBody.innerHTML = sisterRows.length ? sisterRows.map(record => {
      const totals = getPayrollDetailTotals(record, record.lines || []);
      return `
        <tr class="approval-center-row" data-payroll-id="${escapeAttr(getPayrollRecordLookupId(record))}" data-review-mode="payment" tabindex="0">
          <td>${escapeHtml(record.payrollNumber || record.id)}</td>
          <td>${escapeHtml(record.payrollDate || "")}</td>
          <td>${escapeHtml(record.plateNumber || "")}</td>
          <td>${escapeHtml(record.driverName || "")}</td>
          <td>${escapeHtml(record.helperName || "")}</td>
          <td>${escapeHtml(record.groupCategory || "")}</td>
          <td>${formatCurrency(totals.driverNetPay)}</td>
          <td>${formatCurrency(totals.helperNetPay)}</td>
          <td>${formatCurrency(totals.totalBali)}</td>
          <td>${formatCurrency(totals.totalBudgetReleased)}</td>
          <td>${formatCurrency(totals.totalSalaryPayable)}</td>
          <td>${statusBadge(record.paymentStatus || record.payment_status || "Unpaid")}</td>
          <td>${escapeHtml(record.approval?.paymentDate || record.paymentDate || "")}</td>
          <td>${escapeHtml(record.approval?.paymentReference || record.paymentReference || "")}</td>
        </tr>
      `;
    }).join("") : `<tr><td colspan="14" class="empty-table">No approved unpaid payroll records waiting for payment.</td></tr>`;
  }

  document.querySelectorAll(".approval-center-row").forEach(row => {
    row.addEventListener("click", () => showApprovalPaymentReview(row.dataset.payrollId, row.dataset.reviewMode));
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      showApprovalPaymentReview(row.dataset.payrollId, row.dataset.reviewMode);
    });
  });
}

function isMotherApprovalRecord(record = {}) {
  const status = normalize(record.status || "");
  const approval = normalize(record.approvalStatus || record.approval_status || "");
  const payment = normalize(record.paymentStatus || record.payment_status || "Unpaid");
  return payment !== "paid" && (status === "for approval" || approval === "pending" || approval === "for approval");
}

function isSisterPaymentRecord(record = {}) {
  const status = normalize(record.status || "");
  const approval = normalize(record.approvalStatus || record.approval_status || "");
  const payment = normalize(record.paymentStatus || record.payment_status || "Unpaid");
  return payment === "unpaid" && (status === "approved" || approval === "approved");
}

async function showApprovalPaymentReview(payrollId, mode = "approval") {
  const record = findPayrollRecordByLookupId(payrollId);
  const panel = $("payroll-details-panel");
  const content = $("payroll-details-content");
  if (!record || !panel || !content) return;
  content.innerHTML = `<div class="detail-block"><p class="payroll-info-note" style="margin:0">Loading payroll review...</p></div>`;
  panel.hidden = false;
  const lines = await loadPayrollTripLinesForRecord(record, { updateEditor: false });
  content.innerHTML = renderApprovalPaymentReview(record, lines, mode);
  bindApprovalPaymentReviewActions(content, record, mode);
}

function renderApprovalPaymentReview(record = {}, lines = [], mode = "approval") {
  const totals = getPayrollDetailTotals(record, lines);
  const footer = mode === "payment" ? `
    <div class="approval-payment-fields">
      <label><span>Payment Reference</span><input id="review-payment-reference" type="text" value="${escapeAttr(record.approval?.paymentReference || record.paymentReference || "")}"></label>
      <label><span>Payment Date</span><input id="review-payment-date" type="date" value="${escapeAttr(record.approval?.paymentDate || record.paymentDate || new Date().toISOString().slice(0, 10))}"></label>
      <label class="wide-field"><span>Payment Notes</span><textarea id="review-payment-notes" rows="2">${escapeHtml(record.approval?.paymentNotes || "")}</textarea></label>
    </div>
    <div class="payroll-details-footer">
      <button type="button" data-approval-center-action="paid">Mark as Paid</button>
      <button type="button" data-approval-center-action="close">Close</button>
    </div>
  ` : `
    <div class="approval-payment-fields">
      <label><span>Approver Name</span><input id="review-approver-name" type="text" value="${escapeAttr(record.approval?.approverName || "Mother")}"></label>
      <label class="wide-field"><span>Approval / Revision Notes</span><textarea id="review-approval-notes" rows="2">${escapeHtml(record.approval?.approvalNotes || record.approval?.revisionReason || "")}</textarea></label>
    </div>
    <div class="payroll-details-footer">
      <button type="button" data-approval-center-action="approve">Approve</button>
      <button type="button" data-approval-center-action="return">Return for Revision</button>
      <button type="button" data-approval-center-action="reject" class="danger-outline">Reject</button>
      <button type="button" data-approval-center-action="close">Close</button>
    </div>
  `;
  return `
    <div class="detail-block approval-detail-grid payroll-details-summary-grid">
      ${approvalDetailItem("Payroll ID", record.payrollNumber || record.id)}
      ${approvalDetailItem("Plate Number", record.plateNumber)}
      ${approvalDetailItem("Driver", record.driverName)}
      ${approvalDetailItem("Helper", record.helperName)}
      ${approvalDetailItem("Group", record.groupCategory)}
      ${approvalDetailItem("Payroll Date", record.payrollDate)}
      ${approvalDetailItem("Status", getSavedPayrollDisplayStatus(record))}
      ${approvalDetailItem("Approval Status", record.approvalStatus || record.approval_status || "")}
      ${approvalDetailItem("Payment Status", record.paymentStatus || record.payment_status || "Unpaid")}
      ${approvalDetailItem("Total Expenses", formatCurrency(totals.totalExpenses))}
      ${approvalDetailItem("Driver Net Pay", formatCurrency(totals.driverNetPay))}
      ${approvalDetailItem("Helper Net Pay", formatCurrency(totals.helperNetPay))}
      ${approvalDetailItem("Total Bali", formatCurrency(totals.totalBali))}
      ${approvalDetailItem("Total Budget Released", formatCurrency(totals.totalBudgetReleased))}
      ${approvalDetailItem("Total Payable", formatCurrency(totals.totalSalaryPayable))}
    </div>
    <div class="payroll-detail-tabs" role="tablist" aria-label="Payroll review sections">
      <button type="button" class="payroll-detail-tab-button active" data-detail-tab="trip-lines" role="tab" aria-selected="true">Trip Lines / Budget</button>
      <button type="button" class="payroll-detail-tab-button" data-detail-tab="salary-summary" role="tab" aria-selected="false">Salary Summary</button>
    </div>
    <section class="payroll-detail-tab-panel active" data-detail-panel="trip-lines" role="tabpanel">
      ${renderPayrollRouteBreakdownForDetails(lines)}
      ${renderPayrollTripLineDetailsTable(lines)}
    </section>
    <section class="payroll-detail-tab-panel" data-detail-panel="salary-summary" role="tabpanel" hidden>
      ${renderPayrollSalarySummary(record, totals, getPayrollCoverage(record), record.paymentStatus || "Unpaid")}
    </section>
    ${footer}
  `;
}

function bindApprovalPaymentReviewActions(content, record, mode) {
  bindPayrollDetailsModalActions(content);
  content.querySelectorAll("[data-approval-center-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.approvalCenterAction;
      if (action === "close") {
        closePayrollDetails();
      } else if (action === "approve") {
        updateApprovalPaymentStatus(record, {
          status: "Approved",
          approval_status: "Approved",
          payment_status: "Unpaid",
          approved_by: $("review-approver-name")?.value || "Mother",
          approved_at: new Date().toISOString()
        }, {
          approverName: $("review-approver-name")?.value || "Mother",
          approvalNotes: $("review-approval-notes")?.value || ""
        });
      } else if (action === "return") {
        updateApprovalPaymentStatus(record, {
          status: "Returned",
          approval_status: "Returned",
          payment_status: "Unpaid"
        }, {
          approvalNotes: $("review-approval-notes")?.value || "",
          revisionReason: $("review-approval-notes")?.value || ""
        });
      } else if (action === "reject") {
        updateApprovalPaymentStatus(record, {
          status: "Rejected",
          approval_status: "Rejected",
          payment_status: "Unpaid"
        }, {
          approvalNotes: $("review-approval-notes")?.value || "",
          revisionReason: $("review-approval-notes")?.value || ""
        });
      } else if (action === "paid") {
        updateApprovalPaymentStatus(record, {
          status: "Paid",
          approval_status: "Approved",
          payment_status: "Paid",
          deposited_at: $("review-payment-date")?.value || new Date().toISOString().slice(0, 10)
        }, {
          paymentReference: $("review-payment-reference")?.value || "",
          paymentDate: $("review-payment-date")?.value || new Date().toISOString().slice(0, 10),
          paymentNotes: $("review-payment-notes")?.value || ""
        });
      }
    });
  });
}

function updateApprovalPaymentStatus(record, statusData, approvalPatch = {}) {
  const payrollId = record.payrollNumber || record.payroll_id || record.payrollId || record.id;
  if (!payrollId) return;
  setStatus("Updating payroll status...", "info");
  updatePayrollStatusInWorker(payrollId, statusData)
    .then(result => {
      const updated = normalizeSupabasePayrollRecord(result.record || {});
      payrollState.records = payrollState.records.map(item => {
        if (!samePayrollRecord(item, record) && payrollIdentity(item) !== payrollIdentity(updated)) return item;
        return {
          ...item,
          ...updated,
          id: item.id || updated.id,
          payrollNumber: item.payrollNumber || updated.payrollNumber,
          approval: { ...(item.approval || {}), ...(updated.approval || {}), ...approvalPatch },
          paymentReference: approvalPatch.paymentReference || item.paymentReference || "",
          paymentDate: approvalPatch.paymentDate || item.paymentDate || ""
        };
      });
      writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
      renderPayrollRecordsTable();
      closePayrollDetails();
      setStatus("Payroll status updated.", "success");
    })
    .catch(error => {
      console.warn("Payroll status update failed", error);
      setStatus("Payroll status update failed. Please try again.", "error");
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
      if (!getEditablePayrollColumnIndexes().includes(colIndex)) return;
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
  if (event.key === "Escape") {
    event.preventDefault();
    event.currentTarget.blur();
    return;
  }
  if (event.key === "F2") {
    event.preventDefault();
    const input = event.currentTarget;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange?.(end, end);
    return;
  }
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
  syncSinglePayrollCell(event.currentTarget);
  calculatePayroll();
  const [rowDelta, colDelta] = navigation[event.key];
  moveSpreadsheetFocus(event.currentTarget, rowDelta, colDelta, event.shiftKey && event.key !== "Enter", event.key);
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
      if (field && getEditablePayrollColumnIndexes().includes(colIndex)) line[field] = "";
    }
    line.warnings = [];
  }
  renderLinesTable(false);
  calculatePayroll();
  focusSpreadsheetCell(minRow, minCol);
}

function syncSinglePayrollCell(input) {
  const line = payrollState.lines.find(item => item.id === input.dataset.id);
  if (!line || input.dataset.readonly === "true") return;
  line[input.dataset.field] = input.type === "number" ? parseNumber(input.value) : input.value;
  line.rowTotal = getLineRowTotal(line);
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

function moveSpreadsheetFocus(input, rowDelta, colDelta, extend, key = "") {
  let row = Number(input.dataset.rowIndex) + rowDelta;
  let col = Number(input.dataset.colIndex) + colDelta;
  const editableCols = getEditablePayrollColumnIndexes();
  const firstCol = editableCols[0] ?? 0;
  const lastCol = editableCols[editableCols.length - 1] ?? lineColumns.length - 1;
  if (key === "Tab") {
    const currentEditableIndex = editableCols.indexOf(Number(input.dataset.colIndex));
    let nextEditableIndex = currentEditableIndex + (colDelta > 0 ? 1 : -1);
    row = Number(input.dataset.rowIndex);
    if (nextEditableIndex >= editableCols.length) {
      nextEditableIndex = 0;
      row += 1;
    }
    if (nextEditableIndex < 0) {
      nextEditableIndex = editableCols.length - 1;
      row -= 1;
    }
    col = editableCols[nextEditableIndex];
  } else {
    if (col < firstCol) col = firstCol;
    if (col > lastCol) col = lastCol;
    col = nearestEditablePayrollColumn(col, colDelta < 0 ? -1 : 1);
  }
  if (row < 0) row = 0;
  if (row >= payrollState.lines.length && !isLockedStatus($("payroll-status").value)) {
    syncLinesFromTable();
    payrollState.lines.push(createBlankPayrollLine());
    renderLinesTable(false);
  }
  focusSpreadsheetCell(row, col, extend);
}

function getEditablePayrollColumnIndexes() {
  return lineColumns
    .map(([field], index) => ({ field, index }))
    .filter(({ field }) => !["rowTotal", "rateMatchStatus"].includes(field))
    .map(({ index }) => index);
}

function nearestEditablePayrollColumn(col, direction = 1) {
  const editableCols = getEditablePayrollColumnIndexes();
  if (editableCols.includes(col)) return col;
  const sorted = direction < 0 ? [...editableCols].reverse() : editableCols;
  return sorted.find(index => direction < 0 ? index < col : index > col) ?? sorted[0] ?? col;
}

function focusSpreadsheetCell(row, col, extend = false) {
  const targetCol = nearestEditablePayrollColumn(Number(col), 1);
  const input = document.querySelector(`.payroll-cell-input[data-row-index="${row}"][data-col-index="${targetCol}"]:not([disabled])`);
  if (!input) return;
  focusSpreadsheetInput(input, { select: true });
  selectSpreadsheetCell(input, extend);
}

function focusSpreadsheetInput(input, options = {}) {
  input.focus();
  if (options.select !== false) requestAnimationFrame(() => input.select?.());
}

function applyMatchingRulesToLines() {
  if (isLockedStatus($("payroll-status").value)) return;
  syncLinesFromTable();
  let matched = 0;
  let needsReview = 0;
  payrollState.lines.forEach(line => {
    if (isLineBlank(line)) return;
    line.rateMatchStatus = "";
    const rateApplied = applyRateMatrixToLine(line, { force: true });
    if (rateApplied) { matched++; return; }
    const rule = matchSalaryRule(line);
    if (rule) {
      line.driverSalary = parseNumber(rule.driverSalary);
      line.helperSalary = parseNumber(rule.helperSalary);
      line.driverAllowance = parseNumber(rule.driverAllowance);
      line.helperAllowance = parseNumber(rule.helperAllowance);
      line.rateMatchStatus = "Matched";
      line.rowTotal = getLineRowTotal(line);
      matched++;
    } else if (line.source && line.destination) {
      needsReview++;
    }
  });
  renderLinesTable();
  calculatePayroll();
  if (matched + needsReview === 0) {
    setStatus("No rows to match.", "info");
  } else {
    const reviewMsg = needsReview > 0 ? `, ${needsReview} row${needsReview !== 1 ? "s" : ""} need review` : "";
    setStatus(`Matching rule applied. ${matched} row${matched !== 1 ? "s" : ""} matched${reviewMsg}.`, needsReview > 0 ? "warning" : "success");
  }
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
  const status = $("payroll-status").value || "Draft";
  const deductions = {
    driver: getPersonDeductions("driver"),
    helper: getPersonDeductions("helper")
  };
  const deductionFieldsForSave = getPayrollDeductionFlatFields(deductions, totals);
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
    status,
    approvalStatus: mapPayrollToApprovalStatus(status, existing.approvalStatus),
    paymentStatus: ["Draft", "For Approval"].includes(status) ? "Unpaid" : (existing.paymentStatus || "Unpaid"),
    total_bali: getCurrentTotalBali(totals),
    total_budget_released: getCurrentTotalBudgetReleased(totals),
    total_payable: parseNumber(totals.driverNetPay) + parseNumber(totals.helperNetPay),
    ...deductionFieldsForSave,
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
    deductions,
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
  const headerStatusBadge = $("header-status-badge");
  if (headerStatusBadge) headerStatusBadge.outerHTML = statusBadge(status, "header-status-badge");
  const locked = isLockedStatus(status);
  document.querySelectorAll("#payroll-header-form input:not(#payroll-number), #payroll-header-form select, #payroll-header-form textarea, #payroll-lines-body input").forEach(input => {
    if (input.id !== "payroll-status") input.disabled = locked;
  });
}

function isLockedStatus(status) {
  return ["Approved", "Rejected", "Paid", "For Deposit", "Deposited", "Cancelled"].includes(status);
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
  return ["lagayLoaded", "lagayEmpty", "mano", "vulcanize", "hugasTruck", "checkpoint", "otherExpenses"].reduce((sum, field) => sum + parseNumber(line[field]), 0);
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
  return [normalize($("plate-number").value), line.tripDate, normalize(line.referenceNo || line.shipmentNumber), normalize(line.source), normalize(line.destination)].join("|");
}

function getEmptyTotals() {
  return {
    totalTrips: 0,
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
    totalRowAmount: 0,
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

function setPasahodSubmitStatus(message, type = "info") {
  const target = $("pasahod-submit-status");
  if (!target) return;
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

// ── Supabase: save payroll record ────────────────────────────────────────────
async function savePayrollToSupabase(record) {
  const totals = record.totals || {};
  const response = await fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payroll_id: record.payrollNumber || record.id,
      payroll_date: record.payrollDate || null,
      cutoff_from: record.cutoffStart || null,
      cutoff_to: record.cutoffEnd || null,
      group_category: record.groupCategory || null,
      plate_number: record.plateNumber || null,
      driver_name: record.driverName || null,
      helper_name: record.helperName || null,
      driver_salary: totals.totalDriverSalary || 0,
      helper_salary: totals.totalHelperSalary || 0,
      driver_allowance: totals.totalDriverAllowance || 0,
      helper_allowance: totals.totalHelperAllowance || 0,
      total_expenses: totals.totalExpenses || 0,
      total_budget_released: record.total_budget_released || getCurrentTotalBudgetReleased(totals),
      total_bali: record.total_bali || getCurrentTotalBali(totals),
      total_payable: record.total_payable || (parseNumber(totals.driverNetPay) + parseNumber(totals.helperNetPay)),
      driver_cash_advance: record.driver_cash_advance || 0,
      helper_cash_advance: record.helper_cash_advance || 0,
      driver_net_pay: totals.driverNetPay || 0,
      helper_net_pay: totals.helperNetPay || 0,
      status: record.status || "Draft",
      approval_status: record.approvalStatus || record.status || "Draft",
      payment_status: record.paymentStatus || "Unpaid",
      raw_data: record
    })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Payroll save failed (${response.status})`);
  return data;
}

async function savePayrollTripLinesToSupabase(record) {
  const lines = (record.lines || []).map(line => payrollLineToSupabasePayload(record, line));
  const activeLineIds = new Set(lines.map(line => String(line.line_id || "").trim()).filter(Boolean));
  const deletedLines = (payrollState.originalLineIds || [])
    .filter(lineId => lineId && !activeLineIds.has(String(lineId)))
    .map(lineId => ({
      line_id: lineId,
      payroll_id: record.payrollNumber || record.id,
      is_deleted: true,
      status: "Deleted",
      source_module: "Payroll",
      raw_data: { deletedFromPayrollDraft: true, payroll_id: record.payrollNumber || record.id }
    }));
  const payloadLines = lines.concat(deletedLines);
  if (!payloadLines.length) return { ok: true, count: 0 };
  const response = await fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/trip-lines-bulk-upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: payloadLines })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Payroll trip line save failed (${response.status})`);
  payrollState.originalLineIds = lines.map(line => line.line_id).filter(Boolean);
  return data;
}

function payrollLineToSupabasePayload(record, line) {
  const tripDate = line.tripDate || null;
  const payrollId = record.payrollNumber || record.id;
  const plateNumber = record.plateNumber || null;
  const groupCommodity = record.groupCategory || line.commodity || null;
  const driverName = record.driverName || null;
  const helperName = record.helperName || null;
  const perLiter = parseNumber(line.costPerLiter);
  const bayadSaDriver = parseNumber(line.driverSalary);
  const bayadSaHelper = parseNumber(line.helperSalary);
  const tollFee = parseNumber(line.tollFee);
  const passWay = parseNumber(line.passway);
  const hugasTruck = parseNumber(line.hugasTruck);
  const status = line.lineStatus || record.status || "Draft";
  return {
    line_id: line.id,
    payroll_id: payrollId,
    trip_date: tripDate,
    date: tripDate,
    plate_number: plateNumber,
    group_category: groupCommodity,
    group_commodity: groupCommodity,
    driver_name: driverName,
    driver: driverName,
    helper_name: helperName,
    helper: helperName,
    source: line.source || null,
    destination: line.destination || null,
    reference_no: line.referenceNo || line.shipmentNumber || null,
    po_number: line.poNumber || null,
    shipment_number: line.shipmentNumber || null,
    container_number: line.containerNumber || line.vanNumber || null,
    trip_type: line.tripType || null,
    diesel: parseNumber(line.diesel),
    cost_per_liter: perLiter,
    per_liter: perLiter,
    driver_salary: bayadSaDriver,
    bayad_sa_driver: bayadSaDriver,
    helper_salary: bayadSaHelper,
    bayad_sa_helper: bayadSaHelper,
    toll: tollFee,
    toll_fee: tollFee,
    passway: passWay,
    pass_way: passWay,
    parking: parseNumber(line.parking),
    lagay_loaded: parseNumber(line.lagayLoaded),
    lagay_empty: parseNumber(line.lagayEmpty),
    mano: parseNumber(line.mano),
    timbang: parseNumber(line.timbang),
    luna: parseNumber(line.luna),
    vulcanize: parseNumber(line.vulcanize),
    allowance_driver: parseNumber(line.driverAllowance),
    allowance_helper: parseNumber(line.helperAllowance),
    truck_wash: hugasTruck,
    hugas_truck: hugasTruck,
    checkpoint: parseNumber(line.checkpoint),
    other_expenses: parseNumber(line.otherExpenses),
    row_total: getLineRowTotal(line),
    rate_id: line.rateId || null,
    rate_match_status: line.rateMatchStatus || "No Match",
    remarks: line.remarks || null,
    encoded_by: record.encoderName || line.encodedBy || null,
    source_module: line.sourceModule || "Payroll",
    source_file: line.sourceFile || null,
    status,
    raw_data: line
  };
}

function getPayrollDeductionFlatFields(deductions = {}, totals = {}) {
  const driver = deductions.driver || {};
  const helper = deductions.helper || {};
  return {
    driver_cash_advance: parseNumber(driver.ca),
    driver_sss: parseNumber(driver.sss),
    driver_pagibig: parseNumber(driver.pagibig),
    driver_philhealth: parseNumber(driver.philhealth),
    driver_atm_card: parseNumber(driver.atm),
    driver_shortage: parseNumber(driver.short),
    driver_other_deduction_1: parseNumber(driver.other1),
    driver_other_deduction_2: parseNumber(driver.other2),
    driver_other_deduction_3: parseNumber(driver.other3),
    driver_total_deductions: parseNumber(totals.driverDeduction),
    driver_net_pay: parseNumber(totals.driverNetPay),
    helper_cash_advance: parseNumber(helper.ca),
    helper_sss: parseNumber(helper.sss),
    helper_pagibig: parseNumber(helper.pagibig),
    helper_philhealth: parseNumber(helper.philhealth),
    helper_atm_card: parseNumber(helper.atm),
    helper_shortage: parseNumber(helper.short),
    helper_other_deduction_1: parseNumber(helper.other1),
    helper_other_deduction_2: parseNumber(helper.other2),
    helper_other_deduction_3: parseNumber(helper.other3),
    helper_total_deductions: parseNumber(totals.helperDeduction),
    helper_net_pay: parseNumber(totals.helperNetPay)
  };
}

// ── Supabase: load saved payroll records ─────────────────────────────────────
async function loadPayrollRecordsFromSupabase() {
  const response = await fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/list?limit=200`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Payroll list failed (${response.status})`);
  return Array.isArray(data.records) ? data.records.map(normalizeSupabasePayrollRecord) : [];
}

function normalizeSupabasePayrollRecord(r) {
  const raw = r.raw_data || {};
  return {
    id: r.id || createId("payroll"),
    supabaseId: r.id || "",
    source: "supabase",
    payrollNumber: r.payroll_id || raw.payrollNumber || "",
    payrollDate: r.payroll_date ? String(r.payroll_date).slice(0, 10) : "",
    cutoffStart: r.cutoff_from ? String(r.cutoff_from).slice(0, 10) : "",
    cutoffEnd: r.cutoff_to ? String(r.cutoff_to).slice(0, 10) : "",
    groupCategory: normalizePayrollGroup(r.group_category || ""),
    plateNumber: normalizePlateForCloud(r.plate_number || ""),
    driverName: r.driver_name || "",
    helperName: r.helper_name || "",
    status: r.status || "Draft",
    approvalStatus: r.approval_status || r.status || "Draft",
    paymentStatus: r.payment_status || "Unpaid",
    totals: {
      ...getEmptyTotals(),
      totalDriverSalary: parseNumber(r.driver_salary),
      totalHelperSalary: parseNumber(r.helper_salary),
      totalDriverAllowance: parseNumber(r.driver_allowance),
      totalHelperAllowance: parseNumber(r.helper_allowance),
      totalExpenses: parseNumber(r.total_expenses),
      driverNetPay: parseNumber(r.driver_net_pay),
      helperNetPay: parseNumber(r.helper_net_pay)
    },
    lines: raw.lines || [],
    approval: raw.approval || {},
    deductions: raw.deductions || getDeductionsFromFlatFields(raw, r),
    rawData: raw,
    remarks: raw.remarks || "",
    encoderName: raw.encoderName || "",
    truckType: raw.truckType || "",
    createdBy: raw.createdBy || "",
    createdAt: r.created_at || raw.createdAt || "",
    updatedAt: r.updated_at || raw.updatedAt || ""
  };
}

function getDeductionsFromFlatFields(raw = {}, record = {}) {
  const pick = key => raw[key] ?? record[key] ?? "";
  return {
    driver: {
      ca: pick("driver_cash_advance"),
      sss: pick("driver_sss"),
      pagibig: pick("driver_pagibig"),
      philhealth: pick("driver_philhealth"),
      atm: pick("driver_atm_card"),
      short: pick("driver_shortage"),
      other1: pick("driver_other_deduction_1"),
      other2: pick("driver_other_deduction_2"),
      other3: pick("driver_other_deduction_3")
    },
    helper: {
      ca: pick("helper_cash_advance"),
      sss: pick("helper_sss"),
      pagibig: pick("helper_pagibig"),
      philhealth: pick("helper_philhealth"),
      atm: pick("helper_atm_card"),
      short: pick("helper_shortage"),
      other1: pick("helper_other_deduction_1"),
      other2: pick("helper_other_deduction_2"),
      other3: pick("helper_other_deduction_3")
    }
  };
}

function normalizeSupabasePayrollTripLine(line = {}) {
  const raw = line.raw_data || {};
  return createBlankPayrollLine({
    id: line.lineId || line.line_id || raw.id || createId("line"),
    tripDate: line.date || line.tripDate || line.trip_date || raw.date || raw.tripDate || "",
    source: line.source || raw.source || "",
    destination: line.destination || raw.destination || "",
    referenceNo: line.referenceNo || line.reference_no || raw.referenceNo || raw.shipmentNumber || "",
    poNumber: line.poNumber || line.po_number || raw.poNumber || "",
    shipmentNumber: line.shipmentNumber || line.shipment_number || raw.shipmentNumber || "",
    containerNumber: line.containerNumber || line.container_number || raw.containerNumber || raw.vanNumber || "",
    tripType: line.tripType || line.trip_type || raw.tripType || "",
    diesel: line.diesel ?? raw.diesel,
    costPerLiter: line.perLiter ?? line.per_liter ?? line.costPerLiter ?? line.cost_per_liter ?? raw.perLiter ?? raw.costPerLiter,
    driverSalary: line.bayadSaDriver ?? line.bayad_sa_driver ?? line.driverSalary ?? line.driver_salary ?? raw.bayadSaDriver ?? raw.driverSalary,
    helperSalary: line.bayadSaHelper ?? line.bayad_sa_helper ?? line.helperSalary ?? line.helper_salary ?? raw.bayadSaHelper ?? raw.helperSalary,
    tollFee: line.tollFee ?? line.toll_fee ?? line.toll ?? raw.tollFee,
    passway: line.passWay ?? line.pass_way ?? line.passway ?? raw.passWay ?? raw.passway,
    parking: line.parking ?? raw.parking,
    lagayLoaded: line.lagayLoaded ?? line.lagay_loaded ?? raw.lagayLoaded,
    lagayEmpty: line.lagayEmpty ?? line.lagay_empty ?? raw.lagayEmpty,
    mano: line.mano ?? raw.mano,
    timbang: line.timbang ?? raw.timbang,
    luna: line.luna ?? raw.luna,
    vulcanize: line.vulcanize ?? raw.vulcanize,
    driverAllowance: line.driverAllowance ?? line.allowance_driver ?? raw.driverAllowance,
    helperAllowance: line.helperAllowance ?? line.allowance_helper ?? raw.helperAllowance,
    hugasTruck: line.hugasTruck ?? line.hugas_truck ?? line.truck_wash ?? raw.hugasTruck,
    checkpoint: line.checkpoint ?? raw.checkpoint,
    otherExpenses: line.otherExpenses ?? line.other_expenses ?? raw.otherExpenses,
    rowTotal: line.rowTotal ?? line.row_total ?? raw.rowTotal,
    rateId: line.rateId || line.rate_id || raw.rateId || "",
    rateMatchStatus: line.rateMatchStatus || line.rate_match_status || raw.rateMatchStatus || "No Match",
    lineStatus: line.lineStatus || line.status || raw.lineStatus || raw.status || "",
    sourceModule: line.sourceModule || line.source_module || raw.sourceModule || "",
    sourceFile: line.sourceFile || line.source_file || raw.sourceFile || "",
    encodedBy: line.encodedBy || line.encoded_by || raw.encodedBy || "",
    remarks: line.remarks || raw.remarks || "",
    warnings: []
  });
}

async function loadPayrollTripLinesForRecord(record, options = {}) {
  const updateEditor = options.updateEditor !== false;
  const payrollId = record.payrollNumber || record.payroll_id || record.payrollId || record.id;
  if (!payrollId) return [];
  console.log("Loading payroll trip lines", {
    payroll_id: payrollId,
    existingRecordLinesCount: (record.lines || []).length
  });
  try {
    const response = await fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/trip-lines?payroll_id=${encodeURIComponent(payrollId)}&limit=500`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Payroll trip lines load failed (${response.status})`);
    const lines = Array.isArray(data.lines) ? data.lines.map(normalizeSupabasePayrollTripLine) : [];
    console.log("Payroll trip lines loaded", {
      payroll_id: payrollId,
      fetchedTripLinesCount: lines.length,
      firstTripLineSample: lines[0] || null
    });
    if (lines.length) {
      if (updateEditor) payrollState.lines = lines;
      record.lines = lines;
    }
    return lines.length ? lines : (record.lines || []);
  } catch (error) {
    console.warn("Payroll trip lines load failed; using record raw lines", error);
    const fallbackLines = record.lines || (updateEditor ? payrollState.lines : []);
    console.log("Payroll trip lines fallback", {
      payroll_id: payrollId,
      existingRecordLinesCount: fallbackLines.length,
      firstTripLineSample: fallbackLines[0] || null
    });
    return fallbackLines;
  }
}

function loadSavedPayrollRecordsFromSupabase() {
  const statusEl = $("payroll-records-load-status");
  if (statusEl) statusEl.textContent = "Loading payroll records from Supabase...";
  loadPayrollRecordsFromSupabase()
    .then(cloudRecords => {
      if (!cloudRecords.length) {
        renderPayrollRecordsTable();
        return;
      }
      payrollState.supabaseSource = true;
      payrollState.records = mergePayrollRecords(payrollState.records, cloudRecords);
      writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
      renderPayrollRecordsTable();
    })
    .catch(error => {
      console.warn("Payroll Supabase load failed; using local records", error);
      renderPayrollRecordsTable();
    });
}

// ── Worker: update payroll status only ───────────────────────────────────────
async function updatePayrollStatusInWorker(payrollId, statusData) {
  const response = await fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/update-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payroll_id: payrollId, ...statusData })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Payroll status update failed (${response.status})`);
  return data;
}

// ── Worker: load person balances ─────────────────────────────────────────────
function loadPersonBalancesFromWorker() {
  fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/payroll/balances`)
    .then(response => response.json())
    .catch(() => null)
    .then(data => {
      if (!data?.ok || !Array.isArray(data.balances)) return;
      data.balances.forEach(b => {
        if (!b.person_name || !b.person_role) return;
        const key = `${String(b.person_name).toLowerCase().replace(/\s+/g, " ").trim()}|${b.person_role}`;
        payrollState.balances[key] = {
          personName: b.person_name,
          role: b.person_role,
          runningBalance: parseNumber(b.current_balance)
        };
      });
      writeJson(PEOPLE_BALANCES_KEY, payrollState.balances);
      updatePayrollPersonsFromSources();
      renderPayrollBalanceSection();
    })
    .catch(error => {
      console.warn("Person balances load failed", error);
    });
}

// ── Bali / Cash Advance summary from Supabase cash_requests ──────────────────
function loadBaliSummaryFromSupabase(driverName, helperName) {
  const statusEl = $("payroll-bali-load-status");
  if (statusEl) statusEl.textContent = "Loading balance data from Supabase...";
  fetch(`${VNS_PAYROLL_WORKER_API_BASE}/api/cash/list?limit=500`)
    .then(response => response.json())
    .catch(() => null)
    .then(data => {
      if (!data?.ok || !Array.isArray(data.records)) throw new Error("Cash records unavailable");
      const approved = data.records.filter(r => {
        const st = String(r.approval_status || r.status || "").toLowerCase();
        return !r.is_deleted && !/(cancel|reject|draft)/i.test(st) && /(approved|paid|released)/i.test(st);
      });
      const driverNorm = normalize(driverName);
      const helperNorm = normalize(helperName);
      let driverBali = 0;
      let helperBali = 0;
      approved.forEach(r => {
        const type = String(r.request_type || "").toLowerCase();
        if (!/(bali|cash.?advance|\bca\b)/i.test(type)) return;
        const person = normalize(r.driver_name || r.receiver_name || "");
        const amount = parseNumber(r.amount);
        if (driverNorm && person === driverNorm) driverBali += amount;
        if (helperNorm && person === helperNorm) helperBali += amount;
      });
      payrollState.baliSummary = { driverBali, helperBali };
      if (statusEl) statusEl.textContent = `Balance data loaded from ${approved.length} approved cash records.`;
      renderPayrollBalanceSection();
    })
    .catch(error => {
      console.warn("Bali summary load failed", error);
      if (statusEl) statusEl.textContent = "Balance data could not be loaded from Supabase.";
      renderPayrollBalanceSection();
    });
}

// ── Balance section rendering ─────────────────────────────────────────────────
function renderPayrollBalanceSection() {
  const totals = payrollState.totals || getEmptyTotals();
  const bali = payrollState.baliSummary || {};
  const driverName = $("driver-name")?.value || "";
  const helperName = $("helper-name")?.value || "";
  const driverBalance = getPersonBalance(driverName, "Driver");
  const helperBalance = getPersonBalance(helperName, "Helper");
  const driverPrev = driverBalance.balance;
  const helperPrev = helperBalance.balance;
  const driverNewBali = parseNumber(bali.driverBali);
  const helperNewBali = parseNumber(bali.helperBali);
  const driverDeducted = totals.driverDeduction || 0;
  const helperDeducted = totals.helperDeduction || 0;
  const driverBalanceAfter = driverPrev + driverNewBali - driverDeducted;
  const helperBalanceAfter = helperPrev + helperNewBali - helperDeducted;

  setBalancePrevText("driver-prev-balance", driverPrev, driverBalance.exists);
  setText("driver-new-bali", formatCurrency(driverNewBali));
  setText("driver-balance-deduction", formatCurrency(driverDeducted));
  setBalanceAfterText("driver-balance-after", driverBalanceAfter);
  setBalancePrevText("helper-prev-balance", helperPrev, helperBalance.exists);
  setText("helper-new-bali", formatCurrency(helperNewBali));
  setText("helper-balance-deduction", formatCurrency(helperDeducted));
  setBalanceAfterText("helper-balance-after", helperBalanceAfter);
}

function getPersonRunningBalance(name, role) {
  const key = `${normalize(name)}|${role}`;
  return payrollState.balances[key]?.runningBalance || 0;
}

function setBalanceAfterText(id, value) {
  const el = $(id);
  if (!el) return;
  const amount = parseNumber(value);
  if (amount > 0) {
    el.textContent = `${formatCurrency(amount)} (Remaining Balance)`;
    el.className = "balance-positive";
  } else if (amount < 0) {
    el.textContent = `${formatCurrency(Math.abs(amount))} (Salary Remaining to Deposit)`;
    el.className = "balance-negative";
  } else {
    el.textContent = formatCurrency(0);
    el.className = "";
  }
}

// ── Truck Monitoring placeholder ──────────────────────────────────────────────
function loadTruckMonitoringTripsForCutoff() {
  console.info("loadTruckMonitoringTripsForCutoff: Truck Monitoring data source not connected yet. Will pull from Google Sheets once connected.");
  return Promise.resolve({ ok: false, placeholder: true, trips: [] });
}

// ── Status helpers ─────────────────────────────────────────────────────────────
function mapPayrollToApprovalStatus(status, existing) {
  if (status === "For Approval" || status === "Submitted") return "Pending";
  if (status === "Approved") return "Approved";
  if (status === "For Deposit") return "Approved";
  if (status === "Deposited") return "Approved";
  if (status === "Returned") return "Returned";
  if (status === "Rejected") return "Rejected";
  if (status === "Cancelled") return "Cancelled";
  return existing || status || "Draft";
}

function submitPayrollFromRecords(id) {
  const record = findPayrollRecordByLookupId(id);
  if (!record) return;
  if (!["Draft", "Returned"].includes(record.status)) {
    setStatus("Only Draft or Returned payrolls can be submitted.", "warning");
    return;
  }
  const payrollId = record.payrollNumber || record.payroll_id || record.payrollId || record.id;
  console.log("Payroll submit clicked", payrollId);
  record.status = "For Approval";
  record.approvalStatus = "Pending";
  record.paymentStatus = "Unpaid";
  record.updatedAt = new Date().toISOString();
  writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
  renderPayrollRecordsTable();
  renderForApprovalQueue();
  setStatus(`${record.payrollNumber || record.id} submitted for approval. Syncing...`, "info");
  updatePayrollStatusInWorker(payrollId, {
    status: "For Approval",
    approval_status: "Pending",
    payment_status: "Unpaid"
  })
    .then(result => {
      if (result.record) {
        const normalized = normalizeSupabasePayrollRecord(result.record);
        payrollState.records = mergePayrollRecords(payrollState.records, [normalized]);
        writeJson(PAYROLL_RECORDS_KEY, payrollState.records);
      }
      renderPayrollRecordsTable();
      renderForApprovalQueue();
      setStatus(`${record.payrollNumber || record.id} submitted for approval.`, "success");
      loadSavedPayrollRecordsFromSupabase();
    })
    .catch(error => {
      console.warn("Payroll submit status sync failed", error);
      savePayrollToSupabase(record)
        .then(() => {
          renderPayrollRecordsTable();
          setStatus(`${record.payrollNumber || record.id} submitted locally and synced.`, "success");
        })
        .catch(syncError => {
          console.warn("Payroll submit fallback save failed", syncError);
          setStatus("Submitted locally. Supabase sync failed.", "warning");
        });
    });
}

document.addEventListener("DOMContentLoaded", initPayrollPage);
