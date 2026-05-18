import fs from "node:fs/promises";

const CASH_SPREADSHEET_ID = "144qkV-l3Vo5tN6PusDGhcwLSKjIs2-sQeBYcpdA-bXM";
const CASH_TAB = "Cash_PO_Bali_Log";
const TARGET_TABLE = "cash_requests";
const DEFAULT_SOURCE_FILE = new URL("./cash-po-bali-sheet-export.json", import.meta.url);
const RECOMMENDED_COLUMNS = [
  "Cash_ID", "Request_ID", "Date", "Request_Date", "Plate_Number", "Truck_Type",
  "Driver_Name", "Helper_Name", "Logged_By", "Transaction_Type", "Request_Type",
  "Budget_Type", "Amount", "Source", "Destination", "Remarks", "Deposit_Needed",
  "Receiver_Name", "Deposit_To", "Account_Number", "Review_Status", "Approval_Status",
  "Payment_Status", "Created_At", "Updated_At", "Is_Deleted"
];

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/PHP/gi, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString();
  }
  const parsed = new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseBoolean(value) {
  return ["true", "yes", "1", "deleted"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeHeader(header) {
  return String(header ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getFirst(row, names) {
  for (const name of names) {
    const wanted = normalizeHeader(name);
    const key = Object.keys(row).find(candidate => normalizeHeader(candidate) === wanted);
    const value = key ? row[key] : undefined;
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function makeRequestId(row) {
  return cleanText(getFirst(row, ["Request_ID", "Cash_ID", "Sheet_Log_ID", "ID"])) || `cash_${row.__rowNumber || Date.now()}`;
}

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

function valuesToRows(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = values[0].map(header => String(header || "").trim());
  return values.slice(1).map((valuesRow, index) => {
    const row = { __rowNumber: index + 2 };
    headers.forEach((header, cellIndex) => {
      if (header) row[header] = valuesRow[cellIndex] ?? "";
    });
    return row;
  }).filter(row => Object.entries(row).some(([key, value]) => key !== "__rowNumber" && String(value ?? "").trim()));
}

async function readLocalExport() {
  const sourceArg = process.argv.find(arg => arg.startsWith("--source="));
  const sourceFile = sourceArg ? new URL(sourceArg.slice("--source=".length), `file://${process.cwd()}/`) : DEFAULT_SOURCE_FILE;
  try {
    return JSON.parse(await fs.readFile(sourceFile, "utf8"));
  } catch {
    return null;
  }
}

function extractLocalRows(exportData) {
  const candidate = exportData?.[CASH_TAB] || exportData?.tabs?.[CASH_TAB] || exportData?.sheets?.[CASH_TAB];
  if (!candidate) return null;
  if (Array.isArray(candidate) && candidate.length && !Array.isArray(candidate[0])) {
    return candidate.map((row, index) => ({ __rowNumber: index + 2, ...row }));
  }
  const values = Array.isArray(candidate) ? candidate : candidate.values || candidate.rows || [];
  return valuesToRows(values);
}

async function fetchSheetRows() {
  const url = `https://docs.google.com/spreadsheets/d/${CASH_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(CASH_TAB)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google CSV export failed for ${CASH_TAB} (${response.status})`);
  return valuesToRows(csvParse(await response.text()));
}

function logMissingColumns(rows) {
  const headers = new Set(Object.keys(rows[0] || {}).map(normalizeHeader));
  const missing = RECOMMENDED_COLUMNS.filter(header => !headers.has(normalizeHeader(header)));
  if (missing.length) console.warn(`${CASH_TAB}: missing recommended columns: ${missing.join(", ")}`);
}

function mapCashRow(row) {
  const requestType = cleanText(getFirst(row, ["Request_Type", "Transaction_Type", "Type"]));
  const approvalStatus = cleanText(getFirst(row, ["Approval_Status", "Review_Status", "Status"]));
  return {
    request_id: makeRequestId(row),
    request_date: parseDate(getFirst(row, ["Request_Date", "Date", "Transaction_Date"])),
    group_name: cleanText(getFirst(row, ["Group_Name", "Group_Category", "Group"])),
    plate_number: cleanText(getFirst(row, ["Plate_Number", "Plate"])),
    truck_type: cleanText(getFirst(row, ["Truck_Type", "Body_Type"])),
    driver_name: cleanText(getFirst(row, ["Driver_Name", "Driver"])),
    helper_name: cleanText(getFirst(row, ["Helper_Name", "Helper"])),
    logged_by: cleanText(getFirst(row, ["Logged_By", "Encoded_By", "Sender"])),
    request_type: requestType,
    budget_type: cleanText(getFirst(row, ["Budget_Type", "PO_Number", "Role"])),
    amount: parseNumber(getFirst(row, ["Amount", "Total_Amount", "Cash_Amount"])),
    source: cleanText(getFirst(row, ["Source", "From", "Fuel_Station"])),
    destination: cleanText(getFirst(row, ["Destination", "Route", "To"])),
    remarks: cleanText(getFirst(row, ["Remarks", "Notes"])),
    deposit_needed: cleanText(getFirst(row, ["Deposit_Needed", "Deposit_Need"])),
    receiver_name: cleanText(getFirst(row, ["Receiver_Name", "Person_Name", "Payee", "Deposit_To"])),
    deposit_to: cleanText(getFirst(row, ["Deposit_To", "Person_Name", "Payee"])),
    account_number: cleanText(getFirst(row, ["Account_Number", "GCash_Number", "Gcash_Number"])),
    status: cleanText(getFirst(row, ["Status"])) || "Draft",
    approval_status: approvalStatus || "Pending",
    payment_status: cleanText(getFirst(row, ["Payment_Status"])) || "Unpaid",
    approved_by: cleanText(getFirst(row, ["Approved_By"])),
    approved_at: parseTimestamp(getFirst(row, ["Approved_At"])),
    paid_by: cleanText(getFirst(row, ["Paid_By"])),
    paid_at: parseTimestamp(getFirst(row, ["Paid_At"])),
    backup_status: "pending",
    backup_synced_at: null,
    backup_error: null,
    raw_data: row,
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || new Date().toISOString(),
    updated_at: parseTimestamp(getFirst(row, ["Updated_At"])) || new Date().toISOString(),
    is_deleted: parseBoolean(getFirst(row, ["Is_Deleted", "Deleted"]))
  };
}

async function upsertRows(rows) {
  if (!rows.length) return;
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    const response = await fetch(`${supabaseUrl}/rest/v1/${TARGET_TABLE}?on_conflict=request_id`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(batch)
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`${TARGET_TABLE} upsert failed (${response.status}): ${details}`);
    }
  }
}

const localExport = await readLocalExport();
let rows = localExport ? extractLocalRows(localExport) : null;
let source = rows ? "local-json" : "google-csv";
if (!rows) {
  rows = await fetchSheetRows();
}

if (rows.length) logMissingColumns(rows);
const mapped = rows.map(mapCashRow).filter(record => record.request_id);
await upsertRows(mapped);

console.log(JSON.stringify({
  ok: true,
  tab: CASH_TAB,
  table: TARGET_TABLE,
  source,
  rowsRead: rows.length,
  rowsUpserted: mapped.length
}, null, 2));
