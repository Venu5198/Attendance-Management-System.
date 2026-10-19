import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Layers, Info, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

export interface NotificationItem {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'TASK';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export const NotificationBell: React.FC = () => {
  const { tenantId } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'init-1',
      type: 'INFO',
      title: 'Real-Time Stream Active',
      message: `WebSocket listening on tenant '${tenantId || 'default'}'`,
      timestamp: new Date(),
      read: false,
    },
  ]);
  const [isOpen, setIsOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const activeTenant = tenantId || 'default';

  useEffect(() => {
    const wsUrl = `ws://localhost:8000/ws/notifications/${activeTenant}`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const newNotif: NotificationItem = {
            id: String(Date.now()),
            type: data.type === 'SUCCESS' ? 'SUCCESS' : data.type === 'WARNING' ? 'WARNING' : 'INFO',
            title: data.title || 'System Notification',
            message: data.message || JSON.stringify(data),
            timestamp: new Date(),
            read: false,
          };
          setNotifications((prev) => [newNotif, ...prev.slice(0, 19)]);
        } catch {
          // ignore non-json
        }
      };

      socket.onclose = () => {
        setConnected(false);
      };

      socket.onerror = () => {
        setConnected(false);
      };
    } catch {
      // socket init error
    }

    return () => {
      if (socket) socket.close();
    };
  }, [activeTenant]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) markAllRead();
        }}
        className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition"
        title="Live WebSocket Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">Live Notifications</span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  connected
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {connected ? 'WebSocket Live' : 'Reconnecting'}
              </span>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[11px] text-slate-400 hover:text-rose-600 transition flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No new notifications received.
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-3.5 hover:bg-slate-50/80 transition flex items-start gap-3">
                  <div className="mt-0.5">
                    {n.type === 'SUCCESS' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : n.type === 'WARNING' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    ) : n.type === 'TASK' ? (
                      <Layers className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Info className="w-4 h-4 text-indigo-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 break-words">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {n.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
