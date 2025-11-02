import React from 'react';
import { fmtLocal } from './formatDateTime';

export type SessionSummary = {
  id: string;
  short_id: string;
  state: 'LIVE' | 'ENDED' | 'IDLE';
  start_ts: string;          // ISO UTC
  end_ts?: string | null;    // ISO UTC or null if LIVE
};

type Props = {
  current?: SessionSummary | null;
  recent: SessionSummary[];
  onSelect: (s: SessionSummary | 'LIVE') => void; // 'LIVE' = current session
};

export default function SessionSelector({ current, recent, onSelect }: Props) {
  // Minimal, presentational only for now
  return (
    <div className="relative">
      <button
        aria-haspopup="listbox"
        aria-expanded="false"
        className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm"
      >
        {current
          ? `Session ${current.short_id} — ${fmtLocal(current.start_ts)}`
          : 'Current session (LIVE)'}
      </button>
      {/* Dropdown list comes in the next step */}
    </div>
  );
}
