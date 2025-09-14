# Smokehouse — User Stories

## Session Lifecycle

### STORY-SESSION-001 — 30-min continuity merge

**As** the system **I want** to merge restarts within 30 min **So that** short outages don’t fragment sessions.  
**Acceptance**

- New reading within 30 min of last → same session; otherwise new.
- Setting default = 30 min; changeable in Settings; not mid-session.

### STORY-SESSION-002 — Manual end with confirm

**As** a user **I want** a guarded “End Session” **So that** I don’t end by mistake.  
**Acceptance**

- Confirm dialog with summary (elapsed time, items, probes).
- After manual end, any new reading within 30 min ⇒ **new** session (no merge).

---

## Dashboard (Mobile & Desktop)

### STORY-UI-ENV-001 — Environment card (always visible)

**As** a user **I want** Top/Middle/Bottom temps, Smoke, Humidity, Session clock **So that** I can glance status.  
**Acceptance**

- Mobile: compact card; Desktop: left column.
- °F default with °C toggle.
- Updated ~15 s.

### STORY-UI-ENV-002 — Quick charts on tap

**As** a user **I want** transient charts **So that** the main page stays clean.  
**Acceptance**

- Tap metric opens 15-min chart; quick 5/15/30/60 presets.
- Add/remove series (env five + any probes).

---

## Probes & Items

### STORY-PROBE-001 — Session-local probe naming

**As** a user **I want** to rename probes for the session **So that** labels match my cook.  
**Acceptance:** Names persist only for the active session.

### STORY-PROBE-002 — Assign probes to items (many-to-one)

**As** a user **I want** to attach multiple probes to one item **So that** I can monitor large cuts.  
**Acceptance:** Item view lists all attached probes and temps.

### STORY-PROBE-003 — Item thumbnails (optional)

**As** a user **I want** a thumbnail for each item **So that** I can identify it quickly.  
**Acceptance:** Upload to S3; show thumbnail in assignment & detail UI.

---

## Alerts & Notifications

### STORY-ALARM-001 — No-Smoke (Cold)

**As** a pitmaster **I want** a no-smoke alarm during cold smoking **So that** I don’t waste time.  
**Acceptance:** Gate OFF (ignores pit temp). Auto baseline (10 min) with margin (30%); duration 5 min; configurable.

### STORY-ALARM-002 — No-Smoke (Hot, gated at 120°F)

**As** a pitmaster **I want** no-smoke only when the pit is hot **So that** warmup doesn’t spam.  
**Acceptance:** Gate ON at pit_avg ≥ **120°F** (configurable). Same baseline/duration.

### STORY-ALARM-003 — Pre-alarms

**As** a user **I want** early warnings **So that** I can react before hard alarms.  
**Acceptance:** Configurable bands; show banner only; hard alarm escalates.

### STORY-ALARM-004 — Ramp scheduler (end-of-step reminders)

**As** a user **I want** reminders at the end of steps **So that** I take the next action.  
**Acceptance:** Step timer per phase; reminder at end; snooze/edit step.

### STORY-NOTIF-001 — App + optional SMS (US format)

**As** a user **I want** alerts in-app or via SMS **So that** I’m notified when away.  
**Acceptance**

- Add/remove recipients per session; E.164 US (+1…) validation; cap 5.
- Auto-clear recipients at session close.
- De-dupe identical alerts for 30 min unless condition clears first.

### STORY-ALARM-005 — Snooze & Dismiss

**As** a user **I want** snooze and dismiss **So that** I can control noise.  
**Acceptance:** Snooze 15/30/60; Dismiss requires reason; logged.

---

## Advisor (LLM)

### STORY-ADV-001 — Per-item advice (manual/15-min)

**As** a user **I want** advice per item **So that** I get targeted guidance.  
**Acceptance:** Toggle cadence (Manual / 15 min). Returns recommendations + ETA.

### STORY-ADV-002 — Iterative refinement

**As** the advisor **I want** previous recommendations **So that** accuracy improves.  
**Acceptance:** Include prior output in prompt context; log exchanges.

---

## Data & History

### STORY-DATA-001 — Sessions table

**As** an operator **I want** a Sessions table **So that** UIs avoid heavy scans.  
**Acceptance:** Status, start, last_seen, end, items_count.

### STORY-DATA-002 — TTL cleanup

**As** an operator **I want** alerts/recipients TTL **So that** data stays tidy.  
**Acceptance:** TTL ~7 days post-close (configurable).

---

## Settings

### STORY-SET-001 — Baselines & gates

**As** an operator **I want** to tune baseline window, margin, duration, and hot gate **So that** alarms fit my rig.  
**Acceptance:** Defaults: baseline=10 min, margin=30%, duration=5 min, hot gate=120°F.

### STORY-SET-002 — Units & charts

**As** a user **I want** °F/°C toggle and chart window presets **So that** I can view how I like.  
**Acceptance:** Global °F default; user toggle persists; chart presets 5/15/30/60.
