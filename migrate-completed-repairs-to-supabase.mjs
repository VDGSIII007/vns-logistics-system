import fs from "node:fs/promises";

const TAB_NAME = "Completed_Repairs";
const TARGET_TABLE = "completed_repairs";
const SOURCE_FILE = new URL("./repair-master-sheet-export.json", import.meta.url);
const DEFAULT_HEADERS = [
  "Completed_Repair_ID",
  "Linked_Repair_ID",
  "Linked_For_Repair_ID",
  "Date_Finished",
  "Group_Category",
  "Plate_Number",
  "Truck_Type",
  "Driver",
  "Mechanic_Worker",
  "Shop_Name",
  "Work_Done",
  "Parts_Item_Name",
  "Quantity",
  "Unit_Cost",
  "Labor_Cost",
  "Parts_Cost",
  "Total_Amount",
  "Approval_Status",
  "Payment_Status",
  "Payee",
  "Remarks",
  "Created_At",
  "Updated_At"
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

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/PHP/gi, "").replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parseBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "1", "deleted"].includes(normalized);
}

function getFirst(row, possibleHeaderNames) {
  for (const header of possibleHeaderNames) {
    const value = row[header];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeRow(headers, rowValues, rowNumber) {
  const row = { __rowNumber: rowNumber };
  headers.forEach((header, index) => {
    row[header] = rowValues[index] ?? "";
  });
  return row;
}

function isBlankRow(row) {
  return Object.entries(row)
    .filter(([key]) => key !== "__rowNumber")
    .every(([, value]) => String(value ?? "").trim() === "");
}

function extractRows(exportData, tabName, fallbackHeaders) {
  const candidate = exportData?.[tabName] || exportData?.tabs?.[tabName] || exportData?.sheets?.[tabName];
  if (!candidate) return { rows: [], missing: true };

  if (Array.isArray(candidate) && candidate.length && !Array.isArray(candidate[0])) {
    return { rows: candidate.map((row, index) => ({ __rowNumber: index + 2, ...row })), missing: false };
  }

  const values = Array.isArray(candidate) ? candidate : candidate.values || candidate.rows || [];
  if (!Array.isArray(values) || !values.length) return { rows: [], missing: false };

  const headers = values[0]?.length ? values[0] : fallbackHeaders;
  return {
    rows: values.slice(1).map((row, index) => normalizeRow(headers, row, index + 2)),
    missing: false
  };
}

function mapRow(row) {
  const sourceRowId = cleanText(getFirst(row, ["Completed_Repair_ID", "source_row_id"])) || `${TAB_NAME}:${row.__rowNumber}`;
  const linkedRepairId = cleanText(getFirst(row, ["Linked_Repair_ID", "Request_ID"]));
  const linkedForRepairId = cleanText(getFirst(row, ["Linked_For_Repair_ID"]));
  const workDone = cleanText(getFirst(row, ["Work_Done", "Repair_Details"]));
  const partsUsed = cleanText(getFirst(row, ["Parts_Item_Name", "Repair_Parts", "Parts_Used"]));
  const laborCost = parseNumber(getFirst(row, ["Labor_Cost"]));
  const laborDetails = laborCost === null ? null : `Labor cost: ${laborCost}`;
  const updatedAt = parseTimestamp(getFirst(row, ["Updated_At", "Created_At"])) || new Date().toISOString();

  return {
    source_row_id: sourceRowId,
    request_id: linkedRepairId || linkedForRepairId,
    plate_number: cleanText(getFirst(row, ["Plate_Number", "Plate"])),
    truck_type: cleanText(getFirst(row, ["Truck_Type"])),
    driver: cleanText(getFirst(row, ["Driver"])),
    helper: cleanText(getFirst(row, ["Helper"])),
    repair_type: cleanText(getFirst(row, ["Repair_Type", "Group_Category", "Approval_Status"])),
    repair_details: workDone,
    parts_used: partsUsed,
    labor_details: laborDetails,
    supplier: cleanText(getFirst(row, ["Supplier", "Shop_Name"])),
    mechanic: cleanText(getFirst(row, ["Mechanic_Worker", "Mechanic", "Assigned_To"])),
    total_cost: parseNumber(getFirst(row, ["Total_Amount", "Total_Cost", "Final_Cost"])),
    date_started: parseDate(getFirst(row, ["Date_Started", "Start_Date"])),
    date_completed: parseDate(getFirst(row, ["Date_Finished", "Date_Completed"])),
    status: cleanText(getFirst(row, ["Status"])) || "Completed",
    payment_status: cleanText(getFirst(row, ["Payment_Status"])),
    remarks: cleanText(getFirst(row, ["Remarks"])),
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || undefined,
    updated_at: updatedAt,
    is_deleted: parseBoolean(getFirst(row, ["Is_Deleted"])),
    raw_data: row
  };
}

async function upsertRows(rows) {
  if (!rows.length) return;
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/${TARGET_TABLE}?on_conflict=source_row_id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Supabase upsert failed (${response.status}): ${details}`);
  }
}

const errors = [];
const exportData = JSON.parse(await fs.readFile(SOURCE_FILE, "utf8"));
const { rows: sourceRows, missing } = extractRows(exportData, TAB_NAME, DEFAULT_HEADERS);
const nonBlankRows = sourceRows.filter(row => !isBlankRow(row));
const preparedRows = [];

for (const row of nonBlankRows) {
  try {
    preparedRows.push(mapRow(row));
  } catch (error) {
    errors.push({ rowNumber: row.__rowNumber, error: error.message });
  }
}

if (!missing) {
  for (let index = 0; index < preparedRows.length; index += 100) {
    await upsertRows(preparedRows.slice(index, index + 100));
  }
}

console.log(JSON.stringify({
  tab: TAB_NAME,
  missing,
  totalRowsFound: sourceRows.length,
  rowsPrepared: preparedRows.length,
  rowsUpserted: missing ? 0 : preparedRows.length,
  rowsSkipped: sourceRows.length - preparedRows.length,
  errors
}, null, 2));
