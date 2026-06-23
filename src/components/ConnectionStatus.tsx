import React from 'react';
import type { DataMode } from '../lib/config';
import { Database, FlaskConical } from 'lucide-react';

interface ConnectionStatusProps {
  dataMode: DataMode;
  isDemoMode: boolean;
}

export default function ConnectionStatus({ dataMode, isDemoMode }: ConnectionStatusProps) {
  if (isDemoMode || dataMode === 'demo') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] text-amber-800 font-semibold">
        <FlaskConical className="w-3 h-3" />
        Demo Mode
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] text-emerald-800 font-semibold">
      <Database className="w-3 h-3" />
      Production · PostgreSQL
    </span>
  );
}
