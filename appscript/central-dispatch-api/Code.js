// ============================================================
// VNS CENTRAL DISPATCH API — Google Apps Script
// Paste this into the Apps Script editor of:
//   "VNS Central Dispatch API" spreadsheet
// READ-ONLY — does not write to any source sheet
// ============================================================

// ============================================================
// SOURCE CONFIGS — one entry per commodity source spreadsheet
// sheetName and headerRow are exact; no tab-guessing needed
// ============================================================

const SOURCE_CONFIGS = [
  {
    key:           "sugar",
    group:         "Sugar",
    spreadsheetId: "1sNrdsL8w02VmqwXPBend3SwmiBwQKzCO9eXYvZAIyIE",
    sheetName:     "Sugar",
    headerRow:     2,
  },
  {
    key:           "bottle",
    group:         "Bottle",
    spreadsheetId: "1eQDXnqH07GIzmdYPgXPet4LgsaJQE5Uxi8QthVsCqN4",
    sheetName:     "Bottle",
    headerRow:     2,
  },
  {
    key:           "preformResin",
    group:         "Preform / Resin",
    spreadsheetId: "1QHakdcfo8PuqptKhG7zI_UWnr_W4wvFDP8AJAEtF2sw",
    sheetName:     "PreformResin",
    headerRow:     2,
  },
  {
    key:           "capsCrown",
    group:         "Caps / Crown",
    spreadsheetId: "1H_G2nONH9KgB85sgpjIhHFNtXR416wBsEUd_6jMbxsw",
    sheetName:     "CapsCrown",
    headerRow:     2,
  },
];

// ============================================================
// HEADER ALIASES — maps canonical field names to possible
// column header spellings found in source sheets
// ============================================================

const HEADER_ALIASES = {
  plateNumber:  ["Plate Number", "Plate", "Platenumber"],
  imei:         ["IMEI"],
  driverName:   ["Driver", "Driver Name"],
  helperName:   ["Helper", "Helper Name"],
  status:       ["Status"],
  commodity:    ["Commodity", "Group", "Type"],
  source:       ["Source", "Origin"],
  destination:  ["Destination"],
  latitude:     ["Latitude", "Lat"],
  longitude:    ["Longitude", "Lng", "Long"],
  fullAddress:  ["Full Address", "Address"],
  mapLink:      ["Map Link", "Location Link"],
  lastUpdated:  ["Last Updated", "Timestamp", "GPS Timestamp"],
  etaAta:       ["ETA / ATA", "ETA", "ATA"],
  dateAssigned: ["Date Assigned", "Assigned Date", "Booking Date"],
  deliveredAt:  ["Delivered At", "Date Delivered"],
  remarks:      ["Remarks", "Notes"],
};

// ============================================================
// doGet — main entry point
// ============================================================

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "health";

  try {
    switch (action) {
      case "health":
        return jsonResponse_({ ok: true, status: "VNS Central Dispatch API is running", timestamp: new Date().toISOString() });

      case "getDispatchDashboard":
        return jsonResponse_(getDispatchDashboard_());

      case "getDispatchTrucks":
        return jsonResponse_(getDispatchTrucks_());

      case "getDispatchTrips":
        return jsonResponse_(getDispatchTrips_());

      case "getDispatchLogs":
        return jsonResponse_(getDispatchLogs_());

      default:
        return jsonResponse_({ ok: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: err.message, stack: err.stack });
  }
}

// ============================================================
// jsonResponse_ — wraps output as JSON ContentService response
// ============================================================

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// getDispatchDashboard_ — aggregates trucks + trips + logs
// ============================================================

function getDispatchDashboard_() {
  const trucks   = getDispatchTrucks_();
  const trips    = getDispatchTrips_();
  const logs     = getDispatchLogs_();

  const warnings = [
    ...(trucks.warnings  || []),
    ...(trips.warnings   || []),
    ...(logs.warnings    || []),
  ];

  return {
    ok:       true,
    trucks:   trucks.trucks   || [],
    trips:    trips.trips     || [],
    logs:     logs.logs       || [],
    warnings: warnings,
  };
}

// ============================================================
// getDispatchTrucks_ — reads truck rows from all sources,
// deduplicates by plate number (keeps most recently updated)
// ============================================================

