#!/usr/bin/env node
// tools/import-2go-route-matrix-from-active-trucks.mjs
//
// Reads exported 2GO active truck trip history sheets (XLSX or CSV),
// extracts the latest rates per route, and generates:
//   imports/2go-route-matrix-preview.csv
//   supabase/2go-final-route-matrix-import.sql
//
// Usage:
//   node tools/import-2go-route-matrix-from-active-trucks.mjs
//
// Input:
//   Export your active 2GO truck history sheets from Google Sheets and place the
//   .xlsx or .csv files in: imports/2go-active-truck-history/
//
// Source sheets:
//   CAK6152 2025: https://docs.google.com/spreadsheets/d/16DP6CPCQ-u_hj0z_oxMZiV2f7lop9eosuyQJ6BSqn10/edit?gid=1304869265
//   CDA8651:      https://docs.google.com/spreadsheets/d/1Bqq12BHM-ACRDoe8EKWcsiLSBvsOKYJbzGYvkpp7_wo/edit?gid=1336858777
//
// Requires:
//   npm install xlsx
//   (or: cd tools && npm install xlsx)

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const INPUT_DIR = join(ROOT, "imports", "2go-active-truck-history");
const PREVIEW_CSV  = join(ROOT, "imports", "2go-route-matrix-preview.csv");
const OUTPUT_SQL   = join(ROOT, "supabase", "2go-final-route-matrix-import.sql");

// ── xlsx dependency ───────────────────────────────────────────────────────────

let XLSX;
try {
  const mod = await import("xlsx");
  XLSX = mod.default ?? mod;
} catch {
  console.error([
    "",
    "  Error: 'xlsx' package not found.",
    "  Install it and re-run:",
    "",
    "    npm install xlsx",
    "    node tools/import-2go-route-matrix-from-active-trucks.mjs",
    "",
  ].join("\n"));
  process.exit(1);
}

// ── constants ─────────────────────────────────────────────────────────────────

const VALID_EXTS = new Set([".xlsx", ".xls", ".csv"]);

// Rows where source or destination match these patterns are skipped outright.
const SKIP_TEXT = /^(hold|backload|di muna babayaran|hindi babayaran|hindi.*bayar|[-–—]+|total|sub.?total|subtotal|grand.?total|sum|summary|remarks?|notes?)$/i;

// ── normalisation helpers ─────────────────────────────────────────────────────

function normalizeLoc(raw) {
  let text = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!text || text === "-" || text === "—" || text === "–" || text === "N/A") return "";
  // Pier variants  (PIER, PIER 16, PIER16, PEIR16, PPIER16, etc.)
  if (/^P+[EI][EI]?R\s*1?6?$/.test(text) || text === "PIER 16" || text === "PIER 1" ) return "PIER16";
  // Common typos / alternate spellings
  if (/^MABACOPNG?$/.test(text)) return "MABACONG";
  if (/^MABAUAN$/.test(text))    return "BAUAN";
  return text;
}

