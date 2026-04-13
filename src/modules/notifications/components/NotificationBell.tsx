"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, Package, Truck, FileText, Plane } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";
import type { Notification } from "../types";

const TYPE_ICON: Record<string, typeof Package> = {
  package_received: Package,
  awb_shipped: Truck,
  awb_arrived: Plane,
  invoice_ready: FileText,
};

const TYPE_COLOR: Record<string, string> = {
  package_received: "#10b981",
  awb_shipped: "#f59e0b",
  awb_arrived: "#3b82f6",
  invoice_ready: "#8b5cf6",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationBell() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  /* ── position the portal panel relative to the bell button ── */
  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, read_at, sent_at, metadata")
        .order("sent_at", { ascending: false })
        .limit(30);
      if (data) setNotifications(data);
    } catch (err) {
      logger.error("Error fetching notifications", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount + poll every 30s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Subscribe to real-time inserts
  useEffect(() => {
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) =>
      prev.map((n) =>
        !n.read_at ? { ...n, read_at: new Date().toISOString() } : n
      )
    );

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);
  };

  const dropdownPanel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="bg-white border border-border rounded-lg shadow-xl overflow-hidden"
          style={{
            position: "fixed",
            top: panelPos.top,
            right: panelPos.right,
            width: 380,
            zIndex: 9999,
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-ui font-semibold text-txt-primary">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-meta text-white bg-brand-red rounded-full px-1.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-meta text-primary hover:text-primary/80 cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="py-10 text-center text-muted text-txt-tertiary">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell
                  size={28}
                  className="mx-auto mb-2 text-txt-placeholder"
                />
                <p className="text-muted text-txt-tertiary">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = TYPE_ICON[notif.type] || Bell;
                const color = TYPE_COLOR[notif.type] || "#64748b";
                const isUnread = !notif.read_at;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      if (isUnread) markAsRead(notif.id);
                    }}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors cursor-pointer ${
                      isUnread
                        ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon size={15} style={{ color }} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-ui-sm leading-snug ${
                            isUnread
                              ? "font-semibold text-txt-primary"
                              : "font-medium text-txt-secondary"
                          }`}
                        >
                          {notif.title}
                        </p>
                        {isUnread && (
                          <span className="flex-shrink-0 w-2 h-2 mt-1.5 bg-primary rounded-full" />
                        )}
                      </div>
                      {notif.body && (
                        <p className="text-meta text-txt-tertiary mt-0.5 line-clamp-2">
                          {notif.body}
                        </p>
                      )}
                      <p className="text-meta text-txt-placeholder mt-1">
                        {timeAgo(notif.sent_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => {
          setOpen((p) => !p);
          if (!open) fetchNotifications();
        }}
        className="h-9 px-3 flex items-center gap-2 text-txt-secondary hover:bg-surface-hover rounded transition-colors cursor-pointer relative"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center bg-brand-red text-white font-bold rounded-full px-1 leading-none" style={{ fontSize: '10px' }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {dropdownPanel}
    </div>
  );
}
