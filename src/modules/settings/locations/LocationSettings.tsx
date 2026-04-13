"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import SearchableSelect from "@/components/SearchableSelect";
import { createClient } from "@/lib/supabase";
import {
  Plus,
  Trash2,
  Loader2,
  X,
  Check,
  AlertTriangle,
  Power,
  Pencil,
} from "lucide-react";

type WarehouseLocation = {
  id: string;
  name: string;
  code: string;
  customer_id: string | null;
  description: string;
  status: string;
};

type LocationForm = {
  name: string;
  code: string;
  customerId: string;
  description: string;
};

type Customer = {
  id: string;
  first_name: string;
  last_name: string;
};

export default function LocationSettings() {
  const supabase = createClient();

  // State
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Form state
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [locationForm, setLocationForm] = useState<LocationForm>({
    name: "",
    code: "",
    customerId: "",
    description: "",
  });

  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [editLocation, setEditLocation] = useState<WarehouseLocation | null>(null);
  const [editLocationForm, setEditLocationForm] = useState<LocationForm>({
    name: "",
    code: "",
    customerId: "",
    description: "",
  });

  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(null);

  // Batch selection state
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [batchLocationActionLoading, setBatchLocationActionLoading] = useState(false);

  // Toast helpers
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        // Load locations
        const { data: locationsData } = await supabase
          .from("warehouse_locations")
          .select("*")
          .is("deleted_at", null);
        if (locationsData) setLocations(locationsData);

        // Load customers for the dropdown
        const { data: customersData } = await supabase
          .from("users")
          .select("id, first_name, last_name");
        if (customersData) setCustomers(customersData);
      } catch (error) {
        logger.error("Error loading location settings:", error);
        showError("Failed to load locations");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase]);

  // CRUD Handlers
  const handleAddLocation = async () => {
    if (!locationForm.name || !locationForm.code) {
      showError("Location name and code are required");
      return;
    }

    try {
      const { error } = await supabase.from("warehouse_locations").insert({
        name: locationForm.name,
        code: locationForm.code,
        customer_id: locationForm.customerId || null,
        description: locationForm.description,
        status: "active",
      });

      if (!error) {
        setLocationForm({ name: "", code: "", customerId: "", description: "" });
        setLocationFormOpen(false);
        const { data } = await supabase
          .from("warehouse_locations")
          .select("*")
          .is("deleted_at", null);
        if (data) setLocations(data);
        showSuccess("Location added");
      } else {
        showError("Failed to add location: " + error.message);
      }
    } catch (error) {
      logger.error("Error adding location:", error);
      showError("Failed to add location");
    }
  };

  const handleEditLocationSave = async () => {
    if (!editLocation || !editLocationForm.name || !editLocationForm.code) {
      showError("Location name and code are required");
      return;
    }

    try {
      const { error } = await supabase
        .from("warehouse_locations")
        .update({
          name: editLocationForm.name,
          code: editLocationForm.code,
          customer_id: editLocationForm.customerId || null,
          description: editLocationForm.description,
        })
        .eq("id", editLocation.id);

      if (!error) {
        const { data } = await supabase
          .from("warehouse_locations")
          .select("*")
          .is("deleted_at", null);
        if (data) setLocations(data);
        setEditLocationOpen(false);
        setEditLocation(null);
        showSuccess("Location updated");
      } else {
        showError("Failed to update location: " + error.message);
      }
    } catch (error) {
      logger.error("Error updating location:", error);
      showError("Failed to update location");
    }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      const { error } = await supabase
        .from("warehouse_locations")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: currentUserId,
        })
        .eq("id", id);

      if (!error) {
        setLocations(locations.filter((l) => l.id !== id));
        setDeletingLocationId(null);
        showSuccess("Location deleted");
      } else {
        showError("Failed to delete location: " + error.message);
      }
    } catch (error) {
      logger.error("Error deleting location:", error);
      showError("Failed to delete location");
      setDeletingLocationId(null);
    }
  };

  const handleToggleLocationStatus = async (location: WarehouseLocation) => {
    const newStatus = location.status === "active" ? "inactive" : "active";
    try {
      const { error } = await supabase
        .from("warehouse_locations")
        .update({ status: newStatus })
        .eq("id", location.id);

      if (!error) {
        setLocations(
          locations.map((l) =>
            l.id === location.id ? { ...l, status: newStatus } : l
          )
        );
        showSuccess(
          `Location ${newStatus === "active" ? "activated" : "deactivated"}`
        );
      } else {
        showError("Failed to update status: " + error.message);
      }
    } catch (error) {
      logger.error("Error toggling location status:", error);
      showError("Failed to update status");
    }
  };

  // Batch operations
  const handleToggleLocationSelection = (locationId: string) => {
    const newSelection = new Set(selectedLocationIds);
    if (newSelection.has(locationId)) {
      newSelection.delete(locationId);
    } else {
      newSelection.add(locationId);
    }
    setSelectedLocationIds(newSelection);
  };

  const handleSelectAllLocations = () => {
    if (selectedLocationIds.size === locations.length && locations.length > 0) {
      setSelectedLocationIds(new Set());
    } else {
      setSelectedLocationIds(new Set(locations.map((l) => l.id)));
    }
  };

  const handleBatchLocationAction = async (
    action: "activate" | "deactivate" | "delete"
  ) => {
    if (selectedLocationIds.size === 0) return;

    if (action === "delete") {
      const confirmed = window.confirm(
        `Delete ${selectedLocationIds.size} location(s)? This action cannot be undone.`
      );
      if (!confirmed) return;
    }

    setBatchLocationActionLoading(true);
    try {
      const locationIdArray = Array.from(selectedLocationIds);

      if (action === "delete") {
        const { error } = await supabase
          .from("warehouse_locations")
          .delete()
          .in("id", locationIdArray);
        if (!error) {
          setLocations(locations.filter((l) => !selectedLocationIds.has(l.id)));
          showSuccess(`${selectedLocationIds.size} location(s) deleted`);
        } else {
          showError("Failed to delete locations: " + error.message);
        }
      } else {
        const newStatus = action === "activate" ? "active" : "inactive";
        const { error } = await supabase
          .from("warehouse_locations")
          .update({ status: newStatus })
          .in("id", locationIdArray);
        if (!error) {
          setLocations(
            locations.map((l) =>
              selectedLocationIds.has(l.id) ? { ...l, status: newStatus } : l
            )
          );
          showSuccess(`${selectedLocationIds.size} location(s) ${action}d`);
        } else {
          showError(`Failed to ${action} locations: ` + error.message);
        }
      }

      setSelectedLocationIds(new Set());
    } catch (error) {
      logger.error("Error in batch location action:", error);
      showError("Failed to complete batch action");
    } finally {
      setBatchLocationActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-sm p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-txt-tertiary" />
      </div>
    );
  }

  return (
    <>
      {/* Messages */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-ui z-50">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg text-ui z-50">
          {errorMessage}
        </div>
      )}

      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-title font-semibold text-txt-primary">
              Warehouse locations
            </h2>
            <p className="text-ui-sm text-txt-tertiary mt-0.5">
              Manage warehouse facilities
            </p>
          </div>
          <button
            onClick={() => setLocationFormOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add location
          </button>
        </div>

        {selectedLocationIds.size > 0 && (
          <div className="px-5 py-3 border-b border-border bg-blue-50 flex items-center gap-3">
            <span className="text-ui text-txt-primary">
              {selectedLocationIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchLocationAction("activate")}
                disabled={batchLocationActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 flex items-center gap-2"
              >
                {batchLocationActionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Set Active
              </button>
              <button
                onClick={() => handleBatchLocationAction("deactivate")}
                disabled={batchLocationActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 flex items-center gap-2"
              >
                {batchLocationActionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Power className="w-3.5 h-3.5" />
                )}
                Set Inactive
              </button>
              <button
                onClick={() => handleBatchLocationAction("delete")}
                disabled={batchLocationActionLoading}
                className="btn-secondary text-ui py-1.5 px-3 text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                {batchLocationActionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete
              </button>
            </div>
            <button
              onClick={() => setSelectedLocationIds(new Set())}
              className="ml-auto text-txt-tertiary hover:text-txt-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="sheet-table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <div className="overflow-auto">
            <table
              className="sheet-table"
              style={{ "--table-size": "100%" } as React.CSSProperties}
            >
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: 40, minWidth: 40 }}>
                    <input
                      type="checkbox"
                      checked={
                        locations.length > 0 &&
                        selectedLocationIds.size === locations.length
                      }
                      onChange={handleSelectAllLocations}
                      className="w-4 h-4 cursor-pointer"
                      title="Select all locations"
                    />
                  </th>
                  <th
                    className="sheet-th"
                    style={{ width: 220, minWidth: 160 }}
                  >
                    <span>Location Name</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th
                    className="sheet-th"
                    style={{ width: 120, minWidth: 80 }}
                  >
                    <span>Code</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th
                    className="sheet-th"
                    style={{ width: 200, minWidth: 140 }}
                  >
                    <span>Assigned Customer</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th
                    className="sheet-th"
                    style={{ width: 140, minWidth: 100 }}
                  >
                    <span>Status</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th
                    className="sheet-th"
                    style={{ width: 100, minWidth: 80 }}
                  >
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">No locations yet</p>
                        <p className="empty-state-desc">
                          Click "Add location" to create one
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  locations.map((location) => (
                    <tr
                      key={location.id}
                      className={`sheet-row ${
                        selectedLocationIds.has(location.id)
                          ? "bg-blue-50"
                          : ""
                      }`}
                    >
                      <td className="sheet-cell">
                        <input
                          type="checkbox"
                          checked={selectedLocationIds.has(location.id)}
                          onChange={() =>
                            handleToggleLocationSelection(location.id)
                          }
                          className="w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="sheet-cell text-txt-primary font-medium">
                        {location.name}
                      </td>
                      <td className="sheet-cell">
                        <span className="courier-badge">{location.code}</span>
                      </td>
                      <td className="sheet-cell text-txt-secondary">
                        {location.customer_id ? "Customer" : "—"}
                      </td>
                      <td className="sheet-cell">
                        <button
                          onClick={() => handleToggleLocationStatus(location)}
                          className="cursor-pointer"
                        >
                          {location.status === "active" ? (
                            <span className="status-badge bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5 hover:ring-1 hover:ring-emerald-300 transition-all">
                              <span className="status-dot bg-emerald-600" />
                              Active
                            </span>
                          ) : (
                            <span className="status-badge bg-slate-100 text-slate-600 inline-flex items-center gap-1.5 hover:ring-1 hover:ring-slate-300 transition-all">
                              <span className="status-dot bg-slate-400" />
                              Inactive
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="sheet-cell">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditLocation(location);
                              setEditLocationForm({
                                name: location.name,
                                code: location.code,
                                customerId: location.customer_id || "",
                                description: location.description || "",
                              });
                              setEditLocationOpen(true);
                            }}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/5 rounded transition-colors cursor-pointer"
                            title="Edit location"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingLocationId(location.id)}
                            className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title="Delete location"
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

      {/* ── Add Location Modal ── */}
      {locationFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">
                Add warehouse location
              </h3>
              <button
                onClick={() => setLocationFormOpen(false)}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                    Location name
                  </label>
                  <input
                    type="text"
                    placeholder="Location name"
                    value={locationForm.name}
                    onChange={(e) =>
                      setLocationForm({ ...locationForm, name: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                    Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. WH-01"
                    value={locationForm.code}
                    onChange={(e) =>
                      setLocationForm({ ...locationForm, code: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Assigned customer
                </label>
                <SearchableSelect
                  value={locationForm.customerId}
                  onChange={(v) =>
                    setLocationForm({ ...locationForm, customerId: v })
                  }
                  placeholder="Select customer (optional)"
                  searchPlaceholder="Search customers…"
                  options={customers.map((cust) => ({
                    value: cust.id,
                    label: `${cust.first_name} ${cust.last_name}`,
                  }))}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Description"
                  value={locationForm.description}
                  onChange={(e) =>
                    setLocationForm({
                      ...locationForm,
                      description: e.target.value,
                    })
                  }
                  className="form-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setLocationFormOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleAddLocation}
                className="btn-primary flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Add location
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Location Modal ── */}
      {editLocationOpen && editLocation && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">
                Edit warehouse location
              </h3>
              <button
                onClick={() => {
                  setEditLocationOpen(false);
                  setEditLocation(null);
                }}
                className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                    Location name
                  </label>
                  <input
                    type="text"
                    placeholder="Location name"
                    value={editLocationForm.name}
                    onChange={(e) =>
                      setEditLocationForm({
                        ...editLocationForm,
                        name: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                    Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. WH-01"
                    value={editLocationForm.code}
                    onChange={(e) =>
                      setEditLocationForm({
                        ...editLocationForm,
                        code: e.target.value,
                      })
                    }
                    className="form-input"
                  />
                </div>
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Assigned customer
                </label>
                <SearchableSelect
                  value={editLocationForm.customerId}
                  onChange={(v) =>
                    setEditLocationForm({ ...editLocationForm, customerId: v })
                  }
                  placeholder="Select customer (optional)"
                  searchPlaceholder="Search customers…"
                  options={customers.map((cust) => ({
                    value: cust.id,
                    label: `${cust.first_name} ${cust.last_name}`,
                  }))}
                />
              </div>
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Description"
                  value={editLocationForm.description}
                  onChange={(e) =>
                    setEditLocationForm({
                      ...editLocationForm,
                      description: e.target.value,
                    })
                  }
                  className="form-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setEditLocationOpen(false);
                  setEditLocation(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleEditLocationSave}
                className="btn-primary flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Location Confirmation Modal ── */}
      {deletingLocationId && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-txt-primary">
                  Delete location
                </h3>
                <p className="text-ui-sm text-txt-tertiary mt-0.5">
                  This action cannot be undone. The warehouse location will be
                  permanently removed.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingLocationId(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteLocation(deletingLocationId)}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
