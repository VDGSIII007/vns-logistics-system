import fs from "node:fs/promises";

const MASTER_SPREADSHEET_ID = "14JVeGkI3EIaZEHix56ICnFjOE56mrB9LK5sulgPTc7Q";
const CASH_SPREADSHEET_ID = "144qkV-l3Vo5tN6PusDGhcwLSKjIs2-sQeBYcpdA-bXM";
const DEFAULT_SOURCE_FILE = new URL("./cash-master-data-export.json", import.meta.url);

const SHEETS = {
  Truck_Master: {
    spreadsheetId: MASTER_SPREADSHEET_ID,
    table: "trucks",
    conflict: "truck_id",
    recommended: [
      "Truck_ID", "Plate_Number", "IMEI", "Truck_Type", "Truck_Make", "Body_Type",
      "Trailer_Plate", "Group_Category", "Current_Driver_ID", "Current_Helper_ID",
      "Current_Driver_Name", "Current_Helper_Name", "Dispatcher", "Status",
      "GPS_Source", "Last_Known_Latitude", "Last_Known_Longitude", "Last_GPS_Timestamp",
      "Odometer", "ORCR_Status", "Insurance_Expiry", "Registration_Expiry",
      "Remarks", "Created_At", "Updated_At"
    ]
  },
  Driver_Master: {
    spreadsheetId: MASTER_SPREADSHEET_ID,
    table: "drivers",
    conflict: "driver_id",
    recommended: ["Driver_ID", "Driver_Name", "Contact_Number", "GCash_Number", "License_Number", "Status", "Remarks"]
  },
  Helper_Master: {
    spreadsheetId: MASTER_SPREADSHEET_ID,
    table: "helpers",
    conflict: "helper_id",
    recommended: ["Helper_ID", "Helper_Name", "Contact_Number", "GCash_Number", "Status", "Remarks"]
  },
  People_Masterlist: {
    spreadsheetId: CASH_SPREADSHEET_ID,
    table: "payees",
    conflict: "payee_id",
    recommended: ["Payee_ID", "Person_ID", "Person_Name", "Payee_Name", "Role", "GCash_Number", "Bank_Name", "Account_Number", "Status", "Remarks"]
  }
};

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

