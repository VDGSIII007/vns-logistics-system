import {
  runApprovalPushCheck
} from "./approval-checker.js";
import { debugCashSource } from "./checkers/cash.js";
import { debugRepairSource } from "./checkers/repair.js";
import {
  deleteSubscriptionByEndpoint,
  endpointHash,
  getSubscriptionByEndpoint,
  saveSubscription
} from "./subscriptions.js";
import { sendWebPush } from "./webpush.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
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
  return jsonResponse({
    ok: true,
    pushReady: kvReady(env),
    hasPublicKey: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PUBLIC_KEY !== "PUBLIC_KEY_PLACEHOLDER"),
    kvReady: kvReady(env)
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

async function routeRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/push/check") return handleCheck(env);
  if (request.method === "GET" && url.pathname === "/api/push/debug-sources") return handleDebugSources(env);
  if (request.method === "POST" && url.pathname === "/api/push/subscribe") return handleSubscribe(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") return handleUnsubscribe(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/test") return handleTest(request, env);
  if (request.method === "POST" && url.pathname === "/api/push/run-check") return handleRunCheck(env);
  return jsonResponse({ ok: false, error: "Not found" }, 404);
}

export default {
  fetch(request, env) {
    return routeRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runApprovalPushCheck(env));
  }
};
