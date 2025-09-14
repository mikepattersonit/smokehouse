# Alarms Spec

## No-Smoke detection

**Modes**

- Cold: gate OFF (ignore pit temp).
- Hot: gate ON at pit_avg ≥ **120°F** (configurable).

**Auto threshold (default)**

- Baseline window: **10 min** (configurable).
- Margin: trigger if smoke < baseline × (1 − 0.30) for **5 min** (configurable).

**Manual threshold**

- User sets absolute floor; duration still applies.

**De-duplication**

- Suppress identical alarm repeats for **30 min** unless condition clears ≥2 min.

**Snooze / Dismiss**

- Snooze: 15/30/60. Dismiss requires reason; audit logged.

**Notifications**

- In-app banner & history.
- Optional SMS (US numbers, E.164 +1…); recipients scoped to session; max 5; auto-cleared on close.

**Tables (proposed)**

- `alerts(session_id, ts, type, severity, state, details, ttl)`.
- `session_recipients(session_id, phone_number_e164, added_at, ttl)`.
