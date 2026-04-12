"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
import Papa from "papaparse";
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  User,
  Mail,
  Phone,
  Calendar,
  Upload,
  Check,
  Truck,
  ToggleLeft,
  ToggleRight,
  ExternalLink,
  Eye,
  EyeOff,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

/* ───────── Types ───────── */
type RecipientRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  courier_group_id: string | null;
  agent_id: string | null;
  aliases: string[];
  is_active: boolean;
  created_at: string;
  courier_group?: { code: string; name: string } | null;
  agent?: { id: string; name: string; company_name: string | null; agent_code: string | null } | null;
};

type AgentItem = {
  id: string;
  name: string;
  company_name: string | null;
  agent_code: string | null;
};

type CourierGroup = {
  id: string;
  code: string;
  name: string;
};

type FormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  agent_id: string;
  aliases: string;
  portal_access: boolean;
};

/* ───────── Constants ───────── */
const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: "checkbox", label: "", icon: Users, width: 40, minWidth: 40, sortable: false, sticky: true, visible: true },
  { key: "name", label: "Name", icon: User, width: 200, minWidth: 140, sortable: true, sortField: "name", visible: true },
  { key: "email", label: "Email", icon: Mail, width: 220, minWidth: 160, sortable: true, sortField: "email", editable: true, visible: true },
  { key: "phone", label: "Phone", icon: Phone, width: 160, minWidth: 120, sortable: false, editable: true, visible: true },
  { key: "group", label: "Agent", icon: Truck, width: 120, minWidth: 80, sortable: true, sortField: "group", visible: true },
  { key: "portal", label: "Portal", icon: ToggleRight, width: 100, minWidth: 80, sortable: false, visible: true },
  { key: "added", label: "Added", icon: Calendar, width: 140, minWidth: 110, sortable: true, sortField: "created_at", visible: true },
] satisfies ColumnDef[];

