import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = "default",
}) => {
  const variantStyles = {
    default: "border-slate-200 text-slate-900",
    success: "border-emerald-200 bg-emerald-50/40 text-emerald-950",
    warning: "border-amber-200 bg-amber-50/40 text-amber-950",
    danger: "border-rose-200 bg-rose-50/40 text-rose-950",
    info: "border-blue-200 bg-blue-50/40 text-blue-950",
  };

  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight">{value}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-slate-700 shadow-inner">{icon}</div>
      </div>
    </div>
  );
};
