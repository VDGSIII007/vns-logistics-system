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

const GEOFENCE_SHEET_NAME = "Geofences Area";

const GEOFENCE_HEADER_ALIASES = {
  name:        ["Name", "Geofence Name", "Location", "Area Name"],
  category:    ["Category", "Type", "Group", "Geofence Type"],
  sourceFile:  ["Source File", "File", "KMZ", "KML", "Source"],
  coordinates: ["Coordinates", "Polygon", "Path", "LatLng", "Lat/Lng", "Points"],
  latitude:    ["Latitude", "Lat"],
  longitude:   ["Longitude", "Lng", "Long"],
  radius:      ["Radius", "Radius Meters", "Radius (m)"],
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
  const geofenceResult = getDispatchGeofences_();

  const warnings = [
    ...(trucks.warnings  || []),
    ...(trips.warnings   || []),
    ...(logs.warnings    || []),
    ...(geofenceResult.warnings || []),
  ];

  return {
    ok:        true,
    trucks:    trucks.trucks   || [],
    trips:     trips.trips     || [],
    logs:      logs.logs       || [],
    geofences: geofenceResult.geofences || [],
    warnings:  warnings,
  };
}

// ============================================================
// getDispatchGeofences_ — reads + deduplicates geofences
// from all source spreadsheets for dashboard map overlays
// ============================================================

function getDispatchGeofences_() {
  const geofences = [];
  const warnings  = [];
  const seen      = {};

  for (const source of SOURCE_CONFIGS) {
    const result = readGeofencesForSource_(source);
    warnings.push(...result.warnings);

    for (const geofence of result.geofences) {
      const key = [
        geofence.name || "",
        geofence.sourceFile || "",
      ].join("|").toLowerCase().trim();

      if (seen[key]) continue;
      seen[key] = true;

      geofences.push({
        id: makeGeofenceId_(source, geofence),
        name: geofence.name || null,
        category: geofence.category || null,
        sourceFile: geofence.sourceFile || null,
        groupCategory: source.group || null,
        sourceKey: source.key || source.sheetName || source.group || null,
        polygon: geofence.polygon || [],
        centerLat: geofence.centerLat !== undefined ? geofence.centerLat : null,
        centerLng: geofence.centerLng !== undefined ? geofence.centerLng : null,
        radiusMeters: geofence.radiusMeters !== undefined ? geofence.radiusMeters : null,
      });
    }
  }

  return { geofences, warnings };
}

function makeGeofenceId_(source, geofence) {
  return [
    source.key || source.group || "source",
    geofence.name || "geofence",
    geofence.sourceFile || "",
  ].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

  const geofenceResult = readGeofencesForSource_(source);
  warnings.push(...geofenceResult.warnings);

  for (const row of rows) {
    const match = findMatchingGeofence_(row, geofenceResult.geofences);
    row.isInsideGeofence = !!match;
    row.geofenceName = match ? match.name : null;
    row.geofenceCategory = match ? match.category : null;
    row.friendlyLocation = match ? match.name : getFriendlyLocationFromTruck_(row);
  }

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
      geofenceName:  null,
      geofenceCategory: null,
      isInsideGeofence: false,
      friendlyLocation: "Location unavailable",
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

function readGeofencesForSource_(source) {
  const geofences = [];
  const warnings  = [];

  let spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(source.spreadsheetId);
  } catch (err) {
    warnings.push("[" + source.group + "] Could not open spreadsheet for geofences: " + err.message);
    return { geofences, warnings };
  }

  const sheet = spreadsheet.getSheetByName(GEOFENCE_SHEET_NAME);
  if (!sheet) {
    warnings.push("[" + source.group + "] Geofences Area tab missing.");
    return { geofences, warnings };
  }

  let values;
  try {
    values = sheet.getDataRange().getValues();
  } catch (err) {
    warnings.push("[" + source.group + "] Could not read Geofences Area tab: " + err.message);
    return { geofences, warnings };
  }

  const mapped = mapGeofenceRows_(values, source);
  geofences.push(...mapped.geofences);
  warnings.push(...mapped.warnings);

  return { geofences, warnings };
}