function normalizeDate(raw) {
  if (raw == null || raw === "") return null;
  // xlsx with cellDates:true returns JS Date objects for date cells
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  }
  // Numeric serial (Excel date) — fallback if cellDates:true didn't fire
  if (typeof raw === "number" && raw > 1 && raw < 100000) {
    // Excel serial: days since 1899-12-30
    const ms = (raw - 25569) * 86400 * 1000; // 25569 = days from 1899-12-30 to 1970-01-01
    const d  = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const text = String(raw).trim();
  if (!text || text === "-") return null;
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toNum(val) {
  if (val == null || val === "") return 0;
  const n = parseFloat(String(val).replace(/[₱,\s]/g, "").replace(/[^\d.-]/g, ""));
  return isFinite(n) && n >= 0 ? n : 0;
}

function isRecentDate(dateStr) {
  if (!dateStr) return false;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return year >= 2025;
}

// ── column header detection ───────────────────────────────────────────────────

// Each entry: canonical key → array of regex patterns to match raw header text.
const HEADER_PATTERNS = [
  { key: "date",            rx: [/^(trip.?)?date$/i, /^date.*trip/i, /^petsa/i] },
  { key: "source",          rx: [/^(from|source|origin|loading\s*(point)?|punto\s*(a|ng\s*pick.?up))$/i] },
  { key: "destination",     rx: [/^(to|dest(ination)?|unloading(\s*point)?|delivery\s*(point)?|lugar)$/i] },
  { key: "driverSalary",    rx: [/^driver.?sal(ary)?$/i, /^d\.?\s*sal(ary)?$/i, /^ds$/i, /^driver\s*pay$/i, /^sahod\s*driver$/i] },
  { key: "helperSalary",    rx: [/^helper.?sal(ary)?$/i, /^h\.?\s*sal(ary)?$/i, /^hs$/i, /^helper\s*pay$/i, /^sahod\s*helper$/i] },
  { key: "toll",            rx: [/^toll(.?fee)?$/i, /^bayad\s*toll$/i] },
  { key: "passway",         rx: [/^passway$/i, /^pass.?way$/i] },
  { key: "parking",         rx: [/^parking$/i] },
  { key: "lagayLoaded",     rx: [/^lagay.?load(ed)?$/i, /^l\.?\s*load(ed)?$/i, /^lagay.*loaded/i] },
  { key: "lagayEmpty",      rx: [/^lagay.?empty$/i, /^l\.?\s*empty$/i, /^lagay.*empty/i] },
  { key: "mano",            rx: [/^mano$/i] },
  { key: "driverAllowance", rx: [/^driver.?all(owance)?$/i, /^d\.?\s*all(owance)?$/i, /^da$/i] },
  { key: "helperAllowance", rx: [/^helper.?all(owance)?$/i, /^h\.?\s*all(owance)?$/i, /^ha$/i] },
  { key: "otherExpenses",   rx: [/^other(s|\.?\s*exp(enses?)?)?$/i, /^misc(ellaneous)?$/i, /^iba\s*pa$/i] },
  { key: "remarks",         rx: [/^(remarks?|notes?|pangunguna|puna)$/i] },
  { key: "referenceNo",     rx: [/^(ref\.?\s*no\.?|shipment(\s*no\.?)?|dr\.?\s*no\.?|reference)$/i] },
  { key: "poNumber",        rx: [/^(po\.?\s*no\.?|purchase\s*order)$/i] },
];

function matchesAnyPattern(cell, patterns) {
  const s = String(cell ?? "").trim();
  return patterns.some(rx => rx.test(s));
}

// Scan the first `maxRows` rows and return the index of the best header row.
// A row qualifies when ≥ 3 of our expected columns are found.
function detectHeaderRowIndex(rowArrays, maxRows = 15) {
  for (let i = 0; i < Math.min(maxRows, rowArrays.length); i++) {
    const cells = rowArrays[i];
    let hits = 0;
    for (const { rx } of HEADER_PATTERNS) {
      if (cells.some(cell => matchesAnyPattern(cell, rx))) hits++;
    }
    if (hits >= 3) return i;
  }
  return 0; // fall back to row 0
}

// Build a map: canonicalKey → column index (0-based)
function buildColMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    for (const { key, rx } of HEADER_PATTERNS) {
      if (!map[key] && matchesAnyPattern(cell, rx)) {
        map[key] = idx;
      }
    }
  });
  return map;
}

// ── row parsing ───────────────────────────────────────────────────────────────

function parseRow(rowArray, colMap) {
  const get = key => (colMap[key] != null ? rowArray[colMap[key]] : undefined);

  const rawSrc  = String(get("source") ?? "").trim();
  const rawDest = String(get("destination") ?? "").trim();
  const source  = normalizeLoc(rawSrc);
  const dest    = normalizeLoc(rawDest);

  if (!source || !dest) return null;
  if (SKIP_TEXT.test(source) || SKIP_TEXT.test(dest)) return null;
  if (source === dest) return null;
  // Skip pure header repeats that sneak into data rows
  if (matchesAnyPattern(rawSrc, HEADER_PATTERNS.find(h => h.key === "source").rx)) return null;

  const driverSalary = toNum(get("driverSalary"));
  const helperSalary = toNum(get("helperSalary"));
  if (driverSalary <= 0 && helperSalary <= 0) return null;

  return {
    date:           normalizeDate(get("date")),
    source,
    destination:    dest,
    rawSource:      rawSrc,
    rawDestination: rawDest,
    driverSalary,
    helperSalary,
    toll:             toNum(get("toll")),
    passway:          toNum(get("passway")),
    parking:          toNum(get("parking")),
    lagayLoaded:      toNum(get("lagayLoaded")),
    lagayEmpty:       toNum(get("lagayEmpty")),
    mano:             toNum(get("mano")),
    driverAllowance:  toNum(get("driverAllowance")),
    helperAllowance:  toNum(get("helperAllowance")),
    otherExpenses:    toNum(get("otherExpenses")),
    remarks:          String(get("remarks") ?? "").trim(),
  };
}

// ── rate selection ────────────────────────────────────────────────────────────

