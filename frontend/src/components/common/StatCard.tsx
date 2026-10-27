import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  badge?: string;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = "default",
  badge,
  onClick,
  className = "",
}) => {
  const variantStyles = {
    default: "border-slate-200 text-slate-900",
    success: "border-emerald-200 bg-emerald-50/40 text-emerald-950",
    warning: "border-amber-200 bg-amber-50/40 text-amber-950",
    danger: "border-rose-200 bg-rose-50/40 text-rose-950",
    info: "border-blue-200 bg-blue-50/40 text-blue-950",
  };

  const isInteractive = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`rounded-xl border bg-white p-5 shadow-xs transition ${
        isInteractive
          ? "cursor-pointer hover:shadow-md hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 active:scale-[0.99]"
          : "hover:shadow-xs"
      } ${variantStyles[variant]} ${className}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</p>
            {badge && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                {badge}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-2xl font-bold tracking-tight">{value}</h3>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-slate-700 shadow-inner">{icon}</div>
      </div>
    </div>
  );
};
