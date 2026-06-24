import React from 'react';
import { TeamMember, Comment } from '../types';
import { Users, PlusCircle, X, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface TeamViewProps {
  teamMembers: TeamMember[];
  comments: Comment[];
  onNavigateToInbox: (filters?: { assignedTo?: string }) => void;
  onAddTeamMember: (name: string, email: string, role: string) => void;
}

export default function TeamView({ teamMembers, comments, onNavigateToInbox, onAddTeamMember }: TeamViewProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !role) return;
    onAddTeamMember(name, email, role);
    setName('');
    setEmail('');
    setRole('');
    setShowAddForm(false);
  };

  const listData = teamMembers.map(member => {
    const assignedComments = comments.filter(c => c.assignedTo === member.id);
    return {
      ...member,
      assignedCount: assignedComments.length,
      completedCount: assignedComments.filter(c => c.status === 'Replied').length,
      urgentCount: assignedComments.filter(
        c => c.priority === 'Urgent' && c.status !== 'Replied'
      ).length,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in" id="team-screen">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your team</h2>
          <p className="text-sm text-slate-500 mt-1">
            See who&apos;s handling comments and how much work they have.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors shrink-0"
        >
          <PlusCircle className="w-4 h-4" /> Add member
        </button>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleSubmit}
          className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-slate-900">Add team member</h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-600 block mb-1.5">Name</label>
              <input
                type="text"
                required
                placeholder="Jane Smith"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1.5">Role</label>
              <input
                type="text"
                required
                placeholder="Community manager"
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1.5">Email</label>
              <input
                type="email"
                required
                placeholder="jane@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {listData.map(member => (
          <div
            key={member.id}
            className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-4">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.name}
                  className="w-11 h-11 rounded-full object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600">
                  {member.name.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-medium text-slate-900 truncate">{member.name}</h3>
                <p className="text-sm text-slate-500 truncate">{member.role}</p>
              </div>
            </div>

            <div className="space-y-2.5 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Assigned</span>
                <span className="font-medium text-slate-900">{member.assignedCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Replied
                </span>
                <span className="font-medium text-slate-900">{member.completedCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Urgent
                </span>
                <span
                  className={`font-medium ${member.urgentCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}
                >
                  {member.urgentCount}
                </span>
              </div>
            </div>

            <button
              onClick={() => onNavigateToInbox({ assignedTo: member.id })}
              className="mt-4 pt-4 border-t border-slate-100 text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              View their comments <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {listData.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-medium text-slate-700">No team members yet</p>
          <p className="text-sm text-slate-500 mt-1">Add your first team member to start assigning comments.</p>
        </div>
      )}
    </div>
  );
}
