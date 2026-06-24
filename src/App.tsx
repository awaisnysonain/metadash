import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import UnifiedInbox from './components/UnifiedInbox';
import CommentDetailDrawer from './components/CommentDetailDrawer';
import CampaignsView from './components/CampaignsView';
import ConnectedAccountsView from './components/ConnectedAccountsView';
import TeamView from './components/TeamView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import ProfileView from './components/ProfileView';
import ConnectionStatus from './components/ConnectionStatus';

import { Comment, CommentStatus, CommentPriority, ActivityLog } from './types';
import { Loader2, RefreshCw, Bell } from 'lucide-react';
import type { InboxFilters } from './components/UnifiedInbox';
import { useAppData } from './hooks/useAppData';
import { fetchCommentsNow } from './services/dataService';

export default function App() {
  const { user, isLoading: authLoading, isAuthenticated, hasPermission } = useAuth();

  const {
    dataMode,
    isLoading,
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
    addNote,
    addActivityLogLocal,
    saveRules,
    removeRule,
    reload,
  } = useAppData(user);

  const [currentTab, setCurrentTab] = useState<string>('inbox');
  const [selectedComment, setSelectedComment] = useState<Comment | undefined>(undefined);
  const [preconfiguredFilters, setPreconfiguredFilters] = useState<InboxFilters | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (selectedComment) {
      const updated = comments.find(c => c.id === selectedComment.id);
      if (updated) setSelectedComment(updated);
    }
  }, [comments, selectedComment?.id]);

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

  const handleAddRule = (keyword: string, tag: string, priority: string) => {
    saveRules([
      ...autoTaggingRules,
      { id: `rule-${Date.now()}`, keyword, tag, priority: priority as CommentPriority, isActive: true },
    ]);
  };

  const handleNavigateWithFilters = (filters: InboxFilters) => {
    setPreconfiguredFilters(filters);
    setCurrentTab('inbox');
  };

  const totalUnseenCount = comments.filter(c => c.status === 'Unseen').length;

  const pageTitles: Record<string, string> = {
    inbox: 'Inbox',
    dashboard: 'Overview',
    facebook: 'Facebook Comments',
    instagram: 'Instagram Comments',
    accounts: 'Connected Accounts',
    campaigns: 'Campaigns',
    team: 'Team',
    reports: 'Reports',
    settings: 'Settings',
    profile: 'Profile',
  };

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

  return (
    <div className="flex bg-[#f4f6f9] min-h-screen text-slate-800 font-sans" id="app-root">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={tab => {
          setPreconfiguredFilters(null);
          setCurrentTab(tab);
        }}
        unseenCount={totalUnseenCount}
        dataMode={dataMode}
      />

      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <header className="h-14 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 sticky top-0 z-40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {pageTitles[currentTab] || currentTab}
            </h2>
            <ConnectionStatus dataMode={dataMode} isDemoMode={isDemoMode} />
          </div>

          <div className="flex items-center gap-3">
            {totalUnseenCount > 0 && (
              <button
                onClick={() => { setPreconfiguredFilters({ status: 'Unseen' }); setCurrentTab('inbox'); }}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors"
              >
                <Bell className="w-4 h-4" />
                {totalUnseenCount} new
              </button>
            )}
            {!isDemoMode && hasPermission('sync.run') && currentTab !== 'settings' && currentTab !== 'profile' && (
              <button
                onClick={() => void handleRefreshComments()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm shadow-blue-500/20"
              >
                {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </button>
            )}
          </div>
        </header>

        <main
          className={`flex-1 overflow-y-auto p-4 md:p-6 w-full mx-auto space-y-4 ${
            currentTab === 'inbox' || currentTab === 'facebook' || currentTab === 'instagram'
              ? 'max-w-[1600px]'
              : 'max-w-7xl'
          }`}
        >
          {currentTab === 'dashboard' && hasPermission('inbox.view') && (
            <DashboardOverview comments={comments} campaigns={campaigns} teamMembers={team} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {(currentTab === 'inbox' || currentTab === 'facebook' || currentTab === 'instagram') && hasPermission('inbox.view') && (
            <UnifiedInbox
              comments={comments}
              teamMembers={team}
              ads={ads}
              onSelectComment={setSelectedComment}
              selectedCommentId={selectedComment?.id}
              onUpdateStatus={handleUpdateStatus}
              onRefresh={!isDemoMode && hasPermission('sync.run') ? handleRefreshComments : undefined}
              isRefreshing={isRefreshing}
              preconfiguredFilters={
                currentTab === 'facebook'
                  ? { platform: 'facebook' }
                  : currentTab === 'instagram'
                    ? { platform: 'instagram' }
                    : preconfiguredFilters
              }
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
              onNavigateToSettings={() => setCurrentTab('settings')}
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

      {selectedComment && (
        <CommentDetailDrawer
          comment={selectedComment}
          ads={ads}
          onClose={() => setSelectedComment(undefined)}
          teamMembers={team}
          notes={notes}
          activityLogs={activityLogs}
          onAddNote={handleAddNote}
          onUpdateStatus={handleUpdateStatus}
          onUpdatePriority={handleUpdatePriority}
          onAssignTeam={handleAssignTeam}
          onAddCommentTag={handleAddCommentTag}
          onRemoveCommentTag={handleRemoveCommentTag}
        />
      )}
    </div>
  );
}
