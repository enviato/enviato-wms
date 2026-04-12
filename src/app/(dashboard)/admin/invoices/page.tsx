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
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Eye,
  Send,
  DollarSign,
  X,
  CheckCircle2,
  Loader2,
  Calendar,
  Upload,
  Check,
  Hash,
  User,
  Truck,
  Tag,
  Plane,
  Trash2,
  AlertTriangle,
  ChevronDown,
  SlidersHorizontal,
} from "lucide-react";

/* ───────── Types ───────── */
type BillingAgent = {
  id: string;
  name: string;
  company_name: string | null;
  agent_code: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  pricing_model: string;
  rate_per_lb: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  customer_id: string;
  courier_group_id: string;
  billed_by_agent_id: string | null;
  customer?: { first_name: string; last_name: string; email: string } | null;
  courier_group?: { code: string; name: string } | null;
  billed_by_agent?: { company_name: string | null; name: string; agent_code: string | null; email: string | null; phone: string | null; address_line1: string | null; city: string | null; state: string | null; country: string | null; zip_code: string | null } | null;
  packages?: Array<{ awb: { awb_number: string } | null }> | null;
};

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
};

type CourierGroup = {
  id: string;
  code: string;
  name: string;
};

type SortField = "invoice_number" | "customer_name" | "status" | "total" | "due_date" | "created_at";
type SortDir = "asc" | "desc";

/* ───────── Constants ───────── */
const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  sent: { label: "Sent", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  overdue: { label: "Overdue", bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "checkbox", label: "", icon: FileText, width: 40, minWidth: 40, sortable: false, sticky: true, visible: true },
  { key: "invoice", label: "Invoice", icon: Hash, width: 150, minWidth: 110, sortable: true, sortField: "invoice_number", visible: true },
  { key: "customer", label: "Customer", icon: User, width: 200, minWidth: 140, sortable: true, sortField: "customer_name", visible: true },
  { key: "group", label: "Agent", icon: Truck, width: 100, minWidth: 80, sortable: false, visible: true },
  { key: "shipment", label: "Shipment", icon: Plane, width: 140, minWidth: 100, sortable: false, visible: true },
  { key: "status", label: "Status", icon: Tag, width: 120, minWidth: 90, sortable: true, sortField: "status", visible: true },
  { key: "total", label: "Total", icon: DollarSign, width: 120, minWidth: 90, sortable: true, sortField: "total", visible: true },
  { key: "due_date", label: "Due Date", icon: Calendar, width: 130, minWidth: 100, sortable: true, sortField: "due_date", visible: true },
  { key: "created", label: "Created", icon: Calendar, width: 130, minWidth: 100, sortable: true, sortField: "created_at", visible: true },
];

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

function formatCurrency(amount: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `INV-${year}-${randomPart}`;
}

