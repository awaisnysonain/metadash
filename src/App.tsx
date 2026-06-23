import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DashboardOverview from './components/DashboardOverview';
import UnifiedInbox from './components/UnifiedInbox';
import CommentDetailDrawer from './components/CommentDetailDrawer';
import CampaignsView from './components/CampaignsView';
import TeamView from './components/TeamView';
import WebhookSimulator from './components/WebhookSimulator';
import SettingsView from './components/SettingsView';
import ReportsView from './components/ReportsView';
import ConnectionStatus from './components/ConnectionStatus';

import { Comment, CommentStatus, CommentPriority, ActivityLog } from './types';
import { Bot, Loader2 } from 'lucide-react';
import type { InboxFilters } from './components/UnifiedInbox';
import { useAppData } from './hooks/useAppData';

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
    saveComments,
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

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedComment, setSelectedComment] = useState<Comment | undefined>(undefined);
  const [preconfiguredFilters, setPreconfiguredFilters] = useState<InboxFilters | null>(null);

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
        userName: 'Sarah Jenkins',
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
    if (isDemoMode) {
      logActivity({
        id: `log-${Date.now()}`,
        commentId,
        userId: 'team-1',
        userName: 'Sarah Jenkins',
        action: 'Priority Change',
        oldValue: comment.priority,
        newValue: priority,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleAssignTeam = async (commentId: string, teamUserId?: string) => {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const oldName = comment.assignedTo ? team.find(t => t.id === comment.assignedTo)?.name || 'Someone' : 'Unassigned';
    const newName = teamUserId ? team.find(t => t.id === teamUserId)?.name || 'Someone' : 'Unassigned';
    await updateAssign(commentId, teamUserId, { oldAssignee: oldName, assigneeName: newName });
    if (isDemoMode) {
      logActivity({
        id: `log-${Date.now()}`,
        commentId,
        userId: 'team-1',
        userName: 'Sarah Jenkins',
        action: 'Assignment',
        oldValue: oldName,
        newValue: newName,
        createdAt: new Date().toISOString(),
      });
    }
  };

  const handleAddNote = async (commentId: string, noteText: string) => {
    await addNote(commentId, noteText);
    if (isDemoMode) {
      logActivity({
        id: `log-${Date.now()}`,
        commentId,
        userId: 'team-1',
        userName: 'Sarah Jenkins',
        action: 'Context Note Addition',
        oldValue: '',
        newValue: 'Note logged',
        createdAt: new Date().toISOString(),
      });
    }
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

  const handleAddSimulatedComment = (newComment: Comment) => {
    if (isDemoMode) {
      saveComments([newComment, ...comments]);
      logActivity({
        id: `log-${Date.now()}`,
        commentId: newComment.id,
        userId: 'system',
        userName: 'Webhook',
        action: 'Webhook Received',
        oldValue: '',
        newValue: 'New comment received from webhook',
        createdAt: new Date().toISOString(),
      });
    } else {
      saveComment(newComment);
    }
  };

  const handleAddTeamMember = (name: string, email: string, role: string) => {
    addTeamMember({
      id: `team-${Date.now()}`,
      name,
      email,
      role,
      avatarUrl: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 999999)}?auto=format&fit=crop&q=80&w=120`,
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
  const urgentPriorityCount = comments.filter(c => c.priority === 'Urgent').length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-slate-500">Loading inbox data…</p>
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
        urgentCount={urgentPriorityCount}
        dataMode={dataMode}
      />

      <div className="flex-1 flex flex-col min-w-0" id="main-content-area">
        <header className="h-14 bg-white border-b border-slate-200 px-6 sticky top-0 z-40 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 capitalize">
              {currentTab === 'inbox' ? 'Unified Inbox' : currentTab.replace(/([A-Z])/g, ' $1').trim()}
            </h2>
            <ConnectionStatus dataMode={dataMode} isDemoMode={isDemoMode} />
          </div>

          <div className="flex items-center space-x-5">
            <div className="hidden md:flex items-center space-x-4 text-xs font-semibold text-slate-500">
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span>Unseen: <strong className="text-slate-800">{totalUnseenCount}</strong></span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span>Urgent: <strong className="text-red-700">{urgentPriorityCount}</strong></span>
              </div>
            </div>
            <div className="h-5 w-px bg-slate-200 hidden md:block" />
            <button
              onClick={() => setCurrentTab('simulator')}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-bold cursor-pointer transition-all shadow-sm hover:bg-blue-700"
            >
              <Bot className="w-3.5 h-3.5 shrink-0" />
              <span>Inject Simulated comment</span>
            </button>
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
              onAssignTeam={handleAssignTeam}
              onAddNote={handleAddNote}
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
            <CampaignsView campaigns={campaigns} comments={comments} ads={ads} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {currentTab === 'team' && (
            <TeamView teamMembers={team} comments={comments} onNavigateToInbox={handleNavigateWithFilters} onAddTeamMember={handleAddTeamMember} />
          )}

          {currentTab === 'reports' && (
            <ReportsView comments={comments} teamMembers={team} campaigns={campaigns} onNavigateToInbox={handleNavigateWithFilters} />
          )}

          {currentTab === 'simulator' && (
            <WebhookSimulator campaigns={campaigns} ads={ads} onAddSimulatedComment={handleAddSimulatedComment} />
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