// Return the most common value in `arr`.  Ties go to the value appearing first.
function mostCommon(arr) {
  if (!arr.length) return 0;
  const freq = new Map();
  let best = arr[0], bestCount = 0;
  for (const v of arr) {
    const c = (freq.get(v) ?? 0) + 1;
    freq.set(v, c);
    if (c > bestCount) { bestCount = c; best = v; }
  }
  return best;
}

const EXP_FIELDS = [
  "toll","passway","parking","lagayLoaded","lagayEmpty",
  "mano","driverAllowance","helperAllowance","otherExpenses",
];

function selectRates(rows) {
  // Sort newest-first; treat null dates as oldest
  const sorted = [...rows].sort((a, b) => {
    const da = a.date ?? "0000-00-00";
    const db = b.date ?? "0000-00-00";
    return db.localeCompare(da);
  });

  // Prefer 2025/2026 rows for salary selection
  const recentRows = sorted.filter(r => isRecentDate(r.date));
  const salaryPool = recentRows.length >= 2 ? recentRows : sorted;
  const sample5    = salaryPool.slice(0, 5);

  // Most common salary pair in latest 5
  const pairFreq = new Map();
  let bestPair = `${sample5[0].driverSalary}|${sample5[0].helperSalary}`, bestPairCount = 0;
  for (const r of sample5) {
    const k = `${r.driverSalary}|${r.helperSalary}`;
    const c = (pairFreq.get(k) ?? 0) + 1;
    pairFreq.set(k, c);
    if (c > bestPairCount) { bestPairCount = c; bestPair = k; }
  }
  const [driverSalary, helperSalary] = bestPair.split("|").map(Number);

  // Expense defaults: most common non-zero value from recent rows
  const expPool = recentRows.length ? recentRows : sorted;
  const pickExp = field => {
    const nonZero = expPool.map(r => r[field]).filter(v => v > 0);
    return nonZero.length ? mostCommon(nonZero) : 0;
  };

  // Confidence based on how many of latest 5 agree on the salary pair
  const agreeing = sample5.filter(r =>
    r.driverSalary === driverSalary && r.helperSalary === helperSalary
  ).length;
  const confidence = agreeing >= 3 ? "HIGH" : agreeing >= 2 ? "MEDIUM" : "LOW";

  const latestTripDate = sorted.find(r => r.date)?.date ?? null;
  const originalRoutes = [...new Set(sorted.map(r => `${r.rawSource} → ${r.rawDestination}`))];

  return {
    driverSalary,
    helperSalary,
    toll:            pickExp("toll"),
    passway:         pickExp("passway"),
    parking:         pickExp("parking"),
    lagayLoaded:     pickExp("lagayLoaded"),
    lagayEmpty:      pickExp("lagayEmpty"),
    mano:            pickExp("mano"),
    driverAllowance: pickExp("driverAllowance"),
    helperAllowance: pickExp("helperAllowance"),
    otherExpenses:   pickExp("otherExpenses"),
    sampleCount:     rows.length,
    latestTripDate,
    confidence,
    originalRoutes,
    latestSamples:   sample5.map(r => ({ date: r.date, driverSalary: r.driverSalary, helperSalary: r.helperSalary })),
    valuesSeen: {
      driverSalary: [...new Set(sorted.map(r => r.driverSalary))],
      helperSalary: [...new Set(sorted.map(r => r.helperSalary))],
    },
  };
}

// ── output builders ───────────────────────────────────────────────────────────

function makeRateId(source, destination) {
  const clean = s => s.replace(/[^A-Z0-9]/g, "").slice(0, 30);
  return `RATE-2GO-${clean(source)}-${clean(destination)}`;
}

