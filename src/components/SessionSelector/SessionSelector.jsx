import React, { useEffect, useRef, useState } from 'react';
import { fmtSessionId } from './formatDateTime';
import './SessionSelector.css';

/**
 * SessionSelector — dropdown to pick a session.
 *
 * Props:
 *   sessions     {Array}   list of session objects from the API
 *   currentId    {string}  the active session_id (latest/live)
 *   selectedId   {string}  the currently viewed session_id
 *   onSelect     {func}    called with session_id string when user picks one
 *   loading      {bool}    show loading state while sessions are fetching
 */
export default function SessionSelector({ sessions, currentId, selectedId, onSelect, loading }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isLive = selectedId === currentId;
  const label = loading
    ? 'Loading sessions…'
    : isLive
      ? `LIVE — ${fmtSessionId(currentId)}`
      : `${fmtSessionId(selectedId)} (historical)`;

  return (
    <div className="session-selector" ref={ref}>
      <button
        className={`session-selector__button ${isLive ? 'session-selector__button--live' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
      >
        {label}
        <span className="session-selector__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <ul className="session-selector__list" role="listbox">
          {sessions.map((s) => {
            const isSelected = s.session_id === selectedId;
            const isCurrent  = s.session_id === currentId;
            return (
              <li
                key={s.session_id}
                role="option"
                aria-selected={isSelected}
                className={`session-selector__item ${isSelected ? 'session-selector__item--selected' : ''}`}
                onClick={() => {
                  onSelect(s.session_id);
                  setOpen(false);
                }}
              >
                <span className="session-selector__item-label">
                  {fmtSessionId(s.session_id)}
                </span>
                {isCurrent && (
                  <span className="session-selector__badge session-selector__badge--live">LIVE</span>
                )}
                {!isCurrent && s.status && (
                  <span className="session-selector__badge">{s.status}</span>
                )}
              </li>
            );
          })}
          {sessions.length === 0 && !loading && (
            <li className="session-selector__empty">No sessions found</li>
          )}
        </ul>
      )}
    </div>
  );
}
