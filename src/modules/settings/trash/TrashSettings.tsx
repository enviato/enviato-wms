"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  Trash2,
  RotateCcw,
  Loader2,
  Package,
  Plane,
  Receipt,
  Truck,
  MapPin,
  Tag,
  CircleDot,
  Search,
  X,
  AlertTriangle,
  Pencil,
  Calendar,
  Timer,
  User,
  type LucideIcon,
} from "lucide-react";

type TrashItem = {
  id: string;
  type: string;
  label: string;
  details: string;
  deleted_at: string;
  deleted_by_name: string;
};

type TrashTab = {
  key: string;
  label: string;
  icon: LucideIcon;
};

const TRASH_TABS: TrashTab[] = [
  { key: "user", label: "Users", icon: User },
  { key: "package", label: "Packages", icon: Package },
  { key: "shipment", label: "Shipments", icon: Plane },
  { key: "invoice", label: "Invoices", icon: Receipt },
  { key: "courier", label: "Couriers", icon: Truck },
  { key: "location", label: "Locations", icon: MapPin },
  { key: "tag", label: "Tags", icon: Tag },
  { key: "status", label: "Statuses", icon: CircleDot },
];

const TABLE_MAP: Record<string, string> = {
  user: "users",
  package: "packages",
  invoice: "invoices",
  shipment: "awbs",
  courier: "courier_groups",
  location: "warehouse_locations",
  tag: "tags",
  status: "package_statuses",
};

