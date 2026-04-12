"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Save, Loader2 } from "lucide-react";

type NotificationFlags = {
  awbShipped: boolean;
  awbArrived: boolean;
  packageReceived: boolean;
  invoiceReady: boolean;
};

const DEFAULT_FLAGS: NotificationFlags = {
  awbShipped: true,
  awbArrived: true,
  packageReceived: true,
  invoiceReady: true,
};

const NOTIFICATION_ITEMS: {
  key: keyof NotificationFlags;
  label: string;
  desc: string;
}[] = [
  {
    key: "awbShipped",
    label: "Shipment shipped notifications",
    desc: "Notify customers when shipment status changes to shipped",
  },
  {
    key: "awbArrived",
    label: "Shipment arrived notifications",
    desc: "Notify customers when shipment arrives at destination",
  },
  {
    key: "packageReceived",
    label: "Package received alerts",
    desc: "Alert when package is received at destination warehouse",
  },
  {
    key: "invoiceReady",
    label: "Invoice ready notifications",
    desc: "Notify when a new invoice is generated",
  },
];

export default function NotificationSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgSettings, setOrgSettings] = useState<Record<string, unknown>>({});
  const [flags, setFlags] = useState<NotificationFlags>(DEFAULT_FLAGS);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(""), 4000);
  };

  // Load org + notification settings
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, settings")
        .limit(1)
        .single();
      if (data) {
        setOrgId(data.id);
        const settings = (data.settings ?? {}) as Record<string, unknown>;
        setOrgSettings(settings);
        const notif = settings.notifications as NotificationFlags | undefined;
        if (notif) setFlags(notif);
      }
      setLoading(false);
    };
    load();
  }, [supabase]);

  // Toggle a single flag
  const handleToggle = (key: keyof NotificationFlags) => {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Save handler
  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({
          settings: { ...orgSettings, notifications: flags },
        })
        .eq("id", orgId);

      if (!error) {
        showSuccess("Notification settings saved");
      } else {
        showError("Failed to save: " + error.message);
      }
    } catch (error) {
      console.error("Error saving notifications:", error);
      showError("Failed to save notification settings");
    } finally {
      setSaving(false);
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

      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-ui font-semibold text-txt-primary">
              Customer notifications
            </h2>
            <p className="text-muted text-txt-tertiary mt-0.5">
              Configure automated customer notifications
            </p>
          </div>
        </div>

        <div className="px-5 py-5 space-y-0">
          {NOTIFICATION_ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div>
                <p className="text-txt-primary text-ui">
                  {item.label}
                </p>
                <p className="text-txt-tertiary text-muted mt-0.5">
                  {item.desc}
                </p>
              </div>
              <button
                onClick={() => handleToggle(item.key)}
                className={`w-11 h-6 rounded-full relative transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                  flags[item.key] ? "bg-primary" : "bg-gray-300"
                }`}
                aria-label={`Toggle ${item.label}`}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
                  style={{
                    transform: flags[item.key]
                      ? "translateX(20px)"
                      : "translateX(0)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>

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
            Save settings
          </button>
        </div>
      </div>
    </>
  );
}
