// VNS Cash / PO / Bali Log parser.
// First version stores locally until the Apps Script endpoint is ready.
const CASH_WEB_APP_URL = "";
const CASH_LOCAL_STORAGE_KEY = "vnsCashPoBaliRecords";

const cashInput = document.getElementById("cash-input");
const parseButton = document.getElementById("cash-parse-button");
const clearInputButton = document.getElementById("cash-clear-input-button");
const selectAllButton = document.getElementById("cash-select-all-button");
const unselectAllButton = document.getElementById("cash-unselect-all-button");
const removeSelectedButton = document.getElementById("cash-remove-selected-button");
const saveButton = document.getElementById("cash-save-button");
const tableBody = document.getElementById("cash-table-body");
const statusLine = document.getElementById("cash-status");
const savedList = document.getElementById("cash-saved-list");
const refreshLocalButton = document.getElementById("cash-refresh-local-button");

const summaryCount = document.getElementById("cash-summary-count");
const summaryBudget = document.getElementById("cash-summary-budget");
const summaryBali = document.getElementById("cash-summary-bali");
const summaryPo = document.getElementById("cash-summary-po");
const summaryLiters = document.getElementById("cash-summary-liters");

const CASH_FIELDS = [
  "Message_Date",
  "Message_Time",
  "Sender",
  "Plate_Number",
  "Type",
  "Person_Name",
  "Role",
  "GCash_Number",
  "Amount",
  "PO_Number",
  "Liters",
  "Fuel_Station",
  "Route_Trip",
  "Balance_After_Payroll",
  "Review_Status",
  "Remarks"
];

const TYPE_OPTIONS = [
  "Trip Budget",
  "Diesel PO",
  "Bali",
  "Bali Helper",
  "Bali Driver",
  "Salary Balance",
  "For Review"
];

const REVIEW_STATUS_OPTIONS = ["For Review", "Needs Correction", "Ready"];
const FUEL_STATIONS = ["Unioil", "Shell", "Petron", "Phoenix", "Caltex", "Seaoil", "Cleanfuel", "Flying V"];