export default function TrashSettings() {
  const supabase = createClient();

  // ── State ──
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashTab, setTrashTab] = useState<string>("user");
  const [trashSearch, setTrashSearch] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  // ── Retention period ──
  const [retentionMonths, setRetentionMonths] = useState<number>(3);
  const [retentionPermanent, setRetentionPermanent] = useState(false);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [retentionForm, setRetentionForm] = useState({
    years: 0,
    months: 3,
    days: 0,
    permanent: false,
  });
  const [savingRetention, setSavingRetention] = useState(false);

  // ── Toast messages ──
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // ── Load trash items from multiple tables ──
  const loadTrashItems = async () => {
    setTrashLoading(true);
    try {
      const [userRes, pkgRes, invRes, awbRes, courierRes, locRes, tagRes, statusRes] =
        await Promise.all([
          supabase
            .from("users")
            .select(
              "id, first_name, last_name, email, role, role_v2, deleted_at, deleted_by"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("packages")
            .select(
              "id, tracking_number, status, deleted_at, deleted_by, customer:users!packages_customer_id_fkey(first_name, last_name), deleter:users!packages_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("invoices")
            .select(
              "id, invoice_number, status, total, deleted_at, deleted_by, deleter:users!invoices_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("awbs")
            .select(
              "id, awb_number, status, deleted_at, deleted_by, deleter:users!awbs_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("courier_groups")
            .select(
              "id, name, code, deleted_at, deleted_by, deleter:users!courier_groups_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("warehouse_locations")
            .select(
              "id, name, code, deleted_at, deleted_by, deleter:users!warehouse_locations_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("tags")
            .select(
              "id, name, color, deleted_at, deleted_by, deleter:users!tags_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
          supabase
            .from("package_statuses")
            .select(
              "id, name, color, deleted_at, deleted_by, deleter:users!package_statuses_deleted_by_fkey(first_name, last_name)"
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false }),
        ]);

      const getDeleterName = (row: Record<string, unknown>) => {
        const d = row.deleter as { first_name: string; last_name: string } | null;
        return d ? `${d.first_name} ${d.last_name}` : "—";
      };

      const items: TrashItem[] = [];

      // For users, self-referencing FK join doesn't work in PostgREST,
      // so we resolve deleted_by names with a separate lookup
      const userRows = userRes.data || [];
      const deleterIds = [...new Set(userRows.map((u: Record<string, unknown>) => u.deleted_by as string).filter(Boolean))];
      let deleterMap: Record<string, string> = {};
      if (deleterIds.length > 0) {
        const { data: deleters } = await supabase
          .from("users")
          .select("id, first_name, last_name")
          .in("id", deleterIds);
        if (deleters) {
          deleterMap = Object.fromEntries(
            deleters.map((d: Record<string, unknown>) => [d.id as string, `${d.first_name} ${d.last_name}`])
          );
        }
      }
      userRows.forEach((u: Record<string, unknown>) => {
        const roleLabel = (u.role_v2 as string) || (u.role as string) || "";
        items.push({
          id: u.id as string,
          type: "user",
          label: `${u.first_name} ${u.last_name}`,
          details: `${u.email} · ${roleLabel}`,
          deleted_at: u.deleted_at as string,
          deleted_by_name: deleterMap[u.deleted_by as string] || "—",
        });
      });

      (pkgRes.data || []).forEach((p: Record<string, unknown>) => {
        const cust = p.customer as { first_name: string; last_name: string } | null;
        items.push({
          id: p.id as string,
          type: "package",
          label: (p.tracking_number as string) || "No tracking #",
          details: cust ? `${cust.first_name} ${cust.last_name}` : "",
          deleted_at: p.deleted_at as string,
          deleted_by_name: getDeleterName(p),
        });
      });

      (invRes.data || []).forEach((i: Record<string, unknown>) => {
        items.push({
          id: i.id as string,
          type: "invoice",
          label: (i.invoice_number as string) || "No invoice #",
          details: `${i.status} · $${Number(i.total || 0).toFixed(2)}`,
          deleted_at: i.deleted_at as string,
          deleted_by_name: getDeleterName(i),
        });
      });

      (awbRes.data || []).forEach((a: Record<string, unknown>) => {
        items.push({
          id: a.id as string,
          type: "shipment",
          label: (a.awb_number as string) || "No AWB #",
          details: (a.status as string) || "",
          deleted_at: a.deleted_at as string,
          deleted_by_name: getDeleterName(a),
        });
      });

      (courierRes.data || []).forEach((c: Record<string, unknown>) => {
        items.push({
          id: c.id as string,
          type: "courier",
          label: (c.name as string) || "Unnamed",
          details: (c.code as string) || "",
          deleted_at: c.deleted_at as string,
          deleted_by_name: getDeleterName(c),
        });
      });

      (locRes.data || []).forEach((l: Record<string, unknown>) => {
        items.push({
          id: l.id as string,
          type: "location",
          label: (l.name as string) || "Unnamed",
          details: (l.code as string) || "",
          deleted_at: l.deleted_at as string,
          deleted_by_name: getDeleterName(l),
        });
      });

      (tagRes.data || []).forEach((t: Record<string, unknown>) => {
        items.push({
          id: t.id as string,
          type: "tag",
          label: (t.name as string) || "Unnamed",
          details: "",
          deleted_at: t.deleted_at as string,
          deleted_by_name: getDeleterName(t),
        });
      });

      (statusRes.data || []).forEach((s: Record<string, unknown>) => {
        items.push({
          id: s.id as string,
          type: "status",
          label: (s.name as string) || "Unnamed",
          details: "",
          deleted_at: s.deleted_at as string,
          deleted_by_name: getDeleterName(s),
        });
      });

      items.sort(
        (a, b) =>
          new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
      );
      setTrashItems(items);
    } catch (err) {
      logger.error("Error loading trash items:", err);
    } finally {
      setTrashLoading(false);
    }
  };

  // ── Load retention settings ──
  const loadRetentionSettings = async () => {
    try {
      const { data } = await supabase
        .from("org_settings")
        .select("value")
        .eq("key", "retention_period")
        .maybeSingle();
      if (data?.value) {
        const v = data.value as { months?: number; permanent?: boolean };
        setRetentionMonths(v.months ?? 3);
        setRetentionPermanent(v.permanent ?? false);
      }
    } catch (err) {
      logger.error("Error loading retention settings:", err);
    }
  };

  // ── Save retention settings ──
  const saveRetentionSettings = async () => {
    setSavingRetention(true);
    try {
      const { error } = await supabase.from("org_settings").upsert(
        {
          key: "retention_period",
          value: {
            months: retentionForm.years * 12 + retentionForm.months,
            permanent: retentionForm.permanent,
          },
        },
        { onConflict: "key" }
      );
      if (!error) {
        setRetentionMonths(
          retentionForm.years * 12 + retentionForm.months
        );
        setRetentionPermanent(retentionForm.permanent);
        setShowRetentionModal(false);
        showSuccess("Retention settings updated");
      } else {
        showError("Failed to save: " + error.message);
      }
    } catch (err) {
      logger.error("Error saving retention settings:", err);
      showError("Failed to save retention settings");
    } finally {
      setSavingRetention(false);
    }
  };

  // ── Restore item ──
  const handleRestore = async (item: TrashItem) => {
    setRestoringId(item.id);
    try {
      const table = TABLE_MAP[item.type];
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: null, deleted_by: null })
        .eq("id", item.id);
      if (error) {
        showError("Failed to restore: " + error.message);
        return;
      }
      // For users, also unban their auth account via API route
      if (item.type === "user") {
        try {
          await fetch("/api/admin/restore-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: item.id }),
          });
        } catch (authErr) {
          logger.warn("Failed to unban auth user:");
        }
      }
      setTrashItems((prev) => prev.filter((t) => t.id !== item.id));
      showSuccess(`${item.label} restored`);
    } catch (err) {
      logger.error("Restore error:", err);
      showError("Failed to restore item");
    } finally {
      setRestoringId(null);
    }
  };

  // ── Permanently delete item ──
  const handlePermanentDelete = async (item: TrashItem) => {
    setPermanentDeleting(true);
    try {
      if (item.type === "user") {
        // For users, use admin route which also removes auth account
        const res = await fetch("/api/admin/permanent-delete-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: item.id }),
        });
        if (res.ok) {
          setTrashItems((prev) => prev.filter((t) => t.id !== item.id));
          setPermanentDeleteId(null);
          showSuccess(`${item.label} permanently deleted`);
        } else {
          const result = await res.json();
          showError("Failed to delete: " + (result.error || "Unknown error"));
        }
      } else {
        const table = TABLE_MAP[item.type];
        const { error } = await supabase.from(table).delete().eq("id", item.id);
        if (!error) {
          setTrashItems((prev) => prev.filter((t) => t.id !== item.id));
          setPermanentDeleteId(null);
          showSuccess(`${item.label} permanently deleted`);
        } else {
          showError("Failed to delete: " + error.message);
        }
      }
    } catch (err) {
      logger.error("Permanent delete error:", err);
      showError("Failed to permanently delete");
    } finally {
      setPermanentDeleting(false);
    }
  };

  // ── Load data on mount ──
  useEffect(() => {
    loadRetentionSettings();
    loadTrashItems();
  }, []);

  // ── Search and filter ──
  const searchLower = trashSearch.trim().toLowerCase();
  const searchedItems = searchLower
    ? trashItems.filter(
        (item) =>
          item.label.toLowerCase().includes(searchLower) ||
          item.details.toLowerCase().includes(searchLower) ||
          item.deleted_by_name.toLowerCase().includes(searchLower)
      )
    : trashItems;

  const tabCounts: Record<string, number> = {};
  TRASH_TABS.forEach((t) => {
    tabCounts[t.key] = searchedItems.filter((i) => i.type === t.key).length;
  });

  const filtered = searchedItems.filter((t) => t.type === trashTab);

  const retentionDays = retentionPermanent ? Infinity : retentionMonths * 30;

  const getDelInLabel = (deletedAt: string) => {
    if (retentionPermanent)
      return { label: "∞", color: "text-txt-tertiary", dot: "bg-slate-300" };
    const deletedTime = new Date(deletedAt).getTime();
    const expiresAt = deletedTime + retentionDays * 24 * 60 * 60 * 1000;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0)
      return { label: "0h", color: "text-red-600", dot: "bg-red-500" };
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 30)
      return {
        label: `${Math.floor(days / 30)}mo`,
        color: "text-txt-secondary",
        dot: "bg-emerald-500",
      };
    if (days > 7)
      return { label: `${days}d`, color: "text-amber-600", dot: "bg-amber-500" };
    if (days > 0)
      return {
        label: `${days}d`,
        color: "text-orange-600",
        dot: "bg-orange-500",
      };
    return { label: `${hours}h`, color: "text-red-600", dot: "bg-red-500" };
  };

  const fmtDeletedAt = (iso: string) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    );
  };

  const retentionLabel = retentionPermanent
    ? "Permanent"
    : `${retentionMonths} month${retentionMonths !== 1 ? "s" : ""}`;

  // Warning: items expiring in < 1 week
  const expiringCount = retentionPermanent
    ? 0
    : trashItems.filter((item) => {
        const expiresAt =
          new Date(item.deleted_at).getTime() +
          retentionDays * 24 * 60 * 60 * 1000;
        return expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000;
      }).length;

  return (
    <>
      <div className="space-y-0">
        {/* Header */}
        <div className="bg-white border border-border rounded-t-lg px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5 text-txt-secondary" />
              <h2 className="text-ui font-semibold text-txt-primary">
                Retained data
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-ui text-txt-secondary">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  Retention period:{" "}
                  <span className="font-semibold text-txt-primary">
                    {retentionLabel}
                  </span>
                </span>
              </div>
              <button
                onClick={() => {
                  const y = Math.floor(retentionMonths / 12);
                  const m = retentionMonths % 12;
                  setRetentionForm({
                    years: y,
                    months: m,
                    days: 0,
                    permanent: retentionPermanent,
                  });
                  setShowRetentionModal(true);
                }}
                className="btn-secondary h-8 px-3 text-meta flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={loadTrashItems}
                disabled={trashLoading}
                className="btn-secondary h-8 px-3 text-meta flex items-center gap-1.5"
              >
                {trashLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Expiry warning banner */}
        {expiringCount > 0 && (
          <div className="bg-amber-50 border-x border-border px-5 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-ui text-amber-800">
              <span className="font-semibold">
                {expiringCount} item{expiringCount !== 1 ? "s" : ""}
              </span>{" "}
              will be permanently destroyed in less than 1 week
            </p>
          </div>
        )}

        {/* Search + filter bar */}
        <div className="bg-white border-x border-border px-5 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm px-3 py-1.5 bg-surface-secondary rounded-md border border-transparent focus-within:border-primary focus-within:bg-white transition-colors">
            <Search className="w-3.5 h-3.5 text-txt-tertiary shrink-0" />
            <input
              type="text"
              value={trashSearch}
              onChange={(e) => setTrashSearch(e.target.value)}
              placeholder="Search retained data..."
              className="flex-1 bg-transparent text-ui text-txt-primary outline-none placeholder:text-txt-placeholder"
            />
            {trashSearch && (
              <button
                onClick={() => setTrashSearch("")}
                className="p-0.5 text-txt-tertiary hover:text-txt-primary cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {trashSearch && (
            <span className="text-meta text-txt-tertiary">
              {searchedItems.length} result{searchedItems.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="bg-white border-x border-border px-5 flex gap-0 overflow-x-auto">
          {TRASH_TABS.map((tab) => {
            const count = tabCounts[tab.key];
            const isActive = trashTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setTrashTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-ui font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer
                  ${
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-txt-tertiary hover:text-txt-secondary hover:border-border"
                  }
                `}
              >
                {tab.label}
                <span
                  className={`text-meta font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                  ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-slate-100 text-txt-tertiary"
                  }
                `}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-b-lg overflow-hidden">
          {trashLoading && trashItems.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-txt-tertiary mx-auto mb-2" />
              <p className="text-ui-sm text-txt-tertiary">
                Loading deleted items...
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <Trash2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-ui font-medium text-txt-secondary">
                No deleted items
              </p>
              <p className="text-muted text-txt-tertiary mt-1">
                Deleted{" "}
                {TRASH_TABS.find((t) => t.key === trashTab)?.label.toLowerCase()}{" "}
                will appear here for recovery.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th className="sheet-th w-[90px]">
                        <div className="flex items-center gap-1.5">
                          <Timer className="w-3 h-3" />
                          Del in
                        </div>
                      </th>
                      <th className="sheet-th">Identifier</th>
                      <th className="sheet-th">Details</th>
                      <th className="sheet-th w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          Deleted at
                        </div>
                      </th>
                      <th className="sheet-th w-[160px]">Deleted by</th>
                      <th className="sheet-th w-[120px] text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => {
                      const delIn = getDelInLabel(item.deleted_at);
                      return (
                        <tr
                          key={`${item.type}-${item.id}`}
                          className="sheet-row group"
                        >
                          <td className="sheet-cell">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${delIn.dot}`}
                              />
                              <span
                                className={`text-ui font-semibold tabular-nums ${delIn.color}`}
                              >
                                {delIn.label}
                              </span>
                            </div>
                          </td>
                          <td className="sheet-cell">
                            <span className="text-ui font-medium text-txt-primary">
                              {item.label}
                            </span>
                          </td>
                          <td className="sheet-cell">
                            <span className="text-ui text-txt-tertiary truncate">
                              {item.details || "—"}
                            </span>
                          </td>
                          <td className="sheet-cell">
                            <span className="text-ui text-txt-secondary">
                              {fmtDeletedAt(item.deleted_at)}
                            </span>
                          </td>
                          <td className="sheet-cell">
                            <span className="text-ui text-txt-secondary">
                              {item.deleted_by_name}
                            </span>
                          </td>
                          <td className="sheet-cell text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => handleRestore(item)}
                                disabled={restoringId === item.id}
                                className="flex items-center gap-1 px-2 py-1 text-meta font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded transition-colors cursor-pointer"
                                title="Restore"
                              >
                                {restoringId === item.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="w-3 h-3" />
                                )}
                                Restore
                              </button>
                              <button
                                onClick={() => setPermanentDeleteId(item.id)}
                                className="p-1 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                title="Delete permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                <span className="text-ui text-txt-tertiary">
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""} ·{" "}
                  {searchedItems.length} total
                  {trashSearch ? " matching" : " across all types"}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Retention Period Modal */}
        {showRetentionModal && (
          <div className="modal-overlay z-50 flex items-center justify-center p-4">
            <div className="modal-panel max-w-lg w-full">
              <h3 className="text-ui font-semibold text-txt-primary mb-1">
                Retention period
              </h3>
              <p className="text-ui-sm text-txt-tertiary mb-5">
                Select the period for which the data will be stored.
                <br />
                After the period expires, the data will be permanently deleted.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-5">
                <div>
                  <label className="text-meta text-txt-secondary mb-1.5 block">
                    Years
                  </label>
                  <select
                    value={retentionForm.years}
                    onChange={(e) =>
                      setRetentionForm({
                        ...retentionForm,
                        years: Number(e.target.value),
                        permanent: false,
                      })
                    }
                    className="form-input"
                    disabled={retentionForm.permanent}
                  >
                    {Array.from({ length: 11 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-meta text-txt-secondary mb-1.5 block">
                    Months
                  </label>
                  <select
                    value={retentionForm.months}
                    onChange={(e) =>
                      setRetentionForm({
                        ...retentionForm,
                        months: Number(e.target.value),
                        permanent: false,
                      })
                    }
                    className="form-input"
                    disabled={retentionForm.permanent}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-meta text-txt-secondary mb-1.5 block">
                    Days
                  </label>
                  <select
                    value={retentionForm.days}
                    onChange={(e) =>
                      setRetentionForm({
                        ...retentionForm,
                        days: Number(e.target.value),
                        permanent: false,
                      })
                    }
                    className="form-input"
                    disabled={retentionForm.permanent}
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2.5 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={retentionForm.permanent}
                  onChange={(e) =>
                    setRetentionForm({
                      ...retentionForm,
                      permanent: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 cursor-pointer"
                />
                <span className="text-ui text-txt-primary">
                  Retain content permanently
                </span>
              </label>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowRetentionModal(false)}
                  className="btn-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveRetentionSettings}
                  disabled={savingRetention}
                  className="btn-primary flex items-center gap-2 cursor-pointer"
                >
                  {savingRetention && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!permanentDeleteId}
        onClose={() => setPermanentDeleteId(null)}
        onConfirm={() => {
          const item = trashItems.find((t) => t.id === permanentDeleteId);
          if (item) handlePermanentDelete(item);
        }}
        title="Delete permanently"
        description="This item will be permanently removed and cannot be recovered. Are you sure?"
        confirmLabel="Delete forever"
        loading={permanentDeleting}
      />

      {/* Toast Messages */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-emerald-500 text-white px-4 py-2 rounded-md text-ui">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md text-ui">
          {errorMessage}
        </div>
      )}
    </>
  );
}
