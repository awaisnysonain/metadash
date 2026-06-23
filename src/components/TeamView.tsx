import React from 'react';
import { TeamMember, Comment } from '../types';
import { 
  Users, 
  Mail, 
  UserCheck, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  User, 
  Bot,
  PlusCircle,
  X
} from 'lucide-react';

interface TeamViewProps {
  teamMembers: TeamMember[];
  comments: Comment[];
  onNavigateToInbox: (filters?: any) => void;
  onAddTeamMember: (name: string, email: string, role: string) => void;
}

export default function TeamView({ teamMembers, comments, onNavigateToInbox, onAddTeamMember }: TeamViewProps) {
  
  // State for adding team members
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

  // Compute stats for each team member
  const listData = teamMembers.map(member => {
    const assignedComments = comments.filter(c => c.assignedTo === member.id);
    const completedCount = assignedComments.filter(c => c.status === 'Replied').length;
    const urgentCount = assignedComments.filter(c => c.priority === 'Urgent' && c.status !== 'Replied').length;
    
    return {
      ...member,
      assignedCount: assignedComments.length,
      completedCount,
      urgentCount
    };
  });

  return (
    <div className="space-y-4 animate-fadeIn text-xs" id="team-screen">
      {/* Title */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <Users className="w-4 h-4 text-blue-600" /> Team Performance & Assignments
          </h2>
          <p className="text-[11px] text-slate-500">
            Audit team workload capacities, monitor ticket assignment volumes, and coordinate customer care tasks.
          </p>
        </div>
        
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold cursor-pointer flex items-center gap-1 transition-all shadow-sm select-none"
        >
          <PlusCircle className="w-3.5 h-3.5" /> Add Team Member
        </button>
      </div>

      {/* Add team member modal/form banner */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="p-4 bg-slate-50 border border-slate-205 rounded-lg animate-slideOver space-y-3">
          <div className="flex justify-between items-center border-b border-slate-150 pb-1.5">
            <h3 className="font-bold text-[9px] uppercase font-mono text-slate-600">Register New Team Member</h3>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Full Name</label>
              <input
                type="text"
                required
                placeholder="Marcus Aurelius"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-white text-slate-800 placeholder-slate-400 font-sans"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Job Role</label>
              <input
                type="text"
                required
                placeholder="Marketing coordinator"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-white text-slate-800 placeholder-slate-400 font-sans"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">Corporate Email Address</label>
              <input
                type="email"
                required
                placeholder="marcus@growth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-white text-slate-800 placeholder-slate-400 font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5 text-[11px] font-semibold mt-1">
            <button 
              type="button" 
              onClick={() => setShowAddForm(false)}
              className="px-2.5 py-1 border border-slate-200 text-slate-500 rounded hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-3.5 py-1 bg-slate-900 border border-slate-800 text-white rounded hover:bg-slate-950 cursor-pointer"
            >
              Save Register
            </button>
          </div>
        </form>
      )}

      {/* Grid listing workloads */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {listData.map(member => (
          <div 
            key={member.id}
            className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-150 relative overflow-hidden flex flex-col justify-between"
          >
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-slate-50/10 rounded-full blur-xl translate-x-1/2 -translate-y-1/2"></div>
            
            <div>
              {/* Profile card */}
              <div className="flex items-center space-x-2.5 mb-3.5">
                <img 
                  src={member.avatarUrl} 
                  alt={member.name} 
                  className="w-10 h-10 rounded-full object-cover border border-slate-200"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-950 text-xs truncate">{member.name}</h3>
                  <span className="text-[9px] font-mono text-blue-650 block truncate font-bold">{member.role}</span>
                </div>
              </div>

              {/* Workload specs */}
              <div className="space-y-1.5 mt-3.5 text-[11px] text-slate-500">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <div className="flex items-center space-x-1">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Assigned Tickets:</span>
                  </div>
                  <strong className="text-slate-800">{member.assignedCount} comments</strong>
                </div>

                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <div className="flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Replied Resolved:</span>
                  </div>
                  <strong className="text-slate-800">{member.completedCount} replies</strong>
                </div>

                <div className="flex items-center justify-between pb-0.5">
                  <div className="flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Active Urgent Backlog:</span>
                  </div>
                  <strong className={`${member.urgentCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>
                    {member.urgentCount} items
                  </strong>
                </div>
              </div>
            </div>

            {/* Inspect workload button */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-mono italic truncate max-w-[120px]">{member.email}</span>
              <button
                onClick={() => onNavigateToInbox({ assignedTo: member.id })}
                className="text-blue-650 font-bold hover:underline cursor-pointer"
              >
                Inspect Workload ➔
              </button>
            </div>

          </div>
        ))}
      </div>
      
      {/* Simulation tips box */}
      <div className="p-3 bg-blue-50/40 border border-blue-105 rounded text-blue-950 text-xs flex items-start gap-2">
        <Bot className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold block mb-0.5">Mock Team Management Notes</strong>
          <span className="text-[11px] text-slate-650">
            You can reassign comments to any of these representatives inside target cards or within the comment detail overlays. Workload metrics update dynamically.
          </span>
        </div>
      </div>
    </div>
  );
}
