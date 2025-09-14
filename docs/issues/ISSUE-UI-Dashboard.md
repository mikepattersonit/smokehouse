# UI: Responsive Dashboard (Environment + Probes + Graph Drawers)

## Background
Show live smokehouse status on web/mobile with minimal clutter. Always display environment (Top/Mid/Bottom temps, Smoke PPM, Humidity). Allow assigning/renaming probes per session, viewing charts on demand, and toggling F/°C.

## Acceptance Criteria
- [ ] **Environment card** is always visible with: Top, Middle, Bottom temps; Smoke PPM; Humidity; current time; session start; elapsed time.
- [ ] **Units** default to °F with a user toggle to °C (persists for the session in local storage).
- [ ] **Probe list** shows up to 5 probes; each can be renamed for the current session only and assigned to an Item Type.
- [ ] **Assign/rename UI** reachable in ≤2 taps/clicks; updates immediately and survives page refresh.
- [ ] **Graph drawer/modal**: clicking Environment or a probe opens a chart (last 15 minutes by default) with a simple interval selector (5–60 min).
- [ ] **Mobile layout** stacks cards vertically; charts open full-screen modal; controls stay tappable with thumb reach.
- [ ] **Desktop layout** uses a two-column grid (Environment left; Probes right); modals centered with ESC/Close.
- [ ] **Realtime refresh**: environment/probes update ~every 15s without full page reload; “Last updated” timestamp shown.
- [ ] **Advisor cadence toggle** per item: Manual or every 15m (UI only; backend hook later).
- [ ] **Alerts entry point** present (no backend coupling yet): place for min/max per probe and “Smoke present” pre-alarm toggle.
- [ ] **Theme**: clean dark theme default; light theme toggle.
- [ ] **A11y**: color-contrast ≥ WCAG AA; keyboard focus visible; charts have text fallbacks.

## Non-Goals (for separate stories)
- Data export, historical comparisons, or LLM integration wiring.
- SMS setup flows; thumbnails upload flows.

## Tech Notes
- Use existing React app; environment values from `/sensors`.
- Keep probe rename/assign state in API if available, else in temp client state (with TODO tag).
- Charts open as modal/drawer; avoid clutter on main grid.

## QA Scenarios
- [ ] New session loads with live values in ≤3s; no N/A if data exists.
- [ ] Toggling °F/°C updates all displayed temps consistently.
- [ ] Opening/closing charts doesn’t shift underlying layout.
- [ ] Mobile 360×640: tap targets ≥40px; no horizontal scroll.
- [ ] Refreshing page preserves probe display names during session.

