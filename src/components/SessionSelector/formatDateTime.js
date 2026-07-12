const TZ = 'America/Chicago';

/**
 * Parse a session_id (YYYYMMDDHHMMSS) into a Date.
 * The firmware writes these digits from UTC wall-clock time
 * (configTime(0, 0, ...) + gmtime_r — zero offset, explicitly UTC),
 * not local time, so no timezone correction is needed here — only
 * at display time.
 */
export function sessionIdToDate(sessionId) {
  const s = String(sessionId);
  if (s.length < 14) return null;
  const year  = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(4, 6), 10) - 1;
  const day   = parseInt(s.slice(6, 8), 10);
  const hour  = parseInt(s.slice(8, 10), 10);
  const min   = parseInt(s.slice(10, 12), 10);
  const sec   = parseInt(s.slice(12, 14), 10);
  const d = new Date(Date.UTC(year, month, day, hour, min, sec));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a session_id (YYYYMMDDHHMMSS, UTC) as a readable Central-time string.
 * e.g. "20251225184651" -> "Dec 25, 2025, 12:46 PM"
 */
export function fmtSessionId(sessionId) {
  const d = sessionIdToDate(sessionId);
  if (!d) return sessionId;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(d);
}

/**
 * Format an ISO UTC string as a readable Central-time string.
 * e.g. "2025-12-25T18:46:51Z" -> "Dec 25, 2025, 12:46 PM"
 */
export function fmtLocal(isoUtc) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(new Date(isoUtc));
}
