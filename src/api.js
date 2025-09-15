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
    name: x.name ?? String(x?.Name ?? ""),
    description: x.description ?? String(x?.Description ?? ""),
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

// ---------- Assignments ----------
/**
 * POST assignment to ManageProbeAssignments
 * params: { sessionId, probeId, itemType, itemWeight, minAlert, maxAlert, mobileNumber }
 * lambda expects camelCase keys as below (matches your working curl).
 */
export async function saveProbeAssignment({
  sessionId,
  probeId,
  itemType,
  itemWeight,
  minAlert = null,
  maxAlert = null,
  mobileNumber = null,
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
