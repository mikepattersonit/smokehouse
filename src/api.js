// src/api.js

// ---------- Base URLs ----------
export const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com"; // sessions/sensors/advisor

const ITEMS_BASE =
  process.env.REACT_APP_MEAT_API_BASE ||
  "https://o05rs5z8e1.execute-api.us-east-2.amazonaws.com"; // itemTypes/meatTypes

// Full URL for assignments (POST). Prefer a single URL to avoid double-slash mishaps.
const ASSIGN_URL =
  process.env.REACT_APP_ASSIGN_URL ||
  "https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com/ManageProbeAssignments";

const CONTACTS_URL =
  process.env.REACT_APP_CONTACTS_URL ||
  "https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com/ManageAlertContacts";

// ---------- Helper ----------
async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON or empty body; leave data as null
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------- Sessions ----------
/** GET /sessions/latest -> { session_id, started_at, status, ... } */
export async function fetchLatestSession() {
  return jsonFetch(`${API_BASE}/sessions/latest`);
}

/** GET /sessions?limit=N -> [{ session_id, status, started_at, ... }, ...] newest-first */
export async function fetchSessions(limit = 50) {
  return jsonFetch(`${API_BASE}/sessions?limit=${limit}`);
}

// ---------- Sensors ----------
/** GET /sensors?session_id=...&limit=... -> array of samples (newest-first expected by UI) */
export async function fetchSensors(sessionId, limit = 50) {
  if (!sessionId) throw new Error("fetchSensors: sessionId required");
  const url = `${API_BASE}/sensors?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`;
  return jsonFetch(url);
}

// ---------- Item Types (with route fallback) ----------
/**
 * Tries GET /itemTypes first; falls back to /meatTypes.
 * Returns [{ name, description }, ...]
 */
export async function fetchItemTypes() {
  // Attempt /itemTypes
  try {
    const list = await jsonFetch(`${ITEMS_BASE}/itemTypes`);
    return normalizeItemTypes(list);
  } catch {
    // Fallback /meatTypes
    const list = await jsonFetch(`${ITEMS_BASE}/meatTypes`);
    return normalizeItemTypes(list);
  }
}

function normalizeItemTypes(list) {
  if (!Array.isArray(list)) return [];
  return list.map((x) => ({
    name:                   x.name        ?? String(x?.Name ?? ""),
    description:            x.description ?? String(x?.Description ?? ""),
    smoke_type:             x.smoke_type  ?? "hot",
    target_internal_temp_f: x.target_internal_temp_f ?? null,
    max_safe_temp_f:        x.max_safe_temp_f        ?? null,
  }));
}

// ---------- Advisor ----------
/**
 * POST /advisor
 * payload: { session_id: string, probe_id: 'probe1_temp'|'probe2_temp'|... }
 * returns: { advice: string, model?: string, ... }
 */
export async function postAdvisor(payload) {
  if (!payload?.session_id || !payload?.probe_id) {
    throw new Error("postAdvisor: {session_id, probe_id} required");
  }
  return jsonFetch(`${API_BASE}/advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/**
 * GET /advisor?session_id=&probe_id= — a read-only peek at whatever advice
 * is currently cached for this probe (however old), without invoking
 * Bedrock. Used to restore the last shown advice on load/poll so it
 * persists across refreshes and devices until the user reruns it.
 */
export async function fetchAdvisorCache(sessionId, probeId) {
  if (!sessionId || !probeId) return null;
  try {
    return await jsonFetch(`${API_BASE}/advisor?session_id=${encodeURIComponent(sessionId)}&probe_id=${encodeURIComponent(probeId)}`);
  } catch {
    return null;
  }
}

// ---------- Session settings ----------
/**
 * POST /sessions/update
 * payload: { session_id, target_pit_temp_f }
 */
export async function updateSession(payload) {
  return jsonFetch(`${API_BASE}/sessions/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ---------- Assignments ----------
/** GET probe assignments for a session -> [{ probe_id, item_type, item_weight, min_alert, max_alert, mobile_number }, ...] */
export async function fetchProbeAssignments(sessionId) {
  if (!sessionId) return [];
  try {
    const res = await jsonFetch(`${ASSIGN_URL}?session_id=${encodeURIComponent(sessionId)}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

/**
 * POST assignment to ManageProbeAssignments
 * params: { sessionId, probeId, itemType, itemWeight, minAlert, maxAlert, mobileNumber, insertedAt }
 * lambda expects camelCase keys as below (matches your working curl).
 *
 * This is a full replace (DynamoDB put_item), not a partial update — callers
 * that only want to change one field (e.g. marking insertion time) must pass
 * along the probe's other current fields too, or they'll be cleared.
 */
export async function saveProbeAssignment({
  sessionId,
  probeId,
  itemType,
  itemWeight,
  minAlert = null,
  maxAlert = null,
  mobileNumber = null,
  groupId = null,
  insertedAt = null,
}) {
  if (!sessionId || !probeId) {
    throw new Error("saveProbeAssignment: {sessionId, probeId} required");
  }
  const payload = {
    sessionId,
    probeId,
    itemType: itemType ?? "",
    itemWeight: itemWeight ?? "",
    minAlert: toNullableNumber(minAlert),
    maxAlert: toNullableNumber(maxAlert),
    mobileNumber: mobileNumber || null,
    groupId: groupId || null,
    insertedAt: insertedAt || null,
  };
  return jsonFetch(ASSIGN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function toNullableNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- Alert contacts (household notification list) ----------
/** GET all household contacts -> [{ phone_number, name, enabled, created_at }, ...] */
export async function fetchAlertContacts() {
  try {
    const res = await jsonFetch(CONTACTS_URL);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

/**
 * POST upsert a contact. Partial update: only {phoneNumber, enabled} toggles
 * enabled without touching the stored name; include name to set/change it.
 */
export async function saveAlertContact({ phoneNumber, name, enabled }) {
  if (!phoneNumber) throw new Error("saveAlertContact: phoneNumber required");
  const payload = { phoneNumber };
  if (name !== undefined) payload.name = name;
  if (enabled !== undefined) payload.enabled = enabled;
  return jsonFetch(CONTACTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** DELETE a contact by phone number */
export async function deleteAlertContact(phoneNumber) {
  if (!phoneNumber) throw new Error("deleteAlertContact: phoneNumber required");
  return jsonFetch(`${CONTACTS_URL}?phone_number=${encodeURIComponent(phoneNumber)}`, {
    method: "DELETE",
  });
}
