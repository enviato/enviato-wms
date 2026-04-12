"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { adminDelete } from "@/lib/admin-delete";
import SearchableSelect from "@/components/SearchableSelect";
import { useTableColumnSizing } from "@/hooks/useTableColumnSizing";
import { useTableState } from "@/shared/hooks/useTableState";
import BatchBar from "@/shared/components/DataTable/BatchBar";
import type { ColumnDef } from "@/shared/types/common";
import ColumnHeaderMenu from "@/components/ColumnHeaderMenu";
import NotificationBell from "@/modules/notifications/components/NotificationBell";
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Plus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  User,
  Hash,
  Download,
  Upload,
  Truck,
  Tag,
  Layers,
  ExternalLink,
  Eye,
  EyeOff,
  Check,
  Calendar,
  SlidersHorizontal,
} from "lucide-react";

/* ───────── Types ───────── */
type AwbRow = {
  id: string;
  awb_number: string;
  freight_type: string;
  airline_or_vessel: string | null;
  origin: string | null;
  destination: string | null;
  status: string;
  total_pieces: number;
  total_weight: number | null;
  expected_pieces: number | null;
  received_pieces: number;
  departure_date: string | null;
  arrival_date: string | null;
  courier_group_id: string;
  created_at: string;
  courier_group?: { code: string; name: string; logo_url?: string | null } | null;
  /* computed from packages */
  customer_count?: number;
  package_count?: number;
  total_billable_weight?: number;
};

type SortField = "awb_number" | "freight_type" | "carrier" | "courier" | "pieces" | "weight" | "status" | "departure_date" | "customers" | "packages" | "billable_weight";

type FormData = {
  awb_number: string;
  freight_type: string;
  airline_or_vessel: string;
  origin: string;
  destination: string;
  total_pieces: string;
  total_weight: string;
  courier_group_id: string;
};

