import React from 'react';

interface LoadingSkeletonProps {
  className?: string;
  variant?: 'card' | 'table-row' | 'stat' | 'text';
  count?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  className = '',
  variant = 'card',
  count = 1,
}) => {
  const items = Array.from({ length: count });

  if (variant === 'stat') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((_, i) => (
          <div
            key={i}
            className={`rounded-xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse ${className}`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1 mr-4">
                <div className="h-3 w-20 bg-slate-200 rounded"></div>
                <div className="h-7 w-28 bg-slate-200 rounded"></div>
                <div className="h-2.5 w-32 bg-slate-100 rounded"></div>
              </div>
              <div className="h-11 w-11 bg-slate-100 rounded-xl"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'table-row') {
    return (
      <div className="divide-y divide-slate-100 animate-pulse">
        {items.map((_, i) => (
          <div key={i} className="py-3.5 px-4 flex items-center justify-between gap-4">
            <div className="h-4 w-28 bg-slate-200 rounded"></div>
            <div className="h-4 w-24 bg-slate-100 rounded"></div>
            <div className="h-4 w-20 bg-slate-100 rounded"></div>
            <div className="h-6 w-20 bg-slate-100 rounded-full"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((_, i) => (
        <div
          key={i}
          className={`h-28 rounded-xl bg-slate-100 border border-slate-200 animate-pulse ${className}`}
        />
      ))}
    </div>
  );
};
