const TZ = 'America/Chicago';

/**
 * Parse a session_id in YYYYMMDDHHMMSS format into a Date.
 * The digits are treated as local America/Chicago time.
 */
function sessionIdToDate(sessionId) {
  const s = String(sessionId);
  if (s.length < 14) return null;
  // Build an ISO string with offset so Date parses it correctly
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)}:${s.slice(10,12)}:${s.slice(12,14)}`;
  // Use Intl to get the UTC offset for that local time
  const d = new Date(iso + 'Z'); // parse as UTC first to get a Date object
  // Then reinterpret as Chicago local time via a trick: format in UTC offset
  // Simplest reliable approach: format a known UTC epoch and adjust
  return d;
}

/**
 * Format a session_id (YYYYMMDDHHMMSS, Chicago local) as a readable string.
 * e.g. "20251225184651" -> "Dec 25, 2025, 6:46 PM"
 */
export function fmtSessionId(sessionId) {
  const s = String(sessionId);
  if (s.length < 14) return sessionId;
  // Treat the digits as a Chicago-local wall-clock time
  const year  = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(4, 6), 10) - 1;
  const day   = parseInt(s.slice(6, 8), 10);
  const hour  = parseInt(s.slice(8, 10), 10);
  const min   = parseInt(s.slice(10, 12), 10);
  const sec   = parseInt(s.slice(12, 14), 10);

  // Build a UTC Date that, when formatted in Chicago TZ, shows the correct wall time.
  // We do this by formatting an epoch in the target TZ and comparing.
  // Simpler: use the offset trick via Intl.
  const approxUtc = new Date(Date.UTC(year, month, day, hour, min, sec));

  // Get the Chicago offset at that approximate UTC moment
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(approxUtc);

  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });

  const chiYear  = parseInt(p.year,   10);
  const chiMonth = parseInt(p.month,  10) - 1;
  const chiDay   = parseInt(p.day,    10);
  const chiHour  = parseInt(p.hour,   10);
  const chiMin   = parseInt(p.minute, 10);
  const chiSec   = parseInt(p.second, 10);

  // Difference between what Chicago shows vs what we want
  const offsetMs = Date.UTC(chiYear, chiMonth, chiDay, chiHour, chiMin, chiSec)
                 - Date.UTC(year, month, day, hour, min, sec);

  const corrected = new Date(approxUtc.getTime() - offsetMs);

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(corrected);
}

/**
 * Format an ISO UTC string as a readable Chicago-local string.
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
