import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Role } from "../types";

export const RoleProtectedRoute: React.FC<{
  allowedRoles: Role[];
  children: React.ReactElement;
}> = ({ allowedRoles, children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) {
    // If regular employee attempts to access admin route, redirect to their dashboard
    return <Navigate to={user?.role === "EMPLOYEE" ? "/dashboard/employee" : "/dashboard"} replace />;
  }

  return children;
};
