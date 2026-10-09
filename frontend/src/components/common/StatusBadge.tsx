import React from "react";

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getBadgeStyle = (s: string) => {
    switch (s.toUpperCase()) {
      case "COMPLIANT":
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "NON_COMPLIANT":
      case "FAILED":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "IN_PROGRESS":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "PENDING":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "NOT_ATTENDED":
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${getBadgeStyle(
        status
      )}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
};