function getDispatchTrucks_() {
  const allRows  = [];
  const warnings = [];

  for (const source of SOURCE_CONFIGS) {
    const result = readSourceRows_(source);
    allRows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  const truckMap = {};
  for (const row of allRows) {
    const plate = row.plateNumber || null;
    if (!plate) continue;
    const key = plate.toString().trim().toLowerCase();
    if (!truckMap[key]) {
      truckMap[key] = row;
    } else {
      const existing    = truckMap[key];
      const existingDate = existing.lastUpdated ? new Date(existing.lastUpdated) : new Date(0);
      const newDate      = row.lastUpdated      ? new Date(row.lastUpdated)      : new Date(0);
      if (newDate > existingDate) truckMap[key] = row;
    }
  }

  return {
    ok:       true,
    trucks:   Object.values(truckMap),
    warnings: warnings,
  };
}

// ============================================================
// getDispatchTrips_ — returns all trip rows from all sources
// ============================================================

function getDispatchTrips_() {
  const allRows  = [];
  const warnings = [];

  for (const source of SOURCE_CONFIGS) {
    const result = readSourceRows_(source);
    allRows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  return {
    ok:       true,
    trips:    allRows,
    warnings: warnings,
  };
}

// ============================================================
// getDispatchLogs_ — rows with deliveredAt or a delivered status
// ============================================================

function getDispatchLogs_() {
  const allRows  = [];
  const warnings = [];

  for (const source of SOURCE_CONFIGS) {
    const result = readSourceRows_(source);
    allRows.push(...result.rows);
    warnings.push(...result.warnings);
  }

  const DELIVERED_STATUSES = ["delivered", "done", "completed", "arrived", "complete"];

  const logs = allRows.filter(row => {
    if (row.deliveredAt && row.deliveredAt !== "") return true;
    if (row.status) {
      const s = row.status.toString().toLowerCase().trim();
      return DELIVERED_STATUSES.some(ds => s.includes(ds));
    }
    return false;
  });

  return {
    ok:       true,
    logs:     logs,
    warnings: warnings,
  };
}

// ============================================================
// readSourceRows_ — opens a spreadsheet by ID, finds the sheet
// by name (falls back to first visible), reads all values,
// and returns mapped row objects + warnings
// ============================================================

function readSourceRows_(source) {
  const rows     = [];
  const warnings = [];

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
  } catch (err) {
    warnings.push("[" + source.group + "] Could not open spreadsheet: " + err.message);
    return { rows, warnings };
  }

  // Use the exact sheetName from config; fall back to first visible sheet
  let sheet = spreadsheet.getSheetByName(source.sheetName);
  if (!sheet) {
    const firstVisible = spreadsheet.getSheets().find(s => !s.isSheetHidden());
    if (firstVisible) {
      warnings.push("[" + source.group + "] Sheet '" + source.sheetName + "' not found. Using: '" + firstVisible.getName() + "'.");
      sheet = firstVisible;
    } else {
      warnings.push("[" + source.group + "] No visible sheets found.");
      return { rows, warnings };
    }
  }

  let values;
  try {
    values = sheet.getDataRange().getValues();
  } catch (err) {
    warnings.push("[" + source.group + "] Could not read sheet data: " + err.message);
    return { rows, warnings };
  }

  // Need at least headerRow rows plus one data row
  if (!values || values.length <= source.headerRow) {
    warnings.push("[" + source.group + "] Sheet '" + sheet.getName() + "' has no data rows below header row " + source.headerRow + ".");
    return { rows, warnings };
  }

  const mapped = mapRowsByHeaders_(values, source);
  warnings.push(...mapped.warnings);
  rows.push(...mapped.rows);

  return { rows, warnings };
}

// ============================================================
// mapRowsByHeaders_ — uses source.headerRow (1-indexed) to
// locate the header row; data starts on the row after it;
// rows where plateNumber is blank are skipped
// ============================================================

function mapRowsByHeaders_(values, source) {
  const warnings    = [];
  const rows        = [];
  const headerRowIdx = source.headerRow - 1;  // convert to 0-indexed

  const rawHeaders = values[headerRowIdx].map(h => (h || "").toString().trim());

  // Build case-insensitive header → column index map
  const headerIndexMap = {};
  rawHeaders.forEach((h, i) => {
    if (h) headerIndexMap[h.toLowerCase()] = i;
  });

  // Resolve each canonical field to a column index
  const fieldColumnIndex = {};
  for (const field in HEADER_ALIASES) {
    const idx = findColumnIndex_(headerIndexMap, HEADER_ALIASES[field]);
    if (idx !== -1) {
      fieldColumnIndex[field] = idx;
    } else {
      warnings.push("[" + source.group + "] Column not found for field '" + field + "'. Will return null.");
    }
  }

  // Data rows start immediately after the header row
  for (let i = source.headerRow; i < values.length; i++) {
    const row = values[i];

    // Skip entirely empty rows
    if (row.every(cell => cell === "" || cell === null || cell === undefined)) continue;

    const obj = {
      id:            null,
      groupCategory: source.group || null,
      plateNumber:   null,
      imei:          null,
      driverName:    null,
      helperName:    null,
      status:        null,
      commodity:     source.group || null,  // default to group; overridden if column exists
      source:        null,
      destination:   null,
      latitude:      null,
      longitude:     null,
      fullAddress:   null,
      mapLink:       null,
      lastUpdated:   null,
      etaAta:        null,
      dateAssigned:  null,
      deliveredAt:   null,
      remarks:       null,
    };

    for (const field in fieldColumnIndex) {
      const colIdx = fieldColumnIndex[field];
      const raw    = (colIdx < row.length) ? row[colIdx] : "";

      if (field === "latitude" || field === "longitude") {
        obj[field] = normalizeNumber_(raw);
      } else if (field === "lastUpdated" || field === "dateAssigned" || field === "deliveredAt") {
        obj[field] = formatDateValue_(raw);
      } else {
        obj[field] = (raw !== null && raw !== undefined && raw !== "") ? raw.toString().trim() : null;
      }
    }

    // Skip rows where plateNumber is blank
    if (!obj.plateNumber) continue;

    obj.id = [source.group, obj.plateNumber, i].filter(Boolean).join("-");

    rows.push(obj);
  }

  return { rows, warnings };
}

// ============================================================
// findColumnIndex_ — returns first matching alias index
// ============================================================

function findColumnIndex_(headerIndexMap, aliases) {
  for (const alias of aliases) {
    const key = alias.toLowerCase().trim();
    if (key in headerIndexMap) return headerIndexMap[key];
  }
  return -1;
}

// ============================================================
// normalizeNumber_ — safely parse a number from a cell value
// ============================================================

function normalizeNumber_(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(value.toString().trim());
  return isNaN(n) ? null : n;
}

// ============================================================
// formatDateValue_ — safely format a date cell to ISO string
// ============================================================

function formatDateValue_(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value.toISOString();
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? value.toString().trim() : d.toISOString();
  } catch (e) {
    return value.toString().trim();
  }
}
