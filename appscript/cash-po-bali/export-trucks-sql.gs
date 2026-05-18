// Read-only Truck_Master SQL exporter for Supabase trucks seed.
// Run exportTruckMasterSql() or deploy as a web app and call ?type=trucks.

var TRUCK_MASTER_SPREADSHEET_ID = "14JVeGkI3EIaZEHix56ICnFjOE56mrB9LK5sulgPTc7Q";
var TRUCK_MASTER_TAB_NAME = "Truck_Master";

var TRUCK_MASTER_HEADERS = [
  "Truck_ID",
  "Plate_Number",
  "IMEI",
  "Truck_Type",
  "Truck_Make",
  "Body_Type",
  "Trailer_Plate",
  "Group_Category",
  "Current_Driver_ID",
  "Current_Helper_ID",
  "Current_Driver_Name",
  "Current_Helper_Name",
  "Dispatcher",
  "Status",
  "GPS_Source",
  "Last_Known_Latitude",
  "Last_Known_Longitude",
  "Last_GPS_Timestamp",
  "Odometer",
  "ORCR_Status",
  "Insurance_Expiry",
  "Registration_Expiry",
  "Remarks",
  "Created_At",
  "Updated_At"
];

var TRUCK_SQL_COLUMNS = [
  "truck_id",
  "plate_number",
  "imei",
  "truck_type",
  "truck_make",
  "body_type",
  "trailer_plate",
  "group_category",
  "current_driver_id",
  "current_helper_id",
  "current_driver_name",
  "current_helper_name",
  "dispatcher",
  "status",
  "gps_source",
  "last_known_latitude",
  "last_known_longitude",
  "last_gps_timestamp",
  "odometer",
  "orcr_status",
  "insurance_expiry",
  "registration_expiry",
  "remarks",
  "created_at",
  "updated_at"
];

var TRUCK_SQL_CASTS = {
  Last_Known_Latitude: "numeric",
  Last_Known_Longitude: "numeric",
  Last_GPS_Timestamp: "timestamptz",
  Odometer: "numeric",
  Insurance_Expiry: "date",
  Registration_Expiry: "date",
  Created_At: "timestamptz",
  Updated_At: "timestamptz"
};

function exportTruckMasterSql() {
  var rows = readTruckMasterRows_();
  var sql = buildTruckMasterSql_(rows);
  console.log("Truck_Master rows exported: " + rows.length);
  console.log("Truck_Master SQL character length: " + sql.length);
  return sql;
}

function doGetTruckMasterSql_(e) {
  var sql = exportTruckMasterSql();
  return ContentService
    .createTextOutput(sql)
    .setMimeType(ContentService.MimeType.TEXT);
}

function readTruckMasterRows_() {
  var spreadsheet = SpreadsheetApp.openById(TRUCK_MASTER_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(TRUCK_MASTER_TAB_NAME);
  if (!sheet) throw new Error("Sheet not found: " + TRUCK_MASTER_TAB_NAME);

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function(header) {
    return String(header || "").trim();
  });
  validateTruckMasterHeaders_(headers);

  var rows = [];
  values.slice(1).forEach(function(row, rowIndex) {
    if (!isNonblankRow_(row)) return;

    var record = {};
    TRUCK_MASTER_HEADERS.forEach(function(header) {
      record[header] = row[headers.indexOf(header)];
    });

    if (normalizeTruckSqlValue_(record.Truck_ID) === "") {
      throw new Error("Blank Truck_ID on sheet row " + (rowIndex + 2));
    }

    rows.push(record);
  });

  return rows;
}

function validateTruckMasterHeaders_(headers) {
  var missing = TRUCK_MASTER_HEADERS.filter(function(header) {
    return headers.indexOf(header) === -1;
  });
  if (missing.length) {
    throw new Error("Truck_Master missing headers: " + missing.join(", "));
  }
}

function buildTruckMasterSql_(rows) {
  var sql = [];
  sql.push("begin;");
  sql.push("");
  sql.push("insert into trucks (");
  TRUCK_SQL_COLUMNS.forEach(function(column, index) {
    var comma = index === TRUCK_SQL_COLUMNS.length - 1 ? "" : ",";
    sql.push("  " + column + comma);
  });
  sql.push(") values");
  sql.push(rows.map(function(row) {
    return "  (" + TRUCK_MASTER_HEADERS.map(function(header) {
      return truckSqlLiteral_(row[header], TRUCK_SQL_CASTS[header]);
    }).join(", ") + ")";
  }).join(",\n"));
  sql.push("on conflict (truck_id) do update set");
  TRUCK_SQL_COLUMNS.slice(1).forEach(function(column, index, columns) {
    var comma = index === columns.length - 1 ? "" : ",";
    if (column === "created_at") {
      sql.push("  created_at = coalesce(trucks.created_at, excluded.created_at)" + comma);
    } else {
      sql.push("  " + column + " = excluded." + column + comma);
    }
  });
  sql[sql.length - 1] = sql[sql.length - 1] + ";";
  sql.push("");
  sql.push("commit;");
  return sql.join("\n");
}

function truckSqlLiteral_(value, castType) {
  var normalized = normalizeTruckSqlValue_(value);
  if (normalized === "") return "null";
  if (castType === "numeric") return normalized;
  if (castType) return "'" + escapeTruckSqlString_(normalized) + "'::" + castType;
  return "'" + escapeTruckSqlString_(normalized) + "'";
}

function normalizeTruckSqlValue_(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function escapeTruckSqlString_(value) {
  return String(value).replace(/'/g, "''");
}

function isNonblankRow_(row) {
  return row.some(function(value) {
    return normalizeTruckSqlValue_(value) !== "";
  });
}