/* ───────── Constants ───────── */
const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  packing: { label: "Packing", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  shipped: { label: "Shipped", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "In Transit", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  arrived: { label: "Arrived", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  cleared: { label: "Cleared", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  delivered: { label: "Delivered", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "checkbox", label: "", icon: Package, width: 40, minWidth: 40, sortable: false, sticky: true, visible: true },
  { key: "awb_number", label: "Shipment #", icon: Hash, width: 180, minWidth: 130, sortable: true, visible: true },
  { key: "type", label: "Type", icon: Tag, width: 90, minWidth: 70, sortable: true, visible: true },
  { key: "carrier", label: "Carrier", icon: Truck, width: 150, minWidth: 100, sortable: true, editable: true, visible: true },
  { key: "courier", label: "Agent", icon: User, width: 160, minWidth: 110, sortable: true, visible: true },
  { key: "customers", label: "Customers", icon: User, width: 100, minWidth: 80, sortable: true, visible: true },
  { key: "packages", label: "Packages", icon: Package, width: 100, minWidth: 80, sortable: true, visible: true },
  { key: "billable_weight", label: "Billable Wt", icon: Layers, width: 110, minWidth: 90, sortable: true, visible: true },
  { key: "pieces", label: "Pieces", icon: Layers, width: 80, minWidth: 60, sortable: true, visible: false },
  { key: "weight", label: "Weight", icon: Layers, width: 100, minWidth: 80, sortable: true, visible: false },
  { key: "status", label: "Status", icon: Tag, width: 120, minWidth: 90, sortable: true, visible: true },
  { key: "ship_date", label: "Ship Date", icon: Calendar, width: 140, minWidth: 110, sortable: true, visible: true },
] satisfies ColumnDef[];

const filterTabs = [
  { id: "all", label: "All" },
  { id: "packing", label: "Packing" },
  { id: "in_transit", label: "In Transit" },
  { id: "delivered", label: "Delivered" },
];

/* ───────── Component ───────── */
export default function AwbsPage() {
  const supabase = createClient();
  const router = useRouter();

  /* Data state */
  const [awbs, setAwbs] = useState<AwbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courierGroups, setCourierGroups] = useState<{ id: string; name: string; code: string }[]>([]);
  const [agentsList, setAgentsList] = useState<{ id: string; name: string; company_name: string | null; agent_code: string | null }[]>([]);

  /* Filter state */
  const [statusTab, setStatusTab] = useState<"all" | "packing" | "in_transit" | "delivered">("all");
  const [openFilter, setOpenFilter] = useState<"status" | null>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  /* Table state — now managed by useTableState hook */
  const table = useTableState({
    defaultColumns: DEFAULT_COLUMNS,
    defaultSort: { field: "awb_number", direction: "asc" },
  });

  /* Modals */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    awb_number: "", freight_type: "air", airline_or_vessel: "", origin: "",
    destination: "", total_pieces: "", total_weight: "", courier_group_id: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  /* Batch actions */
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showAgentPopover, setShowAgentPopover] = useState(false);
  const [batchAgentValue, setBatchAgentValue] = useState("");
  const agentPopoverRef = useRef<HTMLDivElement>(null);

  /* Inline editing */
  const [savingCell, setSavingCell] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* View AWB modal */
  const [viewAwb, setViewAwb] = useState<AwbRow | null>(null);

  /* Columns dropdown ref */
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  /* Close status filter dropdown on outside click */
  useEffect(() => {
    if (!openFilter) return;
    const handler = (e: MouseEvent) => {
      if (statusFilterRef?.current && !statusFilterRef.current.contains(e.target as Node)) {
        setOpenFilter(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openFilter]);

  /* Close columns dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        table.setShowColumnsDropdown(false);
      }
    };
    if (table.showColumnsDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [table.showColumnsDropdown, table]);

  /* ───────── Data loading ───────── */
  useEffect(() => {
    async function loadData() {
      const { data: awbData, error: awbError } = await supabase
        .from("awbs")
        .select(`*, courier_group:courier_groups(code, name, logo_url)`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (awbError) {
        console.error("awbs query:", awbError.message);
        table.showError("Failed to load shipments");
      }

      /* Fetch package stats per AWB (customer count, package count, billable weight) */
      const { data: pkgData, error: pkgError } = await supabase
        .from("packages")
        .select("id, awb_id, customer_id, billable_weight")
        .is("deleted_at", null)
        .not("awb_id", "is", null);

      if (pkgError) {
        console.error("packages query:", pkgError.message);
      }

      if (awbData) {
        const statsMap: Record<string, { customer_count: number; package_count: number; total_billable_weight: number }> = {};
        if (pkgData) {
          for (const pkg of pkgData) {
            if (!pkg.awb_id) continue;
            if (!statsMap[pkg.awb_id]) statsMap[pkg.awb_id] = { customer_count: 0, package_count: 0, total_billable_weight: 0 };
            statsMap[pkg.awb_id].package_count += 1;
            statsMap[pkg.awb_id].total_billable_weight += Number(pkg.billable_weight || 0);
          }
          /* Count distinct customers per AWB */
          const customerSets: Record<string, Set<string>> = {};
          for (const pkg of pkgData) {
            if (!pkg.awb_id) continue;
            if (!customerSets[pkg.awb_id]) customerSets[pkg.awb_id] = new Set();
            if (pkg.customer_id) customerSets[pkg.awb_id].add(pkg.customer_id);
          }
          for (const [awbId, custSet] of Object.entries(customerSets)) {
            if (statsMap[awbId]) statsMap[awbId].customer_count = custSet.size;
          }
        }
        setAwbs(awbData.map((a) => ({
          ...a,
          customer_count: statsMap[a.id]?.customer_count ?? 0,
          package_count: statsMap[a.id]?.package_count ?? 0,
          total_billable_weight: statsMap[a.id]?.total_billable_weight ?? 0,
        })) as AwbRow[]);
      }

      const { data: grpData, error: grpError } = await supabase.from("courier_groups").select("id, name, code, logo_url").is("deleted_at", null);
      if (grpError) {
        console.error("courier_groups query:", grpError.message);
      }
      if (grpData) setCourierGroups(grpData as { id: string; name: string; code: string; logo_url?: string | null }[]);

      const { data: agentData, error: agentError } = await supabase.from("agents").select("id, name, company_name, agent_code").eq("status", "active").order("name");
      if (agentError) {
        console.error("agents query:", agentError.message);
      }
      if (agentData) setAgentsList(agentData as { id: string; name: string; company_name: string | null; agent_code: string | null }[]);

      setLoading(false);
    }
    loadData();
  }, []);

  /* ───────── Helpers ───────── */
  const showSuccess = (msg: string) => table.showSuccess(msg);

  /* Visible columns from table state */
  const visibleColumns = table.visibleColumns;

  /* Dynamic table sizing — fills container width + column resize */
  const { tableStyle, onResizeStart, isResizing } = useTableColumnSizing(scrollContainerRef, table.columns);

  /* ───────── Filtering / Sorting ───────── */
  useEffect(() => { table.setCurrentPage(1); }, [table.search, statusTab, table]);

  const filtered = awbs.filter((a) => {
    const q = table.search.toLowerCase();
    const matchesSearch = !q ||
      a.awb_number.toLowerCase().includes(q) ||
      a.airline_or_vessel?.toLowerCase().includes(q) ||
      a.destination?.toLowerCase().includes(q) ||
      a.courier_group?.name?.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusTab !== "all" && a.status !== statusTab) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const field = table.sort.field as SortField;
    let aV: string | number = "";
    let bV: string | number = "";
    if (field === "awb_number") {
      aV = a.awb_number.toLowerCase(); bV = b.awb_number.toLowerCase();
    } else if (field === "freight_type") {
      aV = a.freight_type; bV = b.freight_type;
    } else if (field === "carrier") {
      aV = a.airline_or_vessel?.toLowerCase() || ""; bV = b.airline_or_vessel?.toLowerCase() || "";
    } else if (field === "courier") {
      aV = a.courier_group?.name?.toLowerCase() || ""; bV = b.courier_group?.name?.toLowerCase() || "";
    } else if (field === "pieces") {
      aV = a.total_pieces; bV = b.total_pieces;
    } else if (field === "weight") {
      aV = a.total_weight ?? 0; bV = b.total_weight ?? 0;
    } else if (field === "status") {
      aV = a.status; bV = b.status;
    } else if (field === "departure_date") {
      aV = a.departure_date ? new Date(a.departure_date).getTime() : 0;
      bV = b.departure_date ? new Date(b.departure_date).getTime() : 0;
    } else if (field === "customers") {
      aV = a.customer_count ?? 0; bV = b.customer_count ?? 0;
    } else if (field === "packages") {
      aV = a.package_count ?? 0; bV = b.package_count ?? 0;
    } else if (field === "billable_weight") {
      aV = a.total_billable_weight ?? 0; bV = b.total_billable_weight ?? 0;
    }
    if (aV < bV) return table.sort.direction === "asc" ? -1 : 1;
    if (aV > bV) return table.sort.direction === "asc" ? 1 : -1;
    return 0;
  });

  /* Update total items in table state */
  useEffect(() => {
    table.setTotalItems(sorted.length);
  }, [sorted.length, table]);

  const paginatedData = sorted.slice((table.currentPage - 1) * table.pageSize, table.currentPage * table.pageSize);
  const startItem = sorted.length === 0 ? 0 : (table.currentPage - 1) * table.pageSize + 1;
  const endItem = Math.min(table.currentPage * table.pageSize, sorted.length);

  /* ───────── Batch Handlers ───────── */
  const closeAllPopovers = () => {
    setShowAgentPopover(false);
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const ids = Array.from(table.selectedIds);
      const { deleted, failed } = await adminDelete("awbs", ids);
      if (deleted.length > 0) {
        const deletedSet = new Set(deleted);
        setAwbs((prev) => prev.filter((a) => !deletedSet.has(a.id)));
      }
      if (failed.length > 0) {
        table.showSuccess(`${failed.length} failed: ${failed[0].message}`);
      } else {
        table.showSuccess(`${ids.length} shipment${ids.length > 1 ? "s" : ""} deleted`);
      }
      table.clearSelection();
      setShowBatchDeleteModal(false);
    } catch (err) {
      table.showSuccess(err instanceof Error ? err.message : "Delete failed");
    } finally { setBatchDeleting(false); }
  };

  const handleBatchUpdateAgent = async () => {
    if (!batchAgentValue) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("awbs").update({ agent_id: batchAgentValue }).eq("id", id)));
      setAwbs((prev) => prev.map((a) => table.selectedIds.has(a.id) ? { ...a, agent_id: batchAgentValue } : a));
      table.clearSelection();
      setShowAgentPopover(false);
      setBatchAgentValue("");
      table.showSuccess(`${ids.length} shipment${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  /* ───────── Validate form ───────── */
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.awb_number.trim()) errors.awb_number = "Shipment number is required";
    if (!formData.freight_type.trim()) errors.freight_type = "Freight Type is required";
    if (!formData.origin.trim()) errors.origin = "Origin is required";
    if (!formData.destination.trim()) errors.destination = "Destination is required";
    if (!formData.courier_group_id.trim()) errors.courier_group_id = "Courier Group is required";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ───────── Create ───────── */
  const handleCreateAwb = async () => {
    if (!validateForm()) return;
    setCreating(true);
    try {
      // Fetch org_id for the current organization
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) { console.error("No organization found"); return; }

      const newAwb = {
        org_id: orgRow.id,
        awb_number: formData.awb_number,
        freight_type: formData.freight_type,
        airline_or_vessel: formData.airline_or_vessel || null,
        origin: formData.origin || null,
        destination: formData.destination || null,
        total_pieces: formData.total_pieces ? parseInt(formData.total_pieces) : 0,
        total_weight: formData.total_weight ? parseFloat(formData.total_weight) : null,
        courier_group_id: formData.courier_group_id,
        status: "packing",
      };
      const { data: result, error } = await supabase
        .from("awbs").insert([newAwb])
        .select(`*, courier_group:courier_groups(code, name, logo_url)`)
        .single();
      if (error) {
        console.error("Error creating shipment:", error);
        return;
      }
      if (result) {
        setAwbs((prev) => [result as AwbRow, ...prev]);
        setShowCreateModal(false);
        setFormData({ awb_number: "", freight_type: "air", airline_or_vessel: "", origin: "", destination: "", total_pieces: "", total_weight: "", courier_group_id: "" });
        setFormErrors({});
        table.setCurrentPage(1);
        table.showSuccess("Shipment created");
      }
    } finally { setCreating(false); }
  };

  /* ───────── Inline Edit ───────── */
  const startEditing = (rowId: string, colKey: string, currentValue: string) => {
    table.startEdit(rowId, colKey, currentValue);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEdit = async () => {
    if (!table.editingCell) return;
    setSavingCell(true);
    try {
      const { rowId, colKey } = table.editingCell;
      let updatePayload: Record<string, unknown> = {};

      if (colKey === "carrier") updatePayload = { airline_or_vessel: table.editValue };

      const { error } = await supabase.from("awbs").update(updatePayload).eq("id", rowId);
      if (!error) {
        setAwbs((prev) => prev.map((a) => {
          if (a.id !== rowId) return a;
          if (colKey === "carrier") return { ...a, airline_or_vessel: table.editValue };
          return a;
        }));
        table.showSuccess("Updated");
      }
    } finally {
      setSavingCell(false);
      table.cancelEdit();
    }
  };

  const cancelEdit = () => table.cancelEdit();

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") cancelEdit();
  };

  /* ───────── Column Reorder (drag + dropdown menu) ───────── */
  const moveColumn = (fromVisibleIdx: number, toVisibleIdx: number) => {
    const draggedKey = visibleColumns[fromVisibleIdx].key;
    const targetKey = visibleColumns[toVisibleIdx].key;
    const fullDragIdx = table.columns.findIndex((c) => c.key === draggedKey);
    const fullTargetIdx = table.columns.findIndex((c) => c.key === targetKey);
    table.moveColumn(fullDragIdx, fullTargetIdx);
  };

  const handleDragStart = (idx: number) => {
    if (visibleColumns[idx].sticky || isResizing) return;
    table.setDragColIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (visibleColumns[idx].sticky || isResizing) return;
    table.setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (table.dragColIdx === null || visibleColumns[idx].sticky || isResizing) return;
    table.moveColumn(table.dragColIdx, idx);
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };

  /* ───────── Render cell content ───────── */
  const renderCell = (awb: AwbRow, col: ColumnDef) => {
    const isEditing = table.editingCell?.rowId === awb.id && table.editingCell?.colKey === col.key;

    switch (col.key) {
      case "checkbox":
        return (
          <button
            role="checkbox"
            aria-checked={table.selectedIds.has(awb.id)}
            data-checked={table.selectedIds.has(awb.id)}
            onClick={(e) => { e.stopPropagation(); table.toggleSelect(awb.id); }}
            className="sheet-checkbox"
          >
            {table.selectedIds.has(awb.id) && <Check size={12} />}
          </button>
        );

      case "awb_number":
        return (
          <>
            <span className="font-mono text-ui sheet-cell-content">{awb.awb_number}</span>
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/admin/awbs/${awb.id}`); }}
              className="row-open-btn"
            >
              <Eye size={14} />
              Open
            </button>
          </>
        );

      case "type":
        return <span className="text-ui" style={{ fontWeight: 400 }}>{awb.freight_type === "ocean" ? "Ocean" : "Air"}</span>;

      case "carrier":
        if (isEditing) {
          return (
            <input
              ref={editInputRef}
              type="text"
              value={table.editValue}
              onChange={(e) => table.setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={saveEdit}
              className="w-full bg-white border border-primary rounded px-1.5 py-0.5 text-ui focus:outline-none focus:ring-1 focus:ring-primary" style={{ fontWeight: 400 }}
            />
          );
        }
        return (
          <span
            onClick={() => startEditing(awb.id, "carrier", awb.airline_or_vessel || "")}
            className="cursor-text hover:bg-sky-50 px-1 -mx-1 py-0.5 rounded transition-colors text-ui block" style={{ fontWeight: 400 }}
          >
            {awb.airline_or_vessel || "—"}
          </span>
        );

      case "courier":
        return awb.courier_group ? (
          <span className="courier-badge inline-flex items-center gap-1.5">
            {awb.courier_group.logo_url && (
              <img src={awb.courier_group.logo_url} alt="" className="w-4 h-4 rounded object-contain" />
            )}
            {awb.courier_group.name}
          </span>
        ) : (
          <span className="text-txt-placeholder">—</span>
        );

      case "customers":
        return <span className="text-ui">{awb.customer_count ?? 0}</span>;

      case "packages":
        return <span className="text-ui">{awb.package_count ?? 0}</span>;

      case "billable_weight":
        return <span className="text-ui" style={{ fontWeight: 400 }}>{(awb.total_billable_weight ?? 0) > 0 ? `${Number(awb.total_billable_weight).toFixed(1)} lbs` : "—"}</span>;

      case "pieces":
        return <span className="text-ui" style={{ fontWeight: 400 }}>{awb.total_pieces}</span>;

      case "weight":
        return <span className="text-ui" style={{ fontWeight: 400 }}>{awb.total_weight ? `${awb.total_weight} lbs` : "—"}</span>;

      case "status": {
        const sc = statusConfig[awb.status];
        return (
          <span className={`status-badge ${sc?.bg} ${sc?.text}`}>
            <span className={`status-dot ${sc?.dot}`} />
            {sc?.label || awb.status}
          </span>
        );
      }

      case "ship_date":
        return (
          <span className="text-ui" style={{ fontWeight: 400 }}>
            {awb.departure_date
              ? new Date(awb.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—"}
          </span>
        );

      default:
        return null;
    }
  };


  /* ───────── Compute sticky left offsets ───────── */
  const getStickyLeft = (col: ColumnDef, idx: number): number | undefined => {
    if (!col.sticky) return undefined;
    let left = 0;
    for (let i = 0; i < idx; i++) {
      if (visibleColumns[i].sticky) left += visibleColumns[i].width;
    }
    return left;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sticky Top Bar */}

      {/* Success Toast */}
      {table.successMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui shadow-sm">
          <CheckCircle2 size={16} />
          {table.successMessage}
        </div>
      )}

      {/* Create AWB Modal */}
      {showCreateModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add Shipment</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Shipment # (AWB / BOL)</label>
                <input type="text" value={formData.awb_number} onChange={(e) => setFormData({ ...formData, awb_number: e.target.value })} placeholder="Enter shipment number" className={`form-input ${formErrors.awb_number ? "border-red-500" : ""}`} />
                {formErrors.awb_number && <p className="text-meta text-red-500 mt-1">{formErrors.awb_number}</p>}
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Freight Type</label>
                <SearchableSelect
                  value={formData.freight_type}
                  onChange={(v) => setFormData({ ...formData, freight_type: v })}
                  searchable={false}
                  options={[{ value: "air", label: "Air" }, { value: "ocean", label: "Ocean" }]}
                />
                {formErrors.freight_type && <p className="text-meta text-red-500 mt-1">{formErrors.freight_type}</p>}
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Carrier (Airline / Vessel)</label>
                <input type="text" value={formData.airline_or_vessel} onChange={(e) => setFormData({ ...formData, airline_or_vessel: e.target.value })} placeholder="Enter carrier name" className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Origin</label>
                <input type="text" value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="Enter origin location" className={`form-input ${formErrors.origin ? "border-red-500" : ""}`} />
                {formErrors.origin && <p className="text-meta text-red-500 mt-1">{formErrors.origin}</p>}
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Destination</label>
                <input type="text" value={formData.destination} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="Enter destination location" className={`form-input ${formErrors.destination ? "border-red-500" : ""}`} />
                {formErrors.destination && <p className="text-meta text-red-500 mt-1">{formErrors.destination}</p>}
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Courier Group</label>
                <SearchableSelect
                  value={formData.courier_group_id}
                  onChange={(v) => setFormData({ ...formData, courier_group_id: v })}
                  placeholder="Select a courier group"
                  searchPlaceholder="Search groups…"
                  options={courierGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
                />
                {formErrors.courier_group_id && <p className="text-meta text-red-500 mt-1">{formErrors.courier_group_id}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Pieces</label>
                  <input type="number" value={formData.total_pieces} onChange={(e) => setFormData({ ...formData, total_pieces: e.target.value })} placeholder="0" className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Weight (lbs)</label>
                  <input type="number" value={formData.total_weight} onChange={(e) => setFormData({ ...formData, total_weight: e.target.value })} placeholder="0.00" className="form-input" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleCreateAwb} disabled={creating || !formData.awb_number || !formData.courier_group_id} className="btn-primary flex items-center gap-2 cursor-pointer">
                {creating && <Loader2 size={14} className="animate-spin" />}
                Add Shipment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View AWB Modal */}
      {viewAwb && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Shipment Details</h3>
              <button onClick={() => setViewAwb(null)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Shipment #</p><p className="font-mono font-semibold text-ui-sm text-txt-primary">{viewAwb.awb_number}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Type</p><p className="text-ui-sm text-txt-primary capitalize">{viewAwb.freight_type}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Carrier</p><p className="text-ui-sm text-txt-primary">{viewAwb.airline_or_vessel || "—"}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Courier</p><p className="text-ui-sm text-txt-primary">{viewAwb.courier_group?.name || "—"}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Origin</p><p className="text-ui-sm text-txt-primary">{viewAwb.origin || "—"}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Destination</p><p className="text-ui-sm text-txt-primary">{viewAwb.destination || "—"}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Pieces</p><p className="text-ui-sm text-txt-primary">{viewAwb.total_pieces}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Weight</p><p className="text-ui-sm text-txt-primary">{viewAwb.total_weight ? `${viewAwb.total_weight} lbs` : "—"}</p></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Status</p><div className={`status-badge ${statusConfig[viewAwb.status]?.bg} ${statusConfig[viewAwb.status]?.text} w-fit`}><span className={`status-dot ${statusConfig[viewAwb.status]?.dot}`} />{statusConfig[viewAwb.status]?.label || viewAwb.status}</div></div>
              <div><p className="text-meta text-txt-tertiary tracking-tight mb-1">Ship Date</p><p className="text-ui-sm text-txt-primary">{viewAwb.departure_date ? new Date(viewAwb.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Main Content ════════ */}
      {/* ════════ Header ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Shipments</h2>
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
            <input
              type="text"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search shipments, AWB numbers, or carriers..."
              className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => setShowCreateModal(true)} className="btn-primary cursor-pointer">
            <Plus size={16} strokeWidth={2.5} />
            Create Shipment
          </button>
        </div>
      </header>

      {/* ════════ Filter Bar ════════ */}
      <div className="bg-white border-b border-border px-6 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        {/* Columns toggle */}
        <div className="relative" ref={columnsDropdownRef}>
          <button onClick={() => table.setShowColumnsDropdown(!table.showColumnsDropdown)}
            className="h-8 w-8 flex items-center justify-center bg-white border border-[#e2e8f0] rounded-lg hover:bg-[#f1f5f9] transition-colors cursor-pointer"
            title="Columns">
            <SlidersHorizontal size={14} className="text-[#334155]" />
          </button>
          {table.showColumnsDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 z-[1000] w-52">
              <div className="px-3 py-2 text-meta text-txt-tertiary uppercase tracking-wider border-b border-border">Toggle Columns</div>
              {table.columns.filter((c) => !c.sticky).map((col) => (
                <button key={col.key} onClick={() => table.toggleColumnVisibility(col.key)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-ui text-txt-primary hover:bg-surface-hover transition-colors cursor-pointer">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${col.visible ? "bg-primary border-primary" : "border-border bg-white"}`}>
                    {col.visible && <Check size={10} className="text-white" />}
                  </div>
                  {col.icon && <col.icon size={13} className="text-txt-tertiary shrink-0" />}
                  <span>{col.label || col.key}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status filter pill */}
        <div ref={statusFilterRef} className="relative">
          <button onClick={() => setOpenFilter(openFilter === "status" ? null : "status")}
            className={`filter-pill${statusTab !== "all" ? " active" : ""}${openFilter === "status" ? " open" : ""}`}>
            <Tag size={13} />
            <span>Status: {statusTab === "all" ? "All" : statusTab === "packing" ? "Packing" : statusTab === "in_transit" ? "In Transit" : "Delivered"}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "status" && (
            <div className="filter-dropdown">
              {([
                { value: "all", label: "All" },
                { value: "packing", label: "Packing" },
                { value: "in_transit", label: "In Transit" },
                { value: "delivered", label: "Delivered" },
              ] as Array<{ value: typeof statusTab; label: string }>).map((opt) => (
                <button key={opt.value} onClick={() => { setStatusTab(opt.value); setOpenFilter(null); }}
                  className={`filter-dropdown-item${statusTab === opt.value ? " selected" : ""}`}>
                  <span>{opt.label}</span>
                  <Check size={14} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>

        {statusTab !== "all" && (
          <button onClick={() => setStatusTab("all")} className="text-meta text-primary hover:text-primary/80 transition-colors cursor-pointer">
            Clear All
          </button>
        )}
      </div>

      <div className="px-4 py-4 flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* ════════ Spreadsheet Table Container ════════ */}
        <div className="flex-1 flex flex-col min-h-0 sheet-table-wrap">
          {/* Scrollable table — ONLY this scrolls horizontally */}
          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
            <table
              className="sheet-table"
              style={tableStyle}
            >
              <thead className="sheet-thead">
                <tr>
                  {visibleColumns.map((col, idx) => {
                    const stickyLeft = getStickyLeft(col, idx);
                    const isDragOver = table.dragOverIdx === idx && table.dragColIdx !== idx;
                    const firstMovable = visibleColumns.findIndex((c) => !c.sticky);
                    const lastMovable = visibleColumns.length - 1;
                    return (
                      <th
                        key={col.key}
                        style={{
                          width: `var(--col-${col.key}-size)`,
                          position: col.sticky ? "sticky" : undefined,
                          left: stickyLeft,
                          zIndex: col.sticky ? 12 : 10,
                          borderLeft: isDragOver ? "2px solid var(--color-primary)" : undefined,
                        }}
                        draggable={!col.sticky && !isResizing}
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        className={`
                          sheet-th
                          ${col.key === "checkbox" ? "sheet-checkbox-cell" : ""}
                          ${col.sortable ? "sortable" : ""}
                          ${table.dragColIdx === idx ? "opacity-40" : ""}
                        `}
                      >
                        {col.key === "checkbox" ? (
                          <button
                            role="checkbox"
                            aria-checked={table.isAllSelected(paginatedData.map((a) => a.id))}
                            data-checked={table.isAllSelected(paginatedData.map((a) => a.id))}
                            onClick={() => table.toggleSelectAll(paginatedData.map((a) => a.id))}
                            className="sheet-checkbox"
                          >
                            {table.isAllSelected(paginatedData.map((a) => a.id)) && <Check size={12} />}
                          </button>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              {col.icon && <col.icon size={11} className="text-[#9ca3af] shrink-0" />}
                              <span>{col.label}</span>
                            </div>
                            <ColumnHeaderMenu
                              colKey={col.key}
                              sortable={col.sortable}
                              sortField={col.key as SortField}
                              currentSortField={table.sort.field as SortField}
                              currentSortDir={table.sort.direction}
                              onSort={(f) => table.handleSort(f)}
                              canMoveLeft={idx > firstMovable}
                              canMoveRight={idx < lastMovable}
                              onMoveLeft={() => moveColumn(idx, idx - 1)}
                              onMoveRight={() => moveColumn(idx, idx + 1)}
                              onHide={() => table.toggleColumnVisibility(col.key)}
                            />
                          </>
                        )}
                        {/* Separator + resize handle */}
                        {idx < visibleColumns.length - 1 && (
                          <>
                            <span className="sheet-th-sep" />
                            {col.key !== "checkbox" && (
                              <div
                                className="sheet-resize-handle"
                                onMouseDown={(e) => onResizeStart(col.key, e)}
                                onTouchStart={(e) => onResizeStart(col.key, e)}
                              />
                            )}
                          </>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, idx) => (
                    <tr key={`skel-${idx}`}>
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className="sheet-cell"
                          style={{ width: `var(--col-${col.key}-size)` }}
                        >
                          <div className="skeleton-pulse h-4 rounded" style={{ width: col.key === "checkbox" ? 16 : "70%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <Package size={24} className="empty-state-icon" />
                        <p className="empty-state-title">{table.search ? "No shipments match your search" : "No shipments yet"}</p>
                        <p className="empty-state-desc">
                          {table.search ? "Try adjusting your search term" : "Click \"Create Shipment\" to add one"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((awb) => (
                    <tr key={awb.id} className="sheet-row cursor-pointer" onClick={() => router.push(`/admin/awbs/${awb.id}`)}>
                      {visibleColumns.map((col, idx) => {
                        const stickyLeft = getStickyLeft(col, idx);
                        return (
                          <td
                            key={col.key}
                            style={{
                              width: `var(--col-${col.key}-size)`,
                              position: col.sticky ? "sticky" : undefined,
                              left: stickyLeft,
                              zIndex: col.sticky ? 1 : undefined,
                            }}
                            className={`
                              sheet-cell
                              ${col.sticky ? "bg-white" : ""}
                              ${col.key === "checkbox" ? "sheet-checkbox-cell" : ""}
                            `}
                          >
                            {renderCell(awb, col)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer — always visible at bottom */}
          <div className="sheet-pagination">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#6b7280]">Show</span>
              <div className="w-[72px]">
                <SearchableSelect
                  options={[{ value: "50", label: "50" }, { value: "100", label: "100" }, { value: "200", label: "200" }]}
                  value={String(table.pageSize)}
                  onChange={(v) => { table.setCurrentPage(1); }}
                  searchable={false}
                />
              </div>
            </div>

            <span className="text-[#6b7280]">
              Item {startItem} to {endItem}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[#374151]">{table.currentPage}/{table.totalPages || 1}</span>
              <button
                onClick={() => table.setCurrentPage(Math.max(1, table.currentPage - 1))}
                disabled={table.currentPage <= 1}
                className="p-1 border border-[#e5e7eb] rounded text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-40 cursor-pointer transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => table.setCurrentPage(Math.min(table.totalPages, table.currentPage + 1))}
                disabled={table.currentPage >= table.totalPages}
                className="p-1 border border-[#e5e7eb] rounded text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-40 cursor-pointer transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Popover Backdrop ═══ */}
      {showAgentPopover && (
        <div className="popover-backdrop" onClick={() => closeAllPopovers()} />
      )}

      {/* ═══ Floating Batch Action Bar ═══ */}
      <BatchBar
        selectedCount={table.selectedIds.size}
        onClear={() => table.clearSelection()}
      >
        <button onClick={() => { closeAllPopovers(); setShowAgentPopover(true); setBatchAgentValue(""); }} className={`batch-bar-btn ${showAgentPopover ? "active" : ""}`}>
          <User size={16} />
          Agent
        </button>
        <button onClick={() => setShowBatchDeleteModal(true)} className="batch-bar-btn danger">
          <Trash2 size={16} />
          Delete
        </button>
      </BatchBar>

      {/* ═══ Agent Popover ═══ */}
      {showAgentPopover && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Assign agent to {table.selectedIds.size} shipment{table.selectedIds.size > 1 ? "s" : ""}</h3>
            <button onClick={() => setShowAgentPopover(false)} className="batch-popover-close">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="batch-popover-label">Agent</label>
              <SearchableSelect value={batchAgentValue} onChange={(v) => setBatchAgentValue(v)} placeholder="Select agent" searchPlaceholder="Search agents…" options={agentsList.map((a) => ({ value: a.id, label: a.agent_code ? `${a.agent_code} — ${a.company_name || a.name}` : a.company_name || a.name }))} />
            </div>
            <div className="batch-popover-actions">
              <button onClick={handleBatchUpdateAgent} disabled={!batchAgentValue || batchUpdating} className="batch-popover-apply cursor-pointer">
                {batchUpdating && <Loader2 size={14} className="animate-spin" />}
                Apply Changes
              </button>
              <button onClick={() => setShowAgentPopover(false)} className="batch-popover-cancel cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Batch Delete Modal ═══ */}
      {showBatchDeleteModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-brand-red" />
              </div>
              <div className="flex-1">
                <h3 className="text-ui font-semibold text-txt-primary">Delete {table.selectedIds.size} shipment{table.selectedIds.size > 1 ? "s" : ""}</h3>
                <p className="text-muted text-txt-secondary mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBatchDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleBatchDelete} disabled={batchDeleting} className="btn-primary bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-2 cursor-pointer">
                {batchDeleting && <Loader2 size={14} className="animate-spin" />}
                Delete {table.selectedIds.size} shipment{table.selectedIds.size > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
