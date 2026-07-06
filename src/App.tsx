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
    updateAssign,
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

  const handleAssignTeam = async (commentId: string, teamUserId?: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const oldName = comment.assignedTo ? team.find(t => t.id === comment.assignedTo)?.name || 'Someone' : 'Unassigned';
    const newName = teamUserId ? team.find(t => t.id === teamUserId)?.name || 'Someone' : 'Unassigned';
    await updateAssign(commentId, teamUserId, { oldAssignee: oldName, assigneeName: newName });
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading inbox…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/60 rounded-2xl p-6 text-center space-y-4">
          <p className="text-red-700 dark:text-red-400 font-medium">Could not load dashboard data</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{loadError}</p>
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
    <div className="flex min-h-screen bg-[#f4f6fa] dark:bg-[#0b1220] text-slate-800 dark:text-slate-200 font-sans" id="app-root">
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
        <header className="min-h-16 bg-white/85 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 sticky top-0 z-40 flex flex-col gap-3 py-[13px] lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-100 tracking-tight">
              {pageTitles[currentTab] || currentTab}
            </h2>
            <ConnectionStatus dataMode={dataMode} isDemoMode={isDemoMode} />
            </div>
            {selectedAsset && currentTab === 'inbox' && (
              <div className="inline-flex w-fit max-w-full items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-[12px] text-slate-700 dark:text-slate-300">
                <span className="inline-block w-2 h-2 rounded-full bg-slate-700 dark:bg-slate-300" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedAsset.brand}</span>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span className="font-medium truncate max-w-[260px]">{selectedAsset.pageName}</span>
                {selectedAsset.igUsername && <span className="text-slate-400 dark:text-slate-500">· {selectedAsset.igUsername}</span>}
                {selectedAsset.counts && (
                  <span className="text-slate-500 dark:text-slate-400">
                    · {selectedAsset.counts.facebook} FB / {selectedAsset.counts.instagram} IG
                  </span>
                )}
                <button onClick={() => { setSelectedAsset(null); setPreconfiguredFilters(null); }} className="ml-1 px-1.5 py-0.5 text-[11px] rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">Clear</button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300">
                <Facebook className="w-3.5 h-3.5" /> {facebookCount} FB
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300">
                <Instagram className="w-3.5 h-3.5" /> {instagramCount} IG
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 font-medium text-slate-700 dark:text-slate-300">
                <Megaphone className="w-3.5 h-3.5" /> {ads.length} ads
              </span>
            </div>
            <button
              onClick={() => { setPreconfiguredFilters({ status: 'Unseen' }); navigateToTab('inbox'); }}
              className={`hidden md:inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${totalUnseenCount > 0 ? 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <Bell className="w-4 h-4" />
              Notifications
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${totalUnseenCount > 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{totalUnseenCount}</span>
            </button>
            {!isDemoMode && hasPermission('sync.run') && currentTab !== 'settings' && currentTab !== 'profile' && (
              <button
                onClick={() => void handleRefreshComments()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-medium hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 transition-colors"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
            )}
          </div>
        </header>

        <main
          className="flex-1 overflow-y-auto p-4 md:p-6 w-full space-y-5"
        >
          {currentTab === 'dashboard' && hasPermission('inbox.view') && (
            <DashboardOverview comments={comments} campaigns={campaigns} teamMembers={team} currentUserId={user?.id} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {(currentTab === 'inbox' || currentTab === 'facebook' || currentTab === 'instagram') && hasPermission('inbox.view') && (
            <UnifiedInbox
              comments={comments}
              teamMembers={team}
              ads={ads}
              onSelectComment={setSelectedComment}
              selectedCommentId={selectedComment?.id}
              onUpdateStatus={handleUpdateStatus}
              onReplyToComment={handleReplyToComment}
              onModerateComment={handleModerateComment}
              onUpdatePriority={handleUpdatePriority}
              onAssignTeam={handleAssignTeam}
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
            <TeamView teamMembers={team} comments={comments} onNavigateToInbox={handleNavigateWithFilters} />
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
