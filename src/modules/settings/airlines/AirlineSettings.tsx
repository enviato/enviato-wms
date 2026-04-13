"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import { Plane, Plus, Pencil, Trash2, ImagePlus, X, Check, AlertTriangle, Loader2 } from "lucide-react";

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

export default function AirlineSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [airlines, setAirlines] = useState<CarrierRecord[]>([]);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Add airline state
  const [airlineFormOpen, setAirlineFormOpen] = useState(false);
  const [airlineForm, setAirlineForm] = useState({
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

  // Edit airline state
  const [editAirlineOpen, setEditAirlineOpen] = useState(false);
  const [editAirline, setEditAirline] = useState<CarrierRecord | null>(null);
  const [editAirlineName, setEditAirlineName] = useState("");
  const [editAirlineCode, setEditAirlineCode] = useState("");
  const [editAirlineEmail, setEditAirlineEmail] = useState("");
  const [editAirlinePhone, setEditAirlinePhone] = useState("");
  const [editAirlineAddressLine1, setEditAirlineAddressLine1] = useState("");
  const [editAirlineCity, setEditAirlineCity] = useState("");
  const [editAirlineState, setEditAirlineState] = useState("");
  const [editAirlineZipCode, setEditAirlineZipCode] = useState("");
  const [editAirlineCountry, setEditAirlineCountry] = useState("");
  const [editAirlineLogo, setEditAirlineLogo] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingAirlineId, setDeletingAirlineId] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load airlines data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Get current user for deleted_by tracking
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          setCurrentUserId(authUser.id);
        }

        // Load airlines
        const { data: airlinesData } = await supabase
          .from("courier_groups")
          .select("*")
          .eq("type", "airline")
          .is("deleted_at", null);
        if (airlinesData) {
          setAirlines(airlinesData);
        }
      } catch (error) {
        logger.error("Error loading airlines:", error);
        showError("Failed to load airlines");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [supabase]);

  const handleAddAirline = async () => {
    if (!airlineForm.name || !airlineForm.code) {
      showError("Please fill in required fields");
      return;
    }

    try {
      const { error } = await supabase.from("courier_groups").insert({
        name: airlineForm.name,
        code: airlineForm.code,
        contact_email: airlineForm.contactEmail || null,
        contact_phone: airlineForm.contactPhone || null,
        address_line1: airlineForm.addressLine1 || null,
        city: airlineForm.city || null,
        state: airlineForm.state || null,
        zip_code: airlineForm.zipCode || null,
        country: airlineForm.country || null,
        type: "airline",
      });

      if (!error) {
        setAirlineForm({
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
        setAirlineFormOpen(false);
        const { data } = await supabase.from("courier_groups").select("*").eq("type", "airline").is("deleted_at", null);
        if (data) setAirlines(data);
        showSuccess("Airline added");
      } else {
        logger.error("Error adding airline:", error);
        showError("Failed to add airline: " + error.message);
      }
    } catch (error) {
      logger.error("Error adding airline:", error);
      showError("Failed to add airline");
    }
  };

  const openEditAirline = (airline: CarrierRecord) => {
    setEditAirline(airline);
    setEditAirlineName(airline.name);
    setEditAirlineCode(airline.code);
    setEditAirlineEmail(airline.contact_email || "");
    setEditAirlinePhone(airline.contact_phone || "");
    setEditAirlineAddressLine1(airline.address_line1 || "");
    setEditAirlineCity(airline.city || "");
    setEditAirlineState(airline.state || "");
    setEditAirlineZipCode(airline.zip_code || "");
    setEditAirlineCountry(airline.country || "");
    setEditAirlineLogo(airline.logo_url || null);
    setEditAirlineOpen(true);
  };

  const handleEditAirlineSave = async () => {
    if (!editAirline) return;

    try {
      // Build update payload
      const updatePayload: Record<string, unknown> = {
        name: editAirlineName,
        code: editAirlineCode,
        contact_email: editAirlineEmail || null,
        contact_phone: editAirlinePhone || null,
        address_line1: editAirlineAddressLine1 || null,
        city: editAirlineCity || null,
        state: editAirlineState || null,
        zip_code: editAirlineZipCode || null,
        country: editAirlineCountry || null,
      };

      // Try updating with logo_url
      const { error } = await supabase.from("courier_groups").update({
        ...updatePayload,
        logo_url: editAirlineLogo,
      }).eq("id", editAirline.id);

      if (error) {
        // If logo_url column doesn't exist, retry without it
        logger.warn("Update with logo_url failed, retrying without:");
        const { error: retryError } = await supabase.from("courier_groups").update(updatePayload).eq("id", editAirline.id);
        if (retryError) {
          showError("Failed to update airline");
          logger.error("Error updating airline:", retryError);
          return;
        }
      }

      setEditAirlineOpen(false);
      setEditAirline(null);
      const { data } = await supabase.from("courier_groups").select("*").eq("type", "airline").is("deleted_at", null);
      if (data) setAirlines(data);
      showSuccess("Airline updated");
    } catch (error) {
      showError("Failed to update airline");
      logger.error("Error updating airline:", error);
    }
  };

  const handleUploadAirlineLogo = async (file: File) => {
    if (!editAirline) return;

    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = `airline-logos/${editAirline.id}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
      if (uploadError) {
        logger.error("Logo upload error:", uploadError);
        showError("Failed to upload logo: " + uploadError.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("assets").getPublicUrl(filePath);
      const logoUrl = urlData.publicUrl + "?t=" + Date.now();
      setEditAirlineLogo(logoUrl);
      showSuccess("Logo uploaded — click Save to apply");
    } catch (error) {
      logger.error("Logo upload exception:", error);
      showError("Failed to upload logo");
    }
  };

  const handleDeleteAirline = async (id: string) => {
    try {
      // First nullify any AWB references to this airline
      await supabase
        .from("awbs")
        .update({ courier_group_id: null })
        .eq("courier_group_id", id);

      // Soft-delete the airline
      const { error } = await supabase.from("courier_groups").update({ deleted_at: new Date().toISOString(), deleted_by: currentUserId }).eq("id", id);
      if (error) {
        logger.error("Delete airline error:", error);
        showError("Failed to delete: " + error.message);
        setDeletingAirlineId(null);
        return;
      }

      // Verify it was actually soft-deleted
      const { data: check } = await supabase.from("courier_groups").select("id, deleted_at").eq("id", id).maybeSingle();
      if (check && !check.deleted_at) {
        showError("Delete blocked by database policy — ask your admin to enable UPDATE on courier_groups");
        setDeletingAirlineId(null);
        return;
      }

      setDeletingAirlineId(null);
      setAirlines(airlines.filter((a) => a.id !== id));
      showSuccess("Airline deleted");
    } catch (error) {
      logger.error("Error deleting airline:", error);
      showError("Failed to delete airline");
      setDeletingAirlineId(null);
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
            <h2 className="text-ui font-semibold text-txt-primary">Airlines</h2>
            <p className="text-muted text-txt-tertiary mt-0.5">Manage your airline partners</p>
          </div>
          <button onClick={() => setAirlineFormOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add airline
          </button>
        </div>

        <div className="sheet-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <div className="overflow-auto">
            <table className="sheet-table" style={{ '--table-size': '100%' } as React.CSSProperties}>
              <thead className="sheet-thead">
                <tr>
                  <th className="sheet-th" style={{ width: '35%' }}>
                    <span>Airline</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '20%' }}>
                    <span>Code</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '25%' }}>
                    <span>Country</span>
                    <span className="sheet-th-sep" />
                  </th>
                  <th className="sheet-th" style={{ width: '20%', textAlign: 'right' }}>
                    <span>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {airlines.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="sheet-cell text-center py-16">
                      <div className="empty-state">
                        <p className="empty-state-title">No airlines yet</p>
                        <p className="empty-state-desc">Click "Add airline" to create one</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  airlines.map((airline) => (
                    <tr key={airline.id} className="sheet-row">
                      <td className="sheet-cell">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-md border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                            {airline.logo_url ? (
                              <img src={airline.logo_url} alt={airline.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Plane className="w-4 h-4 text-txt-placeholder" />
                            )}
                          </div>
                          <span className="font-medium truncate text-ui text-[#3b3b3e]">{airline.name}</span>
                        </div>
                      </td>
                      <td className="sheet-cell">
                        <span className="courier-badge">{airline.code}</span>
                      </td>
                      <td className="sheet-cell">
                        <span className="text-ui text-txt-secondary">{airline.country || "—"}</span>
                      </td>
                      <td className="sheet-cell">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditAirline(airline)}
                            className="p-1.5 text-txt-tertiary hover:text-primary hover:bg-primary/8 rounded-md transition-colors cursor-pointer"
                            title="Edit airline"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingAirlineId(airline.id)}
                            className="p-1.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            title="Delete airline"
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

      {/* ── Add Airline Modal ── */}
      {airlineFormOpen && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-2xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Add airline</h3>
              <button onClick={() => setAirlineFormOpen(false)} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Company name</label>
                  <input type="text" placeholder="e.g. Emirates" value={airlineForm.name} onChange={(e) => setAirlineForm({ ...airlineForm, name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. EK" value={airlineForm.code} onChange={(e) => setAirlineForm({ ...airlineForm, code: e.target.value })} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                  <input type="email" placeholder="e.g. info@airline.com" value={airlineForm.contactEmail} onChange={(e) => setAirlineForm({ ...airlineForm, contactEmail: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                  <input type="tel" placeholder="e.g. +1 (555) 123-4567" value={airlineForm.contactPhone} onChange={(e) => setAirlineForm({ ...airlineForm, contactPhone: e.target.value })} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address Line 1</label>
                <input type="text" placeholder="e.g. 123 Aviation Way" value={airlineForm.addressLine1} onChange={(e) => setAirlineForm({ ...airlineForm, addressLine1: e.target.value })} className="form-input" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">City</label>
                  <input type="text" placeholder="e.g. Dubai" value={airlineForm.city} onChange={(e) => setAirlineForm({ ...airlineForm, city: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">State</label>
                  <input type="text" placeholder="e.g. Dubai" value={airlineForm.state} onChange={(e) => setAirlineForm({ ...airlineForm, state: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Zip Code</label>
                  <input type="text" placeholder="e.g. 00000" value={airlineForm.zipCode} onChange={(e) => setAirlineForm({ ...airlineForm, zipCode: e.target.value })} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Country</label>
                <input type="text" placeholder="e.g. United Arab Emirates" value={airlineForm.country} onChange={(e) => setAirlineForm({ ...airlineForm, country: e.target.value })} className="form-input" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setAirlineFormOpen(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleAddAirline} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Add airline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Airline Modal ── */}
      {editAirlineOpen && editAirline && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-2xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-txt-primary">Edit airline</h3>
              <button onClick={() => { setEditAirlineOpen(false); setEditAirline(null); }} className="p-1 text-txt-tertiary hover:text-txt-primary transition-colors duration-150 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Logo */}
              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-2">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border bg-[#f8fafc] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {editAirlineLogo ? (
                      <img src={editAirlineLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                    ) : (
                      <Plane className="w-6 h-6 text-txt-placeholder" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="btn-secondary text-ui cursor-pointer flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" />
                      {editAirlineLogo ? "Change" : "Upload"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAirlineLogo(f); }} />
                    </label>
                    {editAirlineLogo && (
                      <button onClick={() => setEditAirlineLogo(null)} className="btn-secondary text-ui text-red-500 hover:text-red-600 flex items-center gap-1.5">
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
                  <input type="text" placeholder="e.g. Emirates" value={editAirlineName} onChange={(e) => setEditAirlineName(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Code</label>
                  <input type="text" placeholder="e.g. EK" value={editAirlineCode} onChange={(e) => setEditAirlineCode(e.target.value)} className="form-input" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Email</label>
                  <input type="email" placeholder="e.g. info@airline.com" value={editAirlineEmail} onChange={(e) => setEditAirlineEmail(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Phone</label>
                  <input type="tel" placeholder="e.g. +1 (555) 123-4567" value={editAirlinePhone} onChange={(e) => setEditAirlinePhone(e.target.value)} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Address Line 1</label>
                <input type="text" placeholder="e.g. 123 Aviation Way" value={editAirlineAddressLine1} onChange={(e) => setEditAirlineAddressLine1(e.target.value)} className="form-input" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">City</label>
                  <input type="text" placeholder="e.g. Dubai" value={editAirlineCity} onChange={(e) => setEditAirlineCity(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">State</label>
                  <input type="text" placeholder="e.g. Dubai" value={editAirlineState} onChange={(e) => setEditAirlineState(e.target.value)} className="form-input" />
                </div>
                <div>
                  <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Zip Code</label>
                  <input type="text" placeholder="e.g. 00000" value={editAirlineZipCode} onChange={(e) => setEditAirlineZipCode(e.target.value)} className="form-input" />
                </div>
              </div>

              <div>
                <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">Country</label>
                <input type="text" placeholder="e.g. United Arab Emirates" value={editAirlineCountry} onChange={(e) => setEditAirlineCountry(e.target.value)} className="form-input" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setEditAirlineOpen(false); setEditAirline(null); }} className="btn-secondary">Cancel</button>
              <button onClick={handleEditAirlineSave} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Airline Confirmation ── */}
      {deletingAirlineId && (
        <div className="modal-overlay z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="modal-panel max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-title font-semibold text-txt-primary">Delete airline</h3>
                <p className="text-ui-sm text-txt-tertiary mt-0.5">This action cannot be undone. Any shipments linked to this airline will be affected.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setDeletingAirlineId(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleDeleteAirline(deletingAirlineId)} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-ui transition-colors cursor-pointer flex items-center gap-1.5">
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