function mapGeofenceRows_(values, source) {
  const geofences = [];
  const warnings  = [];

  if (!values || values.length < 2) {
    warnings.push("[" + source.group + "] Geofences Area tab has no data rows.");
    return { geofences, warnings };
  }

  let headerRowIdx = -1;
  let headerIndexMap = {};
  for (let r = 0; r < Math.min(values.length, 10); r++) {
    const candidateMap = {};
    values[r].forEach((h, i) => {
      const key = (h || "").toString().trim().toLowerCase();
      if (key) candidateMap[key] = i;
    });
    const hasName = findColumnIndex_(candidateMap, GEOFENCE_HEADER_ALIASES.name) !== -1;
    const hasShape = findColumnIndex_(candidateMap, GEOFENCE_HEADER_ALIASES.coordinates) !== -1 ||
      (findColumnIndex_(candidateMap, GEOFENCE_HEADER_ALIASES.latitude) !== -1 &&
       findColumnIndex_(candidateMap, GEOFENCE_HEADER_ALIASES.longitude) !== -1);
    if (hasName && hasShape) {
      headerRowIdx = r;
      headerIndexMap = candidateMap;
      break;
    }
  }

  if (headerRowIdx === -1) {
    warnings.push("[" + source.group + "] Geofences Area headers not recognized.");
    return { geofences, warnings };
  }

  const nameIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.name);
  const categoryIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.category);
  const sourceFileIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.sourceFile);
  const coordinatesIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.coordinates);
  const latIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.latitude);
  const lngIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.longitude);
  const radiusIdx = findColumnIndex_(headerIndexMap, GEOFENCE_HEADER_ALIASES.radius);
  const grouped = {};

  for (let i = headerRowIdx + 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(cell => cell === "" || cell === null || cell === undefined)) continue;

    const name = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].toString().trim() : null;
    if (!name) {
      warnings.push("[" + source.group + "] Geofence row " + (i + 1) + " skipped: missing name.");
      continue;
    }

    const sourceFile = sourceFileIdx !== -1 && row[sourceFileIdx] ? row[sourceFileIdx].toString().trim() : "";
    const key = name.toLowerCase() + "|" + sourceFile.toLowerCase();
    if (!grouped[key]) {
      const explicitCategory = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].toString().trim() : null;
      grouped[key] = {
        name: name,
        category: explicitCategory || deriveGeofenceCategory_(sourceFile),
        sourceFile: sourceFile || null,
        points: [],
        radiusValues: [],
      };
    }

    if (coordinatesIdx !== -1 && row[coordinatesIdx]) {
      const parsedPolygon = parseGeofenceCoordinates_(row[coordinatesIdx]);
      if (parsedPolygon) {
        grouped[key].points.push(...parsedPolygon);
      } else {
        warnings.push("[" + source.group + "] Geofence '" + name + "' coordinates format not recognized.");
      }
    }

    if (latIdx !== -1 && lngIdx !== -1) {
      const point = normalizeLatLngPair_(row[latIdx], row[lngIdx]);
      if (point) {
        grouped[key].points.push(point);
      } else {
        warnings.push("[" + source.group + "] Geofence '" + name + "' row " + (i + 1) + " has invalid latitude/longitude.");
      }
    }

    if (radiusIdx !== -1) {
      const radius = normalizeNumber_(row[radiusIdx]);
      if (radius !== null) grouped[key].radiusValues.push(radius);
    }
  }

  for (const key in grouped) {
    const group = grouped[key];
    const points = dedupeGeofencePoints_(group.points);
    if (!points.length) {
      warnings.push("[" + source.group + "] Geofence '" + group.name + "' cannot be parsed: no valid points.");
      continue;
    }

    const center = getGeofenceCenter_(points);
    const radiusMeters = group.radiusValues.length ? Math.max(...group.radiusValues) : 150;

    geofences.push({
      name: group.name,
      category: group.category,
      sourceFile: group.sourceFile,
      polygon: points.length >= 3 ? points : null,
      centerLat: center.lat,
      centerLng: center.lng,
      radiusMeters: points.length >= 3 ? null : radiusMeters,
    });
  }

  if (!geofences.length) {
    warnings.push("[" + source.group + "] No geofence groups created.");
  } else {
    warnings.push("[" + source.group + "] Geofence groups parsed: " + geofences.length + ".");
    warnings.push("[" + source.group + "] Sample geofences: " + geofences.slice(0, 5).map(g => g.name).join(", ") + ".");
  }

  return { geofences, warnings };
}