function makeId(prefix, value) {
  return `${prefix}_${String(value || "unknown").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "unknown"}`;
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

function extractLocalRows(exportData, tabName) {
  const candidate = exportData?.[tabName] || exportData?.tabs?.[tabName] || exportData?.sheets?.[tabName];
  if (!candidate) return null;
  if (Array.isArray(candidate) && candidate.length && !Array.isArray(candidate[0])) {
    return candidate.map((row, index) => ({ __rowNumber: index + 2, ...row }));
  }
  const values = Array.isArray(candidate) ? candidate : candidate.values || candidate.rows || [];
  return valuesToRows(values);
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

async function fetchSheetRows(spreadsheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google CSV export failed for ${tabName} (${response.status})`);
  return valuesToRows(csvParse(await response.text()));
}

function logMissingColumns(tabName, rows, recommended) {
  const headers = new Set(Object.keys(rows[0] || {}).map(normalizeHeader));
  const missing = recommended.filter(header => !headers.has(normalizeHeader(header)));
  if (missing.length) console.warn(`${tabName}: missing recommended columns: ${missing.join(", ")}`);
}

function mapTruck(row) {
  const truckId = cleanText(getFirst(row, ["Truck_ID", "truck_id"])) || makeId("truck", getFirst(row, ["Plate_Number"]));
  return {
    truck_id: truckId,
    plate_number: cleanText(getFirst(row, ["Plate_Number"])),
    imei: cleanText(getFirst(row, ["IMEI"])),
    truck_type: cleanText(getFirst(row, ["Truck_Type"])),
    truck_make: cleanText(getFirst(row, ["Truck_Make"])),
    body_type: cleanText(getFirst(row, ["Body_Type"])),
    trailer_plate: cleanText(getFirst(row, ["Trailer_Plate"])),
    group_category: cleanText(getFirst(row, ["Group_Category"])),
    current_driver_id: cleanText(getFirst(row, ["Current_Driver_ID"])),
    current_helper_id: cleanText(getFirst(row, ["Current_Helper_ID"])),
    current_driver_name: cleanText(getFirst(row, ["Current_Driver_Name"])),
    current_helper_name: cleanText(getFirst(row, ["Current_Helper_Name"])),
    dispatcher: cleanText(getFirst(row, ["Dispatcher"])),
    status: cleanText(getFirst(row, ["Status"])),
    gps_source: cleanText(getFirst(row, ["GPS_Source"])),
    last_known_latitude: parseNumber(getFirst(row, ["Last_Known_Latitude"])),
    last_known_longitude: parseNumber(getFirst(row, ["Last_Known_Longitude"])),
    last_gps_timestamp: parseTimestamp(getFirst(row, ["Last_GPS_Timestamp"])),
    odometer: parseNumber(getFirst(row, ["Odometer"])),
    orcr_status: cleanText(getFirst(row, ["ORCR_Status"])),
    insurance_expiry: parseDate(getFirst(row, ["Insurance_Expiry"])),
    registration_expiry: parseDate(getFirst(row, ["Registration_Expiry"])),
    remarks: cleanText(getFirst(row, ["Remarks"])),
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || new Date().toISOString(),
    updated_at: parseTimestamp(getFirst(row, ["Updated_At"])) || new Date().toISOString()
  };
}

function mapDriver(row) {
  const name = cleanText(getFirst(row, ["Driver_Name", "Name", "Person_Name"]));
  return {
    driver_id: cleanText(getFirst(row, ["Driver_ID"])) || makeId("driver", name),
    driver_name: name,
    phone_number: cleanText(getFirst(row, ["Phone_Number", "Contact_Number", "Mobile_Number"])),
    gcash_number: cleanText(getFirst(row, ["GCash_Number", "Gcash_Number"])),
    license_number: cleanText(getFirst(row, ["License_Number"])),
    status: cleanText(getFirst(row, ["Status"])),
    remarks: cleanText(getFirst(row, ["Remarks"])),
    raw_data: row,
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || new Date().toISOString(),
    updated_at: parseTimestamp(getFirst(row, ["Updated_At"])) || new Date().toISOString()
  };
}

function mapHelper(row) {
  const name = cleanText(getFirst(row, ["Helper_Name", "Name", "Person_Name"]));
  return {
    helper_id: cleanText(getFirst(row, ["Helper_ID"])) || makeId("helper", name),
    helper_name: name,
    phone_number: cleanText(getFirst(row, ["Phone_Number", "Contact_Number", "Mobile_Number"])),
    gcash_number: cleanText(getFirst(row, ["GCash_Number", "Gcash_Number"])),
    status: cleanText(getFirst(row, ["Status"])),
    remarks: cleanText(getFirst(row, ["Remarks"])),
    raw_data: row,
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || new Date().toISOString(),
    updated_at: parseTimestamp(getFirst(row, ["Updated_At"])) || new Date().toISOString()
  };
}

function mapPayee(row) {
  const name = cleanText(getFirst(row, ["Payee_Name", "Person_Name", "Name", "Receiver_Name", "Deposit_To"]));
  return {
    payee_id: cleanText(getFirst(row, ["Payee_ID", "Person_ID", "People_ID"])) || makeId("payee", name),
    payee_name: name,
    role: cleanText(getFirst(row, ["Role", "Type"])),
    gcash_number: cleanText(getFirst(row, ["GCash_Number", "Gcash_Number"])),
    bank_name: cleanText(getFirst(row, ["Bank_Name", "Bank"])),
    account_number: cleanText(getFirst(row, ["Account_Number", "Account_No", "Account"])),
    status: cleanText(getFirst(row, ["Status"])),
    remarks: cleanText(getFirst(row, ["Remarks"])),
    raw_data: row,
    created_at: parseTimestamp(getFirst(row, ["Created_At"])) || new Date().toISOString(),
    updated_at: parseTimestamp(getFirst(row, ["Updated_At"])) || new Date().toISOString()
  };
}

function mapperFor(tabName) {
  if (tabName === "Truck_Master") return mapTruck;
  if (tabName === "Driver_Master") return mapDriver;
  if (tabName === "Helper_Master") return mapHelper;
  if (tabName === "People_Masterlist") return mapPayee;
  throw new Error(`No mapper for ${tabName}`);
}

async function upsertRows(table, conflict, rows) {
  if (!rows.length) return;
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  for (let index = 0; index < rows.length; index += 100) {
    const batch = rows.slice(index, index + 100);
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=${conflict}`, {
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
      throw new Error(`${table} upsert failed (${response.status}): ${details}`);
    }
  }
}

const localExport = await readLocalExport();
const summary = [];

for (const [tabName, config] of Object.entries(SHEETS)) {
  let rows = localExport ? extractLocalRows(localExport, tabName) : null;
  let source = rows ? "local-json" : "google-csv";
  if (!rows) {
    try {
      rows = await fetchSheetRows(config.spreadsheetId, tabName);
    } catch (error) {
      console.warn(`${tabName}: ${error.message}. Provide --source=./export.json with this tab to migrate it.`);
      rows = [];
      source = "missing";
    }
  }
  if (rows.length) logMissingColumns(tabName, rows, config.recommended);
  const mapped = rows.map(row => ({
    record: mapperFor(tabName)(row),
    conflict: tabName === "Truck_Master" && !cleanText(getFirst(row, ["Truck_ID", "truck_id"])) ? "plate_number" : config.conflict
  })).filter(item => Object.values(item.record).some(value => value !== null && value !== ""));

  const conflictTargets = Array.from(new Set(mapped.map(item => item.conflict)));
  for (const conflict of conflictTargets) {
    await upsertRows(config.table, conflict, mapped.filter(item => item.conflict === conflict).map(item => item.record));
  }
  summary.push({ tab: tabName, table: config.table, source, rowsRead: rows.length, rowsUpserted: mapped.length });
}

console.log(JSON.stringify({ ok: true, summary }, null, 2));