function sqlStr(val) {
  if (val === null || val === undefined) return "null";
  if (typeof val === "boolean")          return val ? "true" : "false";
  if (typeof val === "number")           return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

const INSERT_COLS = [
  "rate_id","group_category","source","destination",
  "driver_salary","helper_salary",
  "default_toll","default_passway","default_parking",
  "default_lagay_loaded","default_lagay_empty","default_mano",
  "default_allowance_driver","default_allowance_helper","default_other_expenses",
  "active","remarks","updated_at",
];
const UPDATE_COLS = INSERT_COLS.filter(c => c !== "rate_id");

function buildSQL(routes, sourceFiles, generatedAt) {
  const out = [
    `-- 2GO payroll_rate_matrix import`,
    `-- Generated: ${generatedAt}`,
    `-- Source files: ${sourceFiles.join(", ")}`,
    `-- Routes: ${routes.length}`,
    `-- Re-generate: node tools/import-2go-route-matrix-from-active-trucks.mjs`,
    `--`,
    `-- Only inserts/updates rows where group_category = '2GO'.`,
    `-- Rows for other groups are never touched.`,
    `-- Rows marked active = false are not overwritten.`,
    ``,
  ];

  for (const r of routes) {
    const rid  = makeRateId(r.source, r.destination);
    const note = `Imported ${generatedAt.slice(0, 10)} from 2GO active trucks (${r.rates.confidence} confidence, ${r.rates.sampleCount} sample${r.rates.sampleCount === 1 ? "" : "s"})`;

    const vals = {
      rate_id:                   rid,
      group_category:            "2GO",
      source:                    r.source,
      destination:               r.destination,
      driver_salary:             r.rates.driverSalary,
      helper_salary:             r.rates.helperSalary,
      default_toll:              r.rates.toll,
      default_passway:           r.rates.passway,
      default_parking:           r.rates.parking,
      default_lagay_loaded:      r.rates.lagayLoaded,
      default_lagay_empty:       r.rates.lagayEmpty,
      default_mano:              r.rates.mano,
      default_allowance_driver:  r.rates.driverAllowance,
      default_allowance_helper:  r.rates.helperAllowance,
      default_other_expenses:    r.rates.otherExpenses,
      active:                    true,
      remarks:                   note,
      updated_at:                null, // will be "now()" literal
    };

    const colList = INSERT_COLS.join(",\n  ");
    const valList = INSERT_COLS.map(c =>
      c === "updated_at" ? "now()" : sqlStr(vals[c])
    ).join(",\n  ");
    const setList = UPDATE_COLS.map(c =>
      `  ${c} = excluded.${c}`
    ).join(",\n");

    out.push(
      `-- ${rid}`,
      `insert into payroll_rate_matrix (`,
      `  ${colList}`,
      `) values (`,
      `  ${valList}`,
      `)`,
      `on conflict (rate_id) do update set`,
      setList,
      `  where payroll_rate_matrix.active is not false;`,
      ``
    );
  }

  return out.join("\n");
}

function csvEscape(val) {
  const s = String(val ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

const CSV_COLS = [
  "source","destination","driver_salary","helper_salary",
  "default_toll","default_passway","default_parking",
  "default_lagay_loaded","default_lagay_empty","default_mano",
  "default_allowance_driver","default_allowance_helper","default_other_expenses",
  "sample_count","latest_trip_date","confidence","notes",
];

function buildCSV(routes) {
  const rows = [CSV_COLS.join(",")];
  for (const r of routes) {
    rows.push([
      r.source,
      r.destination,
      r.rates.driverSalary,
      r.rates.helperSalary,
      r.rates.toll,
      r.rates.passway,
      r.rates.parking,
      r.rates.lagayLoaded,
      r.rates.lagayEmpty,
      r.rates.mano,
      r.rates.driverAllowance,
      r.rates.helperAllowance,
      r.rates.otherExpenses,
      r.rates.sampleCount,
      r.rates.latestTripDate ?? "",
      r.rates.confidence,
      r.rates.originalRoutes.join(" | "),
    ].map(csvEscape).join(","));
  }
  return rows.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────────

if (!existsSync(INPUT_DIR)) {
  mkdirSync(INPUT_DIR, { recursive: true });
  console.log(`Created: ${INPUT_DIR}`);
}

const files = existsSync(INPUT_DIR)
  ? readdirSync(INPUT_DIR).filter(f => VALID_EXTS.has(extname(f).toLowerCase()))
  : [];

if (!files.length) {
  console.log([
    "",
    "  No XLSX/CSV files found in:",
    `    ${INPUT_DIR}`,
    "",
    "  Steps to use this importer:",
    "  1. Open each active 2GO truck sheet in Google Sheets:",
    "       CAK6152 2025: https://docs.google.com/spreadsheets/d/16DP6CPCQ-u_hj0z_oxMZiV2f7lop9eosuyQJ6BSqn10/edit?gid=1304869265",
    "       CDA8651:      https://docs.google.com/spreadsheets/d/1Bqq12BHM-ACRDoe8EKWcsiLSBvsOKYJbzGYvkpp7_wo/edit?gid=1336858777",
    "  2. File → Download → Microsoft Excel (.xlsx)  (or CSV)",
    "  3. Save each file to: imports/2go-active-truck-history/",
    "  4. Re-run: node tools/import-2go-route-matrix-from-active-trucks.mjs",
    "",
  ].join("\n"));
  process.exit(0);
}

let totalRowsScanned = 0;
let totalSkipped     = 0;
let totalValid       = 0;

const routeMap   = new Map(); // "SRC|DEST" → TripRow[]
const srcFiles   = [];

for (const file of files) {
  const filePath = join(INPUT_DIR, file);
  console.log(`\nReading: ${file}`);
  srcFiles.push(file);

  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: true });
  } catch (err) {
    console.warn(`  Skipped (read error): ${err.message}`);
    continue;
  }

  for (const sheetName of workbook.SheetNames) {
    const ws   = workbook.Sheets[sheetName];
    const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (raw.length < 2) continue;

    const headerIdx = detectHeaderRowIndex(raw);
    const colMap    = buildColMap(raw[headerIdx]);

    const hasSrc  = colMap.source      != null;
    const hasDest = colMap.destination != null;
    const hasSal  = colMap.driverSalary != null || colMap.helperSalary != null;

    if (!hasSrc || !hasDest) {
      console.log(`  Sheet "${sheetName}": source/destination columns not detected — skipped`);
      continue;
    }
    if (!hasSal) {
      console.log(`  Sheet "${sheetName}": salary columns not detected — skipped`);
      continue;
    }

    const dataRows = raw.slice(headerIdx + 1);
    let sheetValid = 0, sheetSkipped = 0;

    for (const row of dataRows) {
      totalRowsScanned++;
      const parsed = parseRow(row, colMap);
      if (!parsed) { sheetSkipped++; totalSkipped++; continue; }

      const key = `${parsed.source}|${parsed.destination}`;
      if (!routeMap.has(key)) routeMap.set(key, []);
      routeMap.get(key).push(parsed);
      sheetValid++;
      totalValid++;
    }

    const detected = Object.entries(colMap).map(([k, v]) => `${k}@${v}`).join(" ");
    console.log(`  Sheet "${sheetName}": header row ${headerIdx}, cols: ${detected}`);
    console.log(`  → ${sheetValid} valid trips, ${sheetSkipped} skipped`);
  }
}

if (!routeMap.size) {
  console.log([
    "",
    "  No valid 2GO trip rows found.",
    "  Common reasons:",
    "  - Column headers don't match expected patterns (Source, Destination, Driver Salary, etc.)",
    "  - All salary values are 0 or blank",
    "  - The sheet uses a different structure (merged cells, non-standard headers)",
    "",
    "  Check the 'Sheet ... columns not detected' messages above.",
    "  If the headers use different names, add them to HEADER_PATTERNS in this script.",
  ].join("\n"));
  process.exit(0);
}

// Build final route list
const routes = [...routeMap.entries()].map(([key, rows]) => {
  const [source, destination] = key.split("|");
  return { source, destination, rates: selectRates(rows) };
}).sort((a, b) =>
  a.source.localeCompare(b.source) || a.destination.localeCompare(b.destination)
);

const confidenceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
for (const r of routes) confidenceCounts[r.rates.confidence]++;

const generatedAt = new Date().toISOString();

// Ensure output directories exist
if (!existsSync(join(ROOT, "imports")))   mkdirSync(join(ROOT, "imports"),   { recursive: true });
if (!existsSync(join(ROOT, "supabase")))  mkdirSync(join(ROOT, "supabase"),  { recursive: true });

writeFileSync(PREVIEW_CSV, buildCSV(routes),                              "utf8");
writeFileSync(OUTPUT_SQL,  buildSQL(routes, srcFiles, generatedAt), "utf8");

// ── summary ───────────────────────────────────────────────────────────────────

console.log([
  "",
  "── 2GO Route Matrix Import ───────────────────────────────────────────",
  `  Files scanned:        ${files.length}`,
  `  Total rows scanned:   ${totalRowsScanned}`,
  `  Valid 2GO trip rows:  ${totalValid}`,
  `  Skipped rows:         ${totalSkipped}`,
  `  Unique 2GO routes:    ${routes.length}`,
  `  Confidence — HIGH:    ${confidenceCounts.HIGH}`,
  `  Confidence — MEDIUM:  ${confidenceCounts.MEDIUM}`,
  `  Confidence — LOW:     ${confidenceCounts.LOW}`,
  "",
  `  Preview CSV:  ${PREVIEW_CSV}`,
  `  SQL output:   ${OUTPUT_SQL}`,
  "──────────────────────────────────────────────────────────────────────",
  "",
  "Next steps:",
  "  1. Review the preview CSV — check salaries and expense defaults",
  "  2. If any routes look wrong, adjust the source data or manually edit the SQL",
  "  3. Run supabase/2go-final-route-matrix-import.sql in the Supabase SQL Editor",
  "  4. Refresh the payroll rate matrix in the app",
  "",
].join("\n"));
