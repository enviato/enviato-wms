"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";
import SearchableSelect from "@/components/SearchableSelect";
import { Loader2, Save } from "lucide-react";

type PackageIdConfig = {
  prefix: string;
  separator: string;
  startingNumber: number;
};

type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_icon_url: string | null;
  plan_tier: string;
  address?: Record<string, string>;
  settings?: Record<string, unknown>;
};

export default function PackageIdSettings() {
  const supabase = createClient();

  // State
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [packageIdConfig, setPackageIdConfig] = useState<PackageIdConfig>({
    prefix: "PKG",
    separator: "-",
    startingNumber: 1,
  });
  const [savingPackageId, setSavingPackageId] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
        // Load organization
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .maybeSingle();
        if (orgData) {
          setOrg(orgData);
          // Load package ID config from org settings
          const pkgConfig = (orgData.settings as Record<string, unknown>)?.packageId as Record<string, unknown> | undefined;
          if (pkgConfig) {
            setPackageIdConfig({
              prefix: (pkgConfig.prefix as string) || "PKG",
              separator: (pkgConfig.separator as string) || "-",
              startingNumber: (pkgConfig.startingNumber as number) || 1,
            });
          }
        }
      } catch (error) {
        logger.error("Error loading package ID settings", error);
        showError("Failed to load package ID settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Save package ID configuration
  const handleSavePackageId = async () => {
    setSavingPackageId(true);
    try {
      if (org) {
        const { error } = await supabase
          .from("organizations")
          .update({
            settings: {
              ...((org.settings as Record<string, unknown>) || {}),
              packageId: packageIdConfig,
            },
          })
          .eq("id", org.id);

        if (!error) {
          showSuccess("Package ID configuration saved");
        } else {
          showError("Failed to save package ID configuration");
        }
      }
    } catch (error) {
      logger.error("Error saving package ID config", error);
      showError("An error occurred while saving");
    } finally {
      setSavingPackageId(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-sm p-5 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-5 h-5 animate-spin text-txt-tertiary" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="bg-white border border-border rounded-lg shadow-sm p-5">
        <p className="text-txt-tertiary">Unable to load organization data</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-lg shadow-sm">
      {/* Success/Error Messages */}
      {successMessage && (
        <div className="px-5 py-3 bg-green-50 border-b border-green-200 text-green-800 text-ui">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200 text-red-800 text-ui">
          {errorMessage}
        </div>
      )}

      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-title font-semibold text-txt-primary">
            Package ID configuration
          </h2>
          <p className="text-ui-sm text-txt-tertiary mt-0.5">
            Configure how package IDs are generated
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-5 space-y-4">
        {/* Preview */}
        <div className="p-4 bg-surface-secondary border border-border rounded-md">
          <p className="text-meta text-txt-tertiary tracking-tight mb-2">
            Preview
          </p>
          <p className="text-[20px] font-bold text-txt-primary font-mono">
            {packageIdConfig.prefix}
            {packageIdConfig.separator}
            {String(packageIdConfig.startingNumber).padStart(6, "0")}
          </p>
        </div>

        {/* Configuration Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Prefix */}
          <div>
            <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
              Prefix
            </label>
            <input
              type="text"
              value={packageIdConfig.prefix}
              onChange={(e) =>
                setPackageIdConfig({ ...packageIdConfig, prefix: e.target.value })
              }
              placeholder="PKG"
              className="form-input"
            />
          </div>

          {/* Separator */}
          <div>
            <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
              Separator
            </label>
            <SearchableSelect
              value={packageIdConfig.separator}
              onChange={(v) =>
                setPackageIdConfig({ ...packageIdConfig, separator: v })
              }
              searchable={false}
              options={[
                { value: "-", label: "Hyphen (-)" },
                { value: "_", label: "Underscore (_)" },
                { value: "", label: "None" },
              ]}
            />
          </div>

          {/* Starting Number */}
          <div>
            <label className="text-meta text-txt-tertiary tracking-tight block mb-1.5">
              Starting number
            </label>
            <input
              type="number"
              value={packageIdConfig.startingNumber}
              onChange={(e) =>
                setPackageIdConfig({
                  ...packageIdConfig,
                  startingNumber: parseInt(e.target.value) || 0,
                })
              }
              min="0"
              className="form-input"
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-border flex justify-end">
        <button
          onClick={handleSavePackageId}
          disabled={savingPackageId}
          className="btn-primary flex items-center gap-2"
        >
          {savingPackageId ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save configuration
        </button>
      </div>
    </div>
  );
}
