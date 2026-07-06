import React, { useState, useEffect } from 'react';
import { TeamMember, Comment, AppUser, Permission } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/apiClient';
import {
  Users,
  PlusCircle,
  X,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  Loader2,
  UserPlus,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';

const PERMISSION_LABELS: Record<Permission, string> = {
  'inbox.view': 'View inbox',
  'inbox.manage': 'Manage inbox',
  'comments.reply': 'Reply to comments',
  'comments.assign': 'Assign comments',
  'comments.notes': 'Add notes',
  'comments.tags': 'Manage tags',
  'campaigns.view': 'View campaigns',
  'reports.view': 'View reports',
  'team.view': 'View team',
  'team.manage': 'Manage team',
  'settings.view': 'View settings',
  'settings.manage': 'Manage settings',
  'sync.run': 'Run Meta sync',
};

const DEFAULT_MEMBER_PERMISSIONS: Permission[] = [
  'inbox.view', 'comments.reply', 'comments.notes', 'campaigns.view', 'reports.view', 'team.view',
];

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

interface TeamViewProps {
  teamMembers: TeamMember[];
  comments: Comment[];
  onNavigateToInbox: (filters?: { assignedTo?: string }) => void;
}

export default function TeamView({ teamMembers, comments, onNavigateToInbox }: TeamViewProps) {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin && hasPermission('team.manage');

  const [showAddForm, setShowAddForm] = useState(false);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [slackUserId, setSlackUserId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_MEMBER_PERMISSIONS);

  useEffect(() => {
    if (isAdmin) {
      setLoadingUsers(true);
      apiClient.getUsers()
        .then(setAppUsers)
        .catch(() => {})
        .finally(() => setLoadingUsers(false));
    }
  }, [isAdmin]);

  const togglePermission = (perm: Permission) => {
    setPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !name) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const created = await apiClient.createUser({
        username: username.trim(),
        password,
        name: name.trim(),
        email,
        title,
        slackUserId: slackUserId.trim() || undefined,
        permissions,
      });
      setAppUsers(prev => [...prev, created]);
      if (slackUserId.trim()) {
        setNotice(created.inviteSent ? `Slack invite sent to ${slackUserId.trim()}.` : `Account created, but Slack invite failed: ${created.inviteError || 'unknown error'}.`);
      } else {
        setNotice('Account created. Share the username and temporary password securely.');
      }
      setSlackUserId('');
      setUsername('');
      setPassword('');
      setName('');
      setEmail('');
      setTitle('');
      setPermissions(DEFAULT_MEMBER_PERMISSIONS);
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateCredentials = () => {
    const normalizedSlack = slackUserId.trim().toLowerCase();
    if (normalizedSlack && !username) setUsername(normalizedSlack);
    setPassword(generateTemporaryPassword());
  };

  const handleEditUser = async (memberId: string) => {
    if (!canManage) return;
    const existing = appUsers.find(u => u.id === memberId);
    if (!existing) return;
    const nextName = window.prompt('Full name', existing.name)?.trim();
    if (!nextName) return;
    const nextEmail = window.prompt('Email', existing.email)?.trim() ?? existing.email;
    const nextTitle = window.prompt('Job title', existing.title)?.trim() ?? existing.title;
    setError('');
    setNotice('');
    try {
      const updated = await apiClient.updateUser(memberId, {
        name: nextName,
        email: nextEmail,
        title: nextTitle,
      });
      setAppUsers(prev => prev.map(u => u.id === memberId ? updated : u));
      setNotice('User updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleToggleUser = async (memberId: string, isActive: boolean) => {
    if (!canManage || memberId === user?.id) return;
    setError('');
    setNotice('');
    try {
      const updated = await apiClient.updateUser(memberId, { isActive: !isActive });
      setAppUsers(prev => prev.map(u => u.id === memberId ? updated : u));
      setNotice(updated.isActive ? 'User enabled.' : 'User disabled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (memberId: string, memberName: string) => {
    if (!canManage || memberId === user?.id) return;
    if (!window.confirm(`Delete ${memberName}? This removes their sign-in account and team profile.`)) return;
    setError('');
    setNotice('');
    try {
      await apiClient.deleteUser(memberId);
      setAppUsers(prev => prev.filter(u => u.id !== memberId));
      setNotice('User deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const displayMembers = isAdmin && appUsers.length > 0
    ? appUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.title || u.role,
        avatarUrl: u.avatarUrl,
        username: u.username,
        isAdmin: u.role === 'admin',
        isActive: u.isActive,
      }))
    : teamMembers.map(m => ({ ...m, username: '', isAdmin: false, isActive: true }));

  const listData = displayMembers.map(member => {
    const assignedComments = comments.filter(c => c.assignedTo === member.id);
    return {
      ...member,
      assignedCount: assignedComments.length,
      completedCount: assignedComments.filter(c => c.status === 'Replied').length,
      urgentCount: assignedComments.filter(c => c.priority === 'Urgent' && c.status !== 'Replied').length,
    };
  });

  return (
    <div className="space-y-4 animate-fade-in" id="team-screen">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Users</p>
          <h2 className="font-editorial mt-1" style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.015em' }}>
            Who's on the desk.
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {canManage ? 'Create teammates, adjust permissions, and set retention policies.' : 'Everyone who\'s helping triage today, and how their workload is stacked.'}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> Add member
          </button>
        )}
      </div>

      {showAddForm && canManage && (
        <form onSubmit={handleSubmit} className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-600" /> New team member
            </h3>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Slack user ID</label>
              <input type="text" placeholder="U0APP3SEB46" value={slackUserId} onChange={e => setSlackUserId(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
              <p className="text-[11px] text-slate-400 mt-1">Optional. Sends credentials by Slack DM.</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Username *</label>
              <input type="text" required placeholder="jane.smith" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Password *</label>
              <div className="flex gap-2">
                <input type="text" required placeholder="temporary password" value={password} onChange={e => setPassword(e.target.value)}
                  className="min-w-0 flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
                <button type="button" onClick={handleGenerateCredentials} className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50">
                  Generate
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Full name *</label>
              <input type="text" required placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Email</label>
              <input type="email" placeholder="jane@company.com" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Job title</label>
              <input type="text" placeholder="Community manager" value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-300 focus:border-slate-400" />
            </div>
          </div>

          <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Permissions</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {(Object.keys(PERMISSION_LABELS) as Permission[]).map(perm => (
                  <label key={perm} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-xs ${
                    permissions.includes(perm) ? 'border-slate-400 bg-slate-100 text-slate-900' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                    <input type="checkbox" checked={permissions.includes(perm)} onChange={() => togglePermission(perm)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    {PERMISSION_LABELS[perm]}
                  </label>
                ))}
              </div>
            </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-xl">Cancel</button>
            <button type="submit" disabled={submitting}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create account
            </button>
          </div>
        </form>
      )}

      {notice && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">{notice}</div>}

      {loadingUsers && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading team…
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
        {listData.map(member => (
          <div key={member.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm hover:border-slate-300 transition-all flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              {member.avatarUrl ? (
                <img src={member.avatarUrl} alt={member.name} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                  {member.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-slate-900 truncate">{member.name}</h3>
                  {member.isAdmin && <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 truncate">{member.role}</p>
                {'username' in member && member.username && (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Key className="w-2.5 h-2.5" /> @{member.username}
                  </p>
                )}
                {'isActive' in member && !member.isActive && (
                  <p className="text-[10px] text-red-500 font-semibold mt-0.5">Disabled</p>
                )}
              </div>
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Assigned</span>
                <span className="font-semibold text-slate-900">{member.assignedCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Replied
                </span>
                <span className="font-semibold text-slate-900">{member.completedCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Urgent
                </span>
                <span className={`font-semibold ${member.urgentCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {member.urgentCount}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigateToInbox({ assignedTo: member.id })}
              className="mt-4 pt-4 border-t border-slate-100 text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              View comments <ArrowRight className="w-4 h-4" />
            </button>
            {canManage && 'username' in member && member.username && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleEditUser(member.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                {member.id !== user?.id && (
                  <button
                    type="button"
                    onClick={() => void handleToggleUser(member.id, member.isActive)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Power className="w-3 h-3" /> {member.isActive ? 'Disable' : 'Enable'}
                  </button>
                )}
                {member.id !== user?.id && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(member.id, member.name)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {listData.length === 0 && !loadingUsers && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-medium text-slate-700">No team members yet</p>
          <p className="text-sm text-slate-500 mt-1">Add your first team member to start assigning comments.</p>
        </div>
      )}
    </div>
  );
}
