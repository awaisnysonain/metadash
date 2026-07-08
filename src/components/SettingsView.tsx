import React from 'react';
import type { DataMode } from '../lib/config';
import { AutoTaggingRule, TeamMember } from '../types';
import { apiClient, type RetentionStatus } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Settings,
  Facebook,
  Instagram,
  Trash2,
  Bell,
  PlusCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Link2,
  Archive,
} from 'lucide-react';

interface SettingsViewProps {
  autoTaggingRules: AutoTaggingRule[];
  teamMembers: TeamMember[];
  dataMode: DataMode;
  isDemoMode: boolean;
  onReload: () => Promise<void>;
  onAddRule: (keyword: string, tag: string, priority: string) => void;
  onDeleteRule: (id: string) => void;
}

export default function SettingsView({
  autoTaggingRules,
  teamMembers,
  isDemoMode,
  onReload,
  onAddRule,
  onDeleteRule,
}: SettingsViewProps) {
  const [keyword, setKeyword] = React.useState('');
  const [tag, setTag] = React.useState('');
  const [priority, setPriority] = React.useState('Medium');
  const [pagesList, setPagesList] = React.useState<
    Array<{ id: string; name: string; fans: string; avatar: string; platform: string; isConnected: boolean }>
  >([]);
  const [adAccountsList, setAdAccountsList] = React.useState<Array<{ id: string; name: string; status: string }>>(
    []
  );
  const [syncMessage, setSyncMessage] = React.useState('');
  const [syncWarning, setSyncWarning] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [tokenStatus, setTokenStatus] = React.useState<Awaited<ReturnType<typeof apiClient.getMetaTokenStatus>> | null>(null);
  const [slackStatus, setSlackStatus] = React.useState<Awaited<ReturnType<typeof apiClient.getSlackStatus>> | null>(null);
  const [slackMessage, setSlackMessage] = React.useState('');
  const [shortToken, setShortToken] = React.useState('');
  const [exchangeResult, setExchangeResult] = React.useState('');
  const [retention, setRetention] = React.useState<RetentionStatus | null>(null);
  const [retentionDaysInput, setRetentionDaysInput] = React.useState('');
  const [retentionBusy, setRetentionBusy] = React.useState(false);
  const [retentionMessage, setRetentionMessage] = React.useState('');
  const { user } = useAuth();
  const ownerUsername = (retention?.ownerUsername || 'oh.awais').toLowerCase();
  const isOwner = Boolean(user && ((user.username ?? '').toLowerCase() === ownerUsername || user.role === 'admin'));

  React.useEffect(() => {
    if (!isDemoMode) {
      apiClient.getMetaTokenStatus().then(setTokenStatus).catch(() => setTokenStatus(null));
      apiClient.getSlackStatus().then(setSlackStatus).catch(() => setSlackStatus(null));
      apiClient.getRetentionStatus().then(status => {
        setRetention(status);
        setRetentionDaysInput(String(status.days));
      }).catch(() => setRetention(null));
    }
  }, [isDemoMode, syncMessage]);

  const saveRetentionDays = async () => {
    if (!retention) return;
    const days = Number(retentionDaysInput);
    if (!Number.isFinite(days) || days < retention.minDays || days > retention.maxDays) {
      setRetentionMessage(`Enter a whole number between ${retention.minDays} and ${retention.maxDays}.`);
      return;
    }
    setRetentionBusy(true);
    setRetentionMessage('');
    try {
      const next = await apiClient.setRetentionDays(days);
      setRetention(next);
      setRetentionDaysInput(String(next.days));
      setRetentionMessage(`Retention window updated to ${next.days} day(s). Older comments are deleted on the next daily sweep.`);
    } catch (err) {
      setRetentionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRetentionBusy(false);
    }
  };

  const runRetentionNow = async () => {
    setRetentionBusy(true);
    setRetentionMessage('');
    try {
      const next = await apiClient.runRetentionSweep();
      setRetention(next);
      setRetentionDaysInput(String(next.days));
      setRetentionMessage(next.justRan
        ? `Sweep deleted ${next.justRan.deleted ?? next.justRan.archived ?? 0} comment(s) older than ${next.justRan.days} day(s).`
        : 'Sweep completed.');
    } catch (err) {
      setRetentionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRetentionBusy(false);
    }
  };

  React.useEffect(() => {
    if (isDemoMode) {
      void import('../data').then(({ connectedPages, mockAdAccounts }) => {
        setPagesList(connectedPages);
        setAdAccountsList(mockAdAccounts);
      });
    } else {
      apiClient
        .getPages()
        .then(pages =>
          setPagesList(
            pages.map(p => ({
              id: p.id,
              name: p.pageName,
              fans: p.fans || '',
              avatar: p.avatar || '',
              platform: 'facebook',
              isConnected: p.isConnected,
            }))
          )
        )
        .catch(() => setPagesList([]));
      setAdAccountsList([]);
    }
  }, [isDemoMode]);

  const runSync = async (
    fn: () => Promise<{ message: string; details?: { warnings?: string[] } }>,
    label: string
  ) => {
    setSyncing(true);
    setSyncWarning(false);
    setSyncMessage(`Updating ${label.toLowerCase()}…`);
    try {
      const result = await fn();
      setSyncMessage(result.message.replace(/sync/gi, 'update').replace(/Sync/g, 'Update'));
      setSyncWarning(Boolean(result.details?.warnings?.length));
      await onReload();
    } catch (err) {
      setSyncMessage(`Something went wrong. Please try again.`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in" id="settings-screen">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500 flex items-center gap-2">
          <Settings className="w-3.5 h-3.5" /> Settings
        </p>
        <h2 className="font-editorial mt-1" style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.015em' }}>
          Tune the desk.
        </h2>
        <p className="mt-1 text-sm text-slate-500">Manage connected accounts, sync cadence, auto-tagging, and notifications.</p>
      </div>

      {/* Sync section */}
      <section className="bg-white border border-slate-200 p-4 rounded-xl">
        <h3 className="font-medium text-slate-900 mb-1">Update from Meta</h3>
        <p className="text-sm text-slate-500 mb-4">
          Pull in your latest campaigns, pages, and comments from Facebook & Instagram.
        </p>
        {!isDemoMode && tokenStatus?.valid && !tokenStatus.canSyncComments && (
          <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <strong>Comment sync blocked:</strong> your token is missing{' '}
            <code className="text-xs">pages_read_user_content</code>.
            <ol className="list-decimal list-inside mt-2 space-y-1 text-amber-800">
              <li>Meta App Dashboard → your app → App Review → Permissions → add <strong>pages_read_user_content</strong></li>
              <li>
                Graph API Explorer → generate a new User token with: ads_read, pages_show_list, pages_read_engagement,
                pages_read_user_content
              </li>
              <li>Exchange for a long-lived token, update <code className="text-xs">META_ACCESS_TOKEN</code>, restart the server</li>
            </ol>
          </div>
        )}
        {!isDemoMode && tokenStatus && !tokenStatus.valid && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
            Your Meta connection needs to be refreshed. Ask your admin to reconnect in Advanced setup below.
          </div>
        )}
        {!isDemoMode && tokenStatus?.valid && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2 mb-4">
            Connected to Meta
            {tokenStatus.expiresAtIso
              ? ` · token expires ${new Date(tokenStatus.expiresAtIso).toLocaleDateString()}`
              : ' · long-lived token (no expiry)'}
            {tokenStatus.dataAccessExpiresAt
              ? ` · data access until ${new Date(tokenStatus.dataAccessExpiresAt * 1000).toLocaleDateString()}`
              : ''}
            {tokenStatus.canSyncComments ? ' · comment sync ready' : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            disabled={syncing || isDemoMode}
            onClick={() => runSync(apiClient.syncAll, 'everything')}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Update everything
          </button>
          {[
            { label: 'Campaigns & ads', fn: apiClient.syncAds },
            { label: 'Pages', fn: apiClient.syncPages },
            { label: 'Comments', fn: apiClient.syncComments },
          ].map(item => (
            <button
              key={item.label}
              disabled={syncing || isDemoMode}
              onClick={() => runSync(item.fn, item.label)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm disabled:opacity-50 transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
        {isDemoMode && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">
            You&apos;re viewing sample data. Connect a live account to sync from Meta.
          </p>
        )}
        {syncMessage && (
          <p
            className={`text-sm p-3 rounded-lg mt-3 ${
              syncWarning
                ? 'text-amber-800 bg-amber-50 border border-amber-100'
                : 'text-slate-600 bg-slate-50'
            }`}
          >
            {syncMessage}
          </p>
        )}
      </section>

      {/* Connected pages */}
      <section className="bg-white border border-slate-200 p-4 rounded-xl">
        <h3 className="font-medium text-slate-900 mb-3">Connected pages</h3>
        <div className="grid grid-cols-1 gap-2 max-h-[520px] overflow-y-auto lg:grid-cols-2 2xl:grid-cols-3">
          {pagesList.length === 0 && !isDemoMode ? (
            <p className="text-sm text-slate-500">
              No pages connected yet. Use &quot;Update everything&quot; above to connect your pages.
            </p>
          ) : (
            pagesList.map(page => (
              <div
                key={page.id}
                 className="p-2.5 bg-slate-50 rounded-lg flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  {page.avatar ? (
                    <img src={page.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="h-9 w-9 rounded-full bg-blue-50 text-[#1877F2] flex items-center justify-center"><Facebook className="h-4 w-4" /></span>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                      {page.name}
                      {page.platform === 'facebook' ? (
                        <Facebook className="w-3.5 h-3.5 text-[#1877F2]" />
                      ) : (
                        <Instagram className="w-3.5 h-3.5 text-pink-600" />
                      )}
                    </p>
                    {page.fans && <p className="text-xs text-slate-500">{page.fans}</p>}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                    page.isConnected
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {page.isConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Ad accounts */}
      {(adAccountsList.length > 0 || isDemoMode) && (
        <section className="bg-white border border-slate-200 p-4 rounded-xl">
          <h3 className="font-medium text-slate-900 mb-3">Ad accounts</h3>
          {adAccountsList.length === 0 ? (
            <p className="text-sm text-slate-500">No ad accounts yet. Update campaigns & ads to connect.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
              {adAccountsList.map(acc => (
                <div key={acc.id} className="p-2.5 bg-slate-50 rounded-lg flex justify-between items-center gap-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{acc.name}</p>
                  <span className="shrink-0 text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg">
                    {acc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Auto-tagging */}
      <section className="bg-white border border-slate-200 p-4 rounded-xl">
        <h3 className="font-medium text-slate-900 mb-1">Auto-labeling</h3>
        <p className="text-sm text-slate-500 mb-4">
          Automatically tag comments when they contain certain words.
        </p>
        {autoTaggingRules.length === 0 ? (
          <p className="text-sm text-slate-400 mb-3">No rules yet.</p>
        ) : (
          autoTaggingRules.map(rule => (
            <div
              key={rule.id}
              className="p-2.5 bg-slate-50 rounded-lg mb-1.5 flex justify-between items-center text-sm"
            >
              <span className="text-slate-700">
                When comment contains &quot;<strong>{rule.keyword}</strong>&quot; → tag{' '}
                <strong>#{rule.tag}</strong> · {rule.priority} priority
              </span>
              <button onClick={() => onDeleteRule(rule.id)} className="text-red-500 hover:text-red-700 p-1">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
        <form
          onSubmit={e => {
            e.preventDefault();
            if (keyword && tag) {
              onAddRule(keyword, tag, priority);
              setKeyword('');
              setTag('');
            }
          }}
          className="grid grid-cols-1 gap-2 mt-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <input
            placeholder="Word to look for"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            className="filter-select text-sm"
          />
          <input
            placeholder="Tag name"
            value={tag}
            onChange={e => setTag(e.target.value)}
            className="filter-select text-sm"
          />
          <select value={priority} onChange={e => setPriority(e.target.value)} className="filter-select text-sm">
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
            <option>Urgent</option>
          </select>
          <button
            type="submit"
            className="py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-colors"
          >
            <PlusCircle className="w-4 h-4" /> Add rule
          </button>
        </form>
      </section>

      {/* Notifications */}
      <section className="bg-white border border-slate-200 p-5 rounded-2xl">
        <h3 className="font-medium text-slate-900 mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-slate-400" /> Slack alerts
        </h3>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm text-slate-700">Send Slack messages for new Meta comments.</p>
            <p className="text-xs text-slate-500 mt-1">
              {slackStatus?.configured
                ? `Configured for channel ${slackStatus.channelId}`
                : 'Missing SLACK_BOT_TOKEN or SLACK_ALERT_CHANNEL_ID on the server.'}
            </p>
          </div>
          <button
            type="button"
            disabled={isDemoMode || !slackStatus?.configured}
            onClick={async () => {
              const next = await apiClient.setSlackEnabled(!slackStatus?.enabled);
              setSlackStatus(next);
              setSlackMessage(next.enabled ? 'Slack alerts enabled.' : 'Slack alerts disabled.');
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${slackStatus?.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {slackStatus?.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isDemoMode || !slackStatus?.configured}
            onClick={async () => {
              try {
                const result = await apiClient.testSlackAlert();
                setSlackMessage(result.sent ? 'Test alert sent to Slack.' : `Slack test failed: ${result.reason || 'unknown'}`);
              } catch (err) {
                setSlackMessage(err instanceof Error ? err.message : 'Slack test failed.');
              }
            }}
            className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Send test alert
          </button>
          {slackMessage && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{slackMessage}</p>}
        </div>
      </section>

      {/* Retention — owner-only */}
      {isOwner && retention && (
        <section className="bg-white border border-slate-200 p-5 rounded-2xl">
          <h3 className="text-base font-semibold text-slate-950 flex items-center gap-2">
            <Archive className="w-4 h-4 text-slate-400" /> Comment retention
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Owner only</span>
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Comments older than this window are permanently deleted from the database every day — replied, unseen, and archived comments included.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs font-semibold text-slate-600">
              <span className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Days to keep</span>
              <input
                type="number"
                min={retention.minDays}
                max={retention.maxDays}
                step={1}
                value={retentionDaysInput}
                onChange={e => setRetentionDaysInput(e.target.value)}
                className="h-10 w-28 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <button
              type="button"
              disabled={retentionBusy}
              onClick={() => void saveRetentionDays()}
              className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              Save window
            </button>
            <button
              type="button"
              disabled={retentionBusy}
              onClick={() => void runRetentionNow()}
              className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              Run sweep now
            </button>
            <span className="text-[11px] text-slate-500">
              Allowed: {retention.minDays}–{retention.maxDays} days
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Current window</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{retention.days} <span className="text-xs font-semibold text-slate-500">day{retention.days === 1 ? '' : 's'}</span></p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Last sweep deleted</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">{(retention.deletedTotal ?? retention.archivedTotal ?? 0).toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Last sweep</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {retention.lastRun
                  ? `${retention.lastRun.deleted ?? retention.lastRun.archived ?? 0} deleted · ${new Date(retention.lastRun.at).toLocaleString()}`
                  : 'Not run yet'}
              </p>
            </div>
          </div>

          {retentionMessage && (
            <p className="mt-3 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              {retentionMessage}
            </p>
          )}
        </section>
      )}

      {/* Team preview */}
      <section className="bg-white border border-slate-200 p-5 rounded-2xl">
        <h3 className="font-medium text-slate-900 mb-4">Team members</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
          {teamMembers.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl">
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                  {m.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{m.name}</p>
                <p className="text-xs text-slate-500 truncate">{m.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Advanced - collapsed by default */}
      <section className="border border-slate-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-5 py-4 flex items-center justify-between text-sm text-slate-500 hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Advanced setup
          </span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showAdvanced && (
          <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-3 text-sm text-slate-500">
            <p>
              API credentials, webhooks, and database settings are configured by your admin team on the
              server. Contact your IT administrator if you need to change the Meta connection.
            </p>
            {!isDemoMode && (
              <>
                <button
                  disabled={syncing}
                  onClick={() => runSync(apiClient.syncCommentsBackfill, 'past comments')}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm disabled:opacity-50"
                >
                  Import comments from last 2 years
                </button>
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="font-medium text-slate-700">Refresh Meta access token</p>
                  <p className="text-xs">
                    Paste a short-lived token from Graph API Explorer. This returns a long-lived token to put in server .env.
                  </p>
                  <textarea
                    value={shortToken}
                    onChange={e => setShortToken(e.target.value)}
                    placeholder="Paste short-lived token here…"
                    rows={2}
                    className="w-full filter-select text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={!shortToken.trim()}
                    onClick={async () => {
                      try {
                        const res = await apiClient.exchangeMetaToken(shortToken.trim());
                        setExchangeResult(
                          `Long-lived token (${res.expiresInDays} days). Update META_ACCESS_TOKEN on server, then pm2 restart metadashboard:\n\n${res.accessToken}`
                        );
                      } catch (err) {
                        setExchangeResult(`Exchange failed: ${String(err)}`);
                      }
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    Exchange for long-lived token
                  </button>
                  {exchangeResult && (
                    <textarea readOnly value={exchangeResult} rows={4} className="w-full filter-select text-xs font-mono bg-slate-50" />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
