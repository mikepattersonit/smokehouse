// src/api.js

// Main API (sessions, sensors, advisor)
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  "https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com";

// Item types API (was /meatTypes; we also try /itemTypes)
const MEAT_API =
  process.env.REACT_APP_MEAT_API_BASE ||
  "https://o05rs5z8e1.execute-api.us-east-2.amazonaws.com";

// Probe assignment API (POST)
const PROBE_API_BASE =
  process.env.REACT_APP_PROBE_API_BASE ||
  "https://hgrhqnwar6.execute-api.us-east-2.amazonaws.com";

/* ----------------------------- utils ----------------------------- */
async function fetchJson(url, opts = {}, label = "request") {
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore JSON parse errors; handled below
  }
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `${label} ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

/* ----------------------------- sessions ----------------------------- */
/** GET /sessions/latest -> { session_id, started_at, status, ... } */
export async function fetchLatestSession() {
  const url = `${API_BASE}/sessions/latest`;
  return fetchJson(url, undefined, "sessions/latest");
}

/* ------------------------------ sensors ------------------------------ */
/** GET /sensors?session_id=...&limit=... -> [ { timestamp, ... }, ... ] */
export async function fetchSensors(sessionId, limit = 50) {
  if (!sessionId) throw new Error("fetchSensors: sessionId required");
  const url = `${API_BASE}/sensors?session_id=${encodeURIComponent(
    sessionId
  )}&limit=${limit}`;
  return fetchJson(url, undefined, "sensors");
}

/* ----------------------------- item types ---------------------------- */
/**
 * GET item types
 * Tries /itemTypes first (new), then /meatTypes (legacy) for compatibility.
 * Returns an array like: [{ name, description }, ...]
 */
export async function fetchItemTypes() {
  const tryUrls = [`${MEAT_API}/itemTypes`, `${MEAT_API}/meatTypes`];
  for (const url of tryUrls) {
    try {
      const data = await fetchJson(url, undefined, "itemTypes");
      return Array.isArray(data) ? data : [];
    } catch {
      // try next path
    }
  }
  throw new Error("itemTypes not found (tried /itemTypes and /meatTypes)");
}

/* ------------------------------- advisor ----------------------------- */
/** POST /advisor -> { advice, used_fallback, model, ... } */
export async function getAdvisorAdvice(sessionId, probeId) {
  if (!sessionId) throw new Error("getAdvisorAdvice: sessionId required");
  if (!probeId) throw new Error("getAdvisorAdvice: probeId required");
  const url = `${API_BASE}/advisor`;
  return fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, probe_id: probeId }),
    },
    "advisor"
  );
}

/* ------------------------ probe assignments POST --------------------- */
/**
 * POST ManageProbeAssignments
 * Body shape expected by your Lambda:
 * {
 *   sessionId, probeId, itemType, itemWeight,
 *   minAlert, maxAlert, mobileNumber
 * }
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
  if (!sessionId) throw new Error("saveProbeAssignment: sessionId required");
  if (!probeId) throw new Error("saveProbeAssignment: probeId required");

  const url = `${PROBE_API_BASE}/ManageProbeAssignments`;
  return fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        probeId,
        itemType,
        itemWeight,
        minAlert,
        maxAlert,
        mobileNumber,
      }),
    },
    "ManageProbeAssignments"
  );
}
