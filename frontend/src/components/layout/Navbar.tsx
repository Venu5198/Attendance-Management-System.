import React, { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { LogOut, UserCircle, Menu, Calendar, Shield, ChevronDown } from "lucide-react";
import { AssistantCommandBar } from "../Assistant/AssistantCommandBar";
import { TenantSwitcher } from "./TenantSwitcher";
import { NotificationBell } from "../common/NotificationBell";

interface NavbarProps {
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleMobileMenu }) => {
  const { user, logout } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 sm:px-6 backdrop-blur">
      {/* Left: Mobile Toggle & Brand & Tenant */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Shield className="h-5 w-5" />
          </div>
          <div className="hidden sm:block">
            <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
              AttendanceHub
            </span>
            <span className="text-[11px] font-medium text-slate-500">Enterprise SaaS</span>
          </div>
        </div>

        <div className="hidden md:block h-5 w-[1px] bg-slate-200 mx-1" />

        {/* Multi-Tenant Organization Switcher */}
        <TenantSwitcher />
      </div>

      {/* Middle: Natural Language Assistant Command Bar */}
      <div className="hidden md:block flex-1 max-w-md mx-4">
        <AssistantCommandBar variant="navbar" />
      </div>

      {/* Right: Date, Notifications & User Menu */}
      <div className="flex items-center gap-3">
        {/* Current Date Badge */}
        <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600">
          <Calendar className="h-3.5 w-3.5 text-indigo-600" />
          <span>{todayFormatted}</span>
        </div>

        {/* Real-Time Notification Bell */}
        <NotificationBell />

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 transition"
          >
            <div className="hidden sm:block text-right">
              <p className="text-xs font-bold text-slate-900 leading-tight">{user?.username}</p>
              <span className="inline-block rounded px-1.5 py-0.2 text-[10px] font-bold tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-100 uppercase">
                {user?.role}
              </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
              {user?.username ? user.username.charAt(0).toUpperCase() : <UserCircle className="h-5 w-5" />}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block" />
          </button>

          {profileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setProfileMenuOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-20 divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3.5 py-2">
                  <p className="text-xs font-semibold text-slate-900">{user?.username}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
