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
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const adminLinks = [
    { to: "/dashboard", label: "Admin Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/employees", label: "Employees", icon: <Users className="h-4 w-4" /> },
    { to: "/attendance", label: "Live Attendance", icon: <Clock className="h-4 w-4" /> },
    { to: "/leaves", label: "Leaves & Exemptions", icon: <CalendarDays className="h-4 w-4" /> },
    { to: "/reports", label: "Central Reports", icon: <BarChart3 className="h-4 w-4" /> },
    { to: "/violations", label: "Policy Violations", icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  const employeeLinks = [
    { to: "/dashboard/employee", label: "My Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/attendance", label: "Check In / Out", icon: <Clock className="h-4 w-4" /> },
    { to: "/leaves", label: "Request Leave", icon: <CalendarDays className="h-4 w-4" /> },
    { to: "/reports", label: "My Attendance Report", icon: <BarChart3 className="h-4 w-4" /> },
    { to: "/profile", label: "My Profile", icon: <User className="h-4 w-4" /> },
  ];

  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white min-h-[calc(100vh-4rem)] p-4">
      <div className="mb-6 px-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Navigation</h2>
      </div>
      <nav className="space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/dashboard" || link.to === "/dashboard/employee"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`
            }
          >
            {link.icon}
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};
