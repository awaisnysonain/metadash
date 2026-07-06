import React from 'react';
import type { DataMode } from '../lib/config';

interface ConnectionStatusProps {
  dataMode: DataMode;
  isDemoMode: boolean;
}

export default function ConnectionStatus({ isDemoMode }: ConnectionStatusProps) {
  if (isDemoMode) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Sample data
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Connected
    </span>
  );
}
