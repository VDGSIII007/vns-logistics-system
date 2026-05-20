import {
  acknowledgeLastNotification,
  getLastNotification,
  publicLastNotification,
  runApprovalPushCheck
} from "./approval-checker.js";
import { debugCashSource } from "./checkers/cash.js";
import {
  listCashRequestsFromSupabase,
  updateCashBackupStatus,
  updateCashRequestStatus,
  upsertCashRequestToSupabase
} from "./cash-api.js";
import {
  debugPaymentQueueSources,
  runPaymentQueuePushCheck
} from "./checkers/payment-queue.js";
import { debugRepairSource } from "./checkers/repair.js";
import {
  deleteSubscriptionByEndpoint,
  endpointHash,
  getSubscriptionByEndpoint,
  listSubscriptionsByRoles,
  saveSubscription,
  subscriptionKey
} from "./subscriptions.js";
import {
  createRepairMediaSignedUrl,
  listRepairRequestsFromSupabase,
  uploadRepairMediaToSupabase,
  updateRepairRequestStatus,
  updateRepairBackupStatus,
  upsertRepairRequestToSupabase
} from "./repair-api.js";
import {
  createPayrollBalanceEventInSupabase,
  getBudgetBalanceSummaryFromSupabase,
  listBudgetBalanceTransactionsFromSupabase,
  listPayrollRecordsFromSupabase,
  listPayrollRatesFromSupabase,
  listPayrollTripLinesFromSupabase,
  listPersonBalancesFromSupabase,
  updatePayrollStatusInSupabase,
  upsertPayrollRateToSupabase,
  upsertPayrollRecordToSupabase,
  upsertPayrollTripLinesToSupabase
} from "./payroll-api.js";
import { sendWebPush } from "./webpush.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
const CASH_API_PATHS = new Set([
  "/api/cash/create",
  "/api/cash/list",
  "/api/cash/update-status",
  "/api/cash/backup-status"
]);
const REPAIR_API_PATHS = new Set([
  "/api/repair/create",
  "/api/repair/list",
  "/api/repair/media/upload",
  "/api/repair/media/signed-url",
  "/api/repair/update-status",
  "/api/repair/backup-status"
]);
const PAYROLL_API_PATHS = new Set([
  "/api/payroll/list",
  "/api/payroll/create",
  "/api/payroll/update-status",
  "/api/payroll/balances",
  "/api/payroll/balance-event",
  "/api/payroll/rates",
  "/api/payroll/rate-create",
  "/api/payroll/trip-lines",
  "/api/payroll/trip-line-upsert",
  "/api/payroll/trip-lines-bulk-upsert"
]);
const BUDGET_BALANCE_API_PATHS = new Set([
  "/api/budget-balance/summary",
  "/api/budget-balance/transactions"
]);
const CORS_ALLOWED_ORIGINS = new Set([
  "https://portal.vns-logistics.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

function getCorsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  const allowOrigin = CORS_ALLOWED_ORIGINS.has(origin) ? origin : "https://portal.vns-logistics.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function withCors(response, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(getCorsHeaders(request))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request)
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return null;
  }
}

function defaultPayload(input = {}) {
  return {
    title: String(input.title || "VNS Portal").slice(0, 80),
    body: String(input.body || "Test background alert from VNS.").slice(0, 180),
    url: String(input.url || "/portal.html").slice(0, 300)
  };
}

function kvReady(env) {
  return Boolean(env.VNS_PUSH_SUBSCRIPTIONS);
}

async function handleCheck(env) {
  const lastNotification = await getLastNotification(env);
  return jsonResponse({
    ok: true,
    pushReady: kvReady(env),
    hasPublicKey: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PUBLIC_KEY !== "PUBLIC_KEY_PLACEHOLDER"),
    kvReady: kvReady(env),
    lastNotification: publicLastNotification(lastNotification)
  });
}

