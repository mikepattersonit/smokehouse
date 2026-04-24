# SmokeGPT Roadmap

## Done

### Core UI & Dashboard
- Dark ember theme (Inter + JetBrains Mono, mobile-responsive)
- Sticky header: logo, live/historical badge, session selector, global mobile number
- Status strip: outside / top / mid / bottom / humidity / smoke always visible
- 3-column probe grid (2-col tablet, 1-col mobile)
- Main smokehouse chart: oldest→newest left→right, 8-tick x-axis, colour-coded legend
- Per-probe mini sparkline inside each card

### Sessions
- Historical session browser (session selector dropdown, readable Chicago local times)
- Live vs historical mode: polling pauses for historical sessions, "← Live" button to return
- Session list Lambda (GET /sessions)
- Target pit temp: set in UI, saved to sessions table, auto-applied from AI recommendation

### Probes & Items
- 18 item types with smoke_type (hot/cold), predefined target temps, and max safe temps
- Cold smoke mode: blue card theme, ❄ hint, max alert auto-set to 75°F, AI guidance hidden
- Hot smoke mode: 🎯 pull temp hint, max alert auto-populated on item select
- Item assignment (type + weight) saved to probe_assignments table
- Min/max alert thresholds per probe (UI + save)
- Collapsible configure panel — cards stay clean by default
- Rate of rise (°F/hr) and elapsed time displayed on each probe card

### AI Advisor
- AWS Bedrock Claude 3.5 Haiku (replaced OpenAI — was timing out)
- Hot smoke: ETA, doneness %, stall detection, recommended pit temp with Apply button
- Cold smoke: ambient temp management, remaining safe smoke time, ceiling warnings
- 15-minute advice cache (session_analytics table)
- Compact prompt (~400 tokens): computed summary + 12 evenly-spaced milestones
- Session analytics pre-computed: warmup minutes, avg pit temp, outside temp at start

### Infrastructure
- Lambda deploy scripts, cloud inventory sync
- SessionsList, SessionUpdate, SmokehouseAIAdvisor, ListItemTypesPy Lambdas
- Bedrock IAM permission on advisor role
- CORS configured on both API Gateways
- meat_types table: smoke_type, target_internal_temp_f, max_safe_temp_f on all items

---

## Backlog

### High Priority

- **°F / °C toggle** — global setting in header; applies to all displayed temps and inputs
- **SMS alerts** — verify end-to-end (Twilio or SNS); currently wired in UI but unconfirmed
- **Probe renaming** — let user set a custom name per probe per session (e.g. "Flat", "Point")
- **Chart time window presets** — buttons for Last 30 min / 1 hr / 2 hr / All on main chart and sparklines
- **Session clock** — show elapsed time since session start in the header or status strip

### Medium Priority

- **Session continuity (30-min merge)** — if the ESP32 drops and reconnects within 30 min, treat it as the same session rather than starting a new one
- **No-smoke / stall alarm** — alert if pit temp drops below a threshold (fire went out); separate from probe alerts
- **Advisor auto-refresh** — option to re-run AI advice automatically every 15–30 min without manual button press; show last-updated timestamp
- **Advisor log** — show history of AI advice within a session (what it said at each interval)
- **Humidity & smoke PPM** — sensors not currently active; wire up when hardware is ready; status strip cells already in place

### Lower Priority

- **Settings page** — dedicated screen for: default alert margins, chart window, advisor cadence, units, SMS recipients
- **Ramp scheduler** — define target temp steps with timers (e.g. hold at 150°F for 2 hrs, then ramp to 225°F); alert at each transition
- **Export / share session report** — PDF or shareable link with charts, probe history, AI advice log
- **Probe thumbnails** — optional photo per probe assignment (S3 + lifecycle)
- **Alerts / Recipients table** — persist alert configs in DynamoDB with TTL cleanup instead of in-memory only
- **Import item types** — bulk add/edit items via CSV or admin UI

### Icebox

- **Multi-user / shared sessions** — view a live session from another device without separate login
- **Push notifications** — browser push or native app alerts in addition to SMS
- **Historical analytics** — compare cook times across sessions for the same item/weight
- **°C sensor support** — some sensors report in Celsius; normalize at ingest
