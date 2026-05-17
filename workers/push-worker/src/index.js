import {
  acknowledgeLastNotification,
  getLastNotification,
  publicLastNotification,
  runApprovalPushCheck
} from "./approval-checker.js";
import { debugCashSource } from "./checkers/cash.js";
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
  listRepairRequestsFromSupabase,
  updateRepairRequestStatus,
  updateRepairBackupStatus,
  upsertRepairRequestToSupabase
} from "./repair-api.js";
import { sendWebPush } from "./webpush.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
const REPAIR_API_PATHS = new Set([
  "/api/repair/create",
  "/api/repair/list",
  "/api/repair/update-status",
  "/api/repair/backup-status"
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

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const isRepairApiRoute = REPAIR_API_PATHS.has(url.pathname);
  if (isRepairApiRoute && request.method === "OPTIONS") return handleOptions(request);
  if (request.method === "POST" && url.pathname === "/api/repair/create") return withCors(await handleRepairCreate(request, env), request);
  if (request.method === "GET" && url.pathname === "/api/repair/list") return withCors(await handleRepairList(url, env), request);
  if (request.method === "POST" && url.pathname === "/api/repair/update-status") return withCors(await handleRepairUpdateStatus(request, env), request);
  if (request.method === "POST" && url.pathname === "/api/repair/backup-status") return withCors(await handleRepairBackupStatus(request, env), request);
  if (isRepairApiRoute) return withCors(jsonResponse({ ok: false, error: "Method not allowed" }, 405), request);
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