async function handleSubscribe(request, env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await saveSubscription(env.VNS_PUSH_SUBSCRIPTIONS, {
    subscription: input.subscription,
    role: input.role,
    userAgent: input.userAgent || request.headers.get("user-agent") || ""
  });
  if (result.error) return jsonResponse({ ok: false, error: result.error }, 400);

  return jsonResponse({
    ok: true,
    subscribed: true,
    endpointHash: result.endpointHash
  });
}

async function handleUnsubscribe(request, env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);
  const input = await readJson(request);
  if (!input?.endpoint) return jsonResponse({ ok: false, error: "endpoint is required" }, 400);

  await deleteSubscriptionByEndpoint(env.VNS_PUSH_SUBSCRIPTIONS, input.endpoint);
  return jsonResponse({ ok: true, subscribed: false });
}

async function handleTest(request, env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);
  const input = await readJson(request);
  if (!input?.endpoint) return jsonResponse({ ok: false, error: "endpoint is required" }, 400);

  const record = await getSubscriptionByEndpoint(env.VNS_PUSH_SUBSCRIPTIONS, input.endpoint);
  if (!record?.subscription || record.enabled === false) {
    return jsonResponse({ ok: false, error: "Subscription not found" }, 404);
  }

  const result = await sendWebPush(record.subscription, defaultPayload(input), env);
  if (result.expired) await env.VNS_PUSH_SUBSCRIPTIONS.delete(`push:sub:${await endpointHash(input.endpoint)}`);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      sent: 0,
      failed: 1,
      status: result.status,
      error: result.statusText || "Push endpoint rejected the request"
    }, 502);
  }

  return jsonResponse({ ok: true, sent: 1, failed: 0 });
}

async function handleRunCheck(env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);

  try {
    return jsonResponse(await runApprovalPushCheck(env));
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || "Approval checker failed"
    }, 500);
  }
}

async function handleDebugSources(env) {
  const [cash, repair] = await Promise.all([
    debugCashSource(env),
    debugRepairSource(env)
  ]);

  return jsonResponse({
    ok: true,
    cash,
    repair
  });
}

async function handleDebugPaymentQueue(env) {
  return jsonResponse({
    ok: true,
    paymentQueue: await debugPaymentQueueSources(env)
  });
}

async function handleRunPaymentCheck(env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);

  try {
    return jsonResponse(await runPaymentQueuePushCheck(env));
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || "Payment queue checker failed"
    }, 500);
  }
}

async function handleNotifyPaid(request, env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);

  const input = await readJson(request) || {};
  const payload = {
    title: "VNS Payment Released",
    body: "A payment item has been marked paid/released.",
    url: "/payment-queue.html?tab=paid"
  };

  const TARGET_ROLES = ["Sister", "Payment", "Admin", "Encoder"];
  const targets = await listSubscriptionsByRoles(env.VNS_PUSH_SUBSCRIPTIONS, TARGET_ROLES);
  let sent = 0;
  let failed = 0;

  await Promise.all(targets.map(async record => {
    try {
      const result = await sendWebPush(record.subscription, payload, env);
      if (result.expired) await env.VNS_PUSH_SUBSCRIPTIONS.delete(subscriptionKey(record.endpointHash));
      if (result.ok) { sent += 1; } else { failed += 1; }
    } catch {
      failed += 1;
    }
  }));

  return jsonResponse({ ok: true, sent, failed, module: input.module || null });
}

async function handleAcknowledge(request, env) {
  if (!kvReady(env)) return jsonResponse({ ok: false, error: "KV binding is not configured" }, 500);

  const input = await readJson(request) || {};
  try {
    return jsonResponse(await acknowledgeLastNotification(env, input));
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || "Unable to acknowledge notification"
    }, 500);
  }
}

async function handleCashCreate(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await upsertCashRequestToSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Cash save failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    request_id: result.request_id,
    count: result.count,
    source: result.source,
    record: result.record,
    records: result.records
  });
}

