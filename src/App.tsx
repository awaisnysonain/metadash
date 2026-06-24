import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import UnifiedInbox from './components/UnifiedInbox';
import CommentDetailDrawer from './components/CommentDetailDrawer';
import CampaignsView from './components/CampaignsView';
import TeamView from './components/TeamView';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import ConnectionStatus from './components/ConnectionStatus';

import { Comment, CommentStatus, CommentPriority, ActivityLog } from './types';
import { Loader2, RefreshCw } from 'lucide-react';
import type { InboxFilters } from './components/UnifiedInbox';
import { useAppData } from './hooks/useAppData';
import { fetchCommentsNow } from './services/dataService';

export default function App() {
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
    saveComment,
    updateStatus,
    updateAssign,
    updatePriority,
    updateTags,
    addNote,
    addActivityLogLocal,
    saveRules,
    removeRule,
    addTeamMember,
    reload,
  } = useAppData();

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
    if (isDemoMode) {
      logActivity({
        id: `log-${Date.now()}`,
        commentId,
        userId: 'team-1',
        userName: 'Team',
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

  const handleAddTeamMember = (name: string, email: string, role: string) => {
    addTeamMember({
      id: `team-${Date.now()}`,
      name,
      email,
      role,
      avatarUrl: '',
    });
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
    <div className="flex bg-slate-50 min-h-screen text-slate-800 font-sans" id="app-root">
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
        <header className="h-14 bg-white border-b border-slate-200 px-6 sticky top-0 z-40 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 capitalize">
              {currentTab === 'inbox' ? 'Comment Inbox' : currentTab.replace(/([A-Z])/g, ' $1').trim()}
            </h2>
            <ConnectionStatus dataMode={dataMode} isDemoMode={isDemoMode} />
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-xs text-slate-500">
              Unseen: <strong className="text-slate-800">{totalUnseenCount}</strong>
            </span>
            {!isDemoMode && (
              <button
                onClick={() => void handleRefreshComments()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
              >
                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
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
          {currentTab === 'dashboard' && (
            <DashboardOverview comments={comments} campaigns={campaigns} teamMembers={team} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {(currentTab === 'inbox' || currentTab === 'facebook' || currentTab === 'instagram') && (
            <UnifiedInbox
              comments={comments}
              teamMembers={team}
              ads={ads}
              onSelectComment={setSelectedComment}
              selectedCommentId={selectedComment?.id}
              onUpdateStatus={handleUpdateStatus}
              onRefresh={!isDemoMode ? handleRefreshComments : undefined}
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

          {currentTab === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              comments={comments}
              ads={ads}
              isDemoMode={isDemoMode}
              onNavigateToInbox={handleNavigateWithFilters}
              onNavigateToSettings={() => setCurrentTab('settings')}
            />
          )}

          {currentTab === 'team' && (
            <TeamView teamMembers={team} comments={comments} onNavigateToInbox={handleNavigateWithFilters} onAddTeamMember={handleAddTeamMember} />
          )}

          {currentTab === 'reports' && (
            <ReportsView comments={comments} teamMembers={team} campaigns={campaigns} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {currentTab === 'settings' && (
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
