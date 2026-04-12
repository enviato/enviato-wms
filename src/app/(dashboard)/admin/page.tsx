"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NotificationBell from "@/modules/notifications/components/NotificationBell";
import {
  Package,
  Users,
  Truck,
  CheckCircle2,
  Clock,
  Activity,
  QrCode,
  ArrowRight,
  Warehouse,
  Eye,
} from "lucide-react";

type ActivityLog = {
  id: string;
  action: string;
  metadata: { description?: string } | null;
  created_at: string;
  user: { first_name: string; last_name: string }[] | null;
};

type RecentPackage = {
  id: string;
  tracking_number: string;
  status: string;
  checked_in_at: string;
  customer: { first_name: string; last_name: string }[] | null;
};

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  checked_in: { label: "Checked In", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  assigned_to_awb: { label: "Assigned", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "In Transit", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  received_at_dest: { label: "Received", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  delivered: { label: "Delivered", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  returned: { label: "Returned", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  lost: { label: "Lost", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [receivedToday, setReceivedToday] = useState(0);
  const [inWarehouse, setInWarehouse] = useState(0);
  const [shippedToday, setShippedToday] = useState(0);
  const [pendingAction, setPendingAction] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  const [recentPackages, setRecentPackages] = useState<RecentPackage[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // Load all data in parallel
  useEffect(() => {
    async function loadAll() {
      const today = new Date().toISOString().split("T")[0];

      const [statsResults, dataResults] = await Promise.all([
        // ─── Stats: 4 count queries in parallel ───
        Promise.all([
          supabase.from("packages").select("*", { count: "exact", head: true }).is("deleted_at", null).gte("checked_in_at", `${today}T00:00:00`).lte("checked_in_at", `${today}T23:59:59`),
          supabase.from("packages").select("*", { count: "exact", head: true }).is("deleted_at", null).eq("status", "checked_in"),
          supabase.from("packages").select("*", { count: "exact", head: true }).is("deleted_at", null).neq("status", "checked_in").gte("updated_at", `${today}T00:00:00`),
          supabase.from("awbs").select("*", { count: "exact", head: true }).is("deleted_at", null).in("status", ["shipped", "in_transit"]),
        ]),
        // ─── Recent data: packages + activity in parallel ───
        Promise.all([
          supabase.from("packages").select("id, tracking_number, status, checked_in_at, customer:users(first_name, last_name)").is("deleted_at", null).order("checked_in_at", { ascending: false }).limit(8),
          supabase.from("activity_log").select("id, action, metadata, created_at, user:users(first_name, last_name)").order("created_at", { ascending: false }).limit(8),
        ]),
      ]);

      // Unpack stats
      const [rtRes, iwRes, stRes, paRes] = statsResults;
      setReceivedToday(rtRes.count || 0);
      setInWarehouse(iwRes.count || 0);
      setShippedToday(stRes.count || 0);
      setPendingAction(paRes.count || 0);
      setLoadingStats(false);

      // Unpack recent data
      const [pkgsRes, logsRes] = dataResults;
      if (pkgsRes.data) setRecentPackages(pkgsRes.data as RecentPackage[]);
      if (logsRes.data) setActivityLogs(logsRes.data as ActivityLog[]);
      setLoadingActivity(false);
    }

    loadAll();
  }, []);

  const statsData = [
    { label: "In Warehouse", value: inWarehouse, icon: Warehouse, color: "text-primary" },
    { label: "Inbound Today", value: receivedToday, icon: Truck, color: "text-emerald-600" },
    { label: "Checked Out", value: shippedToday, icon: CheckCircle2, color: "text-amber-600" },
    { label: "Active Shipments", value: pendingAction, icon: Clock, color: "text-violet-600" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ════════ Header — matches gold standard ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Dashboard</h2>
          <span className="text-meta text-txt-tertiary tracking-tight hidden sm:inline-block">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
        </div>
      </header>

      {/* ════════ Scrollable Content ════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-5 space-y-4">
          {/* ── Stats Grid ── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statsData.map((stat, idx) => (
              <div key={idx} className="stat-card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-meta text-txt-tertiary tracking-tight">{stat.label}</p>
                  <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center">
                    <stat.icon size={16} strokeWidth={1.75} className={stat.color} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-txt-primary tracking-tighter leading-none">
                  {loadingStats ? (
                    <span className="inline-block w-12 h-7 skeleton-pulse rounded" />
                  ) : (
                    stat.value.toLocaleString()
                  )}
                </h3>
              </div>
            ))}
          </section>

          {/* ── Main Grid: Table + Sidebar ── */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            {/* Recent Packages Table */}
            <section className="xl:col-span-3">
              <div className="bg-white border border-border overflow-hidden rounded-md">
                {/* Table Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-ui font-semibold text-txt-primary tracking-tight">Recent Inbound Packages</h2>
                    <span className="px-2 py-0.5 bg-surface-secondary text-meta text-txt-tertiary rounded-full">
                      {recentPackages.length}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push("/admin/packages")}
                    className="btn-primary cursor-pointer"
                  >
                    View All
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="sheet-table" style={{ width: "100%", tableLayout: "auto" }}>
                    <thead className="sheet-thead">
                      <tr>
                        {[
                          { label: "Recipient", width: undefined },
                          { label: "Tracking Number", width: undefined },
                          { label: "Status", width: 140 },
                          { label: "Checked-in", width: 140 },
                          { label: "", width: 80 },
                        ].map((col, idx, arr) => (
                          <th
                            key={idx}
                            style={{ width: col.width }}
                            className="sheet-th"
                          >
                            {col.label}
                            {idx < arr.length - 1 && <span className="sheet-th-sep" />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loadingActivity ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td className="sheet-cell"><div className="w-32 h-4 skeleton-pulse rounded" /></td>
                            <td className="sheet-cell"><div className="w-28 h-4 skeleton-pulse rounded" /></td>
                            <td className="sheet-cell"><div className="w-20 h-5 skeleton-pulse rounded-full" /></td>
                            <td className="sheet-cell"><div className="w-24 h-4 skeleton-pulse rounded" /></td>
                            <td className="sheet-cell" />
                          </tr>
                        ))
                      ) : recentPackages.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="sheet-cell text-center py-12">
                            <div className="empty-state">
                              <Package size={32} className="empty-state-icon" />
                              <p className="empty-state-title">No packages yet</p>
                              <p className="empty-state-desc">Packages will appear here once checked in.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        recentPackages.map((pkg) => {
                          const sc = statusConfig[pkg.status] || statusConfig.delivered;
                          return (
                            <tr key={pkg.id} className="sheet-row cursor-pointer" onClick={() => router.push(`/admin/packages/${pkg.id}`)}>
                              <td className="sheet-cell">
                                <span className="text-txt-primary text-ui">
                                  {pkg.customer?.[0]
                                    ? `${pkg.customer[0].first_name} ${pkg.customer[0].last_name}`
                                    : "Unassigned"}
                                </span>
                              </td>
                              <td className="sheet-cell">
                                <span className="font-mono text-ui text-txt-primary">{pkg.tracking_number}</span>
                              </td>
                              <td className="sheet-cell">
                                <span className={`status-badge ${sc.bg} ${sc.text}`}>
                                  <span className={`status-dot ${sc.dot}`} />
                                  {sc.label}
                                </span>
                              </td>
                              <td className="sheet-cell">
                                <span className="text-txt-secondary text-ui" style={{ fontWeight: 400 }}>
                                  {pkg.checked_in_at
                                    ? new Date(pkg.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                    : "\u2014"}
                                </span>
                              </td>
                              <td
                                className="sheet-cell text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => router.push(`/admin/packages/${pkg.id}`)}
                                  className="row-open-btn"
                                >
                                  <Eye size={14} />
                                  Open
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer */}
                <div className="px-4 py-2.5 border-t border-border flex items-center justify-between">
                  <span className="text-meta text-txt-tertiary">
                    Showing {recentPackages.length} most recent
                  </span>
                  <button
                    onClick={() => router.push("/admin/packages")}
                    className="text-meta text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
                  >
                    View all &rarr;
                  </button>
                </div>
              </div>
            </section>

            {/* ── Sidebar ── */}
            <section className="space-y-3">
              {/* Quick Actions */}
              <div className="bg-white border border-border rounded-md p-4">
                <p className="text-meta text-txt-tertiary tracking-tight mb-2.5">Quick Actions</p>
                <div className="space-y-0.5">
                  {[
                    { icon: QrCode, label: "Scan Package", href: "/admin/packages" },
                    { icon: Truck, label: "Dispatch Batch", href: "/admin/awbs" },
                    { icon: Users, label: "Manage Recipients", href: "/admin/customers" },
                  ].map((action) => (
                    <button
                      key={action.label}
                      onClick={() => router.push(action.href)}
                      className="w-full flex items-center justify-between p-2 text-ui hover:bg-surface-hover transition-colors rounded cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <action.icon size={16} strokeWidth={1.75} className="text-txt-tertiary" />
                        <span className="text-txt-primary">{action.label}</span>
                      </div>
                      <ArrowRight size={14} className="text-txt-placeholder group-hover:text-txt-tertiary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-border rounded-md p-4">
                <p className="text-meta text-txt-tertiary tracking-tight mb-2.5">Recent Activity</p>
                {activityLogs.length === 0 ? (
                  <p className="text-muted text-txt-tertiary py-4 text-center">No recent activity</p>
                ) : (
                  <div className="space-y-2.5">
                    {activityLogs.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded bg-surface-secondary flex items-center justify-center shrink-0 mt-0.5">
                          <Activity size={12} className="text-txt-tertiary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-ui-sm text-txt-primary truncate leading-snug">
                            {log.metadata?.description || log.action.replace(/_/g, " ")}
                          </p>
                          <p className="text-meta text-txt-tertiary mt-0.5">
                            {new Date(log.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* System Status */}
              <div className="bg-white border border-border rounded-md p-4">
                <p className="text-meta text-txt-tertiary tracking-tight mb-2.5">System Status</p>
                <div className="space-y-2.5">
                  {[
                    { label: "API Connectivity", status: "online" },
                    { label: "Database", status: "online" },
                    { label: "Auth Service", status: "online" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-ui-sm text-txt-secondary">{item.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-meta text-emerald-600">Online</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
