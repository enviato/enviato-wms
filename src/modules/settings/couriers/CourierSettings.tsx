"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import { Truck, Plus, Pencil, Trash2, ImagePlus, X, Check, AlertTriangle, Loader2 } from "lucide-react";

type CourierGroup = {
  id: string;
  name: string;
  contact_email: string;
  contact_phone: string;
  code: string;
  country: string;
  logo_url?: string | null;
};

export default function CourierSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [couriers, setCouriers] = useState<CourierGroup[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Add courier state
  const [courierFormOpen, setCourierFormOpen] = useState(false);
  const [courierForm, setCourierForm] = useState({
    name: "",
    contactEmail: "",
    contactPhone: "",
    code: "",
    country: "",
  });

  // Edit courier state
  const [editCourierOpen, setEditCourierOpen] = useState(false);
  const [editCourier, setEditCourier] = useState<CourierGroup | null>(null);
  const [editCourierName, setEditCourierName] = useState("");
  const [editCourierCode, setEditCourierCode] = useState("");
  const [editCourierLogo, setEditCourierLogo] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingCourierId, setDeletingCourierId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load couriers data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user for deleted_by tracking
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          setCurrentUserId(authUser.id);
        }

        // Load couriers
        const { data: couriersData } = await supabase
          .from("courier_groups")
          .select("*")
          .is("deleted_at", null);
        if (couriersData) {
          setCouriers(couriersData);
        }
      } catch (error) {
        logger.error("Error loading couriers:", error);
        showError("Failed to load couriers");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  const handleAddCourier = async () => {
    if (!courierForm.name || !courierForm.code) {
      showError("Please fill in required fields");
      return;
    }

    try {
      const { error } = await supabase.from("courier_groups").insert({
        name: courierForm.name,
        code: courierForm.code,
      });

      if (!error) {
        setCourierForm({ name: "", contactEmail: "", contactPhone: "", code: "", country: "" });
        setCourierFormOpen(false);
        const { data } = await supabase.from("courier_groups").select("*").is("deleted_at", null);
        if (data) setCouriers(data);
        showSuccess("Courier company added");
      } else {
        logger.error("Error adding courier:", error);
        showError("Failed to add courier: " + error.message);
      }
    } catch (error) {
      logger.error("Error adding courier:", error);
      showError("Failed to add courier");
    }
  };

  const openEditCourier = (courier: CourierGroup) => {
    setEditCourier(courier);
    setEditCourierName(courier.name);
    setEditCourierCode(courier.code);
    setEditCourierLogo(courier.logo_url || null);
    setEditCourierOpen(true);
  };

  const handleEditCourierSave = async () => {
    if (!editCourier) return;

    try {
      // Build update payload
      const updatePayload: Record<string, unknown> = {
        name: editCourierName,
        code: editCourierCode,
      };

      // Try updating with logo_url
      const { error } = await supabase.from("courier_groups").update({
        ...updatePayload,
        logo_url: editCourierLogo,
      }).eq("id", editCourier.id);

      if (error) {
        // If logo_url column doesn't exist, retry without it
        logger.warn("Update with logo_url failed, retrying without:");
        const { error: retryError } = await supabase.from("courier_groups").update(updatePayload).eq("id", editCourier.id);
        if (retryError) {
          showError("Failed to update courier");
          logger.error("Error updating courier:", retryError);
          return;
        }
      }

      setEditCourierOpen(false);
      setEditCourier(null);
      const { data } = await supabase.from("courier_groups").select("*").is("deleted_at", null);
      if (data) setCouriers(data);
      showSuccess("Courier company updated");
    } catch (error) {
      showError("Failed to update courier");
      logger.error("Error updating courier:", error);
    }
  };

  const handleUploadCourierLogo = async (file: File) => {
    if (!editCourier) return;

    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `courier-logos/${editCourier.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
      if (uploadError) {
        logger.error("Logo upload error:", uploadError);
        showError("Failed to upload logo: " + uploadError.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(filePath);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      setEditCourierLogo(logoUrl);
      showSuccess("Logo uploaded — click Save to apply");
    } catch (error) {
      logger.error("Logo upload exception:", error);
      showError("Failed to upload logo");
    }
  };

  const handleDeleteCourier = async (id: string) => {
    try {
      // First nullify any package references to this courier
      await supabase
        .from("packages")
        .update({ courier_group_id: null })
        .eq("courier_group_id", id);

      // Soft-delete the courier
      const { error } = await supabase.from("courier_groups").update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId }).eq("id", id);
      if (error) {
        logger.error("Delete courier error:", error);
        showError("Failed to delete: " + error.message);
        setDeletingCourierId(null);
        return;
      }

      // Verify it was actually soft-deleted
      const { data: check } = await supabase.from("courier_groups").select("id, deleted_at").eq("id", id).maybeSingle();
      if (check && !check.deleted_at) {
        showError("Delete blocked by database policy — ask your admin to enable UPDATE on courier_groups");
        setDeletingCourierId(null);
        return;
      }

      setDeletingCourierId(null);
      setCouriers(couriers.filter((c) => c.id !== id));
      showSuccess("Courier company deleted");
    } catch (error) {
      logger.error("Error deleting courier:", error);
      showError("Failed to delete courier");
      setDeletingCourierId(null);
    }
  };

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
            <h2 className="text-ui font-semibold text-txt-primary">Courier Companies</h2>
            <p className="text-muted text-txt-tertiary mt-0.5">Manage your courier partners</p>
          </div>
          <button onClick={() => setCourierFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add courier
          </button>
        </div>

        <div className="sheet-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <div className="overflow-auto">
            <table className="sheet-table" style={{ '--table-size': '100%' } as React.CSSProperties}>
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: '45%' }}>
                    <span>Company</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '25%' }}>
                    <span>Code</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '30%', textAlign: 'right' }}>
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {couriers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">No courier companies yet</p>
                        <p className="empty-state-desc">Click "Add courier" to create one</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  couriers.map((courier) => (
                    <tr key={courier.id} className="sheet-row">
                      <td className="sheet-cell">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                            {courier.logo_url ? (
                              <img src={courier.logo_url} alt={courier.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Truck className="w-4 h-4 text-txt-placeholder" />
                            )}
                          </div>
                          <span className="font-medium truncate text-ui text-[#3b3b3e]">{courier.name}</span>
                        </div>
                      </td>
                      <td className="sheet-cell">
                        <span className="courier-badge">{courier.code}</span>
                      </td>
                      <td className="sheet-cell">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditCourier(courier)}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/8 rounded-md transition-colors cursor-pointer"
                            title="Edit courier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingCourierId(courier.id)}
                            className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Delete courier"
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

      {/* ── Success/Error Messages ── */}
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

      {/* ── Add Courier Modal ── */}
      {courierFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Add courier company</h3>
              <button onClick={() => setCourierFormOpen(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Company name</label>
                  <input type="text" placeholder="e.g. FedEx" value={courierForm.name} onChange={(e) => setCourierForm({ ...courierForm, name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. FEDX" value={courierForm.code} onChange={(e) => setCourierForm({ ...courierForm, code: e.target.value })} className="form-input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCourierFormOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddCourier} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Add courier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Courier Modal ── */}
      {editCourierOpen && editCourier && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Edit courier company</h3>
              <button onClick={() => { setEditCourierOpen(false); setEditCourier(null); }} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {editCourierLogo ? (
                      <img src={editCourierLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Truck className="w-6 h-6 text-txt-placeholder" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="btn-secondary text-ui cursor-pointer flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" />
                      {editCourierLogo ? "Change" : "Upload"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCourierLogo(f); }} />
                    </label>
                    {editCourierLogo && (
                      <button onClick={() => setEditCourierLogo(null)} className="btn-secondary text-ui text-red-500 hover:text-red-600 flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Company name</label>
                  <input type="text" placeholder="e.g. FedEx" value={editCourierName} onChange={(e) => setEditCourierName(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. FEDX" value={editCourierCode} onChange={(e) => setEditCourierCode(e.target.value)} className="form-input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setEditCourierOpen(false); setEditCourier(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleEditCourierSave} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Courier Confirmation ── */}
      {deletingCourierId && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-title font-semibold text-txt-primary">Delete courier company</h3>
                <p className="text-ui-sm text-txt-tertiary mt-0.5">This action cannot be undone. Any shipments linked to this courier will be affected.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingCourierId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleDeleteCourier(deletingCourierId)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5">
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
