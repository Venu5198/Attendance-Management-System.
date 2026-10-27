import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  LayoutDashboard,
  Users,
  Clock,
  BarChart3,
  AlertTriangle,
  User,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Shield,
  X,
} from "lucide-react";
import { AssistantCommandBar } from "../Assistant/AssistantCommandBar";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const adminLinks = [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/attendance", label: "My Attendance", icon: <Clock className="h-4 w-4" /> },
    { to: "/reports", label: "Attendance Reports", icon: <BarChart3 className="h-4 w-4" /> },
    { to: "/employees", label: "Employee Management", icon: <Users className="h-4 w-4" /> },
    { to: "/violations", label: "Policy & Compliance", icon: <AlertTriangle className="h-4 w-4" /> },
    { to: "/leaves", label: "Leaves & Exemptions", icon: <CalendarDays className="h-4 w-4" /> },
    { to: "/profile", label: "Profile & Settings", icon: <User className="h-4 w-4" /> },
  ];

  const employeeLinks = [
    { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/attendance", label: "My Attendance", icon: <Clock className="h-4 w-4" /> },
    { to: "/reports", label: "My Attendance Report", icon: <BarChart3 className="h-4 w-4" /> },
    { to: "/leaves", label: "Leaves & Exemptions", icon: <CalendarDays className="h-4 w-4" /> },
    { to: "/profile", label: "Profile & Settings", icon: <User className="h-4 w-4" /> },
  ];

  const links = isAdmin ? adminLinks : employeeLinks;

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between p-3.5">
      <div>
        {/* Brand Header inside Mobile Drawer */}
        <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-100 lg:hidden">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">Attendance Pro</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{user?.role} Portal</p>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Section Label */}
        {!collapsed && (
          <div className="mb-2 px-2.5 hidden lg:block">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Navigation</h2>
          </div>
        )}

        {/* Links */}
        <nav className="space-y-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/dashboard"}
              onClick={onCloseMobile}
              title={collapsed ? link.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition group ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                } ${collapsed ? "justify-center px-2" : ""}`
              }
            >
              <span className="flex-shrink-0">{link.icon}</span>
              {!collapsed && <span className="truncate">{link.label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-100">
        {/* AI Assistant Command Bar */}
        {!collapsed && <AssistantCommandBar variant="sidebar" />}

        {/* Desktop Collapse Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-full items-center justify-center gap-2 rounded-xl py-2 px-3 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 border-r border-slate-200/80 bg-white min-h-[calc(100vh-4rem)] transition-all duration-300 ease-in-out ${
          collapsed ? "w-18" : "w-64"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs transition-opacity lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Drawer */}
      {mobileOpen && (
        <aside className="fixed inset-y-0 left-0 z-40 w-72 bg-white shadow-xl transition-transform duration-300 ease-in-out lg:hidden translate-x-0">
          {sidebarContent}
        </aside>
      )}
    </>
  );
};
