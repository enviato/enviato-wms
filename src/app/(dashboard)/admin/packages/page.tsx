"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { adminDelete } from "@/lib/admin-delete";
import { logger } from "@/shared/lib/logger";
import { reassignAgent } from "@/shared/lib/api";
import SearchableSelect from "@/components/SearchableSelect";
import { useTableColumnSizing } from "@/hooks/useTableColumnSizing";
import { useTableState } from "@/shared/hooks/useTableState";
import {
  useCustomers,
  useCourierGroups,
  useAgents,
  usePackageStatuses,
  useTags,
} from "@/shared/hooks/queries";
import BatchBar from "@/shared/components/DataTable/BatchBar";
import type { ColumnDef } from "@/shared/types/common";
import ColumnHeaderMenu from "@/components/ColumnHeaderMenu";
import CellDropdown from "@/components/CellDropdown";
import NotificationBell from "@/modules/notifications/components/NotificationBell";
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Trash2,
  Plus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  Image as ImageIcon,
  User,
  Hash,
  Download,
  Upload,
  Truck,
  Tag,
  Layers,
  Camera,
  Eye,
  EyeOff,
  Check,
  Edit3,
  Ship,
  Plane,
  LogOut,
  Calendar,
  Columns,
  Building2,
  SlidersHorizontal,
} from "lucide-react";

/* ───────── Types ───────── */
type PackageRow = {
  id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  weight: number | null;
  weight_unit: string;
  package_type: string;
  checked_in_at: string;
  customer_id: string | null;
  courier_group_id: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  notes?: string | null;
  condition_tags?: string[] | null;
  customer?: { id: string; first_name: string; last_name: string; agent_id: string | null; deleted_at?: string | null; agent?: { id: string; name: string; company_name: string | null; agent_code: string | null } | null } | null;
  courier_group?: { code: string; name: string; logo_url?: string | null } | null;
  photos?: Array<{ id: string; storage_url: string; photo_type: string; sort_order: number }>;
};

type AgentItem = { id: string; name: string; company_name: string | null; agent_code: string | null };
type Customer = { id: string; first_name: string; last_name: string; agent_id: string | null };
type CourierGroup = { id: string; code: string; name: string; logo_url?: string | null };
type PackageStatus = { id: string; name: string; slug: string; color: string; sort_order: number };
type TagItem = { id: string; name: string; color: string };
type AwbRow = { id: string; awb_number: string; freight_type: string; status: string; courier_group_id: string };

type SortField = "customer_name" | "tracking_number" | "checked_in_at" | "weight" | "carrier" | "status";

type FormData = {
  tracking_number: string;
  carrier: string;
  customer_id: string;
  weight: string;
  weight_unit: string;
  package_type: string;
  length: string;
  width: string;
  height: string;
  notes: string;
};

/* ───────── Constants ───────── */
/* fallback statusConfig for when DB statuses haven't loaded yet */
const fallbackStatusConfig: Record<string, { label: string; color: string }> = {
  checked_in: { label: "Checked In", color: "#10b981" },
  assigned_to_awb: { label: "Assigned", color: "#3b82f6" },
  in_transit: { label: "In Transit", color: "#f59e0b" },
  received_at_dest: { label: "Received", color: "#8b5cf6" },
  delivered: { label: "Delivered", color: "#94a3b8" },
  returned: { label: "Returned", color: "#f43f5e" },
  lost: { label: "Lost", color: "#ef4444" },
};

const SHIPPED_STATUSES = ["assigned_to_awb", "in_transit", "received_at_dest", "delivered"];

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "checkbox", label: "", icon: Package, width: 48, minWidth: 48, sortable: false, sticky: true, visible: true },
  { key: "photo", label: "", icon: Camera, width: 56, minWidth: 56, sortable: false, sticky: true, visible: true },
  { key: "recipient", label: "Recipient", icon: User, width: 180, minWidth: 120, sortable: true, sortField: "customer_name", visible: true },
  { key: "identifier", label: "Package ID", icon: Package, width: 140, minWidth: 100, sortable: false, visible: true },
  { key: "tracking", label: "Tracking Number", icon: Hash, width: 200, minWidth: 140, sortable: true, sortField: "tracking_number", editable: true, visible: true },
  { key: "checked_in", label: "Checked-in", icon: Download, width: 170, minWidth: 130, sortable: true, sortField: "checked_in_at", visible: true },
  { key: "carrier", label: "Carrier", icon: Truck, width: 120, minWidth: 80, sortable: true, sortField: "carrier", editable: true, visible: true },
  { key: "agent", label: "Agent", icon: User, width: 120, minWidth: 80, sortable: false, visible: true },
  { key: "status", label: "Status", icon: Tag, width: 130, minWidth: 100, sortable: true, sortField: "status", visible: true },
  { key: "weight", label: "Weight", icon: Layers, width: 100, minWidth: 80, sortable: true, sortField: "weight", editable: true, visible: true },
  { key: "quantity", label: "Qty", icon: Layers, width: 60, minWidth: 50, sortable: false, visible: true },
] satisfies ColumnDef[];

