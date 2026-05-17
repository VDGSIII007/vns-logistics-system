import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const GOOGLE_RESPONSE_ARRAY_KEYS = ["records", "entries", "data", "items", "rows", "result"];
const REQUEST_ID_KEYS = [
  "Request_ID",
  "Request_No",
  "Request_Number",
  "request_id",
  "requestNo",
  "requestNumber",
  "id",
];

function normalizeRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of GOOGLE_RESPONSE_ARRAY_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  return [];
}

function getRequestId(record, fallbackIndex) {
  if (!record || typeof record !== "object") return `row-${fallbackIndex + 1}`;

  for (const key of REQUEST_ID_KEYS) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return `row-${fallbackIndex + 1}`;
}

function firstRequestIds(records) {
  return records.slice(0, 3).map((record, index) => getRequestId(record, index));
}

async function getRepairWebAppUrl() {
  const scriptSource = await readFile(new URL("./script.js", import.meta.url), "utf8");
  const match = scriptSource.match(/const\s+REPAIR_WEB_APP_URL\s*=\s*["']([^"']+)["']/);

  if (!match) {
    throw new Error("Could not find REPAIR_WEB_APP_URL in script.js");
  }

  return match[1];
}

async function loadGoogleRepairRecords(repairWebAppUrl) {
  const startedAt = performance.now();
  const response = await fetch(`${repairWebAppUrl}?action=list`);
  const payload = await response.json();
  const milliseconds = performance.now() - startedAt;

  if (!response.ok) {
    throw new Error(`Google Sheets request failed with HTTP ${response.status}`);
  }

  return {
    milliseconds,
    records: normalizeRecords(payload),
  };
}

async function loadSupabaseRepairRecords() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.");
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      throw new Error("Missing package. Install it with: npm install @supabase/supabase-js");
    }
    throw error;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const startedAt = performance.now();
  const { data, error } = await supabase
    .from("repair_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  const milliseconds = performance.now() - startedAt;

  if (error) throw error;

  return {
    milliseconds,
    records: Array.isArray(data) ? data : [],
  };
}

function formatMilliseconds(value) {
  return `${value.toFixed(1)} ms`;
}

function getWinner(googleMilliseconds, supabaseMilliseconds) {
  if (googleMilliseconds === supabaseMilliseconds) return "Tie";
  return googleMilliseconds < supabaseMilliseconds ? "Google Sheets / Apps Script" : "Supabase";
}

function getSpeedRatio(googleMilliseconds, supabaseMilliseconds) {
  const slower = Math.max(googleMilliseconds, supabaseMilliseconds);
  const faster = Math.min(googleMilliseconds, supabaseMilliseconds);
  if (!Number.isFinite(slower) || !Number.isFinite(faster) || faster === 0) return "n/a";
  return `${(slower / faster).toFixed(2)}x`;
}

async function main() {
  const repairWebAppUrl = await getRepairWebAppUrl();
  const googleResult = await loadGoogleRepairRecords(repairWebAppUrl);
  const supabaseResult = await loadSupabaseRepairRecords();
  const winner = getWinner(googleResult.milliseconds, supabaseResult.milliseconds);

  console.log("Repair speed comparison");
  console.log("-----------------------");
  console.log(`Google Sheets milliseconds: ${formatMilliseconds(googleResult.milliseconds)}`);
  console.log(`Google Sheets row count: ${googleResult.records.length}`);
  console.log(`Supabase milliseconds: ${formatMilliseconds(supabaseResult.milliseconds)}`);
  console.log(`Supabase row count: ${supabaseResult.records.length}`);
  console.log(`Winner: ${winner}`);
  console.log(`Speed ratio: ${getSpeedRatio(googleResult.milliseconds, supabaseResult.milliseconds)}`);
  console.log(`Google Sheets first 3 request IDs: ${firstRequestIds(googleResult.records).join(", ") || "none"}`);
  console.log(`Supabase first 3 request IDs: ${firstRequestIds(supabaseResult.records).join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