let parsedRows = [];
let savedRowsSignature = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "PHP 0";
  return `PHP ${amount.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

function setStatus(message, type = "") {
  if (!statusLine) return;
  statusLine.className = `cash-status${type ? ` ${type}` : ""}`;
  statusLine.textContent = message;
}

function emptyTableMarkup() {
  return '<tr><td colspan="17" class="empty">No parsed records yet. Paste Viber messages and click Parse Message.</td></tr>';
}

function stripViberMarks(value) {
  return String(value || "").replace(/[\u2066-\u2069]/g, "").trim();
}

function normalizePlate(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function findPlate(text) {
  const match = String(text || "").toUpperCase().match(/\b([A-Z]{2,4})\s?(\d{3,4})\b/);
  return match ? `${match[1]}${match[2]}` : "";
}

function parseMoney(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : "";
}

function extractFirstMoney(text) {
  const match = String(text || "").match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b/);
  return match ? parseMoney(match[0]) : "";
}

function extractAmount(body, type) {
  if (type === "Diesel PO") return "";
  if (type === "Salary Balance") return extractFirstMoney(body);

  // Deposits usually put the amount after the GCash number and person name.
  // This avoids reading the 09XXXXXXXXX mobile number as the cash amount.
  const gcashLine = String(body || "").split(/\n+/).find(line => /09\d{9}/.test(line)) || "";
  if (gcashLine) {
    const afterNumber = gcashLine.replace(/^.*?09\d{9}\s*/i, "");
    const amountMatch = afterNumber.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b/);
    if (amountMatch) return parseMoney(amountMatch[0]);
  }

  const scrubbed = String(body || "")
    .replace(/09\d{9}/g, "")
    .replace(/\bp\.?\s*o\.?\s*[:#-]?\s*\d+/gi, "")
    .replace(/\b\d+(?:\.\d+)?\s*liters?\b/gi, "")
    .replace(/\b(?:may|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s+\d{4}\b/gi, "");
  return extractFirstMoney(scrubbed);
}

function formatDateForSheet(dateText) {
  const match = String(dateText || "").match(/[A-Za-z]+,\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const months = {
    january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
  };
  if (!match) return dateText;
  const day = match[1].padStart(2, "0");
  const month = months[match[2].toLowerCase()];
  return month ? `${match[3]}-${month}-${day}` : dateText;
}

function normalizeTime(timeText) {
  return String(timeText || "").trim().toUpperCase();
}

function getMessageBlocks(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return [];

  // Each Viber copy starts with: [ Friday, 1 May 2026 7:53 PM ] Sender:
  const pattern = /\[\s*([A-Za-z]+,\s+\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))\s*\]\s*([^:]+):/gi;
  const matches = [...text.matchAll(pattern)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return {
      messageDate: formatDateForSheet(match[1]),
      messageTime: normalizeTime(match[2]),
      sender: stripViberMarks(match[3]),
      body: text.slice(start, end).trim(),
      sourceMessage: text.slice(match.index, end).trim()
    };
  });
}

function lineBeforeAmount(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (/\b\d{1,3}(?:,\d{3})+|\b\d{4,}\b/.test(lines[index])) {
      return lines[index - 1] || "";
    }
  }
  return "";
}

function extractSalaryBalanceAmount(lines, body) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const amount = extractFirstMoney(lines[index]);
    if (amount !== "") return amount;
  }
  return extractFirstMoney(body);
}

function cleanPersonName(value) {
  return String(value || "")
    .replace(/\bGcash\b/gi, "")
    .replace(/\b09\d{9}\b/g, "")
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, "")
    .replace(/\b(budget|bali|bale|helper|driver|may|done|sahod|balance|payroll|deposited)\b/gi, "")
    .replace(/[^\w\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPersonName(body, lines, type) {
  if (type === "Diesel PO") return "";
  if (type === "Salary Balance") return cleanPersonName(lineBeforeAmount(lines));

  const gcashLine = lines.find(line => /09\d{9}/.test(line)) || "";
  if (gcashLine) {
    const afterNumber = gcashLine.replace(/^.*?(09\d{9})\s*/i, "");
    const beforeAmount = afterNumber.split(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b/)[0];
    return cleanPersonName(beforeAmount);
  }

  const nameLine = lines.find(line => /^[A-Za-z\s.-]{4,}$/.test(line) && !/(deposited|budget|balance|sahod|p\.?o|liters?)/i.test(line));
  return cleanPersonName(nameLine || body);
}

function detectFuelStation(body) {
  const station = FUEL_STATIONS.find(name => new RegExp(`\\b${name.replace(" ", "\\s+")}\\b`, "i").test(body));
  return station || "";
}

function extractRouteTrip(lines) {
  const routeLine = lines.find(line =>
    /(biyahe|byahe|trip|route|pinamucan|batangas|pier|port|delivery|loading|unloading)/i.test(line) &&
    !/(p\.?o\.?|liters?|gcash|deposited|budget)/i.test(line)
  );
  return routeLine ? routeLine.trim() : "";
}

function detectTypeAndRole(body) {
  const lower = body.toLowerCase();
  if (/\bp\.?\s*o\.?\b/.test(lower) || /\bpo\b/.test(lower)) return { type: "Diesel PO", role: "" };
  if (/(done sahod|sahod|payroll|balance)/i.test(body)) return { type: "Salary Balance", role: "" };
  if (/\b(bali|bale)\b/i.test(body)) {
    if (/\bhelper\b/i.test(body)) return { type: "Bali Helper", role: "Helper" };
    if (/\bdriver\b/i.test(body)) return { type: "Bali Driver", role: "Driver" };
    return { type: "Bali", role: "" };
  }
  if (/\bbudget\b/i.test(body)) return { type: "Trip Budget", role: "" };
  return { type: "For Review", role: "" };
}

function makeDuplicateKey(row) {
  return [
    row.Message_Date,
    normalizePlate(row.Plate_Number),
    row.Type,
    String(row.Person_Name || "").trim().toLowerCase(),
    row.Amount || "",
    row.PO_Number || "",
    row.Liters || ""
  ].join("|");
}

function parseCashBlock(block) {
  const body = stripViberMarks(block.body);
  const lines = body.split(/\n+/).map(line => stripViberMarks(line)).filter(Boolean);
  const { type, role } = detectTypeAndRole(body);
  const lowerBody = body.toLowerCase();
  const remarks = [];

  const poMatch = body.match(/\bp\.?\s*o\.?\s*[:#-]?\s*(\d+)/i) || body.match(/\bpo\s*[:#-]?\s*(\d+)/i);
  const litersMatch = body.match(/(\d+(?:\.\d+)?)\s*liters?/i);
  const gcashMatch = body.match(/\b(09\d{9})\b/);
  const balanceAmount = type === "Salary Balance" ? extractSalaryBalanceAmount(lines, body) : "";
  const amount = type === "Salary Balance" ? balanceAmount : extractAmount(body, type);
  const personName = extractPersonName(body, lines, type);

  if (role === "Driver" && /melvin/i.test(personName)) {
    remarks.push("Check role: message says driver.");
  }
  if (/\bmay\s+3026\b/i.test(body)) {
    remarks.push("Possible date typo.");
  }
  if (type === "Bali" && !role) {
    remarks.push("Bali role not specified.");
  }

  const row = {
    Record_ID: `LOCAL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    Message_Date: block.messageDate,
    Message_Time: block.messageTime,
    Encoded_At: new Date().toISOString(),
    Source_Platform: "Viber",
    Sender: block.sender,
    Plate_Number: findPlate(body),
    Type: type,
    Person_Name: personName,
    Role: role,
    GCash_Number: gcashMatch ? gcashMatch[1] : "",
    Amount: amount,
    PO_Number: poMatch ? poMatch[1] : "",
    Liters: litersMatch ? Number(litersMatch[1]) : "",
    Fuel_Station: detectFuelStation(body),
    Route_Trip: extractRouteTrip(lines),
    Balance_After_Payroll: balanceAmount,
    Source_Message: block.sourceMessage,
    Review_Status: "For Review",
    Posted_Status: "Unposted",
    Payroll_Period_ID: "",
    Liquidation_Status: "Unliquidated",
    Duplicate_Key: "",
    Remarks: remarks.join(" "),
    Created_By: "Web User"
  };

  if (type === "For Review" || (lowerBody.includes("gcash") && !personName)) {
    row.Review_Status = "Needs Correction";
  }
  if (remarks.some(remark => /check role|date typo|not specified/i.test(remark))) {
    row.Review_Status = "Needs Correction";
  }

  row.Duplicate_Key = makeDuplicateKey(row);
  return row;
}

