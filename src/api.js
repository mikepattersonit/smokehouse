cat > src/api.js <<'JS'
import axios from "axios";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  "https://w6hf0kxlve.execute-api.us-east-2.amazonaws.com";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export async function getLatestSession() {
  const res = await api.get("/sessions/latest");
  // Handle both Lambda proxy {statusCode, body} and plain JSON
  if (res.data && res.data.body && res.data.statusCode === 200) {
    return JSON.parse(res.data.body);
  }
  return res.data;
}

export async function getSensors(sessionId, limit = 100) {
  const res = await api.get("/sensors", { params: { session_id: sessionId, limit } });
  return Array.isArray(res.data) ? res.data : [];
}
JS
