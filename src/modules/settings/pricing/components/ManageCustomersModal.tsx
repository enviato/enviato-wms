"use client";

import { X, Check, Loader2, Search } from "lucide-react";
import { Customer } from "../types";

interface ManageCustomersModalProps {
  open: boolean;
  tierId: string | null;
  tierName: string;
  customers: Customer[];
  selectedCustomers: Set<string>;
  customerSearchQuery: string;
  onSearchChange: (query: string) => void;
  onCustomerToggle: (customerId: string, checked: boolean) => void;
  onAssign: () => void;
  onClose: () => void;
  isAssigning: boolean;
}

export function ManageCustomersModal({
  open,
  tierId,
  tierName,
  customers,
  selectedCustomers,
  customerSearchQuery,
  onSearchChange,
  onCustomerToggle,
  onAssign,
  onClose,
  isAssigning,
}: ManageCustomersModalProps) {
  if (!open || !tierId) return null;

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearchQuery.toLowerCase())
  );

  return (
    <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="modal-panel max-w-2xl w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-txt-primary">
            Manage customers for this tier
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-txt-tertiary pointer-events-none" />
          <input
            type="text"
            placeholder="Search customers..."
            value={customerSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="form-input"
            style={{ paddingLeft: 36 }}
          />
        </div>

        {/* Customer List */}
        <div className="border border-border rounded-lg max-h-96 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-ui text-txt-tertiary">No customers found</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredCustomers.map((customer) => (
                <label
                  key={customer.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#f8fafc] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedCustomers.has(customer.id)}
                    onChange={(e) => onCustomerToggle(customer.id, e.target.checked)}
                    className="w-4 h-4 rounded border-border"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-ui text-txt-primary font-medium">
                      {customer.name}
                    </p>
                  </div>
                  {customer.pricing_tier_id && customer.pricing_tier_id !== tierId && (
                    <span className="text-meta text-txt-tertiary">
                      (Currently assigned)
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <p className="text-meta text-txt-tertiary">
            {selectedCustomers.size} customer(s) selected
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={onAssign}
              disabled={isAssigning || selectedCustomers.size === 0}
              className="btn-primary flex items-center gap-2"
            >
              {isAssigning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Assign selected
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
