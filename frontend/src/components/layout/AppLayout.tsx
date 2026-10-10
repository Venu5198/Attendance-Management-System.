import React from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";
import { AssistantCommandBar } from "../Assistant/AssistantCommandBar";

export const AppLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Floating HUD Assistant (active when position === 'FLOATING_HUD') */}
      <AssistantCommandBar variant="floating_hud" />
    </div>
  );
};
