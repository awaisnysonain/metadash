import React, { useEffect, useState } from 'react';
import { X, Globe, Instagram } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { BrandLogo } from './BrandLogo';

type Brand = 'Flo' | 'Nobl';

interface AssetRow {
  pageId: string;
  pageName: string;
  pageAvatar?: string;
  ads: number;
  instagram?: { id: string; username: string; avatar?: string };
  comments: { facebook: number; instagram: number; total: number };
}

interface Props {
  brand: Brand | null;
  onClose: () => void;
  onSelect: (asset: AssetRow, brand?: Brand) => void;
}

// simple client cache to avoid refetching between opens
const brandCache: Map<Brand, { at: number; assets: AssetRow[] }> = new Map();
const TTL = 5 * 60 * 1000;

export default function BrandAssetsModal({ brand, onClose, onSelect }: Props) {
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!brand) return;
      setLoading(true);
      setError(null);
      try {
        const cached = brandCache.get(brand);
        if (cached && Date.now() - cached.at < TTL) {
          if (mounted) setAssets(cached.assets);
        } else {
          const res = await apiClient.getBrandAssets(brand === 'Flo' ? 'FLO' : 'NOBL');
          brandCache.set(brand, { at: Date.now(), assets: res.assets });
          if (mounted) setAssets(res.assets);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [brand]);

  if (!brand) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <BrandLogo brand={brand} className="h-7 w-7" />
            {brand} Assets
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && (
            <ul className="divide-y divide-slate-200">
              {assets.map(a => (
                <li key={a.pageId} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex items-center gap-3">
                    {a.pageAvatar ? (
                      <img src={a.pageAvatar} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><Globe className="h-4 w-4" /></span>
                    )}
                    <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{a.pageName}</p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3 text-blue-600" /> {a.comments.facebook} FB</span>
                      {a.instagram && (
                        <span className="inline-flex items-center gap-1"><Instagram className="w-3 h-3 text-pink-600" /> {a.comments.instagram} IG · {a.instagram.username}</span>
                      )}
                      <span className="ml-2 text-slate-400 dark:text-slate-500">{a.ads} active ads</span>
                    </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => onSelect(a, brand)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      View comments
                    </button>
                  </div>
                </li>
              ))}
              {assets.length === 0 && (
                <li className="py-6 text-sm text-slate-500 dark:text-slate-400">No assets found for {brand}.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
