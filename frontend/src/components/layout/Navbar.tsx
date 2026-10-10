import React from "react";
import { useAuth } from "../../auth/AuthContext";
import { LogOut, UserCircle } from "lucide-react";
import { AssistantCommandBar } from "../Assistant/AssistantCommandBar";

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold tracking-wide text-slate-700">
          Attendance Management System
        </span>
      </div>

      {/* Natural Language Assistant Command Bar (active when position === 'NAVBAR') */}
      <AssistantCommandBar variant="navbar" />

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-right">
          <div>
            <p className="text-sm font-semibold text-slate-800">{user?.username}</p>
            <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-semibold tracking-wider text-emerald-800 uppercase">
              {user?.role}
            </span>
          </div>
          <UserCircle className="h-8 w-8 text-slate-400" />
        </div>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};
