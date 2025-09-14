const API_BASE = process.env.REACT_APP_API_BASE || 'https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com';

/** GET /sessions/latest -> { session_id, started_at, status } */
export async function fetchLatestSession() {
  const res = await fetch(`${API_BASE}/sessions/latest`);
  if (!res.ok) throw new Error(`sessions/latest ${res.status}`);
  return res.json();
}

/** GET /sensors?session_id=...&limit=... */
export async function fetchSensors(sessionId, limit = 50) {
  if (!sessionId) throw new Error('fetchSensors: sessionId required');
  const url = `${API_BASE}/sensors?session_id=${encodeURIComponent(sessionId)}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sensors ${res.status}`);
  return res.json();
}

/** (optional) item types */
const MEAT_API = process.env.REACT_APP_MEAT_API_BASE || 'https://o05rs5z8e1.execute-api.us-east-2.amazonaws.com';
export async function fetchItemTypes() {
  const res = await fetch(`${MEAT_API}/meatTypes`);
  if (!res.ok) throw new Error(`meatTypes ${res.status}`);
  return res.json();
}
