"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Building2, Save, Loader2 } from "lucide-react";

type OrganizationForm = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_icon_url: string | null;
  plan_tier: string;
  address?: Record<string, string>;
  settings?: Record<string, unknown>;
};

export default function GeneralSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState<OrganizationForm>({
    id: "",
    name: "",
    slug: "",
    logo_url: null,
    logo_icon_url: null,
    plan_tier: "",
    address: {},
    settings: {},
  });

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load org data
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .limit(1)
        .single();
      if (data) {
        setForm(data);
      }
      setLoading(false);
    };
    load();
  }, [supabase]);

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          logo_url: form.logo_url,
          logo_icon_url: form.logo_icon_url,
          address: form.address,
        })
        .eq("id", form.id);

      if (!error) {
        showSuccess("General settings saved");
      } else {
        showError("Failed to save: " + error.message);
      }
    } catch (error) {
      console.error("Error saving general settings:", error);
      showError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Logo upload handler
  const handleLogoUpload = async (file: File, type: "full" | "icon") => {
    if (!form.id) return;
    try {
      const ext = file.name.split(".").pop() || "png";
      const filePath = type === "full"
        ? `logos/${form.id}.${ext}`
        : `logos/${form.id}-icon.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .upload(filePath, file, { upsert: true });
      if (uploadError) {
        showError(`Failed to upload ${type === "full" ? "logo" : "icon"}`);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("assets")
        .getPublicUrl(filePath);
      const url = urlData.publicUrl + "?t=" + Date.now();
      if (type === "full") {
        setForm({ ...form, logo_url: url });
      } else {
        setForm({ ...form, logo_icon_url: url });
      }
      showSuccess(`${type === "full" ? "Logo" : "Icon"} uploaded — click Save to apply`);
    } catch {
      showError("Upload failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-txt-tertiary" />
      </div>
    );
  }

  return (
    <>
      {/* Toast messages */}
      {successMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-ui">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-ui">
          {errorMessage}
        </div>
      )}

      <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-ui font-semibold text-txt-primary">
              Organization details
            </h2>
            <p className="text-muted text-txt-tertiary mt-0.5">
              Manage your organization&apos;s profile
            </p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Company name */}
          <div>
            <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
              Company name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="form-input"
            />
          </div>

          {/* Logos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Full logo */}
            <div>
              <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                Full logo
              </label>
              <p className="text-meta text-txt-placeholder mb-2">
                Displayed in the expanded sidebar. Recommended: wide/horizontal
                format.
              </p>
              <div className="flex items-center gap-4">
                {form.logo_url ? (
                  <div className="w-28 h-12 rounded-lg border border-border bg-surface-secondary flex items-center justify-center overflow-hidden">
                    <img
                      src={form.logo_url}
                      alt="Logo"
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                ) : (
                  <div className="w-28 h-12 rounded-lg border-2 border-dashed border-border bg-surface-secondary flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-txt-placeholder" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="btn-secondary cursor-pointer inline-flex items-center gap-2 text-meta">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, "full");
                      }}
                    />
                    Upload
                  </label>
                  {form.logo_url && (
                    <button
                      onClick={() => setForm({ ...form, logo_url: "" })}
                      className="text-meta text-red-500 hover:text-red-600 transition-colors cursor-pointer text-left"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Icon / mark */}
            <div>
              <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
                Logo icon
              </label>
              <p className="text-meta text-txt-placeholder mb-2">
                Displayed in the collapsed sidebar. Recommended: square format.
              </p>
              <div className="flex items-center gap-4">
                {form.logo_icon_url ? (
                  <div className="w-12 h-12 rounded-lg border border-border bg-surface-secondary flex items-center justify-center overflow-hidden">
                    <img
                      src={form.logo_icon_url}
                      alt="Icon"
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg border-2 border-dashed border-border bg-surface-secondary flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-txt-placeholder" />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="btn-secondary cursor-pointer inline-flex items-center gap-2 text-meta">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, "icon");
                      }}
                    />
                    Upload
                  </label>
                  {form.logo_icon_url && (
                    <button
                      onClick={() =>
                        setForm({ ...form, logo_icon_url: "" })
                      }
                      className="text-meta text-red-500 hover:text-red-600 transition-colors cursor-pointer text-left"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="pt-4 border-t border-border">
            <h3 className="text-meta text-txt-tertiary tracking-tight mb-4">
              Address
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Street address"
                value={form.address?.street || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address: { ...form.address, street: e.target.value },
                  })
                }
                className="form-input"
              />
              <input
                type="text"
                placeholder="City"
                value={form.address?.city || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address: { ...form.address, city: e.target.value },
                  })
                }
                className="form-input"
              />
              <input
                type="text"
                placeholder="State / Province"
                value={form.address?.state || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address: { ...form.address, state: e.target.value },
                  })
                }
                className="form-input"
              />
              <input
                type="text"
                placeholder="Zip code"
                value={form.address?.zip || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address: { ...form.address, zip: e.target.value },
                  })
                }
                className="form-input"
              />
              <input
                type="text"
                placeholder="Country"
                value={form.address?.country || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    address: { ...form.address, country: e.target.value },
                  })
                }
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save changes
          </button>
        </div>
      </div>
    </>
  );
}
