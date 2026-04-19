"use client";

import { useState, useEffect } from "react";
import { DollarSign, Plus, Pencil, Trash2, Users, Loader2 } from "lucide-react";
import { usePricingTiers } from "./hooks/usePricingTiers";
import { TierFormModal } from "./components/TierFormModal";
import { ManageCustomersModal } from "./components/ManageCustomersModal";
import { DeleteTierDialog } from "./components/DeleteTierDialog";
import { PricingTier, tierTypeColors, tierTypeLabels, CommodityOverride } from "./types";

export default function PricingSettings() {
  const hook = usePricingTiers();
  const { loading, tiers, tierCustomerCounts, successMessage, errorMessage, orgId } = hook;

  // Add/Edit tier form state
  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState({
    name: "",
    description: "",
    tier_type: "retail" as "retail" | "commercial" | "agent",
    base_rate_per_lb: 0,
    currency: "USD",
    delivery_fee: 0,
    hazmat_fee: 0,
    is_default: false,
    is_active: true,
  });
  const [commodityOverrides, setCommodityOverrides] = useState<CommodityOverride[]>([]);

  // Manage customers modal state
  const [managingTierId, setManagingTierId] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [assigningCustomers, setAssigningCustomers] = useState(false);

  // Delete confirmation state
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  const openTierForm = async (tier?: PricingTier) => {
    if (tier) {
      setEditingTierId(tier.id);
      setTierForm({
        name: tier.name,
        description: tier.description || "",
        tier_type: tier.tier_type,
        base_rate_per_lb: tier.base_rate_per_lb,
        currency: tier.currency,
        delivery_fee: tier.delivery_fee,
        hazmat_fee: tier.hazmat_fee,
        is_default: tier.is_default,
        is_active: tier.is_active,
      });
      const rates = await hook.loadCommodityRates(tier.id);
      setCommodityOverrides(rates);
    } else {
      setEditingTierId(null);
      setTierForm({
        name: "",
        description: "",
        tier_type: "retail",
        base_rate_per_lb: 0,
        currency: "USD",
        delivery_fee: 0,
        hazmat_fee: 0,
        is_default: false,
        is_active: true,
      });
      setCommodityOverrides([]);
    }
    setTierFormOpen(true);
  };

  const handleSaveTier = async () => {
    const success = await hook.saveTier(editingTierId, tierForm, commodityOverrides);
    if (success) {
      setTierFormOpen(false);
      setEditingTierId(null);
      setCommodityOverrides([]);
    }
  };

  const handleOpenManageCustomers = async (tierId: string) => {
    setManagingTierId(tierId);
    setSelectedCustomers(new Set());
    setCustomerSearchQuery("");
    const customerData = await hook.loadCustomersForManagement();
    const assigned = new Set(
      customerData
        .filter((c) => c.pricing_tier_id === tierId)
        .map((c) => c.id)
    );
    setSelectedCustomers(assigned);
  };

  const handleAssignCustomers = async () => {
    if (!managingTierId) return;
    setAssigningCustomers(true);
    const success = await hook.assignCustomers(managingTierId, Array.from(selectedCustomers));
    if (success) {
      setManagingTierId(null);
      setSelectedCustomers(new Set());
    }
    setAssigningCustomers(false);
  };

  const handleDeleteTier = async (id: string) => {
    const success = await hook.deleteTier(id);
    if (success) {
      setDeletingTierId(null);
    }
  };

  const handleAddCommodity = () => {
    setCommodityOverrides([
      ...commodityOverrides,
      {
        tempId: "temp_" + Date.now(),
        commodity_name: "",
        rate_per_lb: 0,
      },
    ]);
  };

  const handleRemoveCommodity = (index: number) => {
    setCommodityOverrides(commodityOverrides.filter((_, i) => i !== index));
  };

  const handleCommodityChange = (index: number, field: string, value: any) => {
    const updated = [...commodityOverrides];
    updated[index] = { ...updated[index], [field]: value };
    setCommodityOverrides(updated);
  };

  const deletingTierName = tiers.find((t) => t.id === deletingTierId)?.name || "";

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-txt-tertiary animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-ui font-semibold text-txt-primary">
              Pricing Tiers
            </h2>
            <p className="text-muted text-txt-tertiary mt-0.5">
              Manage pricing tiers and customer assignments
            </p>
          </div>
          <button
            onClick={() => openTierForm()}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add tier
          </button>
        </div>

        <div className="sheet-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <div className="overflow-auto">
            <table
              className="sheet-table"
              style={{ "--table-size": "100%" } as React.CSSProperties}
            >
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: "20%" }}>
                    <span>Name</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "12%" }}>
                    <span>Type</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "12%" }}>
                    <span>Base Rate</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "12%" }}>
                    <span>Delivery Fee</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "12%" }}>
                    <span>Hazmat Fee</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "10%" }}>
                    <span>Customers</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "10%" }}>
                    <span>Status</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: "12%", textAlign: "right" }}>
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tiers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">No pricing tiers yet</p>
                        <p className="empty-state-desc">
                          Click "Add tier" to create one
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  tiers.map((tier) => (
                    <tr key={tier.id} className="sheet-row">
                      <td className="sheet-cell">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                            <DollarSign className="w-4 h-4 text-txt-placeholder" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-medium truncate text-ui text-[#3b3b3e] block">
                              {tier.name}
                            </span>
                            {tier.description && (
                              <span className="text-muted text-txt-tertiary truncate block">
                                {tier.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="sheet-cell">
                        <span
                          className={`status-badge border ${
                            tierTypeColors[tier.tier_type]
                          }`}
                        >
                          {tierTypeLabels[tier.tier_type]}
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">
                          {tier.currency} {tier.base_rate_per_lb.toFixed(2)}/lb
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">
                          {tier.currency} {tier.delivery_fee.toFixed(2)}
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">
                          {tier.currency} {tier.hazmat_fee.toFixed(2)}
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">
                          {tierCustomerCounts[tier.id] || 0}
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <span
                          className={`status-badge border ${
                            tier.is_active
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {tier.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="sheet-cell">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenManageCustomers(tier.id)}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/8 rounded-md transition-colors cursor-pointer"
                            title="Manage customers"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openTierForm(tier)}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/8 rounded-md transition-colors cursor-pointer"
                            title="Edit tier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingTierId(tier.id)}
                            className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Delete tier"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-ui z-50 animate-fade-in">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-ui z-50 animate-fade-in">
          {errorMessage}
        </div>
      )}

      {/* Modals */}
      <TierFormModal
        open={tierFormOpen}
        editingTier={editingTierId !== null}
        tierForm={tierForm}
        onTierFormChange={(updates) => setTierForm({ ...tierForm, ...updates })}
        commodityOverrides={commodityOverrides}
        onAddCommodity={handleAddCommodity}
        onRemoveCommodity={handleRemoveCommodity}
        onCommodityChange={handleCommodityChange}
        onSave={handleSaveTier}
        onClose={() => {
          setTierFormOpen(false);
          setEditingTierId(null);
          setCommodityOverrides([]);
        }}
      />

      <ManageCustomersModal
        open={managingTierId !== null}
        tierId={managingTierId}
        tierName={tiers.find((t) => t.id === managingTierId)?.name || ""}
        customers={hook.customers}
        selectedCustomers={selectedCustomers}
        customerSearchQuery={customerSearchQuery}
        onSearchChange={setCustomerSearchQuery}
        onCustomerToggle={(customerId, checked) => {
          const updated = new Set(selectedCustomers);
          if (checked) {
            updated.add(customerId);
          } else {
            updated.delete(customerId);
          }
          setSelectedCustomers(updated);
        }}
        onAssign={handleAssignCustomers}
        onClose={() => {
          setManagingTierId(null);
          setSelectedCustomers(new Set());
        }}
        isAssigning={assigningCustomers}
      />

      <DeleteTierDialog
        open={deletingTierId !== null}
        tierName={deletingTierName}
        onConfirm={() => {
          if (deletingTierId) handleDeleteTier(deletingTierId);
        }}
        onCancel={() => setDeletingTierId(null)}
      />
    </>
  );
}
