import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import UnifiedInbox from './components/UnifiedInbox';
import CampaignsView from './components/CampaignsView';
import ConnectedAccountsView from './components/ConnectedAccountsView';
import TeamView from './components/TeamView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import ProfileView from './components/ProfileView';
import ConnectionStatus from './components/ConnectionStatus';
import BrandAssetsModal from './components/BrandAssetsModal';

import { Comment, CommentStatus, CommentPriority, ActivityLog, CommentView } from './types';
import { Loader2, RefreshCw, Bell, Facebook, Instagram, Megaphone } from 'lucide-react';
import type { InboxFilters } from './components/UnifiedInbox';
import { useAppData } from './hooks/useAppData';
import { fetchCommentsNow } from './services/dataService';
import { apiClient } from './services/apiClient';
import { getAdForComment, inferBrandLabel } from './utils/helpers';

const TAB_PATHS: Record<string, string> = {
  dashboard: '/',
  inbox: '/comments',
  facebook: '/comments/facebook',
  instagram: '/comments/instagram',
  accounts: '/assets',
  campaigns: '/ads-campaigns',
  reports: '/insights',
  team: '/users',
  settings: '/settings',
  profile: '/profile',
};

function tabFromPath(pathname: string) {
  const normalized = pathname.replace(/\/$/, '') || '/';
  const match = Object.entries(TAB_PATHS).find(([, path]) => path === normalized);
  return match?.[0] ?? 'dashboard';
}

