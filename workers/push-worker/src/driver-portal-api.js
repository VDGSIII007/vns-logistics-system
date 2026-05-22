const SAFE_ERROR = "Driver portal service is unavailable";

function supabaseConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: "Supabase driver portal API is not configured" };
  }
  return {
    url: String(env.SUPABASE_URL).replace(/\/+$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function supabaseHeaders(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "content-type": "application/json"
  };
}

async function supabaseFetch(env, path) {
  const config = supabaseConfig(env);
  if (config.error) return { error: config.error, status: 500 };

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: "GET",
    headers: supabaseHeaders(config)
  });
  const text = await response.text();
  const body = text ? (() => {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  })() : null;

  if (!response.ok) {
    return { error: body?.message || SAFE_ERROR, details: body, status: response.status };
  }

  return { body, status: response.status };
}

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function publicDriver(record = {}) {
  return {
    username: record.username || "",
    plate_number: record.plate_number || "",
    plateNumber: record.plate_number || "",
    driver_name: record.driver_name || "",
    driverName: record.driver_name || "",
    helper_name: record.helper_name || "",
    helperName: record.helper_name || "",
    group_name: record.group_name || "",
    groupName: record.group_name || "",
    mobile_number: record.mobile_number || "",
    mobileNumber: record.mobile_number || ""
  };
}

// Internal trial login only. TODO: replace temporary_password with password_hash
// verification and a signed session token before wider rollout.
export async function loginDriverPortalUser(env, input = {}) {
  const username = textOrNull(input.username);
  const password = textOrNull(input.password);
  if (!username || !password) {
    return { ok: false, error: "Invalid username or password", status: 401 };
  }

  const filters = new URLSearchParams({
    select: "username,temporary_password,plate_number,driver_name,helper_name,group_name,mobile_number,active",
    username: `eq.${username}`,
    active: "eq.true",
    limit: "1"
  });
  const result = await supabaseFetch(env, `driver_portal_users?${filters.toString()}`);
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };

  const record = Array.isArray(result.body) ? result.body[0] : null;
  if (!record || String(record.temporary_password || "") !== password) {
    return { ok: false, error: "Invalid username or password", status: 401 };
  }

  return {
    ok: true,
    driver: publicDriver(record)
  };
}

export async function getDriverPortalUser(env, username) {
  const cleanUsername = textOrNull(username);
  if (!cleanUsername) return { ok: false, error: "username is required", status: 400 };

  const filters = new URLSearchParams({
    select: "username,plate_number,driver_name,helper_name,group_name,mobile_number,active",
    username: `eq.${cleanUsername}`,
    active: "eq.true",
    limit: "1"
  });
  const result = await supabaseFetch(env, `driver_portal_users?${filters.toString()}`);
  if (result.error) return { ok: false, error: SAFE_ERROR, details: result.error, status: result.status || 500 };

  const record = Array.isArray(result.body) ? result.body[0] : null;
  if (!record) return { ok: false, error: "Driver user not found", status: 404 };
  return {
    ok: true,
    driver: publicDriver(record)
  };
}