/* ───────── Component ───────── */
export default function CustomersPage() {
  const router = useRouter();
  const supabase = createClient();

  /* Data state */
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [courierGroups, setCourierGroups] = useState<CourierGroup[]>([]);
  const [agentsList, setAgentsList] = useState<AgentItem[]>([]);

  /* Table state — now managed by useTableState hook */
  const table = useTableState({
    defaultColumns: DEFAULT_COLUMNS,
    defaultSort: { field: "created_at", direction: "desc" },
  });

  /* Modals */
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    agent_id: "",
    aliases: "",
    portal_access: false,
  });

  /* CSV Import */
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<Record<string, unknown>[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const csvInputRef = useRef<HTMLInputElement>(null);

  /* Batch actions */
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchUpdating, setBatchUpdating] = useState(false);
  const [showAgentPopover, setShowAgentPopover] = useState(false);
  const [batchAgentValue, setBatchAgentValue] = useState("");
  const agentPopoverRef = useRef<HTMLDivElement>(null);
  const [showPortalPopover, setShowPortalPopover] = useState(false);
  const portalPopoverRef = useRef<HTMLDivElement>(null);

  /* Inline editing */
  const [savingCell, setSavingCell] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* Columns dropdown — close on outside click */
  const columnsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(e.target as Node)) {
        table.setShowColumnsDropdown(false);
      }
    };
    if (table.showColumnsDropdown) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [table.showColumnsDropdown, table.setShowColumnsDropdown]);

  /* ───────── Data loading ───────── */
  useEffect(() => {
    async function loadData() {
      // Load recipients — try with agent join first, fall back without
      let custData: any[] | null = null;

      const { data: d1, error: e1 } = await supabase
        .from("users")
        .select(`*, courier_group:courier_groups(code, name), agent:agents(id, name, company_name, agent_code)`)
        .eq("role", "customer")
        .order("created_at", { ascending: false })
        .limit(500);

      if (e1) {
        console.warn("[Recipients] Join query failed:", e1.message, e1.code, e1.details);

        // Fallback: no joins at all
        const { data: d2, error: e2 } = await supabase
          .from("users")
          .select("*")
          .eq("role", "customer")
          .order("created_at", { ascending: false })
          .limit(500);

        if (e2) {
          console.error("[Recipients] Basic query also failed:", e2.message, e2.code);
          table.showError("Failed to load recipients: " + e2.message);
        } else {
          custData = d2;
          // Merge agent info separately
          if (custData && custData.length > 0) {
            const agentIds = Array.from(new Set(custData.map((u: any) => u.agent_id).filter(Boolean)));
            if (agentIds.length > 0) {
              const { data: agentData } = await supabase
                .from("agents")
                .select("id, name, company_name, agent_code")
                .in("id", agentIds);
              const agentMap = new Map((agentData || []).map((a: any) => [a.id, a]));
              for (const user of custData) {
                user.agent = user.agent_id ? agentMap.get(user.agent_id) || null : null;
              }
            }
          }
        }
      } else {
        custData = d1;
      }

      if (custData) {
        setRecipients(custData as RecipientRow[]);
      } else if (!e1) {
        // Query succeeded but returned null/empty — show count for debugging
        table.showError("No recipients found (query returned empty)");
      }

      const { data: grpData } = await supabase.from("courier_groups").select("id, code, name").is("deleted_at", null);
      if (grpData) setCourierGroups(grpData as CourierGroup[]);

      const { data: agentsData } = await supabase.from("agents").select("id, name, company_name, agent_code").eq("status", "active").order("name");
      if (agentsData) setAgentsList(agentsData as AgentItem[]);

      setLoading(false);
    }
    loadData();
  }, []);


  /* ───────── CSV Import ───────── */
  const handleFileSelect = (file: File) => {
    setImportFile(file);
    setImportData([]);
    setImportErrors([]);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, unknown>[];
        const errors: string[] = [];

        // Validate rows
        rows.forEach((row, idx) => {
          const firstName = (row.first_name as string || "").trim();
          const lastName = (row.last_name as string || "").trim();
          const email = (row.email as string || "").trim();

          if (!firstName) errors.push(`Row ${idx + 1}: first_name is required`);
          if (!lastName) errors.push(`Row ${idx + 1}: last_name is required`);
          if (!email) errors.push(`Row ${idx + 1}: email is required`);
          else if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            errors.push(`Row ${idx + 1}: invalid email format`);
          }
        });

        // Check for duplicate emails
        const emailSet = new Set<string>();
        rows.forEach((row, idx) => {
          const email = (row.email as string || "").trim().toLowerCase();
          if (emailSet.has(email)) {
            errors.push(`Row ${idx + 1}: duplicate email address`);
          }
          emailSet.add(email);
        });

        setImportData(rows);
        setImportErrors(errors);
      },
      error: (error) => {
        setImportErrors([`Parse error: ${error.message}`]);
      },
    });
  };

  const downloadTemplate = () => {
    const headers = "first_name,last_name,email,phone,agent_code,aliases\n";
    const example = "John,Doe,john@example.com,+1 (555) 000-0000,AG001,Johnny;JD\n";
    const csvContent = headers + example;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "recipients-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportCSV = async () => {
    if (importData.length === 0 || importErrors.length > 0) return;
    setImporting(true);
    setImportProgress(0);

    try {
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) {
        setImportErrors(["No organization found"]);
        setImporting(false);
        return;
      }

      let successCount = 0;
      const errors: string[] = [];
      const newRecipients: RecipientRow[] = [];

      for (let i = 0; i < importData.length; i++) {
        const row = importData[i];
        const firstName = (row.first_name as string || "").trim();
        const lastName = (row.last_name as string || "").trim();
        const email = (row.email as string || "").trim();
        const phone = (row.phone as string || "").trim() || null;
        const agentCode = (row.agent_code as string || "").trim();
        const aliasesStr = (row.aliases as string || "").trim();

        try {
          // Find agent by code if provided
          let agentId: string | null = null;
          if (agentCode) {
            const agent = agentsList.find((a) => a.agent_code === agentCode);
            if (!agent) {
              errors.push(`Row ${i + 1}: agent code "${agentCode}" not found`);
              setImportProgress(((i + 1) / importData.length) * 100);
              continue;
            }
            agentId = agent.id;
          }

          const aliasArray = aliasesStr
            ? aliasesStr.split(";").map((a) => a.trim()).filter(Boolean)
            : [];

          const res = await fetch("/api/admin/create-recipient", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              first_name: firstName,
              last_name: lastName,
              email: email,
              phone: phone,
              agent_id: agentId,
              aliases: aliasArray,
              is_active: true,
            }),
          });
          const json = await res.json();
          if (!res.ok) {
            errors.push(`Row ${i + 1}: ${json.error || "Failed"}`);
          } else {
            const { data: result } = await supabase
              .from("users")
              .select("*")
              .eq("id", json.id)
              .single();
            if (result) {
              const enriched: any = { ...result, agent: null, courier_group: null };
              if (result.agent_id) {
                const matched = agentsList.find((a) => a.id === result.agent_id);
                if (matched) enriched.agent = matched;
              }
              newRecipients.push(enriched as RecipientRow);
              successCount++;
            }
          }
        } catch (err) {
          errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }

        setImportProgress(((i + 1) / importData.length) * 100);
      }

      setRecipients((prev) => [...newRecipients, ...prev]);
      table.setCurrentPage(1);
      table.showSuccess(`${successCount} recipient(s) imported`);
      setShowImportModal(false);
      setImportFile(null);
      setImportData([]);
      setImportErrors(errors.length > 0 ? errors : []);

      if (errors.length > 0) {
        setImportErrors(errors);
      }
    } finally {
      setImporting(false);
      setImportProgress(0);
    }
  };

  /* Dynamic table sizing — fills container width + column resize */
  const { tableStyle, onResizeStart, isResizing } = useTableColumnSizing(scrollContainerRef, table.columns);

  /* ───────── Filtering / Sorting ───────── */
  const filtered = recipients.filter((r) => {
    const q = table.search.toLowerCase();
    const matchesSearch = !q ||
      `${r.first_name} ${r.last_name}`.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q) ||
      r.courier_group?.code.toLowerCase().includes(q) ||
      r.agent?.name.toLowerCase().includes(q) ||
      r.agent?.company_name?.toLowerCase().includes(q) ||
      r.aliases?.some((a) => a.toLowerCase().includes(q));
    return matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aV: string | number = "";
    let bV: string | number = "";
    if (table.sort.field === "name") {
      aV = `${a.first_name} ${a.last_name}`.toLowerCase();
      bV = `${b.first_name} ${b.last_name}`.toLowerCase();
    } else if (table.sort.field === "email") {
      aV = a.email.toLowerCase(); bV = b.email.toLowerCase();
    } else if (table.sort.field === "group") {
      aV = (a.agent?.company_name || a.agent?.name || "").toLowerCase(); bV = (b.agent?.company_name || b.agent?.name || "").toLowerCase();
    } else if (table.sort.field === "created_at") {
      aV = new Date(a.created_at).getTime(); bV = new Date(b.created_at).getTime();
    }
    if (aV < bV) return table.sort.direction === "asc" ? -1 : 1;
    if (aV > bV) return table.sort.direction === "asc" ? 1 : -1;
    return 0;
  });

  // Keep pagination in sync with filtered data
  useEffect(() => {
    table.setTotalItems(sorted.length);
  }, [sorted.length, table]);

  const paginatedData = sorted.slice((table.currentPage - 1) * table.pageSize, table.currentPage * table.pageSize);

  /* ───────── Column drag handlers ───────── */
  const handleDragStart = (idx: number) => {
    if (table.visibleColumns[idx].sticky || isResizing) return;
    table.setDragColIdx(idx);
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (table.visibleColumns[idx].sticky || isResizing) return;
    table.setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (table.dragColIdx === null || table.visibleColumns[idx].sticky || isResizing) return;
    table.moveColumn(table.dragColIdx, idx);
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };
  const handleDragEnd = () => {
    table.setDragColIdx(null);
    table.setDragOverIdx(null);
  };

  // Close all batch popovers — ensures only one is open at a time
  const closeAllPopovers = () => {
    setShowAgentPopover(false);
    setShowPortalPopover(false);
  };

  /* ───────── Batch Handlers ───────── */
  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const ids = Array.from(table.selectedIds);
      const { deleted, failed } = await adminDelete("users", ids);
      if (deleted.length > 0) {
        const deletedSet = new Set(deleted);
        setRecipients((prev) => prev.filter((r) => !deletedSet.has(r.id)));
      }
      if (failed.length > 0) {
        table.showSuccess(`${failed.length} failed: ${failed[0].message}`);
      } else {
        table.showSuccess(`${ids.length} recipient${ids.length > 1 ? "s" : ""} deleted`);
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
      await Promise.all(ids.map((id) => supabase.from("users").update({ agent_id: batchAgentValue || null }).eq("id", id)));
      const agent = agentsList.find((a) => a.id === batchAgentValue);
      setRecipients((prev) => prev.map((r) => table.selectedIds.has(r.id) ? { ...r, agent_id: batchAgentValue, agent: agent ? { id: agent.id, name: agent.name, company_name: agent.company_name, agent_code: agent.agent_code } : null } : r));
      table.clearSelection();
      setShowAgentPopover(false);
      setBatchAgentValue("");
      table.showSuccess(`${ids.length} recipient${ids.length > 1 ? "s" : ""} updated`);
    } finally { setBatchUpdating(false); }
  };

  const handleBatchPortalAccess = async (enable: boolean) => {
    setBatchUpdating(true);
    try {
      const ids = Array.from(table.selectedIds);
      await Promise.all(ids.map((id) => supabase.from("users").update({ is_active: enable }).eq("id", id)));
      setRecipients((prev) => prev.map((r) => table.selectedIds.has(r.id) ? { ...r, is_active: enable } : r));
      table.clearSelection();
      setShowPortalPopover(false);
      table.showSuccess(`Portal access ${enable ? "enabled" : "disabled"} for ${ids.length} recipient${ids.length > 1 ? "s" : ""}`);
    } finally { setBatchUpdating(false); }
  };

  /* ───────── Create ───────── */
  const handleAddRecipient = async () => {
    if (!formData.first_name || !formData.last_name || !formData.email) return;
    setCreating(true);
    try {
      const aliasArray = formData.aliases
        ? formData.aliases.split(",").map((a) => a.trim()).filter(Boolean)
        : [];

      const res = await fetch("/api/admin/create-recipient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone || null,
          agent_id: formData.agent_id || null,
          aliases: aliasArray,
          is_active: formData.portal_access,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        table.showError(json.error || "Failed to add recipient");
        return;
      }

      // Re-fetch the new record (no agent join — it breaks on this DB)
      const { data: result } = await supabase
        .from("users")
        .select("*")
        .eq("id", json.id)
        .single();

      if (result) {
        // Attach agent info if assigned
        const enriched: any = { ...result, agent: null, courier_group: null };
        if (result.agent_id) {
          const matched = agentsList.find((a) => a.id === result.agent_id);
          if (matched) enriched.agent = matched;
        }
        setRecipients((prev) => [enriched as RecipientRow, ...prev]);
        setShowAddModal(false);
        setFormData({
          first_name: "",
          last_name: "",
          email: "",
          phone: "",
          agent_id: "",
          aliases: "",
          portal_access: false,
        });
        table.setCurrentPage(1);
        table.showSuccess("Recipient added");
      } else {
        table.showError("Recipient created but failed to load — please refresh");
      }
    } catch (err) {
      table.showError(err instanceof Error ? err.message : "Failed to add recipient");
    } finally { setCreating(false); }
  };

  /* ───────── Inline Edit ───────── */
  const saveEdit = async () => {
    if (!table.editingCell) return;
    setSavingCell(true);
    try {
      const { rowId, colKey } = table.editingCell;
      let updatePayload: Record<string, unknown> = {};

      if (colKey === "email") updatePayload = { email: table.editValue };
      else if (colKey === "phone") updatePayload = { phone: table.editValue || null };

      const { error } = await supabase.from("users").update(updatePayload).eq("id", rowId);
      if (!error) {
        setRecipients((prev) => prev.map((r) => {
          if (r.id !== rowId) return r;
          if (colKey === "email") return { ...r, email: table.editValue };
          if (colKey === "phone") return { ...r, phone: table.editValue || null };
          return r;
        }));
        table.showSuccess("Updated");
      }
    } finally {
      setSavingCell(false);
      table.cancelEdit();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") table.cancelEdit();
  };

  /* ───────── Render cell content ───────── */
  const renderCell = (recipient: RecipientRow, col: ColumnDef) => {
    const isEditing = table.editingCell?.rowId === recipient.id && table.editingCell?.colKey === col.key;

    switch (col.key) {
      case "checkbox":
        return (
          <button
            role="checkbox"
            aria-checked={table.selectedIds.has(recipient.id)}
            data-checked={table.selectedIds.has(recipient.id)}
            onClick={() => table.toggleSelect(recipient.id)}
            className="sheet-checkbox"
          >
            {table.selectedIds.has(recipient.id) && <Check size={12} />}
          </button>
        );

      case "name":
        return (
          <>
            <span className="text-ui sheet-cell-content">
              {`${recipient.first_name} ${recipient.last_name}`}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); router.push(`/admin/customers/${recipient.id}`); }}
              className="row-open-btn"
            >
              <Eye size={14} />
              Open
            </button>
          </>
        );

      case "email":
        if (isEditing) {
          return (
            <input
              ref={editInputRef}
              type="email"
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
            onClick={() => table.startEdit(recipient.id, "email", recipient.email)}
            className="text-ui truncate cursor-text hover:bg-sky-50 px-1 -mx-1 py-0.5 rounded transition-colors block" style={{ fontWeight: 400 }}
          >
            {recipient.email}
          </span>
        );

      case "phone":
        if (isEditing) {
          return (
            <input
              ref={editInputRef}
              type="tel"
              value={table.editValue}
              onChange={(e) => table.setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={saveEdit}
              className="w-full bg-white border border-primary rounded px-1.5 py-0.5 text-ui focus:outline-none focus:ring-1 focus:ring-primary" style={{ fontWeight: 400 }}
            />
          );
        }
        return recipient.phone ? (
          <span
            onClick={() => table.startEdit(recipient.id, "phone", recipient.phone || "")}
            className="cursor-text hover:bg-sky-50 px-1 -mx-1 py-0.5 rounded transition-colors text-ui block" style={{ fontWeight: 400 }}
          >
            {recipient.phone}
          </span>
        ) : (
          <span
            onClick={() => table.startEdit(recipient.id, "phone", "")}
            className="text-txt-placeholder cursor-text hover:bg-sky-50 px-1 -mx-1 py-0.5 rounded transition-colors text-ui"
          >
            —
          </span>
        );

      case "group": {
        const agentLabel = recipient.agent?.agent_code || recipient.agent?.company_name || recipient.agent?.name;
        return agentLabel ? (
          <span className="courier-badge text-ui">{agentLabel}</span>
        ) : (
          <span className="text-txt-placeholder text-ui">—</span>
        );
      }

      case "portal":
        return (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              const newStatus = !recipient.is_active;
              // Optimistic update
              setRecipients((prev) => prev.map((r) => r.id === recipient.id ? { ...r, is_active: newStatus } : r));
              const { error } = await supabase.from("users").update({ is_active: newStatus }).eq("id", recipient.id);
              if (error) {
                // Revert on failure
                setRecipients((prev) => prev.map((r) => r.id === recipient.id ? { ...r, is_active: !newStatus } : r));
                table.showSuccess("Failed to update portal access");
              } else {
                table.showSuccess(`Portal access ${newStatus ? "enabled" : "disabled"}`);
              }
            }}
            className={`status-badge text-ui cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${
              recipient.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            <span className={`status-dot ${recipient.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
            {recipient.is_active ? "Active" : "Off"}
          </button>
        );

      case "added":
        return (
          <span className="text-txt-secondary text-ui" style={{ fontWeight: 400 }}>
            {new Date(recipient.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
      if (table.visibleColumns[i].sticky) left += table.visibleColumns[i].width;
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

      {/* Error Toast */}
      {table.errorMessage && (
        <div className="fixed top-6 right-6 z-50 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui shadow-sm">
          <AlertTriangle size={16} />
          {table.errorMessage}
        </div>
      )}

      {/* Add Recipient Modal */}
      {/* ════════ CSV Import Modal ════════ */}
      {showImportModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Import recipients from CSV</h3>
              <button onClick={() => setShowImportModal(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {!importFile ? (
              <div className="space-y-4">
                {/* File drop zone */}
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file && file.type === "text/csv") {
                      handleFileSelect(file);
                    }
                  }}
                  className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => csvInputRef.current?.click()}
                >
                  <Upload size={32} className="mx-auto mb-2 text-txt-tertiary" />
                  <p className="text-ui text-txt-primary">Drop CSV file here</p>
                  <p className="text-muted text-txt-tertiary mt-1">or click to select</p>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                    className="hidden"
                  />
                </div>

                {/* Template download */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-ui-sm text-txt-primary mb-2">Need a template?</p>
                  <button onClick={downloadTemplate} className="text-ui-sm text-primary hover:text-primary-dark transition-colors cursor-pointer">
                    Download CSV template
                  </button>
                </div>

                {/* Format info */}
                <div className="bg-slate-50 border border-border rounded-lg p-3 text-ui-sm">
                  <p className="font-medium text-txt-primary mb-2">Required columns:</p>
                  <ul className="text-txt-secondary space-y-1">
                    <li>• first_name</li>
                    <li>• last_name</li>
                    <li>• email</li>
                  </ul>
                  <p className="font-medium text-txt-primary mt-3 mb-2">Optional columns:</p>
                  <ul className="text-txt-secondary space-y-1">
                    <li>• phone</li>
                    <li>• agent_code (matched to your agents)</li>
                    <li>• aliases (semicolon-separated)</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* File info */}
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={18} className="text-green-600 shrink-0" />
                  <div>
                    <p className="font-medium text-green-900">{importFile.name}</p>
                    <p className="text-muted text-green-700">{importData.length} row(s)</p>
                  </div>
                </div>

                {/* Validation errors */}
                {importErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={16} className="text-red-600" />
                      <p className="font-medium text-red-900">{importErrors.length} error(s)</p>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {importErrors.map((err, idx) => (
                        <p key={idx} className="text-meta text-red-700">{err}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preview table */}
                {importData.length > 0 && importErrors.length === 0 && (
                  <div>
                    <p className="text-ui text-txt-primary mb-2">Preview (first 5 rows)</p>
                    <div className="overflow-x-auto border border-border rounded-lg">
                      <table className="w-full text-ui-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-border">
                            <th className="px-3 py-2 text-left font-medium text-txt-primary">First Name</th>
                            <th className="px-3 py-2 text-left font-medium text-txt-primary">Last Name</th>
                            <th className="px-3 py-2 text-left font-medium text-txt-primary">Email</th>
                            <th className="px-3 py-2 text-left font-medium text-txt-primary">Phone</th>
                            <th className="px-3 py-2 text-left font-medium text-txt-primary">Agent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importData.slice(0, 5).map((row, idx) => (
                            <tr key={idx} className="border-b border-border hover:bg-slate-50">
                              <td className="px-3 py-2 text-txt-primary">{row.first_name as string}</td>
                              <td className="px-3 py-2 text-txt-primary">{row.last_name as string}</td>
                              <td className="px-3 py-2 text-txt-primary">{row.email as string}</td>
                              <td className="px-3 py-2 text-txt-secondary text-meta">{row.phone ? (row.phone as string) : "—"}</td>
                              <td className="px-3 py-2 text-txt-secondary text-meta">{row.agent_code ? (row.agent_code as string) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importData.length > 5 && (
                      <p className="text-meta text-txt-tertiary mt-2">… and {importData.length - 5} more rows</p>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {importing && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-ui text-txt-primary">Importing…</p>
                      <p className="text-meta text-txt-tertiary">{Math.round(importProgress)}%</p>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${importProgress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportData([]);
                setImportErrors([]);
              }} className="btn-secondary cursor-pointer">
                {importFile ? "Cancel" : "Close"}
              </button>
              {importFile && importErrors.length === 0 && (
                <button
                  onClick={handleImportCSV}
                  disabled={importing || importData.length === 0}
                  className="btn-primary flex items-center gap-2 cursor-pointer"
                >
                  {importing && <Loader2 size={14} className="animate-spin" />}
                  Import {importData.length} recipient{importData.length !== 1 ? "s" : ""}
                </button>
              )}
              {importFile && !importErrors.length && (
                <button
                  onClick={() => {
                    setImportFile(null);
                    setImportData([]);
                    setImportErrors([]);
                  }}
                  className="btn-secondary cursor-pointer"
                >
                  Choose different file
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4">
          <div className="modal-panel max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-ui font-semibold text-txt-primary">Add recipient</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">First name</label>
                  <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} placeholder="First name" className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Last name</label>
                  <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} placeholder="Last name" className="form-input" />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="recipient@example.com" className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="form-input" />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Agent</label>
                <SearchableSelect
                  value={formData.agent_id}
                  onChange={(v) => setFormData({ ...formData, agent_id: v })}
                  placeholder="Select an agent"
                  searchPlaceholder="Search agents…"
                  options={agentsList.map((a) => ({ value: a.id, label: a.agent_code ? `${a.agent_code} — ${a.company_name || a.name}` : a.company_name || a.name }))}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Aliases</label>
                <input type="text" value={formData.aliases} onChange={(e) => setFormData({ ...formData, aliases: e.target.value })} placeholder="Comma-separated alternate names" className="form-input" />
                <p className="text-meta text-txt-tertiary mt-1">Used for matching packages to this recipient.</p>
              </div>
              <div className="flex items-center justify-between p-3 bg-white border border-border rounded-md">
                <div>
                  <p className="text-ui text-txt-primary">Portal access</p>
                  <p className="text-meta text-txt-tertiary mt-0.5">Allow this recipient to log in and view their packages.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, portal_access: !formData.portal_access })}
                  className="cursor-pointer flex-shrink-0 transition-colors duration-150"
                >
                  {formData.portal_access ? (
                    <ToggleRight size={32} className="text-primary" />
                  ) : (
                    <ToggleLeft size={32} className="text-txt-tertiary" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <button onClick={() => setShowAddModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleAddRecipient} disabled={creating || !formData.first_name || !formData.last_name || !formData.email} className="btn-primary flex items-center gap-2 cursor-pointer">
                {creating && <Loader2 size={14} className="animate-spin" />}
                Add recipient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════ Header ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Recipients</h2>
          <div className="relative w-full max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
            <input
              type="text"
              value={table.search}
              onChange={(e) => table.setSearch(e.target.value)}
              placeholder="Search recipients, emails, or groups..."
              className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <button onClick={() => setShowImportModal(true)} className="btn-secondary cursor-pointer">
            <Upload size={16} strokeWidth={2.5} />
            Import CSV
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary cursor-pointer">
            <Plus size={16} strokeWidth={2.5} />
            Add Recipient
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
      </div>

      {/* ════════ Main Content ════════ */}
      <div className="px-4 py-4 flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Result count */}
        <div className="text-ui mb-2 shrink-0 flex items-center justify-between">
          <div>
            <span className="font-semibold text-txt-primary">{table.selectedIds.size > 0 ? `${table.selectedIds.size} selected of ` : ""}{sorted.length}/{recipients.length}</span>
            <span className="text-txt-secondary"> Recipients</span>
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
                    const stickyLeft = getStickyLeft(col, idx);
                    const isDragOver = table.dragOverIdx === idx && table.dragColIdx !== idx;
                    const firstMovable = table.visibleColumns.findIndex((c) => !c.sticky);
                    const lastMovable = table.visibleColumns.length - 1;
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
                            aria-checked={table.isAllSelected(paginatedData.map((r) => r.id))}
                            data-checked={table.isAllSelected(paginatedData.map((r) => r.id))}
                            onClick={() => table.toggleSelectAll(paginatedData.map((r) => r.id))}
                            className="sheet-checkbox"
                          >
                            {table.isAllSelected(paginatedData.map((r) => r.id)) && <Check size={12} />}
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
                              onSort={(f) => table.handleSort(f)}
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
                        <Users size={24} className="empty-state-icon" />
                        <p className="empty-state-title">{table.search ? "No recipients match your search" : "No recipients yet"}</p>
                        <p className="empty-state-desc">
                          {table.search ? "Try adjusting your search term" : "Click \"Add Recipient\" to create one"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((recipient) => (
                    <tr key={recipient.id} className="sheet-row">
                      {table.visibleColumns.map((col, idx) => {
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
                            {renderCell(recipient, col)}
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
      {(showAgentPopover || showPortalPopover) && (
        <div className="popover-backdrop" onClick={() => closeAllPopovers()} />
      )}

      {/* ═══ Floating Batch Action Bar ═══ */}
      <BatchBar
        selectedCount={table.selectedIds.size}
        onClear={() => table.clearSelection()}
      >
        <div className="flex items-center gap-4">
          <button onClick={() => { closeAllPopovers(); setShowAgentPopover(true); setBatchAgentValue(""); }} className={`batch-bar-btn ${showAgentPopover ? "active" : ""}`}>
            <User size={16} />
            Agent
          </button>
          <button onClick={() => { closeAllPopovers(); setShowPortalPopover(true); }} className={`batch-bar-btn ${showPortalPopover ? "active" : ""}`}>
            <Shield size={16} />
            Portal
          </button>
          <button onClick={() => setShowBatchDeleteModal(true)} className="batch-bar-btn danger">
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </BatchBar>

      {/* ═══ Agent Popover ═══ */}
      {showAgentPopover && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Assign agent to {table.selectedIds.size} recipient{table.selectedIds.size > 1 ? "s" : ""}</h3>
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

      {/* ═══ Portal Access Popover ═══ */}
      {showPortalPopover && (
        <div className="batch-popover" style={{ width: 340 }}>
          <div className="batch-popover-header">
            <h3 className="batch-popover-title">Portal access for {table.selectedIds.size} recipient{table.selectedIds.size > 1 ? "s" : ""}</h3>
            <button onClick={() => setShowPortalPopover(false)} className="batch-popover-close">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-2">
            <button onClick={() => handleBatchPortalAccess(true)} disabled={batchUpdating} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors cursor-pointer border border-border">
              <ToggleRight size={16} className="text-green-500" />
              <span className="text-ui text-txt-primary">Enable Access</span>
            </button>
            <button onClick={() => handleBatchPortalAccess(false)} disabled={batchUpdating} className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left hover:bg-surface-hover transition-colors cursor-pointer border border-border">
              <ToggleLeft size={16} className="text-txt-tertiary" />
              <span className="text-ui text-txt-primary">Disable Access</span>
            </button>
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
                <h3 className="text-ui font-semibold text-txt-primary">Delete {table.selectedIds.size} recipient{table.selectedIds.size > 1 ? "s" : ""}</h3>
                <p className="text-muted text-txt-secondary mt-1">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBatchDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
              <button onClick={handleBatchDelete} disabled={batchDeleting} className="btn-primary bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-2 cursor-pointer">
                {batchDeleting && <Loader2 size={14} className="animate-spin" />}
                Delete {table.selectedIds.size} recipient{table.selectedIds.size > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