function deriveGeofenceCategory_(sourceFile) {
  const file = (sourceFile || "").toString().trim();
  const key = file.toLowerCase();
  if (key === "garage.kmz") return "Garage";
  if (key === "parking.kmz") return "Parking";
  if (key === "plants.kmz") return "Plant";
  if (key === "port.kmz") return "Port";
  if (key === "warehouse and pick up location.kmz") return "Warehouse / Pickup";
  return file ? file.replace(/\.kmz$/i, "").trim() : null;
}

function dedupeGeofencePoints_(points) {
  const seen = {};
  const deduped = [];
  for (const point of points || []) {
    if (!point || point.lat === null || point.lng === null) continue;
    const key = point.lat.toFixed(7) + "," + point.lng.toFixed(7);
    if (seen[key]) continue;
    seen[key] = true;
    deduped.push(point);
  }
  return deduped;
}

function getGeofenceCenter_(points) {
  const total = points.reduce((acc, point) => {
    acc.lat += point.lat;
    acc.lng += point.lng;
    return acc;
  }, { lat: 0, lng: 0 });

  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

function parseGeofenceCoordinates_(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = value.toString().trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const points = Array.isArray(parsed) ? parsed : (parsed.coordinates || parsed.points || parsed.path || null);
    const polygon = normalizeParsedPolygon_(points);
    if (polygon && polygon.length >= 3) return polygon;
  } catch (err) {
    // Continue with text parsing below.
  }

  const matches = text.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length < 3) return null;

  const polygon = matches.map(pair => {
    const parts = pair.split(",").map(p => normalizeNumber_(p));
    if (parts.length < 2 || parts[0] === null || parts[1] === null) return null;
    return normalizeLatLngPair_(parts[0], parts[1]);
  }).filter(Boolean);

  return polygon.length >= 3 ? polygon : null;
}

function normalizeParsedPolygon_(points) {
  if (!Array.isArray(points)) return null;

  if (points.length === 1 && Array.isArray(points[0])) {
    return normalizeParsedPolygon_(points[0]);
  }

  const polygon = points.map(point => {
    if (Array.isArray(point) && point.length >= 2) {
      return normalizeLatLngPair_(point[0], point[1]);
    }
    if (point && typeof point === "object") {
      const lat = normalizeNumber_(point.lat || point.latitude);
      const lng = normalizeNumber_(point.lng || point.long || point.longitude);
      return lat === null || lng === null ? null : { lat, lng };
    }
    return null;
  }).filter(Boolean);

  return polygon.length >= 3 ? polygon : null;
}

function normalizeLatLngPair_(first, second) {
  const a = normalizeNumber_(first);
  const b = normalizeNumber_(second);
  if (a === null || b === null) return null;

  // GeoJSON commonly stores coordinates as [lng, lat].
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    return { lat: b, lng: a };
  }
  return { lat: a, lng: b };
}

function pointInPolygon_(lat, lng, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / ((yj - yi) || 0.0000000001) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceMeters_(lat1, lng1, lat2, lng2) {
  const toRad = deg => deg * Math.PI / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findMatchingGeofence_(truck, geofences) {
  if (!truck || truck.latitude === null || truck.longitude === null) return null;
  const lat = normalizeNumber_(truck.latitude);
  const lng = normalizeNumber_(truck.longitude);
  if (lat === null || lng === null) return null;

  for (const geofence of geofences || []) {
    if (geofence.polygon && pointInPolygon_(lat, lng, geofence.polygon)) return geofence;
  }

  for (const geofence of geofences || []) {
    const centerLat = geofence.centerLat !== undefined ? geofence.centerLat : geofence.latitude;
    const centerLng = geofence.centerLng !== undefined ? geofence.centerLng : geofence.longitude;
    const radiusMeters = geofence.radiusMeters !== undefined ? geofence.radiusMeters : geofence.radius;
    if (centerLat === null || centerLat === undefined ||
        centerLng === null || centerLng === undefined ||
        radiusMeters === null || radiusMeters === undefined) continue;
    if (distanceMeters_(lat, lng, centerLat, centerLng) <= radiusMeters) return geofence;
  }

  return null;
}

function getFriendlyLocationFromTruck_(truck) {
  if (!truck || truck.latitude === null || truck.longitude === null) return "Location unavailable";
  const address = truck.fullAddress ? truck.fullAddress.toString().trim() : "";
  if (!address) return "Unknown location";

  const parts = address
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !/^\d{4,}$/.test(part));

  if (!parts.length) return address;
  return parts.slice(0, 3).join(", ");
}

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
