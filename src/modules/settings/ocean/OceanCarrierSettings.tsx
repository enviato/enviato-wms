"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import { Ship, Plus, Pencil, Trash2, ImagePlus, X, Check, AlertTriangle, Loader2 } from "lucide-react";

type CarrierRecord = {
  id: string;
  name: string;
  code: string;
  contact_email: string;
  contact_phone: string;
  country: string;
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
  logo_url?: string | null;
};

export default function OceanCarrierSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Add carrier state
  const [carrierFormOpen, setCarrierFormOpen] = useState(false);
  const [carrierForm, setCarrierForm] = useState({
    name: "",
    code: "",
    contactEmail: "",
    contactPhone: "",
    addressLine1: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  });

  // Edit carrier state
  const [editCarrierOpen, setEditCarrierOpen] = useState(false);
  const [editCarrier, setEditCarrier] = useState<CarrierRecord | null>(null);
  const [editCarrierName, setEditCarrierName] = useState("");
  const [editCarrierCode, setEditCarrierCode] = useState("");
  const [editCarrierEmail, setEditCarrierEmail] = useState("");
  const [editCarrierPhone, setEditCarrierPhone] = useState("");
  const [editCarrierAddressLine1, setEditCarrierAddressLine1] = useState("");
  const [editCarrierCity, setEditCarrierCity] = useState("");
  const [editCarrierState, setEditCarrierState] = useState("");
  const [editCarrierZipCode, setEditCarrierZipCode] = useState("");
  const [editCarrierCountry, setEditCarrierCountry] = useState("");
  const [editCarrierLogo, setEditCarrierLogo] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingCarrierId, setDeletingCarrierId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load carriers data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user for deleted_by tracking
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          setCurrentUserId(authUser.id);
          // Fetch org_id for RLS compliance on inserts
          const { data: userData } = await supabase
            .from("users")
            .select("org_id")
            .eq("id", authUser.id)
            .single();
          if (userData?.org_id) setOrgId(userData.org_id);
        }

        // Load ocean carriers
        const { data: carriersData } = await supabase
          .from("courier_groups")
          .select("*")
          .eq("type", "ocean")
          .is("deleted_at", null);
        if (carriersData) {
          setCarriers(carriersData as CarrierRecord[]);
        }
      } catch (error) {
        logger.error("Error loading ocean carriers:", error);
        showError("Failed to load ocean carriers");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  const handleAddCarrier = async () => {
    if (!carrierForm.name || !carrierForm.code) {
      showError("Please fill in required fields");
      return;
    }

    try {
      const { error } = await supabase.from("courier_groups").insert({
        name: carrierForm.name,
        code: carrierForm.code,
        contact_email: carrierForm.contactEmail || null,
        contact_phone: carrierForm.contactPhone || null,
        address_line1: carrierForm.addressLine1 || null,
        city: carrierForm.city || null,
        state: carrierForm.state || null,
        zip_code: carrierForm.zipCode || null,
        country: carrierForm.country || null,
        type: "ocean",
        org_id: orgId,
      });

      if (!error) {
        setCarrierForm({
          name: "",
          code: "",
          contactEmail: "",
          contactPhone: "",
          addressLine1: "",
          city: "",
          state: "",
          zipCode: "",
          country: "",
        });
        setCarrierFormOpen(false);
        const { data } = await supabase.from("courier_groups").select("*").eq("type", "ocean").is("deleted_at", null);
        if (data) setCarriers(data as CarrierRecord[]);
        showSuccess("Ocean carrier added");
      } else {
        logger.error("Error adding ocean carrier:", error);
        showError("Failed to add ocean carrier: " + error.message);
      }
    } catch (error) {
      logger.error("Error adding ocean carrier:", error);
      showError("Failed to add ocean carrier");
    }
  };

  const openEditCarrier = (carrier: CarrierRecord) => {
    setEditCarrier(carrier);
    setEditCarrierName(carrier.name);
    setEditCarrierCode(carrier.code);
    setEditCarrierEmail(carrier.contact_email || "");
    setEditCarrierPhone(carrier.contact_phone || "");
    setEditCarrierAddressLine1(carrier.address_line1 || "");
    setEditCarrierCity(carrier.city || "");
    setEditCarrierState(carrier.state || "");
    setEditCarrierZipCode(carrier.zip_code || "");
    setEditCarrierCountry(carrier.country || "");
    setEditCarrierLogo(carrier.logo_url || null);
    setEditCarrierOpen(true);
  };

  const handleEditCarrierSave = async () => {
    if (!editCarrier) return;

    try {
      // Build update payload
      const updatePayload: Record<string, unknown> = {
        name: editCarrierName,
        code: editCarrierCode,
        contact_email: editCarrierEmail || null,
        contact_phone: editCarrierPhone || null,
        address_line1: editCarrierAddressLine1 || null,
        city: editCarrierCity || null,
        state: editCarrierState || null,
        zip_code: editCarrierZipCode || null,
        country: editCarrierCountry || null,
      };

      // Try updating with logo_url
      const { error } = await supabase.from("courier_groups").update({
        ...updatePayload,
        logo_url: editCarrierLogo,
      }).eq("id", editCarrier.id);

      if (error) {
        // If logo_url column doesn't exist, retry without it
        logger.warn("Update with logo_url failed, retrying without:");
        const { error: retryError } = await supabase.from("courier_groups").update(updatePayload).eq("id", editCarrier.id);
        if (retryError) {
          showError("Failed to update ocean carrier");
          logger.error("Error updating ocean carrier:", retryError);
          return;
        }
      }

      setEditCarrierOpen(false);
      setEditCarrier(null);
      const { data } = await supabase.from("courier_groups").select("*").eq("type", "ocean").is("deleted_at", null);
      if (data) setCarriers(data as CarrierRecord[]);
      showSuccess("Ocean carrier updated");
    } catch (error) {
      showError("Failed to update ocean carrier");
      logger.error("Error updating ocean carrier:", error);
    }
  };

  const handleUploadCarrierLogo = async (file: File) => {
    if (!editCarrier) return;

    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `ocean-logos/${editCarrier.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
      if (uploadError) {
        logger.error("Logo upload error:", uploadError);
        showError("Failed to upload logo: " + uploadError.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(filePath);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      setEditCarrierLogo(logoUrl);
      showSuccess("Logo uploaded — click Save to apply");
    } catch (error) {
      logger.error("Logo upload exception:", error);
      showError("Failed to upload logo");
    }
  };

  const handleDeleteCarrier = async (id: string) => {
    try {
      // First nullify any AWB references to this carrier
      await supabase
        .from("awbs")
        .update({ courier_group_id: null })
        .eq("courier_group_id", id);

      // Soft-delete the carrier
      const { error } = await supabase.from("courier_groups").update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId }).eq("id", id);
      if (error) {
        logger.error("Delete ocean carrier error:", error);
        showError("Failed to delete: " + error.message);
        setDeletingCarrierId(null);
        return;
      }

      // Verify it was actually soft-deleted
      const { data: check } = await supabase.from("courier_groups").select("id, deleted_at").eq("id", id).maybeSingle();
      if (check && !check.deleted_at) {
        showError("Delete blocked by database policy — ask your admin to enable UPDATE on courier_groups");
        setDeletingCarrierId(null);
        return;
      }

      setDeletingCarrierId(null);
      setCarriers(carriers.filter((c) => c.id !== id));
      showSuccess("Ocean carrier deleted");
    } catch (error) {
      logger.error("Error deleting ocean carrier:", error);
      showError("Failed to delete ocean carrier");
      setDeletingCarrierId(null);
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
            <h2 className="text-ui font-semibold text-txt-primary">Ocean Carriers</h2>
            <p className="text-muted text-txt-tertiary mt-0.5">Manage your ocean freight carriers</p>
          </div>
          <button onClick={() => setCarrierFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add ocean carrier
          </button>
        </div>

        <div className="sheet-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <div className="overflow-auto">
            <table className="sheet-table" style={{ '--table-size': '100%' } as React.CSSProperties}>
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: '35%' }}>
                    <span>Carrier</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '20%' }}>
                    <span>Code</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '20%' }}>
                    <span>Country</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '25%', textAlign: 'right' }}>
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {carriers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">No ocean carriers yet</p>
                        <p className="empty-state-desc">Click "Add ocean carrier" to create one</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  carriers.map((carrier) => (
                    <tr key={carrier.id} className="sheet-row">
                      <td className="sheet-cell">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                            {carrier.logo_url ? (
                              <img src={carrier.logo_url} alt={carrier.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Ship className="w-4 h-4 text-txt-placeholder" />
                            )}
                          </div>
                          <span className="font-medium truncate text-ui text-[#3b3b3e]">{carrier.name}</span>
                        </div>
                      </td>
                      <td className="sheet-cell">
                        <span className="courier-badge">{carrier.code}</span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">{carrier.country || "—"}</span>
                      </td>
                      <td className="sheet-cell">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditCarrier(carrier)}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/8 rounded-md transition-colors cursor-pointer"
                            title="Edit carrier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingCarrierId(carrier.id)}
                            className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Delete carrier"
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

      {/* ── Add Carrier Modal ── */}
      {carrierFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Add ocean carrier</h3>
              <button onClick={() => setCarrierFormOpen(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Company name</label>
                  <input type="text" placeholder="e.g. Maersk" value={carrierForm.name} onChange={(e) => setCarrierForm({ ...carrierForm, name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. MAERSK" value={carrierForm.code} onChange={(e) => setCarrierForm({ ...carrierForm, code: e.target.value })} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                  <input type="email" placeholder="contact@carrier.com" value={carrierForm.contactEmail} onChange={(e) => setCarrierForm({ ...carrierForm, contactEmail: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                  <input type="tel" placeholder="+1 (555) 000-0000" value={carrierForm.contactPhone} onChange={(e) => setCarrierForm({ ...carrierForm, contactPhone: e.target.value })} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address Line 1</label>
                <input type="text" placeholder="Street address" value={carrierForm.addressLine1} onChange={(e) => setCarrierForm({ ...carrierForm, addressLine1: e.target.value })} className="form-input" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">City</label>
                  <input type="text" placeholder="City" value={carrierForm.city} onChange={(e) => setCarrierForm({ ...carrierForm, city: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">State</label>
                  <input type="text" placeholder="State" value={carrierForm.state} onChange={(e) => setCarrierForm({ ...carrierForm, state: e.target.value })} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Zip Code</label>
                  <input type="text" placeholder="12345" value={carrierForm.zipCode} onChange={(e) => setCarrierForm({ ...carrierForm, zipCode: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Country</label>
                  <input type="text" placeholder="Country" value={carrierForm.country} onChange={(e) => setCarrierForm({ ...carrierForm, country: e.target.value })} className="form-input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setCarrierFormOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddCarrier} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Add ocean carrier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Carrier Modal ── */}
      {editCarrierOpen && editCarrier && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Edit ocean carrier</h3>
              <button onClick={() => { setEditCarrierOpen(false); setEditCarrier(null); }} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {editCarrierLogo ? (
                      <img src={editCarrierLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Ship className="w-6 h-6 text-txt-placeholder" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="btn-secondary text-ui cursor-pointer flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" />
                      {editCarrierLogo ? "Change" : "Upload"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadCarrierLogo(f); }} />
                    </label>
                    {editCarrierLogo && (
                      <button onClick={() => setEditCarrierLogo(null)} className="btn-secondary text-ui text-red-500 hover:text-red-600 flex items-center gap-1.5">
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
                  <input type="text" placeholder="e.g. Maersk" value={editCarrierName} onChange={(e) => setEditCarrierName(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. MAERSK" value={editCarrierCode} onChange={(e) => setEditCarrierCode(e.target.value)} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                  <input type="email" placeholder="contact@carrier.com" value={editCarrierEmail} onChange={(e) => setEditCarrierEmail(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                  <input type="tel" placeholder="+1 (555) 000-0000" value={editCarrierPhone} onChange={(e) => setEditCarrierPhone(e.target.value)} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address Line 1</label>
                <input type="text" placeholder="Street address" value={editCarrierAddressLine1} onChange={(e) => setEditCarrierAddressLine1(e.target.value)} className="form-input" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">City</label>
                  <input type="text" placeholder="City" value={editCarrierCity} onChange={(e) => setEditCarrierCity(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">State</label>
                  <input type="text" placeholder="State" value={editCarrierState} onChange={(e) => setEditCarrierState(e.target.value)} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Zip Code</label>
                  <input type="text" placeholder="12345" value={editCarrierZipCode} onChange={(e) => setEditCarrierZipCode(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Country</label>
                  <input type="text" placeholder="Country" value={editCarrierCountry} onChange={(e) => setEditCarrierCountry(e.target.value)} className="form-input" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setEditCarrierOpen(false); setEditCarrier(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleEditCarrierSave} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Carrier Confirmation ── */}
      {deletingCarrierId && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-title font-semibold text-txt-primary">Delete ocean carrier</h3>
                <p className="text-ui-sm text-txt-tertiary mt-0.5">This action cannot be undone. Any shipments linked to this carrier will be affected.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingCarrierId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleDeleteCarrier(deletingCarrierId)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5">
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
