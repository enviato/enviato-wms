"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import SearchableSelect from "@/components/SearchableSelect";
import { DetailRow, SuccessToast, Toggle } from "@/shared/components/forms";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Package,
  Pencil,
  Trash2,
  Bell,
  AlertTriangle,
  Loader2,
  Save,
  X,
  Building2,
} from "lucide-react";

type Customer = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  courier_group_id: string | null;
  agent_id: string | null;
  is_active: boolean;
  email_notifications: boolean;
  courier_group?: { code: string; name: string } | null;
  agent?: { id: string; name: string; company_name: string | null } | null;
};

type AgentItem = {
  id: string;
  name: string;
  company_name: string | null;
};

type PackageRow = {
  id: string;
  tracking_number: string;
  carrier: string;
  weight: number | null;
  weight_unit: string | null;
  checked_in_at: string | null;
  status: string;
};

const roleLabels: Record<string, string> = {
  org_admin: "Admin",
  warehouse_staff: "Warehouse",
  courier_admin: "Agent Admin",
  courier_staff: "Agent Staff",
  customer: "Customer",
};

const roleColors: Record<string, string> = {
  org_admin: "bg-amber-50 text-amber-700",
  warehouse_staff: "bg-blue-50 text-blue-700",
  courier_admin: "bg-violet-50 text-violet-700",
  courier_staff: "bg-indigo-50 text-indigo-700",
  customer: "bg-emerald-50 text-emerald-700",
};

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  checked_in: { label: "Checked In", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  assigned_to_awb: { label: "On AWB", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "In Transit", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  received_at_dest: { label: "Received", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  delivered: { label: "Delivered", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
};

export default function CustomerDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [inStockPackages, setInStockPackages] = useState<PackageRow[]>([]);
  const [shippedPackages, setShippedPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agentsList, setAgentsList] = useState<AgentItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", agent_id: "" });
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "users", ids: [params.id] }),
      });
      const json = await res.json();
      if (res.ok && json.deleted?.length > 0) {
        router.push("/admin/customers");
      } else {
        const msg = json.failed?.[0]?.message || json.error || "Delete failed";
        showSuccess(msg); // reuse the toast for now
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleNotifications = async () => {
    const newValue = !emailNotifications;
    setEmailNotifications(newValue);
    try {
      await supabase.from("users").update({ email_notifications: newValue }).eq("id", params.id);
      showSuccess(newValue ? "Notifications enabled" : "Notifications disabled");
    } catch (error) {
      console.error("Error updating notifications:", error);
      setEmailNotifications(!newValue);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const newAgentId = editForm.agent_id || null;
      const { error } = await supabase
        .from("users")
        .update({ first_name: editForm.first_name, last_name: editForm.last_name, email: editForm.email, phone: editForm.phone || null, agent_id: newAgentId })
        .eq("id", params.id);

      if (!error) {
        const matchedAgent = agentsList.find((a) => a.id === newAgentId);
        setCustomer((prev) =>
          prev ? {
            ...prev,
            first_name: editForm.first_name,
            last_name: editForm.last_name,
            email: editForm.email,
            phone: editForm.phone || null,
            agent_id: newAgentId,
            agent: matchedAgent ? { id: matchedAgent.id, name: matchedAgent.name, company_name: matchedAgent.company_name } : null,
          } : prev
        );
        setEditing(false);
        showSuccess("Recipient updated");
      }
    } catch (error) {
      console.error("Error saving customer:", error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Load agents first (needed for enrichment)
        const { data: agentsData } = await supabase.from("agents").select("id, name, company_name").eq("status", "active").order("name");
        if (agentsData) setAgentsList(agentsData as AgentItem[]);

        // Load customer — avoid agent join (FK may not exist in DB)
        const { data: customerData, error: customerError } = await supabase
          .from("users")
          .select("*")
          .eq("id", params.id)
          .single();

        if (!customerError && customerData) {
          // Attach agent info from the agents list we already loaded
          const enriched: any = { ...customerData, agent: null, courier_group: null };
          if (customerData.agent_id && agentsData) {
            const matched = agentsData.find((a: any) => a.id === customerData.agent_id);
            if (matched) enriched.agent = { id: matched.id, name: matched.name, company_name: matched.company_name };
          }
          setCustomer(enriched as Customer);
          setEmailNotifications(customerData.email_notifications || false);
          setEditForm({ first_name: customerData.first_name, last_name: customerData.last_name, email: customerData.email, phone: customerData.phone || "", agent_id: customerData.agent_id || "" });
        }

        const { data: inStockData } = await supabase
          .from("packages")
          .select("id, tracking_number, carrier, weight, weight_unit, checked_in_at, status")
          .eq("customer_id", params.id)
          .is("deleted_at", null)
          .eq("status", "checked_in")
          .order("checked_in_at", { ascending: false });

        if (inStockData) setInStockPackages(inStockData as PackageRow[]);

        const { data: shippedData } = await supabase
          .from("packages")
          .select("id, tracking_number, carrier, weight, weight_unit, checked_in_at, status")
          .eq("customer_id", params.id)
          .is("deleted_at", null)
          .in("status", ["assigned_to_awb", "in_transit", "received_at_dest", "delivered"])
          .order("checked_in_at", { ascending: false });

        if (shippedData) setShippedPackages(shippedData as PackageRow[]);
        setLoading(false);
      } catch (error) {
        console.error("Error loading data:", error);
        setLoading(false);
      }
    }
    loadData();
  }, [params.id]);

  if (loading) {
    return (
      <div className="px-4 py-5">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-surface-secondary rounded w-32" />
          <div className="h-10 bg-surface-secondary rounded" />
          <div className="h-48 bg-surface-secondary rounded" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="px-4 py-5 space-y-4">
        <button
          onClick={() => router.push("/admin/customers")}
          className="inline-flex items-center gap-1.5 text-meta text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Recipients
        </button>
        <div className="text-center py-12">
          <User size={32} className="text-txt-placeholder mx-auto mb-2" />
          <p className="text-txt-tertiary text-muted">Recipient not found</p>
        </div>
      </div>
    );
  }

  return (
    <div>

      <div className="px-4 py-5 space-y-4">
        {/* Success Toast */}
        <SuccessToast message={successMessage} />

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="modal-overlay">
            <div className="modal-panel max-w-md">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-brand-red" />
                </div>
                <div className="flex-1">
                  <h3 className="text-ui font-semibold text-txt-primary">Delete recipient</h3>
                  <p className="text-muted text-txt-secondary mt-1">
                    Are you sure you want to delete <span className="font-medium text-txt-primary">{customer.first_name} {customer.last_name}</span>? All their package associations will be removed.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border">
                <button onClick={() => setShowDeleteModal(false)} className="btn-secondary cursor-pointer">Cancel</button>
                <button onClick={handleDelete} disabled={deleting} className="btn-primary bg-brand-red hover:bg-brand-red/90 text-white flex items-center gap-2 cursor-pointer">
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back link */}
        <button
          onClick={() => router.push("/admin/customers")}
          className="inline-flex items-center gap-1.5 text-meta text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Recipients
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Information Card */}
            <div className="bg-white border border-border rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-meta text-txt-tertiary tracking-tight">Information</p>
                {editing ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(false)} className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors duration-150 cursor-pointer">
                      <X size={14} />
                    </button>
                    <button onClick={handleSaveEdit} disabled={saving} className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors duration-150 cursor-pointer">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => {
                    if (customer) {
                      setEditForm({ first_name: customer.first_name, last_name: customer.last_name, email: customer.email, phone: customer.phone || "", agent_id: customer.agent_id || "" });
                    }
                    setEditing(true);
                  }} className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded transition-colors duration-150 cursor-pointer">
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              <div>
                <DetailRow icon={User} label="First name">
                  {editing ? (
                    <input type="text" value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} className="form-input text-right" />
                  ) : (
                    customer.first_name
                  )}
                </DetailRow>
                <DetailRow icon={User} label="Last name">
                  {editing ? (
                    <input type="text" value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} className="form-input text-right" />
                  ) : (
                    customer.last_name
                  )}
                </DetailRow>
                <DetailRow icon={Mail} label="Email">
                  {editing ? (
                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="form-input text-right" placeholder="Email address" />
                  ) : (
                    customer.email
                  )}
                </DetailRow>
                <DetailRow icon={Phone} label="Phone">
                  {editing ? (
                    <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="form-input text-right" placeholder="Phone number" />
                  ) : (
                    customer.phone || "\u2014"
                  )}
                </DetailRow>
                <DetailRow icon={Building2} label="Agent">
                  {editing ? (
                    <SearchableSelect
                      value={editForm.agent_id}
                      onChange={(v) => setEditForm({ ...editForm, agent_id: v })}
                      placeholder="No agent"
                      searchPlaceholder="Search agents…"
                      options={[{ value: "", label: "No agent" }, ...agentsList.map((a) => ({ value: a.id, label: a.company_name || a.name }))]}
                    />
                  ) : (
                    customer.agent ? (
                      <span className="courier-badge">{customer.agent.company_name || customer.agent.name}</span>
                    ) : "\u2014"
                  )}
                </DetailRow>
              </div>
            </div>

            {/* Packages In Stock */}
            <div className="bg-white border border-border rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-meta text-txt-tertiary tracking-tight">Packages in stock</p>
                  <span className="px-2 py-0.5 bg-surface-secondary text-meta text-txt-tertiary rounded-full">{inStockPackages.length}</span>
                </div>
              </div>

              {inStockPackages.length === 0 ? (
                <div className="text-center py-10">
                  <Package size={24} className="text-txt-placeholder mx-auto mb-2" />
                  <p className="text-txt-tertiary text-muted">No packages in stock</p>
                </div>
              ) : (
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Tracking number</th>
                      <th>Carrier</th>
                      <th>Weight</th>
                      <th>Checked in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inStockPackages.map((pkg) => (
                      <tr key={pkg.id} className="clickable-row" onClick={() => router.push(`/admin/packages/${pkg.id}`)}>
                        <td className="font-mono text-txt-primary">{pkg.tracking_number}</td>
                        <td className="text-txt-secondary">{pkg.carrier}</td>
                        <td className="text-txt-secondary">{pkg.weight ? `${pkg.weight} ${pkg.weight_unit}` : "\u2014"}</td>
                        <td className="text-txt-secondary">{pkg.checked_in_at ? new Date(pkg.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Shipped Packages */}
            <div className="bg-white border border-border rounded-md overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-meta text-txt-tertiary tracking-tight">Shipped packages</p>
                  <span className="px-2 py-0.5 bg-surface-secondary text-meta text-txt-tertiary rounded-full">{shippedPackages.length}</span>
                </div>
              </div>

              {shippedPackages.length === 0 ? (
                <div className="text-center py-10">
                  <Package size={24} className="text-txt-placeholder mx-auto mb-2" />
                  <p className="text-txt-tertiary text-muted">No shipped packages</p>
                </div>
              ) : (
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th>Tracking number</th>
                      <th>Carrier</th>
                      <th>Status</th>
                      <th>Checked in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shippedPackages.map((pkg) => {
                      const sc = statusConfig[pkg.status];
                      return (
                        <tr key={pkg.id} className="clickable-row" onClick={() => router.push(`/admin/packages/${pkg.id}`)}>
                          <td className="font-mono text-txt-primary">{pkg.tracking_number}</td>
                          <td className="text-txt-secondary">{pkg.carrier}</td>
                          <td>
                            <span className={`status-badge ${sc?.bg} ${sc?.text}`}>
                              <span className={`status-dot ${sc?.dot}`} />
                              {sc?.label || pkg.status}
                            </span>
                          </td>
                          <td className="text-txt-secondary">{pkg.checked_in_at ? new Date(pkg.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "\u2014"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Status Card */}
            <div className="bg-white border border-border rounded-md p-4">
              <p className="text-meta text-txt-tertiary tracking-tight mb-3">Status</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-ui-sm text-txt-secondary">Portal Access</span>
                  <button
                    onClick={async () => {
                      const newStatus = !customer.is_active;
                      setCustomer((prev) => prev ? { ...prev, is_active: newStatus } : prev);
                      const { error } = await supabase.from("users").update({ is_active: newStatus }).eq("id", params.id);
                      if (error) {
                        setCustomer((prev) => prev ? { ...prev, is_active: !newStatus } : prev);
                        showSuccess("Failed to update portal access");
                      } else {
                        showSuccess(`Portal access ${newStatus ? "enabled" : "disabled"}`);
                      }
                    }}
                    className={`status-badge cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${
                      customer.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <span className={`status-dot ${customer.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {customer.is_active ? "Active" : "Off"}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ui-sm text-txt-secondary">Role</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-meta ${roleColors[customer.role] || "bg-slate-100 text-txt-tertiary"}`}>
                    {roleLabels[customer.role] || customer.role}
                  </span>
                </div>
                {customer.agent && (
                  <div className="flex items-center justify-between">
                    <span className="text-ui-sm text-txt-secondary">Agent</span>
                    <span className="courier-badge">{customer.agent.company_name || customer.agent.name}</span>
                  </div>
                )}
                {customer.courier_group && (
                  <div className="flex items-center justify-between">
                    <span className="text-ui-sm text-txt-secondary">Courier group</span>
                    <span className="courier-badge">{customer.courier_group.code}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notifications Card */}
            <div className="bg-white border border-border rounded-md p-4">
              <p className="text-meta text-txt-tertiary tracking-tight mb-3 flex items-center gap-1.5">
                <Bell size={14} />
                Notifications
              </p>
              <Toggle checked={emailNotifications} onChange={() => handleToggleNotifications()} label="Email notifications" card />
            </div>

            {/* Actions Card */}
            <div className="bg-white border border-border rounded-md p-4">
              <p className="text-meta text-txt-tertiary tracking-tight mb-3">Actions</p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="btn-secondary w-full flex items-center justify-center gap-1.5 text-brand-red hover:text-brand-red cursor-pointer"
              >
                <Trash2 size={14} />
                Delete recipient
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
