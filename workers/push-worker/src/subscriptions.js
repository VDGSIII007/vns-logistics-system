export async function endpointHash(endpoint) {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function subscriptionKey(hash) {
  return `push:sub:${hash}`;
}

export function validateSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return "subscription is required";
  if (!subscription.endpoint || typeof subscription.endpoint !== "string") return "subscription.endpoint is required";
  if (!subscription.keys || typeof subscription.keys !== "object") return "subscription.keys is required";
  if (!subscription.keys.p256dh || typeof subscription.keys.p256dh !== "string") return "subscription.keys.p256dh is required";
  if (!subscription.keys.auth || typeof subscription.keys.auth !== "string") return "subscription.keys.auth is required";
  return "";
}

export async function saveSubscription(kv, input) {
  const validationError = validateSubscription(input.subscription);
  if (validationError) return { error: validationError };

  const hash = await endpointHash(input.subscription.endpoint);
  const now = new Date().toISOString();
  const key = subscriptionKey(hash);
  const existing = await kv.get(key, "json");
  const record = {
    endpointHash: hash,
    subscription: input.subscription,
    role: String(input.role || existing?.role || "Viewer").trim() || "Viewer",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastSeenAt: now,
    userAgent: String(input.userAgent || existing?.userAgent || "").slice(0, 500),
    enabled: true
  };

  await kv.put(key, JSON.stringify(record));
  return { endpointHash: hash, record };
}

export async function getSubscriptionByEndpoint(kv, endpoint) {
  if (!endpoint || typeof endpoint !== "string") return null;
  const hash = await endpointHash(endpoint);
  return kv.get(subscriptionKey(hash), "json");
}

export async function deleteSubscriptionByEndpoint(kv, endpoint) {
  if (!endpoint || typeof endpoint !== "string") return "";
  const hash = await endpointHash(endpoint);
  await kv.delete(subscriptionKey(hash));
  return hash;
}

export async function listTargetSubscriptions(kv) {
  const records = [];
  let cursor;

  do {
    const page = await kv.list({ prefix: "push:sub:", cursor });
    await Promise.all(page.keys.map(async item => {
      const record = await kv.get(item.name, "json");
      const role = String(record?.role || "").trim().toLowerCase();
      if (
        record?.subscription &&
        record.enabled === true &&
        (role === "admin" || role === "mother" || role === "approver")
      ) {
        records.push(record);
      }
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return records;
}
