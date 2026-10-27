import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { AssistantCommandBar } from "../Assistant/AssistantCommandBar";

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50/60 flex flex-col relative text-slate-900">
      <Navbar onToggleMobileMenu={() => setMobileOpen(!mobileOpen)} />
      <div className="flex flex-1">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Floating HUD Assistant (active when position === 'FLOATING_HUD') */}
      <AssistantCommandBar variant="floating_hud" />
    </div>
  );
};