export default function App() {
  const { user, isLoading: authLoading, isAuthenticated, hasPermission } = useAuth();

  const {
    dataMode,
    isLoading,
    loadError,
    isDemoMode,
    comments,
    notes,
    activityLogs,
    autoTaggingRules,
    team,
    campaigns,
    ads,
    updateStatus,
    updatePriority,
    updateTags,
    saveComments,
    addNote,
    addActivityLogLocal,
    saveRules,
    removeRule,
    reload,
  } = useAppData(user);

  const [currentTab, setCurrentTab] = useState<string>(() => tabFromPath(window.location.pathname));
  const [selectedComment, setSelectedComment] = useState<Comment | undefined>(undefined);
  const [preconfiguredFilters, setPreconfiguredFilters] = useState<InboxFilters | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [brandModal, setBrandModal] = useState<null | 'Flo' | 'Nobl'>(null);
  const [selectedAsset, setSelectedAsset] = useState<null | { brand: 'Flo' | 'Nobl'; pageId: string; pageName: string; igUsername?: string; counts?: { facebook: number; instagram: number; total: number } }>(null);

  useEffect(() => {
    if (selectedComment) {
      const updated = comments.find(c => c.id === selectedComment.id);
      if (updated) setSelectedComment(updated);
    }
  }, [comments, selectedComment?.id]);

  useEffect(() => {
    const handlePopState = () => setCurrentTab(tabFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated && window.location.pathname !== '/login') {
      window.history.replaceState(null, '', '/login');
      return;
    }
    if (isAuthenticated && window.location.pathname === '/login') {
      const path = TAB_PATHS[currentTab] ?? '/comments';
      window.history.replaceState(null, '', path);
    }
  }, [authLoading, isAuthenticated, currentTab]);

  const navigateToTab = (tab: string) => {
    setCurrentTab(tab);
    const path = TAB_PATHS[tab] ?? '/comments';
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
  };

  const logActivity = (log: ActivityLog) => {
    if (isDemoMode) addActivityLogLocal(log);
  };

  const handleUpdateStatus = async (commentId: string, status: CommentStatus) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    await updateStatus(commentId, status, comment.status);
    if (isDemoMode && user) {
      logActivity({
        id: `log-${Date.now()}`,
        commentId,
        userId: user.id,
        userName: user.name,
        action: 'Status Change',
        oldValue: comment.status,
        newValue: status,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleReplyToComment = async (commentId: string, message: string, opts?: { targetCommentId?: string; mention?: string; includeMention?: boolean }) => {
    const updated = await apiClient.replyToComment(commentId, message, opts);
    saveComments(comments.map(c => (c.id === updated.id ? updated : c)));
  };

  const handleModerateComment = async (commentId: string, hidden: boolean) => {
    const updated = await apiClient.moderateComment(commentId, hidden);
    saveComments(comments.map(c => (c.id === updated.id ? updated : c)));
  };

  const handleUpdatePriority = async (commentId: string, priority: CommentPriority) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    await updatePriority(commentId, priority, comment.priority);
  };

  const handleAddNote = async (commentId: string, noteText: string) => {
    await addNote(commentId, noteText);
  };

  const handleAddCommentTag = async (commentId: string, tag: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment || comment.tags.includes(tag)) return;
    await updateTags(commentId, [...comment.tags, tag]);
  };

  const handleRemoveCommentTag = async (commentId: string, tag: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    await updateTags(commentId, comment.tags.filter(t => t !== tag));
  };

  const handleRefreshComments = async () => {
    setIsRefreshing(true);
    try {
      if (!isDemoMode) {
        await fetchCommentsNow(dataMode);
      }
      await reload();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewComment = (commentId: string, views?: CommentView[], updatedComment?: Comment) => {
    const now = new Date().toISOString();
    saveComments(comments.map(c => (
      c.id === commentId
        ? updatedComment ?? {
            ...c,
            status: c.status === 'Unseen' ? 'Seen' : c.status,
            seenAt: c.seenAt ?? now,
            updatedAt: now,
            views: views ?? c.views,
          }
        : c
    )));
  };

  const handleAddRule = (keyword: string, tag: string, priority: string) => {
    saveRules([
      ...autoTaggingRules,
      { id: `rule-${Date.now()}`, keyword, tag, priority: priority as CommentPriority, isActive: true },
    ]);
  };

  const handleNavigateWithFilters = (filters: InboxFilters) => {
    setPreconfiguredFilters(filters);
    navigateToTab('inbox');
  };

  const totalUnseenCount = comments.filter(c => c.status === 'Unseen').length;
  const facebookCount = comments.filter(c => c.platform === 'facebook').length;
  const instagramCount = comments.filter(c => c.platform === 'instagram').length;
  const brandCounts = comments.reduce(
    (acc, comment) => {
      const brand = inferBrandLabel(comment, getAdForComment(comment, ads));
      if (brand === 'Flo') acc.flo += 1;
      if (brand === 'Nobl') acc.nobl += 1;
      return acc;
    },
    { flo: 0, nobl: 0 }
  );

  const pageTitles: Record<string, string> = {
    inbox: 'Comments',
    dashboard: 'Home',
    facebook: 'Facebook Feed',
    instagram: 'Instagram Feed',
    accounts: 'Connected Assets',
    campaigns: 'Ads & Campaigns',
    team: 'Users',
    reports: 'Insights',
    settings: 'Settings',
    profile: 'Profile',
  };

  useEffect(() => {
    document.title = `MetaDash | ${pageTitles[currentTab] || 'Comments'}`;
  }, [currentTab]);

  const inboxFilters = useMemo(() => {
    if (currentTab === 'facebook') return { platform: 'facebook' } satisfies InboxFilters;
    if (currentTab === 'instagram') return { platform: 'instagram' } satisfies InboxFilters;
    return preconfiguredFilters;
  }, [currentTab, preconfiguredFilters]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading inbox…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 text-center space-y-4">
          <p className="text-red-700 font-medium">Could not load dashboard data</p>
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            onClick={() => void reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen font-sans" style={{ background: 'var(--color-ground)', color: 'var(--color-ink)' }} id="app-root">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={tab => {
          setPreconfiguredFilters(null);
          navigateToTab(tab);
        }}
        unseenCount={totalUnseenCount}
        brandCounts={brandCounts}
        onBrandSelect={brand => setBrandModal(brand)}
        onSelectPage={(pageId, _brand) => {
          setBrandModal(null);
          setPreconfiguredFilters({ pageId, status: 'Unseen' });
          navigateToTab('inbox');
        }}
        dataMode={dataMode}
      />

      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0" id="main-content-area">
        <header
          className="min-h-12 backdrop-blur-xl px-3 md:px-5 sticky top-0 z-40 flex flex-col gap-2 py-2 lg:flex-row lg:items-center lg:justify-between"
          style={{ background: 'rgba(246, 245, 240, 0.85)', borderBottom: '1px solid var(--color-line-soft)' }}
        >
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] font-semibold tracking-tight" style={{ color: 'var(--color-ink)' }}>
                {pageTitles[currentTab] || currentTab}
              </h2>
              <ConnectionStatus dataMode={dataMode} isDemoMode={isDemoMode} />
            </div>
            {selectedAsset && currentTab === 'inbox' && (
              <div
                className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg px-2.5 py-1 text-[11px]"
                style={{ background: 'var(--color-panel)', color: 'var(--color-ink-2)', border: '1px solid var(--color-line)' }}
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--color-accent)' }} />
                <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>{selectedAsset.brand}</span>
                <span style={{ color: 'var(--color-muted-2)' }}>/</span>
                <span className="font-medium truncate max-w-[260px]">{selectedAsset.pageName}</span>
                {selectedAsset.igUsername && <span style={{ color: 'var(--color-muted)' }}>· {selectedAsset.igUsername}</span>}
                {selectedAsset.counts && (
                  <span className="tabular" style={{ color: 'var(--color-muted)' }}>
                    · {selectedAsset.counts.facebook} FB / {selectedAsset.counts.instagram} IG
                  </span>
                )}
                <button
                  onClick={() => { setSelectedAsset(null); setPreconfiguredFilters(null); }}
                  className="ml-1 px-1.5 py-0.5 text-[11px] rounded-md hover:bg-black/5"
                  style={{ border: '1px solid var(--color-line)' }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold tabular" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', color: 'var(--color-ink-2)' }}>
                <Facebook className="w-3.5 h-3.5" style={{ color: 'var(--color-brand-fb)' }} /> {facebookCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold tabular" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', color: 'var(--color-ink-2)' }}>
                <Instagram className="w-3.5 h-3.5" style={{ color: 'var(--color-brand-ig)' }} /> {instagramCount.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold tabular" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', color: 'var(--color-ink-2)' }}>
                <Megaphone className="w-3.5 h-3.5" style={{ color: 'var(--color-muted)' }} /> {ads.length.toLocaleString()}
              </span>
            </div>
            <button
              onClick={() => { setPreconfiguredFilters({ status: 'Unseen' }); navigateToTab('inbox'); }}
              className="hidden md:inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
              style={
                totalUnseenCount > 0
                  ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: '1px solid rgba(15,91,77,0.15)' }
                  : { background: 'var(--color-panel)', color: 'var(--color-muted)', border: '1px solid var(--color-line)' }
              }
            >
              <Bell className="w-4 h-4" />
              Notifications
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular"
                style={
                  totalUnseenCount > 0
                    ? { background: 'var(--color-accent)', color: '#FFFFFF' }
                    : { background: 'rgba(15,18,24,0.06)', color: 'var(--color-muted)' }
                }
              >
                {totalUnseenCount}
              </span>
            </button>
            {!isDemoMode && hasPermission('sync.run') && currentTab !== 'settings' && currentTab !== 'profile' && (
              <button
                onClick={() => void handleRefreshComments()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-60 transition-colors"
                style={{ background: 'var(--color-accent)', color: '#FFFFFF', border: '1px solid var(--color-accent)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-accent-ink)'; }}
                onMouseLeave={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--color-accent)'; }}
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
            )}
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto p-3 md:p-4 w-full space-y-4"
        >
          {currentTab === 'dashboard' && hasPermission('inbox.view') && (
            <DashboardOverview
              comments={comments}
              ads={ads}
              onNavigateToInbox={handleNavigateWithFilters}
              onSelectComment={comment => { setSelectedComment(comment); handleNavigateWithFilters({}); }}
            />
          )}

          {(currentTab === 'inbox' || currentTab === 'facebook' || currentTab === 'instagram') && hasPermission('inbox.view') && (
            <UnifiedInbox
              comments={comments}
              ads={ads}
              onSelectComment={setSelectedComment}
              selectedCommentId={selectedComment?.id}
              onUpdateStatus={handleUpdateStatus}
              onReplyToComment={handleReplyToComment}
              onModerateComment={handleModerateComment}
              onUpdatePriority={handleUpdatePriority}
              onAddNote={handleAddNote}
              onAddCommentTag={handleAddCommentTag}
              onRemoveCommentTag={handleRemoveCommentTag}
              notes={notes}
              activityLogs={activityLogs}
              onViewComment={handleViewComment}
              onRefresh={!isDemoMode && hasPermission('sync.run') ? handleRefreshComments : undefined}
              isRefreshing={isRefreshing}
              preconfiguredFilters={inboxFilters}
            />
          )}

          {currentTab === 'accounts' && hasPermission('campaigns.view') && (
            <ConnectedAccountsView comments={comments} ads={ads} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {currentTab === 'campaigns' && hasPermission('campaigns.view') && (
            <CampaignsView
              campaigns={campaigns}
              comments={comments}
              ads={ads}
              isDemoMode={isDemoMode}
              onNavigateToInbox={handleNavigateWithFilters}
              onNavigateToSettings={() => navigateToTab('settings')}
            />
          )}

          {currentTab === 'team' && hasPermission('team.view') && (
            <TeamView teamMembers={team} />
          )}

          {currentTab === 'reports' && hasPermission('reports.view') && (
            <ReportsView comments={comments} teamMembers={team} campaigns={campaigns} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {currentTab === 'settings' && hasPermission('settings.view') && (
            <SettingsView
              autoTaggingRules={autoTaggingRules}
              teamMembers={team}
              dataMode={dataMode}
              isDemoMode={isDemoMode}
              onReload={reload}
              onAddRule={handleAddRule}
              onDeleteRule={removeRule}
            />
          )}

          {currentTab === 'profile' && <ProfileView />}
        </main>
      </div>

      {brandModal && (
        <BrandAssetsModal
          brand={brandModal}
          onClose={() => setBrandModal(null)}
          onSelect={(asset, brandSel) => {
            setBrandModal(null);
            setSelectedAsset({ brand: brandSel || 'Flo', pageId: asset.pageId, pageName: asset.pageName, igUsername: asset.instagram?.username, counts: asset.comments });
            setPreconfiguredFilters({ pageId: asset.pageId, igAccountId: asset.instagram?.id, brand: brandSel || 'Flo', status: 'All' });
            navigateToTab('inbox');
          }}
        />
      )}
    </div>
  );
}