async function handleCashList(url, env) {
  const result = await listCashRequestsFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Cash list failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleCashBackupStatus(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await updateCashBackupStatus(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Cash backup status update failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleCashUpdateStatus(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await updateCashRequestStatus(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Cash status update failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleRepairCreate(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await upsertRepairRequestToSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Repair save failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    request_id: result.request_id,
    count: result.count,
    source: result.source
  });
}

async function handleRepairList(url, env) {
  const result = await listRepairRequestsFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Repair list failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleRepairMediaUpload(request, env) {
  const formData = await request.formData().catch(() => null);
  if (!formData) return jsonResponse({ ok: false, error: "Invalid multipart form data" }, 400);

  const result = await uploadRepairMediaToSupabase(env, formData);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Repair media upload failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleRepairMediaSignedUrl(url, env) {
  const result = await createRepairMediaSignedUrl(env, url.searchParams.get("path"));
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Repair media signed URL failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleRepairBackupStatus(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await updateRepairBackupStatus(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Backup status update failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handleRepairUpdateStatus(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await updateRepairRequestStatus(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Repair status update failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    source: result.source,
    request_id: result.request_id
  });
}

async function handlePayrollCreate(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await upsertPayrollRecordToSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Payroll save failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    payroll_id: result.payroll_id,
    source: result.source,
    record: result.record
  });
}

async function handlePayrollList(url, env) {
  const result = await listPayrollRecordsFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Payroll list failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handlePayrollUpdateStatus(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await updatePayrollStatusInSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Payroll status update failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    payroll_id: result.payroll_id,
    source: result.source,
    record: result.record
  });
}

async function handlePayrollBalances(url, env) {
  const result = await listPersonBalancesFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Payroll balances fetch failed"
    }, result.status || 500);
  }

  return jsonResponse(result);
}

async function handlePayrollBalanceEvent(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);

  const result = await createPayrollBalanceEventInSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({
      ok: false,
      error: result.error || "Payroll balance event save failed"
    }, result.status || 500);
  }

  return jsonResponse({
    ok: true,
    event_id: result.event_id,
    source: result.source,
    record: result.record
  });
}