function markDuplicateRows(rows) {
  const counts = rows.reduce((map, row) => {
    map.set(row.Duplicate_Key, (map.get(row.Duplicate_Key) || 0) + 1);
    return map;
  }, new Map());

  rows.forEach(row => {
    if (counts.get(row.Duplicate_Key) <= 1) return;
    row.Review_Status = "Needs Correction";
    row.Remarks = [row.Remarks, "Duplicate parsed row detected."].filter(Boolean).join(" ");
  });
}

function parseCashMessages(rawText) {
  const rows = getMessageBlocks(rawText).map(parseCashBlock);
  markDuplicateRows(rows);
  return rows;
}

function buildOptions(options, currentValue) {
  return options.map(option => `<option value="${escapeHtml(option)}"${option === currentValue ? " selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function renderTable() {
  if (!tableBody) return;
  if (!parsedRows.length) {
    tableBody.innerHTML = emptyTableMarkup();
    updateSummary();
    return;
  }

  tableBody.innerHTML = parsedRows.map((row, index) => `
    <tr class="${row.Review_Status === "Needs Correction" ? "cash-row-needs-correction" : ""}">
      <td class="select-cell"><input data-cash-select="${index}" type="checkbox" checked aria-label="Select cash log row"></td>
      ${CASH_FIELDS.map(field => {
        if (field === "Type") {
          return `<td><select data-cash-field="${field}" data-row-index="${index}">${buildOptions(TYPE_OPTIONS, row[field])}</select></td>`;
        }
        if (field === "Review_Status") {
          return `<td><select data-cash-field="${field}" data-row-index="${index}">${buildOptions(REVIEW_STATUS_OPTIONS, row[field])}</select></td>`;
        }
        const inputType = ["Amount", "Liters", "Balance_After_Payroll"].includes(field) ? "number" : "text";
        return `<td><input data-cash-field="${field}" data-row-index="${index}" type="${inputType}" step="0.01" value="${escapeHtml(row[field])}"></td>`;
      }).join("")}
    </tr>
  `).join("");
  updateSummary();
}

function collectRowsFromTable() {
  if (!tableBody) return [];
  return Array.from(tableBody.querySelectorAll("tr")).map((tr, index) => {
    if (tr.querySelector(".empty")) return null;
    const base = { ...parsedRows[index] };
    CASH_FIELDS.forEach(field => {
      const input = tr.querySelector(`[data-cash-field="${field}"]`);
      if (!input) return;
      base[field] = ["Amount", "Liters", "Balance_After_Payroll"].includes(field) ? parseMoney(input.value) : input.value.trim();
    });
    base.Duplicate_Key = makeDuplicateKey(base);
    return base;
  }).filter(Boolean);
}

function selectedRowsFromTable() {
  return collectRowsFromTable().filter((_, index) => tableBody.querySelector(`[data-cash-select="${index}"]`)?.checked);
}

function updateSummary() {
  const rows = collectRowsFromTable();
  const totalBudget = rows.filter(row => row.Type === "Trip Budget").reduce((sum, row) => sum + (Number(row.Amount) || 0), 0);
  const totalBali = rows.filter(row => /^Bali/.test(row.Type)).reduce((sum, row) => sum + (Number(row.Amount) || 0), 0);
  const poCount = rows.filter(row => row.Type === "Diesel PO").length;
  const liters = rows.reduce((sum, row) => sum + (Number(row.Liters) || 0), 0);

  if (summaryCount) summaryCount.textContent = String(rows.length);
  if (summaryBudget) summaryBudget.textContent = formatCurrency(totalBudget);
  if (summaryBali) summaryBali.textContent = formatCurrency(totalBali);
  if (summaryPo) summaryPo.textContent = String(poCount);
  if (summaryLiters) summaryLiters.textContent = liters.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function setSelection(checked) {
  tableBody?.querySelectorAll("[data-cash-select]").forEach(checkbox => {
    checkbox.checked = checked;
  });
}

function clearParsedTable() {
  parsedRows = [];
  savedRowsSignature = "";
  renderTable();
}

function clearInputAndRows() {
  if (cashInput) cashInput.value = "";
  clearParsedTable();
  setStatus("");
}

function getLocalRecords() {
  try {
    return JSON.parse(localStorage.getItem(CASH_LOCAL_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function saveLocalRecords(records) {
  const existing = getLocalRecords();
  localStorage.setItem(CASH_LOCAL_STORAGE_KEY, JSON.stringify(existing.concat(records)));
}

function renderLocalRecords() {
  if (!savedList) return;
  const records = getLocalRecords();
  if (!records.length) {
    savedList.innerHTML = '<div class="cash-saved-item">No locally saved records yet.</div>';
    return;
  }
  savedList.innerHTML = records.slice(-25).reverse().map(record => `
    <div class="cash-saved-item">
      ${escapeHtml(record.Message_Date || "-")} | ${escapeHtml(record.Plate_Number || "-")} | ${escapeHtml(record.Type || "-")} | ${escapeHtml(record.Person_Name || "-")} | ${formatCurrency(record.Amount || 0)}
    </div>
  `).join("");
}

function rowsSignature(rows) {
  return rows.map(row => row.Duplicate_Key).join("\n");
}

async function saveRows() {
  const rows = selectedRowsFromTable();
  if (!rows.length) {
    setStatus("No parsed records to save.", "warning");
    return;
  }

  const signature = rowsSignature(rows);
  if (signature && signature === savedRowsSignature) {
    setStatus("These selected records were already saved. Parse a new message or edit rows before saving again.", "warning");
    return;
  }

  setStatus("Saving records...", "info");
  if (saveButton) saveButton.disabled = true;

  try {
    if (!CASH_WEB_APP_URL) {
      saveLocalRecords(rows);
      setStatus("Saved locally. Apps Script endpoint not connected yet.", "success");
    } else {
      await fetch(CASH_WEB_APP_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "saveCashPoBaliRecords", records: rows })
      });
      setStatus("Saved to Google Sheet.", "success");
    }

    savedRowsSignature = signature;
    renderLocalRecords();
    if (window.confirm("Clear parsed message and parsed rows?")) {
      clearInputAndRows();
      setStatus("Input cleared. Ready for next request.", "success");
    } else {
      setStatus("Saved. Parsed rows kept for review.", "success");
    }
  } catch (error) {
    setStatus("Error saving records. Please try again.", "error");
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function wireEvents() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".nav-links");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  parseButton?.addEventListener("click", () => {
    const text = cashInput?.value.trim() || "";
    if (!text) {
      setStatus("Please paste Viber messages before parsing.", "warning");
      return;
    }
    parsedRows = parseCashMessages(text);
    savedRowsSignature = "";
    renderTable();
    setStatus(parsedRows.length ? `Parsed ${parsedRows.length} record${parsedRows.length === 1 ? "" : "s"}.` : "No Viber messages found.", parsedRows.length ? "success" : "warning");
  });

  clearInputButton?.addEventListener("click", clearInputAndRows);
  selectAllButton?.addEventListener("click", () => setSelection(true));
  unselectAllButton?.addEventListener("click", () => setSelection(false));
  removeSelectedButton?.addEventListener("click", () => {
    const selectedIndexes = new Set(
      Array.from(tableBody?.querySelectorAll("[data-cash-select]") || [])
        .filter(checkbox => checkbox.checked)
        .map(checkbox => Number(checkbox.dataset.cashSelect))
    );
    if (!selectedIndexes.size) {
      setStatus("Please select at least one row to remove.", "warning");
      return;
    }
    parsedRows = parsedRows.filter((_, index) => !selectedIndexes.has(index));
    savedRowsSignature = "";
    renderTable();
    setStatus("Selected rows removed.", "success");
  });

  tableBody?.addEventListener("input", event => {
    const input = event.target.closest("[data-cash-field]");
    if (!input) return;
    const rowIndex = Number(input.dataset.rowIndex);
    const field = input.dataset.cashField;
    if (!parsedRows[rowIndex] || !field) return;
    parsedRows[rowIndex][field] = ["Amount", "Liters", "Balance_After_Payroll"].includes(field) ? parseMoney(input.value) : input.value.trim();
    parsedRows[rowIndex].Duplicate_Key = makeDuplicateKey(parsedRows[rowIndex]);
    savedRowsSignature = "";
    updateSummary();
  });

  tableBody?.addEventListener("change", event => {
    if (event.target.closest("[data-cash-field]")) updateSummary();
  });

  saveButton?.addEventListener("click", saveRows);
  refreshLocalButton?.addEventListener("click", renderLocalRecords);
}

wireEvents();
renderTable();
renderLocalRecords();