/* ───────── Component ───────── */
export default function PackagesPage() {
  const router = useRouter();
  const supabase = createClient();

  /* Data state */
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverTotal, setServerTotal] = useState(0);

  /* Reference data — cached across pages via React Query.
     First nav to any page using these hooks fetches; subsequent
     nav within staleTime reads from cache (no network hit). */
  const { data: customersRaw = [] } = useCustomers();
  const { data: courierGroupsRaw = [] } = useCourierGroups();
  const { data: agentsListRaw = [] } = useAgents();
  const { data: packageStatusesRaw = [] } = usePackageStatuses();
  const customers = customersRaw as unknown as Customer[];
  const courierGroups = courierGroupsRaw as unknown as CourierGroup[];
  const agentsList = agentsListRaw as unknown as AgentItem[];
  const packageStatuses = packageStatusesRaw as unknown as PackageStatus[];

  /* Filter state */
  const [statusTab, setStatusTab] = useState<"all" | "in_warehouse" | "shipped">("all");
  const [courierFilter, setCourierFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [datePreset, setDatePreset] = useState<"yesterday" | "today" | "last_week" | "this_week" | "this_month" | "last_month" | "this_year" | "last_year" | "all" | "custom">("all");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [rangeAnchor, setRangeAnchor] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");

  /* Table state — now managed by useTableState hook */
  const table = useTableState({
    defaultColumns: DEFAULT_COLUMNS,
    defaultSort: { field: "checked_in_at", direction: "desc" },
  });

  /* Modals */
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    tracking_number: "", carrier: "UPS", customer_id: "",
    weight: "", weight_unit: "lb", package_type: "box", length: "", width: "", height: "", notes: "",
  });

  /* Inline editing (local state for unsaved changes) */
  const [savingCell, setSavingCell] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* Dropdown editing (agent & status) */
  const [dropdownCell, setDropdownCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [cellAnchorEl, setCellAnchorEl] = useState<HTMLElement | null>(null);

  /* Image preview */
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  /* Batch action modals */
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showBatchStatusModal, setShowBatchStatusModal] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState("");
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const { data: tagsRaw = [] } = useTags();
  const tags = tagsRaw as unknown as TagItem[];
  const [batchTagIds, setBatchTagIds] = useState<Set<string>>(new Set());
  const [showEditPopover, setShowEditPopover] = useState(false);
  const [batchEditField, setBatchEditField] = useState<"carrier" | "agent" | "weight">("carrier");
  const [batchEditValue, setBatchEditValue] = useState("");
  const editPopoverRef = useRef<HTMLDivElement>(null);
  const [showAssignShipmentModal, setShowAssignShipmentModal] = useState(false);
  const [openShipments, setOpenShipments] = useState<AwbRow[]>([]);
  const [assignStep, setAssignStep] = useState<"select" | "create">("select");
  const [newShipmentType, setNewShipmentType] = useState<"air" | "ocean">("air");
  const [newShipmentNumber, setNewShipmentNumber] = useState("");
  const [assigningShipment, setAssigningShipment] = useState(false);

  /* Filter pill dropdowns */
  const [openFilter, setOpenFilter] = useState<"status" | "courier" | "date" | "warehouse" | null>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const courierFilterRef = useRef<HTMLDivElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const warehouseFilterRef = useRef<HTMLDivElement>(null);

  /* Columns dropdown ref */
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  /* Close filter dropdowns on outside click */
  useEffect(() => {
    if (!openFilter) return;
    const handler = (e: MouseEvent) => {
      const refs = { status: statusFilterRef, courier: courierFilterRef, date: dateFilterRef, warehouse: warehouseFilterRef };
      const activeRef = refs[openFilter as keyof typeof refs];
      if (activeRef?.current && !activeRef.current.contains(e.target as Node)) {
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

  /* Close edit popover on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editPopoverRef.current && !editPopoverRef.current.contains(e.target as Node)) {
        setShowEditPopover(false);
      }
    };
    if (showEditPopover) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEditPopover]);

  /* Close agent/status dropdown on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownCell(null);
        setDropdownSearch("");
      }
    };
    if (dropdownCell) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownCell]);

  /* ───────── Data loading ─────────
   * Reference data (customers, courier_groups, agents, statuses, tags)
   * is now fetched via React Query hooks above. Only the main packages
   * query remains here — it's page-specific and gets invalidated by
   * user mutations rather than being a cache-friendly taxonomy fetch.
   */
  useEffect(() => {
    async function loadData() {
      const { data: pkgData, count: pkgCount, error: pkgError } = await supabase
        .from("packages")
        .select(`*, customer:users!packages_customer_id_fkey(id, first_name, last_name, agent_id, deleted_at, agent:agents(id, name, company_name, agent_code)), courier_group:courier_groups(code, name, logo_url), photos:package_photos(id, storage_url, photo_type, sort_order)`, { count: "exact", head: false })
        .is("deleted_at", null)
        .order("checked_in_at", { ascending: false })
        .range(0, 999);
      if (pkgError) { table.showError("Failed to load packages"); logger.error("packages query", pkgError); }
      if (pkgData) {
        setPackages(pkgData as PackageRow[]);
        if (pkgCount != null) setServerTotal(pkgCount);
      }

      setLoading(false);
    }
    loadData();
  }, []);

  /* ───────── Helpers ───────── */
  const showSuccess = (msg: string) => table.showSuccess(msg);
  const showError = (msg: string) => table.showError(msg);

  /* Visible columns from table state */
  const visibleColumns = table.visibleColumns;

  /* Dynamic table sizing — fills container width + column resize */
  const { tableStyle, onResizeStart, isResizing } = useTableColumnSizing(scrollContainerRef, table.columns);

  /* ───────── Filtering / Sorting ───────── */
  useEffect(() => { table.setCurrentPage(1); }, [table.search, statusTab, courierFilter, dateRange, warehouseFilter, table]);

  const filtered = packages.filter((p) => {
    const q = table.search.toLowerCase();
    const matchesSearch = !q ||
      p.tracking_number.toLowerCase().includes(q) ||
      p.carrier?.toLowerCase().includes(q) ||
      (p.customer && `${p.customer.first_name} ${p.customer.last_name}`.toLowerCase().includes(q)) ||
      p.id.substring(0, 8).toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusTab === "in_warehouse" && p.status !== "checked_in") return false;
    if (statusTab === "shipped" && !SHIPPED_STATUSES.includes(p.status)) return false;
    if (courierFilter !== "all" && p.carrier?.toLowerCase() !== courierFilter.toLowerCase()) return false;
    if (dateRange.from || dateRange.to) {
      const checkedIn = new Date(p.checked_in_at);
      if (dateRange.from && checkedIn < dateRange.from) return false;
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (checkedIn > endOfDay) return false;
      }
    }
    /* Warehouse filter — ready for when warehouse field is added to packages */
    // if (warehouseFilter !== "all" && p.warehouse !== warehouseFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const field = table.sort.field as SortField;
    let aV: string | number = "";
    let bV: string | number = "";
    if (field === "customer_name") {
      aV = a.customer ? `${a.customer.first_name} ${a.customer.last_name}`.toLowerCase() : "";
      bV = b.customer ? `${b.customer.first_name} ${b.customer.last_name}`.toLowerCase() : "";
    } else if (field === "tracking_number") {
      aV = a.tracking_number.toLowerCase(); bV = b.tracking_number.toLowerCase();
    } else if (field === "checked_in_at") {
      aV = new Date(a.checked_in_at).getTime(); bV = new Date(b.checked_in_at).getTime();
    } else if (field === "weight") {
      aV = a.weight ?? 0; bV = b.weight ?? 0;
    } else if (field === "carrier") {
      aV = a.carrier.toLowerCase(); bV = b.carrier.toLowerCase();
    } else if (field === "status") {
      aV = a.status; bV = b.status;
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

  /* ───────── Filter helpers ───────── */
  const uniqueCarriers = Array.from(new Set(packages.map((p) => p.carrier).filter(Boolean)));

  const statusOptions: Array<{ value: "all" | "in_warehouse" | "shipped"; label: string }> = [
    { value: "all", label: "All" },
    { value: "in_warehouse", label: "In Warehouse" },
    { value: "shipped", label: "Shipped" },
  ];

  const courierOptions = [
    { value: "all", label: "All" },
    ...uniqueCarriers.map((c) => ({ value: c, label: c })),
  ];

  type DatePresetValue = "yesterday" | "today" | "last_week" | "this_week" | "this_month" | "last_month" | "this_year" | "last_year" | "all" | "custom";

  const datePresets: Array<{ value: DatePresetValue; label: string }> = [
    { value: "all", label: "All Time" },
    { value: "yesterday", label: "Yesterday" },
    { value: "today", label: "Today" },
    { value: "last_week", label: "Last Week" },
    { value: "this_week", label: "This Week" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "this_year", label: "This Year" },
    { value: "last_year", label: "Last Year" },
    { value: "custom", label: "Custom" },
  ];

  const computeDateRange = (preset: DatePresetValue): { from: Date | null; to: Date | null } => {
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOfDay(now);

    switch (preset) {
      case "yesterday": {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return { from: y, to: y };
      }
      case "today":
        return { from: today, to: today };
      case "this_week": {
        const dow = today.getDay();
        const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate() - dow);
        return { from: startOfWeek, to: today };
      }
      case "last_week": {
        const dow = today.getDay();
        const endOfLastWeek = new Date(today); endOfLastWeek.setDate(today.getDate() - dow - 1);
        const startOfLastWeek = new Date(endOfLastWeek); startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
        return { from: startOfLastWeek, to: endOfLastWeek };
      }
      case "this_month":
        return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: today };
      case "last_month": {
        const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: firstOfLastMonth, to: lastOfLastMonth };
      }
      case "this_year":
        return { from: new Date(now.getFullYear(), 0, 1), to: today };
      case "last_year":
        return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31) };
      case "all":
        return { from: null, to: null };
      default:
        return { from: null, to: null };
    }
  };

  const applyDatePreset = (preset: DatePresetValue) => {
    setDatePreset(preset);
    setRangeAnchor(null);
    setHoverDate(null);
    if (preset !== "custom") {
      setDateRange(computeDateRange(preset));
    }
  };

  const handleCalendarDayClick = (day: Date) => {
    if (!rangeAnchor) {
      setRangeAnchor(day);
      setDateRange({ from: day, to: null });
      setDatePreset("custom");
    } else {
      const start = day < rangeAnchor ? day : rangeAnchor;
      const end = day < rangeAnchor ? rangeAnchor : day;
      setDateRange({ from: start, to: end });
      setRangeAnchor(null);
      setDatePreset("custom");
    }
  };

  const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const presetLabelMap: Record<string, string> = {
    yesterday: "Yesterday", today: "Today", last_week: "Last Week", this_week: "This Week",
    this_month: "This Month", last_month: "Last Month", this_year: "This Year", last_year: "Last Year", all: "All Time",
  };
  const dateFilterLabel = datePreset === "custom"
    ? (dateRange.from && dateRange.to ? `${fmtShort(dateRange.from)} – ${fmtShort(dateRange.to)}` : dateRange.from ? `${fmtShort(dateRange.from)} – …` : "Custom")
    : presetLabelMap[datePreset] || "This Month";

  const warehouseOptions = [
    { value: "all", label: "Central" },
  ];
  const statusFilterLabel = statusTab === "all" ? "All" : statusTab === "in_warehouse" ? "In Warehouse" : "Shipped";
  const courierFilterLabel = courierFilter === "all" ? "All" : courierFilter;

  const toggleFilter = (name: "status" | "courier" | "date" | "warehouse") => {
    setOpenFilter((prev) => (prev === name ? null : name));
  };

  const hasActiveFilters = statusTab !== "all" || courierFilter !== "all" || datePreset !== "all";

  const clearAllFilters = () => {
    setStatusTab("all");
    setCourierFilter("all");
    applyDatePreset("all");
    setWarehouseFilter("all");
    table.handleSort("checked_in_at");
    if (table.sort.field !== "checked_in_at" || table.sort.direction !== "desc") {
      table.handleSort("checked_in_at");
    }
    setOpenFilter(null);
  };

  /* ───────── Create ───────── */
  const handleCreatePackage = async () => {
    if (!formData.tracking_number || !formData.customer_id) return;
    setCreating(true);
    try {
      // Fetch org_id dynamically from the organization
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) { logger.error("No organization found"); return; }

      const selectedCustomer = customers.find((c) => c.id === formData.customer_id);
      const selectedCourierGroup = courierGroups.find((g) => g.name === formData.carrier);
      const newPackage = {
        tracking_number: formData.tracking_number, carrier: formData.carrier,
        customer_id: formData.customer_id,
        weight: formData.weight ? parseFloat(formData.weight) : null,
        weight_unit: formData.weight_unit, package_type: formData.package_type,
        length: formData.length ? parseFloat(formData.length) : null,
        width: formData.width ? parseFloat(formData.width) : null,
        height: formData.height ? parseFloat(formData.height) : null,
        notes: formData.notes || null,
        org_id: orgRow.id,
        agent_id: selectedCustomer?.agent_id || null,
        courier_group_id: selectedCourierGroup?.id || null,
        status: "checked_in", checked_in_at: new Date().toISOString(),
      };
      const { data: result, error } = await supabase
        .from("packages").insert([newPackage])
        .select(`*, customer:users!packages_customer_id_fkey(id, first_name, last_name, agent_id, deleted_at, agent:agents(id, name, company_name, agent_code)), courier_group:courier_groups(code, name, logo_url), photos:package_photos(id, storage_url, photo_type, sort_order)`)
        .single();
      if (!error && result) {
        setPackages((prev) => [result as PackageRow, ...prev]);
        setShowCreateModal(false);
        setFormData({ tracking_number: "", carrier: courierGroups.length > 0 ? courierGroups[0].name : "", customer_id: "", weight: "", weight_unit: "lb", package_type: "box", length: "", width: "", height: "", notes: "" });
        table.setCurrentPage(1);
        showSuccess("Package created");

        // Notify customer their package was received
        if (result.customer_id) {
          import("@/modules/notifications/lib/triggers").then(({ notifyPackageReceived }) => {
            notifyPackageReceived({
              orgId: orgRow.id,
              customerId: result.customer_id!,
              trackingNumber: result.tracking_number,
              customerName: result.customer
                ? `${result.customer.first_name} ${result.customer.last_name}`
                : "",
            });
          }).catch(err => logger.error("Error in package creation notification", err));
        }

        // Auto-print label on check-in (if enabled in settings)
        try {
          const { autoPrintLabel } = await import("@/lib/label-builder");
          await autoPrintLabel({
            id: result.id,
            tracking_number: result.tracking_number,
            carrier: result.carrier,
            weight: result.weight,
            weight_unit: result.weight_unit,
            billable_weight: (result as Record<string, unknown>).billable_weight as number | null,
            length: result.length,
            width: result.width,
            height: result.height,
            dim_unit: (result as Record<string, unknown>).dim_unit as string | null,
            commodity: (result as Record<string, unknown>).commodity as string | null,
            org_id: orgRow.id,
            customer_id: result.customer?.id || null,
            customer: result.customer ? {
              id: result.customer.id,
              first_name: result.customer.first_name,
              last_name: result.customer.last_name,
              agent_id: result.customer.agent_id || null,
            } : null,
          });
        } catch (err) {
          logger.error("Auto-print error", err);
        }
      }
    } finally { setCreating(false); }
  };

  /* ───────── Inline Edit ───────── */
  const startEditing = (rowId: string, colKey: string, currentValue: string) => {
    table.startEdit(rowId, colKey, currentValue);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEdit = async () => {
    const result = table.confirmEdit();
    if (!result) return;
    setSavingCell(true);
    try {
      const { rowId, colKey, value } = result;
      let updatePayload: Record<string, unknown> = {};

      if (colKey === "tracking") updatePayload = { tracking_number: value };
      else if (colKey === "courier") updatePayload = { carrier: value };
      else if (colKey === "weight") updatePayload = { weight: value ? parseFloat(value) : null };

      const { error } = await supabase.from("packages").update(updatePayload).eq("id", rowId);
      if (!error) {
        setPackages((prev) => prev.map((p) => {
          if (p.id !== rowId) return p;
          if (colKey === "tracking") return { ...p, tracking_number: value };
          if (colKey === "courier") return { ...p, carrier: value };
          if (colKey === "weight") return { ...p, weight: value ? parseFloat(value) : null };
          return p;
        }));
        showSuccess("Updated");
      }
    } finally {
      setSavingCell(false);
    }
  };

  const cancelEdit = () => table.cancelEdit();

  /* ───────── Batch Actions ───────── */
  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const ids = Array.from(table.selectedIds);
      const { deleted, failed } = await adminDelete("packages", ids);
      if (deleted.length > 0) {
        const deletedSet = new Set(deleted);
        setPackages((prev) => prev.filter((p) => !deletedSet.has(p.id)));
      }
      if (failed.length > 0) {
        showSuccess(`${failed.length} failed: ${failed[0].message}`);
      } else {
        showSuccess(`${ids.length} package${ids.length > 1 ? "s" : ""} deleted`);
      }
      table.clearSelection();
      setShowBatchDeleteModal(false);
    } catch (err) {
      showSuccess(err instanceof Error ? err.message : "Delete failed");
    } finally { setBatchDeleting(false); }
  };

  const handleBatchStatusUpdate = async () => {
    if (!batchStatusValue) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("packages").update({ status: batchStatusValue }).eq("id", id)));
      setPackages((prev) => prev.map((p) => table.selectedIds.has(p.id) ? { ...p, status: batchStatusValue } : p));
      table.clearSelection();
      setShowBatchStatusModal(false);
      setBatchStatusValue("");
      showSuccess(`${ids.length} package${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  const handleBatchTagUpdate = async () => {
    if (batchTagIds.size === 0) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      const tagIds = Array.from(batchTagIds);
      const inserts = ids.flatMap((pkgId) => tagIds.map((tagId) => ({ package_id: pkgId, tag_id: tagId })));
      await supabase.from("package_tags").upsert(inserts, { onConflict: "package_id,tag_id", ignoreDuplicates: true });
      table.clearSelection();
      setShowBatchTagModal(false);
      setBatchTagIds(new Set());
      showSuccess(`Tags applied to ${ids.length} package${ids.length > 1 ? "s" : ""}`);
    } finally { setBatchUpdating(false); }
  };

  const handleBatchEdit = async () => {
    if (!batchEditValue && batchEditField !== "weight") return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      let updatePayload: Record<string, unknown> = {};
      if (batchEditField === "carrier") {
        const selectedGroup = courierGroups.find((g) => g.name === batchEditValue);
        updatePayload = { carrier: batchEditValue, courier_group_id: selectedGroup?.id || null };
      }
      else if (batchEditField === "weight") updatePayload = { weight: batchEditValue ? parseFloat(batchEditValue) : null };

      if (batchEditField === "agent") {
        // Agent is on the customer (recipient), not the package — update each customer's agent_id.
        // Routed via /api/admin/reassign-agent (migration 030 blocks direct writes).
        const customerIds = Array.from(new Set(
          packages.filter((p) => table.selectedIds.has(p.id) && p.customer_id).map((p) => p.customer_id!)
        ));
        const { error: reassignError } = await reassignAgent("users", customerIds, batchEditValue || null);
        if (reassignError) {
          showSuccess(reassignError.message);
          return;
        }
        const agentObj = agentsList.find((a) => a.id === batchEditValue);
        setPackages((prev) => prev.map((p) => {
          if (!table.selectedIds.has(p.id) || !p.customer) return p;
          return { ...p, customer: { ...p.customer, agent_id: batchEditValue || null, agent: agentObj ? { id: agentObj.id, name: agentObj.name, company_name: agentObj.company_name, agent_code: agentObj.agent_code } : null } };
        }));
      } else {
        await Promise.all(ids.map((id) => supabase.from("packages").update(updatePayload).eq("id", id)));
        setPackages((prev) => prev.map((p) => {
          if (!table.selectedIds.has(p.id)) return p;
          if (batchEditField === "carrier") {
            const selectedGroup = courierGroups.find((g) => g.name === batchEditValue);
            return { ...p, carrier: batchEditValue, courier_group_id: selectedGroup?.id || null, courier_group: selectedGroup ? { code: selectedGroup.code, name: selectedGroup.name, logo_url: selectedGroup.logo_url } : p.courier_group };
          }
          if (batchEditField === "weight") return { ...p, weight: batchEditValue ? parseFloat(batchEditValue) : null };
          return p;
        }));
      }
      table.clearSelection();
      setShowEditPopover(false);
      setBatchEditValue("");
      showSuccess(`${ids.length} package${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  // Close all batch popovers — ensures only one is open at a time
  const closeAllPopovers = () => {
    setShowEditPopover(false);
    setShowBatchStatusModal(false);
    setShowBatchTagModal(false);
    setShowAssignShipmentModal(false);
  };

  const openAssignShipmentModal = async () => {
    closeAllPopovers();
    setShowAssignShipmentModal(true);
    setAssignStep("select");
    setNewShipmentNumber("");
    setNewShipmentType("air");
    const { data } = await supabase.from("awbs").select("id, awb_number, freight_type, status, courier_group_id").is("deleted_at", null).eq("status", "packing");
    if (data) setOpenShipments(data as AwbRow[]);
  };

  const handleAssignToShipment = async (shipmentId: string) => {
    setAssigningShipment(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("packages").update({ awb_id: shipmentId, status: "assigned_to_awb" }).eq("id", id)));
      setPackages((prev) => prev.map((p) => table.selectedIds.has(p.id) ? { ...p, status: "assigned_to_awb" } : p));
      table.clearSelection();
      setShowAssignShipmentModal(false);
      showSuccess(`${ids.length} package${ids.length > 1 ? "s" : ""} assigned to shipment`);
    } finally { setAssigningShipment(false); }
  };

  const handleCreateAndAssignShipment = async () => {
    if (!newShipmentNumber.trim()) return;
    setAssigningShipment(true);
    try {
      // Fetch org_id dynamically from the organization
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) { logger.error("No organization found"); return; }

      const { data: newAwb, error: createErr } = await supabase
        .from("awbs")
        .insert({
          awb_number: newShipmentNumber.trim(),
          freight_type: newShipmentType,
          status: "packing",
          total_pieces: table.selectedIds.size,
          org_id: orgRow.id,
          courier_group_id: courierGroups[0]?.id || null,
        })
        .select("id")
        .single();

      if (createErr || !newAwb) {
        logger.error("Error creating shipment", createErr);
        return;
      }

      await handleAssignToShipment(newAwb.id);
    } finally { setAssigningShipment(false); }
  };

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
    moveColumn(table.dragColIdx, idx);
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };

  /* ───────── Status helper ───────── */
  const getStatusInfo = (slug: string) => {
    const found = packageStatuses.find((s) => s.slug === slug);
    if (found) return { label: found.name, color: found.color };
    const fb = fallbackStatusConfig[slug];
    if (fb) return fb;
    return { label: slug, color: "#6b7280" };
  };

  /* ───────── Render cell content ───────── */
  const renderCell = (pkg: PackageRow, col: ColumnDef) => {
    const isEditing = table.editingCell?.rowId === pkg.id && table.editingCell?.colKey === col.key;
    const isDropdownOpen = dropdownCell?.rowId === pkg.id && dropdownCell?.colKey === col.key;

    switch (col.key) {
      case "checkbox":
        return (
          <button
            role="checkbox"
            aria-checked={table.selectedIds.has(pkg.id)}
            data-checked={table.selectedIds.has(pkg.id)}
            onClick={() => table.toggleSelect(pkg.id)}
            className="sheet-checkbox"
          >
            {table.selectedIds.has(pkg.id) && <Check size={14} strokeWidth={2.5} />}
          </button>
        );

      case "photo": {
        const firstPhoto = pkg.photos?.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))?.[0];
        return firstPhoto ? (
          <button
            onClick={() => setPreviewImage(firstPhoto.storage_url)}
            className="relative w-8 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 group/photo cursor-pointer"
          >
            <img src={firstPhoto.storage_url} alt="Package" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 size={12} className="text-white" />
            </div>
          </button>
        ) : (
          <div className="w-8 h-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center">
            <Camera size={14} className="text-slate-400" />
          </div>
        );
      }

      case "recipient": {
        const isDeletedCustomer = pkg.customer?.deleted_at != null;
        const customerName = pkg.customer ? `${pkg.customer.first_name} ${pkg.customer.last_name}` : "—";
        return (
          <>
            <span className={`font-semibold sheet-cell-content ${isDeletedCustomer ? "text-slate-400 italic" : "text-slate-700"}`}>
              {customerName}
              {isDeletedCustomer && <span className="ml-1.5 text-[10px] font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded not-italic">Archived</span>}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/admin/packages/${pkg.id}`); }}
              className="row-open-btn"
            >
              <Eye size={14} />
              Open
            </button>
          </>
        );
      }

      case "identifier":
        return <span className="font-mono text-ui text-slate-400 sheet-cell-content">{pkg.id.substring(0, 8).toUpperCase()}</span>;

      case "tracking":
        if (isEditing) {
          return (
            <input
              ref={editInputRef}
              type="text"
              value={table.editValue}
              onChange={(e) => table.setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={saveEdit}
              className="w-full bg-white border border-primary rounded px-1.5 py-0.5 text-ui font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            />
          );
        }
        return (
          <span
            onClick={() => startEditing(pkg.id, "tracking", pkg.tracking_number)}
            className="font-mono text-ui text-primary truncate cursor-text hover:bg-slate-50 px-1 -mx-1 py-0.5 rounded transition-colors block hover:underline"
          >
            {pkg.tracking_number}
          </span>
        );

      case "checked_in":
        return (
          <span className="text-ui text-slate-500 sheet-cell-content" style={{ fontWeight: 400 }}>
            {new Date(pkg.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{" "}
            {new Date(pkg.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        );

      case "carrier": {
        if (isEditing) {
          return (
            <>
              <span className="courier-badge">{table.editValue || "—"}</span>
              <CellDropdown open={true} onClose={() => table.cancelEdit()} anchorEl={cellAnchorEl} width={200}>
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {courierGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        table.cancelEdit();
                        (async () => {
                          const { error } = await supabase.from("packages").update({ carrier: g.name, courier_group_id: g.id }).eq("id", pkg.id);
                          if (!error) {
                            setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, carrier: g.name, courier_group_id: g.id, courier_group: { code: g.code, name: g.name, logo_url: g.logo_url } } : p));
                            showSuccess("Updated");
                          }
                        })();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer
                        ${g.name === pkg.carrier ? "bg-primary/5" : "hover:bg-surface-hover"}
                      `}
                    >
                      <span className="text-ui text-txt-primary flex-1">{g.name}</span>
                      {g.name === pkg.carrier && <Check size={15} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </CellDropdown>
            </>
          );
        }
        const displayName = pkg.courier_group?.name ?? pkg.carrier;
        return displayName ? (
          <span
            onClick={(e) => { setCellAnchorEl(e.currentTarget); startEditing(pkg.id, "courier", displayName); }}
            className="cursor-text hover:bg-slate-50 px-1 -mx-1 py-0.5 rounded transition-colors block"
          >
            <span className="courier-badge inline-flex items-center gap-1.5">
              {pkg.courier_group?.logo_url && (
                <img src={pkg.courier_group.logo_url} alt="" className="w-4 h-4 rounded object-contain" />
              )}
              {displayName}
            </span>
          </span>
        ) : (
          <span
            onClick={(e) => { setCellAnchorEl(e.currentTarget); startEditing(pkg.id, "courier", ""); }}
            className="text-txt-placeholder cursor-text hover:bg-slate-50 px-1 -mx-1 py-0.5 rounded transition-colors"
          >
            —
          </span>
        );
      }

      case "agent": {
        const currentAgent = pkg.customer?.agent;
        const currentAgentId = pkg.customer?.agent_id;
        const agentLabel = currentAgent?.agent_code || currentAgent?.company_name || currentAgent?.name;
        if (isDropdownOpen) {
          const filtered = agentsList.filter((a) =>
            !dropdownSearch || a.name.toLowerCase().includes(dropdownSearch.toLowerCase()) || (a.company_name && a.company_name.toLowerCase().includes(dropdownSearch.toLowerCase()))
          );
          return (
            <>
              <span className="text-ui text-txt-primary">{agentLabel || "—"}</span>
              <CellDropdown open={true} onClose={() => { setDropdownCell(null); setDropdownSearch(""); }} anchorEl={cellAnchorEl} width={220}>
                {agentsList.length > 5 && (
                  <div className="px-3 pt-2.5 pb-2">
                    <input
                      type="text"
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      placeholder="Search agents..."
                      autoFocus
                      className="w-full bg-slate-50 rounded-md px-2.5 py-1.5 text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none"
                    />
                  </div>
                )}
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {/* Unassign option */}
                  <button
                    onClick={() => {
                      setDropdownCell(null);
                      setDropdownSearch("");
                      if (!pkg.customer_id) return;
                      (async () => {
                        const { error } = await reassignAgent("users", [pkg.customer_id!], null);
                        if (!error) {
                          setPackages((prev) => prev.map((p) => {
                            if (p.customer_id === pkg.customer_id && p.customer) {
                              return { ...p, customer: { ...p.customer, agent_id: null, agent: null } };
                            }
                            return p;
                          }));
                          showSuccess("Agent removed");
                        }
                      })();
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer
                      ${!currentAgentId ? "bg-primary/5" : "hover:bg-surface-hover"}`}
                  >
                    <span className="text-ui-sm text-txt-tertiary italic flex-1">None</span>
                    {!currentAgentId && <Check size={15} className="text-primary shrink-0" />}
                  </button>
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setDropdownCell(null);
                        setDropdownSearch("");
                        if (!pkg.customer_id) return;
                        (async () => {
                          const { error } = await reassignAgent("users", [pkg.customer_id!], a.id);
                          if (!error) {
                            setPackages((prev) => prev.map((p) => {
                              if (p.customer_id === pkg.customer_id && p.customer) {
                                return { ...p, customer: { ...p.customer, agent_id: a.id, agent: { id: a.id, name: a.name, company_name: a.company_name, agent_code: a.agent_code } } };
                              }
                              return p;
                            }));
                            showSuccess("Agent updated");
                          }
                        })();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer
                        ${currentAgentId === a.id ? "bg-primary/5" : "hover:bg-surface-hover"}`}
                    >
                      <span className="text-ui text-txt-primary flex-1">{a.agent_code ? `${a.agent_code} — ${a.company_name || a.name}` : a.company_name || a.name}</span>
                      {currentAgentId === a.id && <Check size={15} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </CellDropdown>
            </>
          );
        }
        return (
          <span
            onClick={(e) => { e.stopPropagation(); setCellAnchorEl(e.currentTarget); setDropdownCell({ rowId: pkg.id, colKey: "agent" }); setDropdownSearch(""); }}
            className="cursor-pointer hover:bg-slate-50 px-1 -mx-1 py-0.5 rounded transition-colors text-txt-primary block"
          >
            {agentLabel || <span className="text-txt-placeholder">—</span>}
          </span>
        );
      }

      case "status": {
        const si = getStatusInfo(pkg.status);
        if (isDropdownOpen) {
          return (
            <>
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-meta"
                style={{ backgroundColor: si.color + "18", color: si.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: si.color }} />
                {si.label}
              </span>
              <CellDropdown open={true} onClose={() => { setDropdownCell(null); setDropdownSearch(""); }} anchorEl={cellAnchorEl} width={200}>
                <div className="max-h-[280px] overflow-y-auto py-1">
                  {packageStatuses.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setDropdownCell(null);
                        setDropdownSearch("");
                        (async () => {
                          const { error } = await supabase.from("packages").update({ status: s.slug }).eq("id", pkg.id);
                          if (!error) {
                            setPackages((prev) => prev.map((p) => p.id === pkg.id ? { ...p, status: s.slug } : p));
                            showSuccess("Status updated");
                          }
                        })();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer
                        ${pkg.status === s.slug ? "bg-primary/5" : "hover:bg-surface-hover"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-ui text-txt-primary flex-1">{s.name}</span>
                      {pkg.status === s.slug && <Check size={15} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              </CellDropdown>
            </>
          );
        }
        return (
          <span
            onClick={(e) => { e.stopPropagation(); setCellAnchorEl(e.currentTarget); setDropdownCell({ rowId: pkg.id, colKey: "status" }); setDropdownSearch(""); }}
            className="cursor-pointer inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-meta"
            style={{ backgroundColor: si.color + "18", color: si.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: si.color }} />
            {si.label}
          </span>
        );
      }

      case "weight":
        if (isEditing) {
          return (
            <input
              ref={editInputRef}
              type="number"
              step="0.01"
              value={table.editValue}
              onChange={(e) => table.setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={saveEdit}
              className="w-full bg-white border border-primary rounded px-1.5 py-0.5 text-ui-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          );
        }
        return (
          <span
            onClick={() => startEditing(pkg.id, "weight", pkg.weight ? String(pkg.weight) : "")}
            className="cursor-text hover:bg-slate-50 px-1 -mx-1 py-0.5 rounded transition-colors text-slate-500 font-medium block"
          >
            {pkg.weight ? `${pkg.weight} ${pkg.weight_unit}` : "—"}
          </span>
        );

      case "quantity":
        return <span>1</span>;

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
      {/* Sticky Header */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Inventory Dashboard</h2>
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
            <input
              type="text"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search recipients, tracking IDs, or SKUs..."
              className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary cursor-pointer"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add Package
          </button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white border-b border-border px-6 py-2.5 flex items-center gap-3 flex-wrap shrink-0">
        {/* Status filter pill + dropdown */}
        <div ref={statusFilterRef} className="relative">
          <button onClick={() => toggleFilter("status")} className={`filter-pill${statusTab !== "all" ? " active" : ""}${openFilter === "status" ? " open" : ""}`}>
            <Tag size={13} />
            <span>Status: {statusFilterLabel}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "status" && (
            <div className="filter-dropdown">
              {statusOptions.map((opt) => (
                <button key={opt.value} onClick={() => { setStatusTab(opt.value); setOpenFilter(null); }}
                  className={`filter-dropdown-item${statusTab === opt.value ? " selected" : ""}`}>
                  <span>{opt.label}</span>
                  <Check size={14} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Carrier filter pill + dropdown */}
        <div ref={courierFilterRef} className="relative">
          <button onClick={() => toggleFilter("courier")} className={`filter-pill${courierFilter !== "all" ? " active" : ""}${openFilter === "courier" ? " open" : ""}`}>
            <Truck size={13} />
            <span>Carrier: {courierFilterLabel}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "courier" && (
            <div className="filter-dropdown">
              {courierOptions.map((opt) => (
                <button key={opt.value} onClick={() => { setCourierFilter(opt.value); setOpenFilter(null); }}
                  className={`filter-dropdown-item${courierFilter === opt.value ? " selected" : ""}`}>
                  <span>{opt.label}</span>
                  <Check size={14} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date filter pill + calendar dropdown */}
        <div ref={dateFilterRef} className="relative">
          <button onClick={() => toggleFilter("date")} className={`filter-pill${datePreset !== "all" ? " active" : ""}${openFilter === "date" ? " open" : ""}`}>
            <Calendar size={13} />
            <span>{dateFilterLabel}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "date" && (
            <div className={`filter-dropdown${datePreset === "custom" ? " !w-80" : ""} !p-0`}>
            {(() => {
              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
              const cells: (Date | null)[] = [];
              for (let i = 0; i < firstDay; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

              const isInRange = (d: Date) => {
                if (rangeAnchor && hoverDate) {
                  const s = rangeAnchor < hoverDate ? rangeAnchor : hoverDate;
                  const e = rangeAnchor < hoverDate ? hoverDate : rangeAnchor;
                  return d >= s && d <= e;
                }
                if (dateRange.from && dateRange.to) return d >= dateRange.from && d <= dateRange.to;
                return false;
              };
              const isStart = (d: Date) => {
                if (rangeAnchor && hoverDate) {
                  const s = rangeAnchor < hoverDate ? rangeAnchor : hoverDate;
                  return d.getTime() === s.getTime();
                }
                return dateRange.from ? d.getTime() === dateRange.from.getTime() : false;
              };
              const isEnd = (d: Date) => {
                if (rangeAnchor && hoverDate) {
                  const e = rangeAnchor < hoverDate ? hoverDate : rangeAnchor;
                  return d.getTime() === e.getTime();
                }
                return dateRange.to ? d.getTime() === dateRange.to.getTime() : false;
              };

              const showCalendar = datePreset === "custom";

              return (
                <>
                  {/* Preset list */}
                  <div className="py-1 px-1">
                    {datePresets.map((p) => (
                      <button key={p.value}
                        onClick={() => {
                          if (p.value === "custom") {
                            setDatePreset("custom");
                            setRangeAnchor(null);
                            setHoverDate(null);
                          } else {
                            applyDatePreset(p.value);
                            setOpenFilter(null);
                          }
                        }}
                        className={`filter-dropdown-item${datePreset === p.value ? " selected" : ""}`}>
                        <span>{p.label}</span>
                        <Check size={14} className="check-icon" />
                      </button>
                    ))}
                  </div>

                  {/* Calendar — only visible when "Custom" is selected */}
                  {showCalendar && (
                    <>
                      <div className="border-t border-[#e2e8f0]" />
                      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                        <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#f1f5f9] transition-colors cursor-pointer">
                          <ChevronLeft size={14} className="text-[#64748b]" />
                        </button>
                        <span className="text-ui-sm font-semibold text-[#1e293b]">
                          {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                        </span>
                        <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#f1f5f9] transition-colors cursor-pointer">
                          <ChevronRight size={14} className="text-[#64748b]" />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 px-3">
                        {dayNames.map((dn) => (
                          <div key={dn} className="h-7 flex items-center justify-center text-meta text-[#94a3b8]">{dn}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 px-3 pb-2">
                        {cells.map((cell, i) => {
                          if (!cell) return <div key={`empty-${i}`} className="h-8" />;
                          const inRange = isInRange(cell);
                          const start = isStart(cell);
                          const end = isEnd(cell);
                          const isToday = cell.getTime() === today.getTime();
                          const isFuture = cell > today;
                          return (
                            <div key={cell.getTime()}
                              className={`relative h-8 flex items-center justify-center ${inRange && !start && !end ? "bg-primary/8" : ""} ${start ? "rounded-l-md" : ""} ${end ? "rounded-r-md" : ""}`}>
                              <button
                                onClick={() => !isFuture && handleCalendarDayClick(cell)}
                                onMouseEnter={() => rangeAnchor && !isFuture && setHoverDate(cell)}
                                className={`relative z-10 h-7 w-7 flex items-center justify-center rounded-md text-meta transition-all cursor-pointer
                                  ${isFuture ? "text-[#cbd5e1] cursor-default" : ""}
                                  ${start || end ? "bg-primary text-white shadow-sm" : ""}
                                  ${inRange && !start && !end ? "text-primary" : ""}
                                  ${!inRange && !start && !end && !isFuture ? "text-[#334155] hover:bg-[#f1f5f9]" : ""}
                                  ${isToday && !start && !end ? "ring-1 ring-primary/40" : ""}
                                `}>
                                {cell.getDate()}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {dateRange.from && (
                        <div className="border-t border-[#e2e8f0] px-3 py-2 flex items-center justify-between">
                          <span className="text-meta text-[#64748b]">
                            {fmtShort(dateRange.from)}{dateRange.to ? ` – ${fmtShort(dateRange.to)}` : " – select end"}
                          </span>
                          {dateRange.to && (
                            <button onClick={() => setOpenFilter(null)}
                              className="text-meta text-primary hover:text-primary/80 cursor-pointer">
                              Apply
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
            </div>
          )}
        </div>

        {/* Warehouse filter pill + dropdown */}
        <div ref={warehouseFilterRef} className="relative">
          <button onClick={() => toggleFilter("warehouse")} className={`filter-pill${warehouseFilter !== "all" ? " active" : ""}${openFilter === "warehouse" ? " open" : ""}`}>
            <Building2 size={13} />
            <span>Warehouse: {warehouseFilter === "all" ? "Central" : warehouseFilter}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "warehouse" && (
            <div className="filter-dropdown">
              {warehouseOptions.map((opt) => (
                <button key={opt.value} onClick={() => { setWarehouseFilter(opt.value); setOpenFilter(null); }}
                  className={`filter-dropdown-item${warehouseFilter === opt.value ? " selected" : ""}`}>
                  <span>{opt.label}</span>
                  <Check size={14} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>

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

        <div className="h-5 w-px bg-border" />

        <button onClick={clearAllFilters}
          className="text-meta text-primary hover:text-primary/80 transition-colors cursor-pointer">
          Clear All
        </button>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-meta text-txt-secondary" style={{ fontWeight: 400 }}>{sorted.length.toLocaleString()} Packages total</p>
          <button className="h-8 w-8 flex items-center justify-center text-txt-tertiary hover:text-txt-primary cursor-pointer rounded-lg hover:bg-surface-hover transition-colors">
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {table.successMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui shadow-sm">
          <CheckCircle2 size={16} />
          {table.successMessage}
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-1.5 text-white hover:text-white/80 cursor-pointer"
            >
              <X size={20} />
            </button>
            <img src={previewImage} alt="Package preview" className="w-full rounded-md shadow-xl" />
          </div>
        </div>
      )}

      {/* Create Package Modal */}
      {showCreateModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add package</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Tracking number</label>
                <input type="text" value={formData.tracking_number} onChange={(e) => setFormData({ ...formData, tracking_number: e.target.value })} placeholder="Enter tracking number" className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Carrier</label>
                <SearchableSelect
                  value={formData.carrier}
                  onChange={(v) => setFormData({ ...formData, carrier: v })}
                  placeholder="Select a carrier"
                  searchPlaceholder="Search carriers…"
                  options={courierGroups.map((g) => ({ value: g.name, label: g.name }))}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Customer</label>
                <SearchableSelect
                  value={formData.customer_id}
                  onChange={(v) => setFormData({ ...formData, customer_id: v })}
                  placeholder="Select a customer"
                  searchPlaceholder="Search customers…"
                  options={customers.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Weight</label>
                  <input type="number" value={formData.weight} onChange={(e) => setFormData({ ...formData, weight: e.target.value })} placeholder="0.00" className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Unit</label>
                  <SearchableSelect
                    value={formData.weight_unit}
                    onChange={(v) => setFormData({ ...formData, weight_unit: v })}
                    searchable={false}
                    options={[{ value: "lb", label: "lb" }, { value: "oz", label: "oz" }, { value: "kg", label: "kg" }]}
                  />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Package type</label>
                <SearchableSelect
                  value={formData.package_type}
                  onChange={(v) => setFormData({ ...formData, package_type: v })}
                  searchable={false}
                  options={[{ value: "bag", label: "Bag" }, { value: "box", label: "Box" }, { value: "envelope", label: "Envelope" }, { value: "pallet", label: "Pallet" }, { value: "other", label: "Other" }]}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Length</label><input type="number" value={formData.length} onChange={(e) => setFormData({ ...formData, length: e.target.value })} placeholder="—" className="form-input" /></div>
                <div><label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Width</label><input type="number" value={formData.width} onChange={(e) => setFormData({ ...formData, width: e.target.value })} placeholder="—" className="form-input" /></div>
                <div><label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Height</label><input type="number" value={formData.height} onChange={(e) => setFormData({ ...formData, height: e.target.value })} placeholder="—" className="form-input" /></div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Add any additional notes..." rows={3} className="form-input resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleCreatePackage} disabled={creating || !formData.tracking_number || !formData.customer_id} className="btn-primary flex items-center gap-2 cursor-pointer">
                {creating && <Loader2 size={14} className="animate-spin" />}
                Add package
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Main Content ════════ */}
      <div className="flex-1 flex flex-col min-h-0 p-4">
        {/* Truncation Warning Banner */}
        {serverTotal > packages.length && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mx-6 mb-2 flex items-center gap-2 text-meta text-amber-700">
            <AlertTriangle size={14} />
            Showing {packages.length.toLocaleString()} of {serverTotal.toLocaleString()} records. Use filters to narrow results.
          </div>
        )}
        {/* ════════ Table Container — bordered card ════════ */}
        <div className="sheet-table-wrap">
          {/* Scrollable table — ONLY this scrolls */}
          <div className="flex-1 overflow-auto min-h-0" ref={scrollContainerRef}>
            <table
              className="sheet-table"
              style={tableStyle}
            >
              <thead className="sheet-thead">
                <tr>
                  {visibleColumns.map((col, idx) => {
                    const stickyLeft = getStickyLeft(col, idx);
                    const isUtility = col.key === "checkbox" || col.key === "photo";
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
                            aria-checked={table.selectedIds.size === paginatedData.length && paginatedData.length > 0}
                            data-checked={table.selectedIds.size === paginatedData.length && paginatedData.length > 0}
                            onClick={() => table.toggleSelectAll(paginatedData.map((p) => p.id))}
                            className="sheet-checkbox"
                          >
                            {table.selectedIds.size === paginatedData.length && paginatedData.length > 0 && <Check size={14} strokeWidth={2.5} />}
                          </button>
                        ) : col.key === "photo" ? (
                          <div className="flex items-center justify-center">
                            <ImageIcon size={13} className="text-[#9ca3af]" />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              {col.icon && <col.icon size={11} className="text-[#9ca3af] shrink-0" />}
                              <span>{col.label}</span>
                            </div>
                            <ColumnHeaderMenu
                              colKey={col.key}
                              sortable={col.sortable}
                              sortField={col.sortField}
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
                            {!isUtility && (
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
                        <p className="empty-state-title">{table.search ? "No packages match your search" : "No packages yet"}</p>
                        <p className="empty-state-desc">
                          {table.search ? "Try adjusting your search term" : "Click \"Add Package\" to create one"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((pkg) => (
                    <tr key={pkg.id} className="sheet-row">
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
                              ${col.key === "checkbox" ? "sheet-checkbox-cell" : col.key === "photo" ? "sheet-photo-cell" : ""}
                            `}
                          >
                            {renderCell(pkg, col)}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Status Footer + Pagination */}
          <div className="h-10 bg-white border-t border-border px-4 flex items-center justify-between shrink-0 text-meta">
            {/* Status Summary */}
            <div className="flex items-center gap-4">
              {(() => {
                const statusCounts: Record<string, number> = {};
                packages.forEach((p) => {
                  statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
                });
                return Object.entries(statusCounts).map(([slug, count]) => {
                  const si = getStatusInfo(slug);
                  return (
                    <div key={slug} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: si.color }} />
                      <span className="text-txt-secondary font-medium">{count} {si.label}</span>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-3">
              <span className="text-txt-secondary">
                Showing {startItem}-{endItem} of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => table.setCurrentPage(Math.max(1, table.currentPage - 1))}
                  disabled={table.currentPage <= 1}
                  className="p-1 border border-border rounded text-txt-secondary hover:text-txt-primary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-txt-primary font-medium px-1">{table.currentPage}/{table.totalPages || 1}</span>
                <button
                  onClick={() => table.setCurrentPage(Math.min(table.totalPages, table.currentPage + 1))}
                  disabled={table.currentPage >= table.totalPages}
                  className="p-1 border border-border rounded text-txt-secondary hover:text-txt-primary hover:bg-surface-hover disabled:opacity-40 cursor-pointer transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════ Popover Backdrop ════════ */}
      {(showEditPopover || showBatchStatusModal || showBatchTagModal || showAssignShipmentModal || dropdownCell) && (
        <div className="popover-backdrop" onClick={() => { closeAllPopovers(); setDropdownCell(null); setDropdownSearch(""); setCellAnchorEl(null); }} />
      )}

      {/* ════════ Floating Batch Action Bar ════════ */}
      <BatchBar selectedCount={table.selectedIds.size} onClear={() => table.clearSelection()}>
        <button onClick={openAssignShipmentModal} className={`batch-bar-btn ${showAssignShipmentModal ? "active" : ""}`}>
          <Ship size={16} />
          Ship
        </button>
        <div className="relative" ref={editPopoverRef}>
          <button onClick={() => { if (!showEditPopover) closeAllPopovers(); setShowEditPopover(!showEditPopover); setBatchEditField("carrier"); setBatchEditValue(""); }} className={`batch-bar-btn ${showEditPopover ? "active" : ""}`}>
            <Edit3 size={16} />
            Edit
          </button>
          {showEditPopover && (
            <div className="batch-popover">
              <div className="batch-popover-header">
                <h3 className="batch-popover-title">Update {table.selectedIds.size} package{table.selectedIds.size > 1 ? "s" : ""}</h3>
                <button onClick={() => setShowEditPopover(false)} className="batch-popover-close">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="batch-popover-label">Field</label>
                  <SearchableSelect
                    value={batchEditField}
                    onChange={(v) => { setBatchEditField(v as "carrier" | "agent" | "weight"); setBatchEditValue(""); }}
                    searchable={false}
                    options={[{ value: "carrier", label: "Carrier" }, { value: "agent", label: "Agent" }, { value: "weight", label: "Weight" }]}
                  />
                </div>
                <div>
                  <label className="batch-popover-label">New value</label>
                  {batchEditField === "carrier" ? (
                    <SearchableSelect value={batchEditValue} onChange={(v) => setBatchEditValue(v)} placeholder="Select carrier" searchPlaceholder="Search carriers…" options={courierGroups.map((g) => ({ value: g.name, label: g.name }))} />
                  ) : batchEditField === "agent" ? (
                    <SearchableSelect value={batchEditValue} onChange={(v) => setBatchEditValue(v)} placeholder="Select agent" searchPlaceholder="Search agents…" options={agentsList.map((a) => ({ value: a.id, label: a.agent_code ? `${a.agent_code} — ${a.company_name || a.name}` : a.company_name || a.name }))} />
                  ) : (
                    <input type="number" step="0.01" value={batchEditValue} onChange={(e) => setBatchEditValue(e.target.value)} placeholder="Enter weight" className="form-input" />
                  )}
                </div>
                <div className="batch-popover-actions">
                  <button onClick={() => { handleBatchEdit(); setShowEditPopover(false); }} disabled={(!batchEditValue && batchEditField !== "weight") || batchUpdating} className="batch-popover-apply cursor-pointer">
                    {batchUpdating && <Loader2 size={14} className="animate-spin" />}
                    Apply Changes
                  </button>
                  <button onClick={() => setShowEditPopover(false)} className="batch-popover-cancel cursor-pointer">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <button onClick={() => { closeAllPopovers(); setShowBatchStatusModal(true); setBatchStatusValue(""); }} className={`batch-bar-btn ${showBatchStatusModal ? "active" : ""}`}>
          <Tag size={16} />
          Status
        </button>
        <button onClick={() => { closeAllPopovers(); setShowBatchTagModal(true); setBatchTagIds(new Set()); }} className={`batch-bar-btn ${showBatchTagModal ? "active" : ""}`}>
          <Tag size={16} />
          Tags
        </button>
        <button onClick={() => setShowBatchDeleteModal(true)} className="batch-bar-btn danger">
          <Trash2 size={16} />
          Delete
        </button>
      </BatchBar>

      {/* ════════ Batch Delete Modal ════════ */}
      {showBatchDeleteModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-brand-red" />
              </div>
              <div className="flex-1">
                <h3 className="text-ui font-semibold text-txt-primary">Delete {table.selectedIds.size} package{table.selectedIds.size > 1 ? "s" : ""}</h3>
                <p className="text-muted text-txt-secondary mt-1">
                  Are you sure you want to delete {table.selectedIds.size} selected package{table.selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBatchDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleBatchDelete} disabled={batchDeleting} className="btn-primary bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-2 cursor-pointer">
                {batchDeleting && <Loader2 size={14} className="animate-spin" />}
                Delete {table.selectedIds.size} package{table.selectedIds.size > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Batch Status Popover ════════ */}
      {showBatchStatusModal && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Update status</h3>
            <button onClick={() => setShowBatchStatusModal(false)} className="batch-popover-close"><X size={18} /></button>
          </div>
          <p className="text-muted text-txt-secondary mb-3">Choose a new status for {table.selectedIds.size} selected package{table.selectedIds.size > 1 ? "s" : ""}.</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {packageStatuses.map((s) => (
              <button
                key={s.id}
                onClick={() => setBatchStatusValue(s.slug)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  batchStatusValue === s.slug ? "bg-primary/5 ring-1 ring-primary/30" : "hover:bg-surface-hover"
                }`}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-ui text-txt-primary flex-1">{s.name}</span>
                {batchStatusValue === s.slug && <Check size={15} className="text-primary shrink-0" />}
              </button>
            ))}
          </div>
          <div className="batch-popover-actions">
            <button onClick={handleBatchStatusUpdate} disabled={!batchStatusValue || batchUpdating} className="batch-popover-apply cursor-pointer">
              {batchUpdating && <Loader2 size={14} className="animate-spin" />}
              Update Status
            </button>
            <button onClick={() => setShowBatchStatusModal(false)} className="batch-popover-cancel cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* ════════ Batch Tag Popover ════════ */}
      {showBatchTagModal && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Apply tags</h3>
            <button onClick={() => setShowBatchTagModal(false)} className="batch-popover-close"><X size={18} /></button>
          </div>
          <p className="text-muted text-txt-secondary mb-3">Select tags to apply to {table.selectedIds.size} selected package{table.selectedIds.size > 1 ? "s" : ""}.</p>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {tags.length === 0 ? (
              <p className="text-muted text-txt-tertiary py-4 text-center">No tags created yet. Add tags in Settings.</p>
            ) : (
              tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setBatchTagIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                      return next;
                    });
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                    batchTagIds.has(t.id) ? "bg-primary/5 ring-1 ring-primary/30" : "hover:bg-surface-hover"
                  }`}
                >
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-ui text-txt-primary flex-1">{t.name}</span>
                  {batchTagIds.has(t.id) && <Check size={15} className="text-primary shrink-0" />}
                </button>
              ))
            )}
          </div>
          <div className="batch-popover-actions">
            <button onClick={handleBatchTagUpdate} disabled={batchTagIds.size === 0 || batchUpdating} className="batch-popover-apply cursor-pointer">
              {batchUpdating && <Loader2 size={14} className="animate-spin" />}
              Apply Tags
            </button>
            <button onClick={() => setShowBatchTagModal(false)} className="batch-popover-cancel cursor-pointer">Cancel</button>
          </div>
        </div>
      )}


      {/* ════════ Assign to Shipment Popover ════════ */}
      {showAssignShipmentModal && (
        <div className="batch-popover" style={{ width: 380 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Assign to Shipment</h3>
            <button onClick={() => setShowAssignShipmentModal(false)} className="batch-popover-close"><X size={18} /></button>
          </div>
          <p className="text-muted text-txt-secondary mb-3">
            Assign {table.selectedIds.size} package{table.selectedIds.size > 1 ? "s" : ""} to an existing shipment or create a new one.
          </p>

          {assignStep === "select" ? (
            <>
              {openShipments.length > 0 ? (
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  <p className="batch-popover-label px-1 mb-1">Open shipments (Packing)</p>
                  {openShipments.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleAssignToShipment(s.id)}
                      disabled={assigningShipment}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-left hover:bg-surface-hover transition-colors cursor-pointer border border-border"
                    >
                      <div className="w-8 h-8 rounded-md bg-sky-50 flex items-center justify-center shrink-0">
                        {s.freight_type === "ocean" ? <Ship size={14} className="text-blue-600" /> : <Plane size={14} className="text-sky-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ui text-txt-primary font-mono">{s.awb_number}</p>
                        <p className="text-meta text-txt-tertiary capitalize">{s.freight_type}</p>
                      </div>
                      {assigningShipment ? <Loader2 size={14} className="animate-spin text-primary" /> : <ChevronRight size={14} className="text-txt-tertiary" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center">
                  <Ship size={24} className="text-txt-tertiary mx-auto mb-2" />
                  <p className="text-muted text-txt-secondary">No open shipments available</p>
                </div>
              )}
              <div className="border-t border-border pt-3 mt-3">
                <button
                  onClick={() => setAssignStep("create")}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-meta text-primary bg-primary/5 border border-primary/20 rounded-lg hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  Create New Shipment
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="batch-popover-label">Freight Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewShipmentType("air")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-ui transition-colors cursor-pointer ${
                      newShipmentType === "air"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-txt-secondary hover:bg-surface-hover"
                    }`}
                  >
                    <Plane size={14} />
                    Air (AWB)
                  </button>
                  <button
                    onClick={() => setNewShipmentType("ocean")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-ui transition-colors cursor-pointer ${
                      newShipmentType === "ocean"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-txt-secondary hover:bg-surface-hover"
                    }`}
                  >
                    <Ship size={14} />
                    Ocean (BOL)
                  </button>
                </div>
              </div>
              <div>
                <label className="batch-popover-label">
                  {newShipmentType === "air" ? "AWB Number" : "BOL Number"}
                </label>
                <input
                  type="text"
                  value={newShipmentNumber}
                  onChange={(e) => setNewShipmentNumber(e.target.value)}
                  placeholder={newShipmentType === "air" ? "Enter AWB number" : "Enter BOL number"}
                  className="form-input"
                  autoFocus
                />
              </div>
              <div className="batch-popover-actions">
                <button onClick={() => setAssignStep("select")} className="batch-popover-cancel cursor-pointer flex items-center gap-1.5">
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={handleCreateAndAssignShipment}
                  disabled={!newShipmentNumber.trim() || assigningShipment}
                  className="batch-popover-apply cursor-pointer"
                >
                  {assigningShipment && <Loader2 size={14} className="animate-spin" />}
                  Create & Assign
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
