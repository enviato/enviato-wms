"use client";

import { X, Check, Plus, Trash2, Package } from "lucide-react";
import { CommodityOverride } from "../types";

interface TierFormModalProps {
  open: boolean;
  editingTier: boolean;
  tierForm: {
    name: string;
    description: string;
    tier_type: "retail" | "commercial" | "agent";
    base_rate_per_lb: number;
    currency: string;
    delivery_fee: number;
    hazmat_fee: number;
    is_default: boolean;
    is_active: boolean;
  };
  onTierFormChange: (updates: any) => void;
  commodityOverrides: CommodityOverride[];
  onAddCommodity: () => void;
  onRemoveCommodity: (index: number) => void;
  onCommodityChange: (index: number, field: string, value: any) => void;
  onSave: () => void;
  onClose: () => void;
}

export function TierFormModal({
  open,
  editingTier,
  tierForm,
  onTierFormChange,
  commodityOverrides,
  onAddCommodity,
  onRemoveCommodity,
  onCommodityChange,
  onSave,
  onClose,
}: TierFormModalProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="modal-panel max-w-3xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="text-[16px] font-semibold text-txt-primary">
            {editingTier ? "Edit pricing tier" : "Add pricing tier"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Basic Info */}
          <div>
            <label className="text-sm font-medium text-txt-primary block mb-3">
              Basic Information
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Tier Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Standard Retail"
                  value={tierForm.name}
                  onChange={(e) => onTierFormChange({ name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Tier Type
                </label>
                <select
                  value={tierForm.tier_type}
                  onChange={(e) =>
                    onTierFormChange({
                      tier_type: e.target.value as "retail" | "commercial" | "agent",
                    })
                  }
                  className="form-input"
                >
                  <option value="retail">Retail</option>
                  <option value="commercial">Commercial</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
            </div>

            <div className="mt-3">
              <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                Description (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Standard pricing for retail customers"
                value={tierForm.description}
                onChange={(e) => onTierFormChange({ description: e.target.value })}
                className="form-input"
              />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="text-sm font-medium text-txt-primary block mb-3">
              Pricing
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Base Rate per lb
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={tierForm.base_rate_per_lb}
                    onChange={(e) =>
                      onTierFormChange({
                        base_rate_per_lb: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="form-input flex-1"
                  />
                  <span className="text-txt-tertiary text-ui shrink-0">
                    {tierForm.currency}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Delivery Fee
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={tierForm.delivery_fee}
                    onChange={(e) =>
                      onTierFormChange({
                        delivery_fee: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="form-input flex-1"
                  />
                  <span className="text-txt-tertiary text-ui shrink-0">
                    {tierForm.currency}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Hazmat Fee
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={tierForm.hazmat_fee}
                    onChange={(e) =>
                      onTierFormChange({
                        hazmat_fee: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="form-input flex-1"
                  />
                  <span className="text-txt-tertiary text-ui shrink-0">
                    {tierForm.currency}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div>
            <label className="text-sm font-medium text-txt-primary block mb-3">
              Settings
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tierForm.is_active}
                  onChange={(e) =>
                    onTierFormChange({ is_active: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-ui text-txt-secondary">
                  Active (customers can use this tier)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tierForm.is_default}
                  onChange={(e) =>
                    onTierFormChange({ is_default: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-ui text-txt-secondary">
                  Default tier (apply to new customers)
                </span>
              </label>
            </div>
          </div>

          {/* Commodity Overrides */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-txt-primary flex items-center gap-2">
                <Package className="w-4 h-4" />
                Commodity Overrides (optional)
              </label>
              <button
                onClick={onAddCommodity}
                className="text-primary hover:text-primary/80 flex items-center gap-1 text-ui transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add commodity
              </button>
            </div>

            {commodityOverrides.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-[#f8fafc]">
                        <th className="px-4 py-2 text-left text-meta text-txt-tertiary font-medium">
                          Commodity Name
                        </th>
                        <th className="px-4 py-2 text-left text-meta text-txt-tertiary font-medium">
                          Rate per lb
                        </th>
                        <th className="px-4 py-2 text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {commodityOverrides.map((commodity, index) => (
                        <tr
                          key={commodity.id || commodity.tempId}
                          className="border-b border-border last:border-b-0 hover:bg-[#f8fafc]"
                        >
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              placeholder="e.g. Electronics"
                              value={commodity.commodity_name}
                              onChange={(e) =>
                                onCommodityChange(index, "commodity_name", e.target.value)
                              }
                              className="form-input text-ui"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={commodity.rate_per_lb}
                                onChange={(e) =>
                                  onCommodityChange(
                                    index,
                                    "rate_per_lb",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="form-input text-ui flex-1"
                              />
                              <span className="text-txt-tertiary text-meta shrink-0">
                                {tierForm.currency}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => onRemoveCommodity(index)}
                              className="p-1 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="Remove commodity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onSave} className="btn-primary flex items-center gap-2">
            <Check className="w-4 h-4" />
            {editingTier ? "Save changes" : "Add tier"}
          </button>
        </div>
      </div>
    </div>
  );
}