/* ───────── Component ───────── */
export default function InvoicesPage() {
  const supabase = createClient();
  const router = useRouter();

  /* Data state */
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [courierGroups, setCourierGroups] = useState<CourierGroup[]>([]);
  const [billingAgents, setBillingAgents] = useState<BillingAgent[]>([]);

  /* Table state — now managed by useTableState hook */
  const table = useTableState({
    defaultColumns: DEFAULT_COLUMNS,
    defaultSort: { field: "created_at", direction: "desc" },
  });

  /* Filter state */
  const [statusFilter, setStatusFilter] = useState("all");
  const [openFilter, setOpenFilter] = useState<"status" | null>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  /* Modals */
  const [viewInvoice, setViewInvoice] = useState<InvoiceRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customer_id: "",
    billed_by_agent_id: "",
    invoice_number: generateInvoiceNumber(),
    pricing_model: "gross_weight",
    rate_per_lb: "",
    subtotal: "",
    tax_rate: "0",
    due_date: "",
    notes: "",
  });

  /* Batch actions */
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState("");
  const statusPopoverRef = useRef<HTMLDivElement>(null);
  const [showAgentPopover, setShowAgentPopover] = useState(false);
  const [batchAgentValue, setBatchAgentValue] = useState("");
  const agentPopoverRef = useRef<HTMLDivElement>(null);

  /* Columns dropdown — close on outside click */
  const columnsDropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
  }, [table.showColumnsDropdown, table.setShowColumnsDropdown]);

  // Close all batch popovers — ensures only one is open at a time
  const closeAllPopovers = () => {
    setShowStatusPopover(false);
    setShowAgentPopover(false);
  };

  /* ───────── Batch Handlers ───────── */
  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const ids = Array.from(table.selectedIds);
      const { deleted, failed } = await adminDelete("invoices", ids);
      if (deleted.length > 0) {
        const deletedSet = new Set(deleted);
        setInvoices((prev) => prev.filter((inv) => !deletedSet.has(inv.id)));
      }
      if (failed.length > 0) {
        table.showError(`${failed.length} failed: ${failed[0].message}`);
      } else {
        table.showSuccess(`${ids.length} invoice${ids.length > 1 ? "s" : ""} deleted`);
      }
      table.clearSelection();
      setShowBatchDeleteModal(false);
    } catch (err) {
      table.showError(err instanceof Error ? err.message : "Delete failed");
    } finally { setBatchDeleting(false); }
  };

  const handleBatchUpdateStatus = async () => {
    if (!batchStatusValue) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("invoices").update({ status: batchStatusValue }).eq("id", id)));
      setInvoices((prev) => prev.map((inv) => table.selectedIds.has(inv.id) ? { ...inv, status: batchStatusValue } : inv));
      table.clearSelection();
      setShowStatusPopover(false);
      setBatchStatusValue("");
      table.showSuccess(`${ids.length} invoice${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  const handleBatchUpdateAgent = async () => {
    if (!batchAgentValue) return;
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("invoices").update({ billed_by_agent_id: batchAgentValue }).eq("id", id)));
      setInvoices((prev) => prev.map((inv) => table.selectedIds.has(inv.id) ? { ...inv, billed_by_agent_id: batchAgentValue } : inv));
      table.clearSelection();
      setShowAgentPopover(false);
      setBatchAgentValue("");
      table.showSuccess(`${ids.length} invoice${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  /* Dynamic table sizing — fills container width + column resize */
  const { tableStyle, onResizeStart, isResizing } = useTableColumnSizing(scrollContainerRef, table.columns);

  /* ───────── Data loading ───────── */
  useEffect(() => {
    async function loadData() {
      const { data: invData } = await supabase
        .from("invoices")
        .select(`*, customer:users!invoices_customer_id_fkey(first_name, last_name, email), courier_group:courier_groups(code, name), billed_by_agent:agents!invoices_billed_by_agent_id_fkey(company_name, name, agent_code, email, phone, address_line1, city, state, country, zip_code), packages(awb:awbs(awb_number))`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (invData) setInvoices(invData as InvoiceRow[]);

      const { data: custData } = await supabase.from("users").select("id, first_name, last_name").eq("role", "customer");
      if (custData) setCustomers(custData as Customer[]);

      const { data: grpData } = await supabase.from("courier_groups").select("id, code, name").is("deleted_at", null);
      if (grpData) setCourierGroups(grpData as CourierGroup[]);

      const { data: agentData } = await supabase.from("agents").select("id, name, company_name, agent_code, email, phone, address_line1, address_line2, city, state, country, zip_code").eq("status", "active").is("deleted_at", null).order("name");
      if (agentData) setBillingAgents(agentData as BillingAgent[]);

      setLoading(false);
    }
    loadData();
  }, []);

  /* ───────── Filtering / Sorting ───────── */
  const filtered = invoices.filter((inv) => {
    const q = table.search.toLowerCase();
    const matchesSearch = !q ||
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.customer && `${inv.customer.first_name} ${inv.customer.last_name}`.toLowerCase().includes(q)) ||
      inv.customer?.email?.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aV: string | number = "";
    let bV: string | number = "";
    if (table.sort.field === "customer_name") {
      aV = a.customer ? `${a.customer.first_name} ${a.customer.last_name}`.toLowerCase() : "";
      bV = b.customer ? `${b.customer.first_name} ${b.customer.last_name}`.toLowerCase() : "";
    } else if (table.sort.field === "invoice_number") {
      aV = a.invoice_number.toLowerCase(); bV = b.invoice_number.toLowerCase();
    } else if (table.sort.field === "status") {
      aV = a.status; bV = b.status;
    } else if (table.sort.field === "total") {
      aV = a.total ?? 0; bV = b.total ?? 0;
    } else if (table.sort.field === "due_date") {
      aV = a.due_date ? new Date(a.due_date).getTime() : 0; bV = b.due_date ? new Date(b.due_date).getTime() : 0;
    } else if (table.sort.field === "created_at") {
      aV = new Date(a.created_at).getTime(); bV = new Date(b.created_at).getTime();
    }
    if (aV < bV) return table.sort.direction === "asc" ? -1 : 1;
    if (aV > bV) return table.sort.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Update total items count
  useEffect(() => {
    table.setTotalItems(filtered.length);
  }, [filtered.length, table]);

  const paginatedData = sorted.slice((table.currentPage - 1) * table.pageSize, table.currentPage * table.pageSize);

  /* ───────── Create ───────── */
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateInvoice = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!formData.customer_id || !formData.billed_by_agent_id || !formData.rate_per_lb || !formData.subtotal) {
      table.showError("Please fill all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      // Fetch org_id dynamically from the organization
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) { table.showError("Error: no organization found"); return; }

      const subtotal = parseFloat(formData.subtotal);
      const taxRate = parseFloat(formData.tax_rate) || 0;
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount;

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          invoice_number: formData.invoice_number,
          customer_id: formData.customer_id,
          courier_group_id: null,
          billed_by_agent_id: formData.billed_by_agent_id,
          pricing_model: formData.pricing_model,
          rate_per_lb: parseFloat(formData.rate_per_lb),
          subtotal,
          tax_amount: taxAmount,
          total,
          currency: "USD",
          due_date: formData.due_date || null,
          notes: formData.notes || null,
          status: "draft",
          org_id: orgRow.id,
        })
        .select(`*, customer:users!invoices_customer_id_fkey(first_name, last_name, email), courier_group:courier_groups(code, name), billed_by_agent:agents!invoices_billed_by_agent_id_fkey(company_name, name, agent_code, email, phone, address_line1, city, state, country, zip_code), packages(awb:awbs(awb_number))`)
        .single();

      if (error) { console.error("Error creating invoice:", error); table.showError("Error creating invoice"); return; }
      if (data) {
        setInvoices((prev) => [data as InvoiceRow, ...prev]);
        setShowCreateModal(false);
        setFormData({
          customer_id: "",
          billed_by_agent_id: "",
          invoice_number: generateInvoiceNumber(),
          pricing_model: "gross_weight",
          rate_per_lb: "",
          subtotal: "",
          tax_rate: "0",
          due_date: "",
          notes: "",
        });
        table.setCurrentPage(1);
        table.showSuccess("Invoice created successfully");

        // Notify customer their invoice is ready (fire-and-forget)
        if (data.customer_id) {
          import("@/modules/notifications/lib/triggers").then(({ notifyInvoiceReady }) => {
            notifyInvoiceReady({
              orgId: orgRow.id,
              customerId: data.customer_id,
              invoiceNumber: data.invoice_number,
            });
          }).catch(console.error);
        }
      }
    } finally { setIsSubmitting(false); }
  };

  // Summary stats
  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;

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
      {table.errorMessage && (
        <div className="fixed top-6 right-6 z-50 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui shadow-sm">
          <AlertTriangle size={16} />
          {table.errorMessage}
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreateModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Create invoice</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Customer</label>
                <SearchableSelect
                  value={formData.customer_id}
                  onChange={(v) => setFormData((prev) => ({ ...prev, customer_id: v }))}
                  placeholder="Select a customer"
                  searchPlaceholder="Search customers…"
                  options={customers.map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}` }))}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Bill From (Agent)</label>
                <SearchableSelect
                  value={formData.billed_by_agent_id}
                  onChange={(v) => setFormData((prev) => ({ ...prev, billed_by_agent_id: v }))}
                  placeholder="Select an agent"
                  searchPlaceholder="Search agents…"
                  options={billingAgents.map((a) => ({ value: a.id, label: `${a.agent_code ? `${a.agent_code} — ` : ""}${a.company_name || a.name}${a.city ? ` — ${a.city}` : ""}` }))}
                />
                {formData.billed_by_agent_id && (() => {
                  const agent = billingAgents.find((a) => a.id === formData.billed_by_agent_id);
                  if (!agent) return null;
                  const parts = [agent.address_line1, agent.city, agent.state, agent.zip_code, agent.country].filter(Boolean);
                  return parts.length > 0 ? (
                    <p className="text-meta text-txt-placeholder mt-1">{parts.join(", ")}</p>
                  ) : null;
                })()}
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Invoice Number</label>
                <input type="text" name="invoice_number" value={formData.invoice_number} onChange={handleInputChange} readOnly className="form-input bg-surface-secondary opacity-70" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Pricing Model</label>
                <SearchableSelect
                  value={formData.pricing_model}
                  onChange={(v) => setFormData((prev) => ({ ...prev, pricing_model: v }))}
                  searchable={false}
                  options={[{ value: "gross_weight", label: "Gross Weight" }, { value: "volume_weight", label: "Volume Weight" }]}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Rate per Lb</label>
                <input type="number" name="rate_per_lb" value={formData.rate_per_lb} onChange={handleInputChange} required step="0.01" min="0" className="form-input" placeholder="0.00" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Subtotal</label>
                <input type="number" name="subtotal" value={formData.subtotal} onChange={handleInputChange} required step="0.01" min="0" className="form-input" placeholder="0.00" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Tax Rate (%)</label>
                <input type="number" name="tax_rate" value={formData.tax_rate} onChange={handleInputChange} step="0.01" min="0" className="form-input" placeholder="0" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Due Date</label>
                <input type="date" name="due_date" value={formData.due_date} onChange={handleInputChange} className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} className="form-input resize-none" placeholder="Add any additional notes..." rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleCreateInvoice} disabled={isSubmitting || !formData.customer_id || !formData.billed_by_agent_id || !formData.rate_per_lb || !formData.subtotal} className="btn-primary flex items-center gap-2 cursor-pointer">
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                Create invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">invoice {viewInvoice.invoice_number}</h3>
              <button onClick={() => setViewInvoice(null)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            {/* Bill From section */}
            {viewInvoice.billed_by_agent && (
              <div className="p-3 bg-surface-secondary border border-border rounded-md text-ui-sm">
                <p className="text-txt-tertiary text-meta uppercase tracking-wider mb-2">Bill from</p>
                <p className="text-txt-primary font-semibold">{viewInvoice.billed_by_agent.agent_code || viewInvoice.billed_by_agent.company_name || viewInvoice.billed_by_agent.name}</p>
                {viewInvoice.billed_by_agent.email && <p className="text-txt-secondary mt-0.5">{viewInvoice.billed_by_agent.email}</p>}
                {viewInvoice.billed_by_agent.phone && <p className="text-txt-secondary mt-0.5">{viewInvoice.billed_by_agent.phone}</p>}
                {viewInvoice.billed_by_agent.address_line1 && (
                  <p className="text-txt-secondary mt-0.5">
                    {[viewInvoice.billed_by_agent.address_line1, viewInvoice.billed_by_agent.city, viewInvoice.billed_by_agent.state, viewInvoice.billed_by_agent.zip_code, viewInvoice.billed_by_agent.country].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-ui-sm">
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Customer</p>
                <p className="text-txt-primary font-medium">{viewInvoice.customer ? `${viewInvoice.customer.first_name} ${viewInvoice.customer.last_name}` : "—"}</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Email</p>
                <p className="text-txt-primary font-medium">{viewInvoice.customer?.email || "—"}</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Status</p>
                <span className={`status-badge ${statusConfig[viewInvoice.status]?.bg} ${statusConfig[viewInvoice.status]?.text}`}>
                  <span className={`status-dot ${statusConfig[viewInvoice.status]?.dot}`} />
                  {statusConfig[viewInvoice.status]?.label || viewInvoice.status}
                </span>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Pricing</p>
                <p className="text-txt-primary capitalize font-medium">{viewInvoice.pricing_model} @ {formatCurrency(viewInvoice.rate_per_lb)}/lb</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Subtotal</p>
                <p className="text-txt-primary font-medium">{formatCurrency(viewInvoice.subtotal, viewInvoice.currency)}</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Tax</p>
                <p className="text-txt-primary font-medium">{formatCurrency(viewInvoice.tax_amount, viewInvoice.currency)}</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Total</p>
                <p className="text-txt-primary font-semibold text-ui">{formatCurrency(viewInvoice.total, viewInvoice.currency)}</p>
              </div>
              <div>
                <p className="text-txt-tertiary text-meta mb-1.5">Due Date</p>
                <p className="text-txt-primary font-medium">{viewInvoice.due_date ? new Date(viewInvoice.due_date).toLocaleDateString() : "—"}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Main Content ════════ */}
      {/* ════════ Header ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Invoices</h2>
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
            <input
              type="text"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search invoices, customers, or amounts..."
              className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => setShowCreateModal(true)} className="btn-primary cursor-pointer">
            <Plus size={16} strokeWidth={2.5} />
            Create Invoice
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
            className={`filter-pill${statusFilter !== "all" ? " active" : ""}${openFilter === "status" ? " open" : ""}`}>
            <Tag size={13} />
            <span>Status: {statusFilter === "all" ? "All" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}</span>
            <ChevronDown size={12} className="chevron-icon" />
          </button>
          {openFilter === "status" && (
            <div className="filter-dropdown">
              {["all", "draft", "sent", "paid", "overdue", "cancelled"].map((val) => (
                <button key={val} onClick={() => { setStatusFilter(val); setOpenFilter(null); }}
                  className={`filter-dropdown-item${statusFilter === val ? " selected" : ""}`}>
                  <span>{val === "all" ? "All" : val.charAt(0).toUpperCase() + val.slice(1)}</span>
                  <Check size={14} className="check-icon" />
                </button>
              ))}
            </div>
          )}
        </div>

        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} className="text-meta text-primary hover:text-primary/80 transition-colors cursor-pointer">
            Clear All
          </button>
        )}
      </div>

      <div className="px-4 py-4 flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 shrink-0">
          <div className="bg-white border border-border rounded-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center">
                <Send className="w-3.5 h-3.5 text-txt-secondary" />
              </div>
              <span className="text-txt-tertiary text-meta tracking-tight">outstanding</span>
            </div>
            <p className="text-lg font-semibold text-txt-primary">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="bg-white border border-border rounded-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-txt-secondary" />
              </div>
              <span className="text-txt-tertiary text-meta tracking-tight">collected</span>
            </div>
            <p className="text-lg font-semibold text-txt-primary">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="bg-white border border-border rounded-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-txt-secondary" />
              </div>
              <span className="text-txt-tertiary text-meta tracking-tight">overdue</span>
            </div>
            <p className="text-lg font-semibold text-txt-primary">{overdueCount}</p>
          </div>
        </div>

        {/* Result count */}
        <div className="text-ui mb-2 shrink-0 flex items-center justify-between">
          <div>
            <span className="font-semibold text-txt-primary">{table.selectedIds.size > 0 ? `${table.selectedIds.size} selected of ` : ""}{sorted.length}/{invoices.length}</span>
            <span className="text-txt-secondary"> Invoices</span>
          </div>
          {table.selectedIds.size > 0 && (
            <button onClick={() => table.clearSelection()} className="flex items-center gap-1 px-2 py-1 text-meta text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors cursor-pointer">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ════════ Spreadsheet Table Container ════════ */}
        <div className="sheet-table-wrap">
          {/* Scrollable table — ONLY this scrolls horizontally */}
          <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
            <table
              className="sheet-table"
              style={tableStyle}
            >
              <thead className="sheet-thead">
                <tr>
                  {table.visibleColumns.map((col, idx) => {
                    const isDragOver = table.dragOverIdx === idx && table.dragColIdx !== idx;
                    const firstMovable = table.visibleColumns.findIndex((c) => !c.sticky);
                    const lastMovable = table.visibleColumns.length - 1;
                    return (
                      <th
                        key={col.key}
                        style={{
                          width: `var(--col-${col.key}-size)`,
                          position: col.sticky ? "sticky" : undefined,
                          left: col.sticky ? (idx === 0 ? 0 : undefined) : undefined,
                          zIndex: col.sticky ? 12 : 10,
                          borderLeft: isDragOver ? "2px solid var(--color-primary)" : undefined,
                        }}
                        draggable={!col.sticky && !isResizing}
                        onDragStart={() => table.setDragColIdx(idx)}
                        onDragOver={(e) => { e.preventDefault(); if (!col.sticky && !isResizing) table.setDragOverIdx(idx); }}
                        onDrop={() => {
                          if (table.dragColIdx === null || col.sticky || isResizing) return;
                          table.moveColumn(table.dragColIdx, idx);
                          table.setDragColIdx(null);
                          table.setDragOverIdx(null);
                        }}
                        onDragEnd={() => { table.setDragColIdx(null); table.setDragOverIdx(null); }}
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
                            onClick={() => table.toggleSelectAll(paginatedData.map((inv) => inv.id))}
                            className="sheet-checkbox"
                          >
                            {table.selectedIds.size === paginatedData.length && paginatedData.length > 0 && <Check size={12} />}
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
                              sortField={col.sortField}
                              currentSortField={table.sort.field}
                              currentSortDir={table.sort.direction}
                              onSort={(f) => table.handleSort(f as SortField)}
                              canMoveLeft={idx > firstMovable}
                              canMoveRight={idx < lastMovable}
                              onMoveLeft={() => table.moveColumn(idx, idx - 1)}
                              onMoveRight={() => table.moveColumn(idx, idx + 1)}
                              onHide={() => table.toggleColumnVisibility(col.key)}
                            />
                          </>
                        )}
                        {/* Separator + resize handle */}
                        {idx < table.visibleColumns.length - 1 && (
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
                      {table.visibleColumns.map((col) => (
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
                    <td colSpan={table.visibleColumns.length} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <FileText size={24} className="empty-state-icon" />
                        <p className="empty-state-title">{table.search ? "No invoices match your search" : "No invoices yet"}</p>
                        <p className="empty-state-desc">
                          {table.search ? "Try adjusting your search term" : "Click \"Create Invoice\" to create one"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((inv) => (
                    <tr key={inv.id} className="sheet-row cursor-pointer" onClick={() => router.push(`/admin/invoices/${inv.id}`)}>
                      {table.visibleColumns.map((col) => {
                        let cellContent: React.ReactNode = null;

                        if (col.key === "checkbox") {
                          cellContent = (
                            <button
                              role="checkbox"
                              aria-checked={table.selectedIds.has(inv.id)}
                              data-checked={table.selectedIds.has(inv.id)}
                              onClick={(e) => { e.stopPropagation(); table.toggleSelect(inv.id); }}
                              className="sheet-checkbox"
                            >
                              {table.selectedIds.has(inv.id) && <Check size={12} />}
                            </button>
                          );
                        } else if (col.key === "invoice") {
                          cellContent = (
                            <>
                              <span className="font-mono text-ui sheet-cell-content">{inv.invoice_number}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/admin/invoices/${inv.id}`); }}
                                className="row-open-btn"
                              >
                                <Eye size={14} />
                                Open
                              </button>
                            </>
                          );
                        } else if (col.key === "customer") {
                          cellContent = (
                            <span className="text-txt-primary text-ui">
                              {inv.customer ? `${inv.customer.first_name} ${inv.customer.last_name}` : "—"}
                            </span>
                          );
                        } else if (col.key === "group") {
                          const agentName = inv.billed_by_agent?.agent_code || inv.billed_by_agent?.company_name || inv.billed_by_agent?.name;
                          cellContent = agentName ? (
                            <span className="bg-surface-secondary text-txt-primary px-2 py-0.5 rounded text-meta">
                              {agentName}
                            </span>
                          ) : inv.courier_group ? (
                            <span className="bg-surface-secondary text-txt-primary px-2 py-0.5 rounded text-meta">
                              {inv.courier_group.code}
                            </span>
                          ) : "—";
                        } else if (col.key === "shipment") {
                          const awbNumbers = Array.from(new Set(
                            (inv.packages || [])
                              .map((p) => p.awb?.awb_number)
                              .filter((n): n is string => !!n)
                          ));
                          cellContent = awbNumbers.length > 0 ? (
                            <span className="font-mono text-ui-sm text-txt-primary">{awbNumbers.join(", ")}</span>
                          ) : (
                            <span className="text-txt-tertiary">—</span>
                          );
                        } else if (col.key === "status") {
                          const sc = statusConfig[inv.status];
                          cellContent = (
                            <span className={`status-badge ${sc?.bg} ${sc?.text}`}>
                              <span className={`status-dot ${sc?.dot}`} />
                              {sc?.label || inv.status}
                            </span>
                          );
                        } else if (col.key === "total") {
                          cellContent = <span className="font-semibold text-ui">{formatCurrency(Number(inv.total), inv.currency)}</span>;
                        } else if (col.key === "due_date") {
                          cellContent = <span className="text-txt-secondary text-ui" style={{ fontWeight: 400 }}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</span>;
                        } else if (col.key === "created") {
                          cellContent = <span className="text-txt-secondary text-ui" style={{ fontWeight: 400 }}>{new Date(inv.created_at).toLocaleDateString()}</span>;
                        }

                        return (
                          <td
                            key={col.key}
                            style={{
                              width: `var(--col-${col.key}-size)`,
                              position: col.sticky ? "sticky" : undefined,
                              left: col.sticky ? (table.visibleColumns.indexOf(col) === 0 ? 0 : undefined) : undefined,
                              zIndex: col.sticky ? 1 : undefined,
                            }}
                            className={`
                              sheet-cell
                              ${col.sticky ? "bg-white" : ""}
                              ${col.key === "checkbox" ? "sheet-checkbox-cell" : ""}
                            `}
                          >
                            {cellContent}
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
              Item {table.startItem} to {table.endItem}
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
      {(showStatusPopover || showAgentPopover) && (
        <div className="popover-backdrop" onClick={() => closeAllPopovers()} />
      )}

      {/* ═══ Floating Batch Action Bar ═══ */}
      <BatchBar selectedCount={table.selectedIds.size} onClear={() => table.clearSelection()}>
        <div className="flex items-center gap-4">
          <button onClick={() => { closeAllPopovers(); setShowStatusPopover(true); setBatchStatusValue(""); }} className={`batch-bar-btn ${showStatusPopover ? "active" : ""}`}>
            <Tag size={16} />
            Status
          </button>
          <button onClick={() => { closeAllPopovers(); setShowAgentPopover(true); setBatchAgentValue(""); }} className={`batch-bar-btn ${showAgentPopover ? "active" : ""}`}>
            <User size={16} />
            Agent
          </button>
          <button onClick={() => setShowBatchDeleteModal(true)} className="batch-bar-btn danger">
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </BatchBar>

      {/* ═══ Status Popover ═══ */}
      {showStatusPopover && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Update status</h3>
            <button onClick={() => setShowStatusPopover(false)} className="batch-popover-close">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-1 mb-4">
            {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
              <button key={s} onClick={() => setBatchStatusValue(s)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${batchStatusValue === s ? "bg-primary/5 ring-1 ring-primary/30" : "hover:bg-surface-hover"}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${s === "draft" ? "bg-gray-400" : s === "sent" ? "bg-blue-400" : s === "paid" ? "bg-green-500" : s === "overdue" ? "bg-red-400" : "bg-gray-300"}`} />
                <span className="text-ui text-txt-primary flex-1 capitalize">{s}</span>
                {batchStatusValue === s && <Check size={15} className="text-primary" />}
              </button>
            ))}
          </div>
          <div className="batch-popover-actions">
            <button onClick={handleBatchUpdateStatus} disabled={!batchStatusValue || batchUpdating} className="batch-popover-apply cursor-pointer">
              {batchUpdating && <Loader2 size={14} className="animate-spin" />}
              Update Status
            </button>
            <button onClick={() => setShowStatusPopover(false)} className="batch-popover-cancel cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ═══ Agent Popover ═══ */}
      {showAgentPopover && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Assign billing agent</h3>
            <button onClick={() => setShowAgentPopover(false)} className="batch-popover-close">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="batch-popover-label">Agent</label>
              <SearchableSelect value={batchAgentValue} onChange={(v) => setBatchAgentValue(v)} placeholder="Select agent" searchPlaceholder="Search agents…" options={billingAgents.map((a) => ({ value: a.id, label: a.agent_code ? `${a.agent_code} — ${a.company_name || a.name}` : a.company_name || a.name }))} />
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
                <h3 className="text-ui font-semibold text-txt-primary">Delete {table.selectedIds.size} invoice{table.selectedIds.size > 1 ? "s" : ""}</h3>
                <p className="text-muted text-txt-secondary mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBatchDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleBatchDelete} disabled={batchDeleting} className="btn-primary bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-2 cursor-pointer">
                {batchDeleting && <Loader2 size={14} className="animate-spin" />}
                Delete {table.selectedIds.size} invoice{table.selectedIds.size > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