async function handlePayrollRates(url, env) {
  const result = await listPayrollRatesFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Payroll rates fetch failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function handlePayrollRateCreate(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  const result = await upsertPayrollRateToSupabase(env, input);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Payroll rate save failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function handlePayrollTripLines(url, env) {
  const result = await listPayrollTripLinesFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Payroll trip lines fetch failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function handlePayrollTripLineUpsert(request, env) {
  const input = await readJson(request);
  if (!input) return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  const result = await upsertPayrollTripLinesToSupabase(env, input.line ? { lines: [input.line] } : input);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Payroll trip line save failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function handleBudgetBalanceSummary(url, env) {
  const result = await getBudgetBalanceSummaryFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Budget Balance summary fetch failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function handleBudgetBalanceTransactions(url, env) {
  const result = await listBudgetBalanceTransactionsFromSupabase(env, url.searchParams);
  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error || "Budget Balance transactions fetch failed" }, result.status || 500);
  }
  return jsonResponse(result);
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const isCashApiRoute = CASH_API_PATHS.has(url.pathname);
  const isRepairApiRoute = REPAIR_API_PATHS.has(url.pathname);
  if (isCashApiRoute && request.method === "OPTIONS") return handleOptions(request);
  if (request.method === "POST" && url.pathname === "/api/cash/create") return withCors(await handleCashCreate(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/cash/list") return withCors(await handleCashList(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/cash/update-status") return withCors(await handleCashUpdateStatus(request, env), request);
  if (request.method === "POST" && url.pathname === "/api/cash/backup-status") return withCors(await handleCashBackupStatus(request, env), request);
  if (isCashApiRoute) return withCors(jsonResponse({ ok: false, error: "Method not allowed" }, 405), request);
  if (isRepairApiRoute && request.method === "OPTIONS") return handleOptions(request);
  if (request.method === "POST" && url.pathname === "/api/repair/create") return withCors(await handleRepairCreate(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/repair/list") return withCors(await handleRepairList(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/repair/media/upload") return withCors(await handleRepairMediaUpload(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/repair/media/signed-url") return withCors(await handleRepairMediaSignedUrl(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/repair/update-status") return withCors(await handleRepairUpdateStatus(request, env), request);
  if (request.method === "POST" && url.pathname === "/api/repair/backup-status") return withCors(await handleRepairBackupStatus(request, env), request);
  if (isRepairApiRoute) return withCors(jsonResponse({ ok: false, error: "Method not allowed" }, 405), request);
  const isPayrollApiRoute = PAYROLL_API_PATHS.has(url.pathname);
  if (isPayrollApiRoute && request.method === "OPTIONS") return handleOptions(request);
  if (request.method === "POST" && url.pathname === "/api/payroll/create") return withCors(await handlePayrollCreate(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/payroll/list") return withCors(await handlePayrollList(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/payroll/update-status") return withCors(await handlePayrollUpdateStatus(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/payroll/balances") return withCors(await handlePayrollBalances(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/payroll/balance-event") return withCors(await handlePayrollBalanceEvent(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/payroll/rates") return withCors(await handlePayrollRates(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/payroll/rate-create") return withCors(await handlePayrollRateCreate(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/payroll/trip-lines") return withCors(await handlePayrollTripLines(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/payroll/trip-line-upsert") return withCors(await handlePayrollTripLineUpsert(request, env), request);
  if (request.method === "POST" && url.pathname === "/api/payroll/trip-lines-bulk-upsert") return withCors(await handlePayrollTripLineUpsert(request, env), request);
  if (isPayrollApiRoute) return withCors(jsonResponse({ ok: false, error: "Method not allowed" }, 405), request);
  const isBudgetBalanceApiRoute = BUDGET_BALANCE_API_PATHS.has(url.pathname);
  if (isBudgetBalanceApiRoute && request.method === "OPTIONS") return handleOptions(request);
  if (request.method === "GET" && url.pathname === "/api/budget-balance/summary") return withCors(await handleBudgetBalanceSummary(url, env), request);
  if (request.method === "GET" && url.pathname === "/api/budget-balance/transactions") return withCors(await handleBudgetBalanceTransactions(url, env), request);
  if (isBudgetBalanceApiRoute) return withCors(jsonResponse({ ok: false, error: "Method not allowed" }, 405), request);
  if (request.method === "GET" && url.pathname === "/api/push/check") return handleCheck(env);
  if (request.method === "GET" && url.pathname === "/api/push/debug-sources") return handleDebugSources(env);
  if (request.method === "GET" && url.pathname === "/api/push/debug-payment-queue") return handleDebugPaymentQueue(env);
  if (request.method === "POST" && url.pathname === "/api/push/subscribe") return handleSubscribe(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") return handleUnsubscribe(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/test") return handleTest(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/run-check") return handleRunCheck(env);
  if (request.method === "POST" && url.pathname === "/api/push/run-payment-check") return handleRunPaymentCheck(env);
  if (request.method === "POST" && url.pathname === "/api/push/notify-paid") return handleNotifyPaid(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/acknowledge") return handleAcknowledge(request, env);
  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

export default {
  fetch(request, env) {
    return routeRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledChecks(env));
  }
};

async function runScheduledChecks(env) {
  await Promise.all([
    safeScheduledCheck(() => runApprovalPushCheck(env)),
    safeScheduledCheck(() => runPaymentQueuePushCheck(env))
  ]);
}

async function safeScheduledCheck(checker) {
  try {
    await checker();
  } catch (error) {
    console.warn("VNS push scheduled checker failed.", error);
  }
}
