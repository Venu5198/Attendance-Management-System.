import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { User, Mail, Shield, KeyRound, Clock, CheckCircle2 } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Profile</h1>
        <p className="text-sm text-slate-500">Your account identity, assigned role, and permissions</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{user?.username}</h2>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                user?.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                <Shield className="w-3 h-3" />
                {user?.role}
              </span>
              <StatusBadge status="ACTIVE" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5" /> Employee ID
            </span>
            <p className="font-mono font-semibold text-slate-800">{user?.employee_id || 'Not Assigned'}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Email
            </span>
            <p className="font-semibold text-slate-800">{user?.email}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> System User ID
            </span>
            <p className="font-mono text-xs text-slate-600">{user?.user_id || user?.id || '—'}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Attendance Policy Enforced
            </span>
            <p className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> 3 days / 15 hrs per week
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
