# Smokehouse — Epics

## EPIC-001 — Session lifecycle & continuity (30-min merge)

**Problem:** Reboots/battery swaps can fragment sessions.  
**Outcome:** Device restarts within **30 minutes** roll into the current session; otherwise start a new session. Default 30 min (configurable), not changeable mid-session.  
**Scope:**

- Session state model (Active, Ending, Closed).
- Server function to decide “same vs new” session (uses last sensor timestamp).
- Manual “End Session” button with confirm/safety check; session within 30 min after manual end starts **new** session.
  **Out of scope:** Historical analytics.  
  **Measures:** Zero accidental session splits across restarts <30 min.

## EPIC-002 — Real-time dashboard (mobile & desktop)

**Problem:** Users need glanceable current conditions.  
**Outcome:** Always-visible **Environment** card (Top/Middle/Bottom temps, Smoke, Humidity, Session clock). Tap to open charts.  
**Scope:**

- °F default with °C toggle.
- Live refresh ~15 s; charts default window 15 min (quick 5/15/30/60).
- Mobile modal charts; desktop side drawer.
  **Measures:** <2 s time-to-first-paint; no layout thrash on mobile.

## EPIC-003 — Probe & item management

**Problem:** Many probes/items need clear naming & assignment.  
**Outcome:** Session-local probe names; assign 0–5 probes per item; optional item thumbnails.  
**Scope:**

- Rename probes (session-scoped).
- Assign probes to items; multiple probes per item.
- Item types taxonomy (not just “meat”; includes cheese, nuts, spices, fruit, etc.).
  **Measures:** Rename/assign flows <10 s on mobile.

## EPIC-004 — Alerts & notifications (App + optional SMS)

**Problem:** Users miss critical changes (no smoke, step transitions).  
**Outcome:** In-app alerts with optional **US phone** SMS via SNS. Session-scoped recipients auto-cleared at close.  
**Scope:**

- “No-Smoke” alarms (Cold/Hot modes), **Hot gate default 120°F**.
- Pre-alarms for early warnings (configurable bands).
- Ramp step reminders at **end of each step**.
- Snooze (15/30/60) & Dismiss with reason.
- TTL cleanup for alerts & recipients (e.g., 7 days after session close).
  **Measures:** <1 min alert latency; no duplicate spam within 30 min.

## EPIC-005 — Advisor (LLM) — per item, on-demand or every 15 min

**Problem:** Users want projected finish times & guidance.  
**Outcome:** Per-item call that summarizes trends since session start and returns recommendations (“hold at X°F”, “estimated time remaining”).  
**Scope:**

- Cadence toggle: **Manual / every 15 min** (configurable).
- Include previous recommendation to refine subsequent calls (RAG-style).
- Cost controls (on/off per item).
  **Measures:** Reasonable accuracy improvements across calls; transparent log.

## EPIC-006 — Data retention & history

**Problem:** Need records without ballooning storage.  
**Outcome:** Keep historical sessions; short-lived operational data auto-expires.  
**Scope:**

- Sessions table (status, start, end, metadata).
- TTL on operational tables: `alerts`, `session_recipients`.
  **Measures:** Storage growth within budget; zero orphan recipients.

## EPIC-007 — Images (item thumbnails)

**Problem:** Hard to identify items quickly.  
**Outcome:** Optional item thumbnails stored in S3, shown in UI.  
**Scope:** S3 bucket, upload flow, thumbnail renditions, session-only association.  
**Measures:** Upload <5 s on broadband; correct S3 lifecycle/ACL.

## EPIC-008 — Settings & defaults

**Problem:** One-size doesn’t fit all cooks.  
**Outcome:** Central settings with safe defaults; some runtime toggles.  
**Scope:**

- °F/°C, No-Smoke baseline window (10 min default), duration (5 min default), Hot gate temp (120°F default), pre-alarm bands, chart windows, Advisor cadence.
- US phone format validation (E.164 +1…).
  **Measures:** Changes persist; no mid-session setting that risks corruption.
