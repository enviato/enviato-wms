"use client";

import { useState, useEffect } from "react";
import { logger } from "@/shared/lib/logger";
import { createClient } from "@/lib/supabase";
import {
  Printer,
  Loader2,
  Save,
} from "lucide-react";

type LabelTemplate = {
  id: string;
  name: string;
  fields: {
    packageId: boolean;
    recipientName: boolean;
    customerNumber: boolean;
    billableWeight: boolean;
    agentName: boolean;
    trackingNumber: boolean;
    dimensions: boolean;
    commodity: boolean;
    orgLogo: boolean;
  };
  paper_size: string;
  label_size: { width: number; height: number };
  is_default: boolean;
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

export default function LabelSettings() {
  const supabase = createClient();

  // State
  const [loading, setLoading] = useState(true);
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [autoPrintOnCheckin, setAutoPrintOnCheckin] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) setCurrentUserId(user.id);

        // Load organization
        const { data: orgData } = await supabase.from("organizations").select("*").maybeSingle();
        if (orgData) setOrg(orgData);

        // Load label template
        const { data: labelData } = await supabase
          .from("label_templates")
          .select("*")
          .limit(1)
          .single();
        if (labelData) setLabelTemplate(labelData);

        // Load auto-print setting
        const { data: apData } = await supabase
          .from("org_settings")
          .select("value")
          .eq("key", "auto_print_label")
          .maybeSingle();
        if (apData?.value) {
          const v = apData.value as { enabled?: boolean };
          setAutoPrintOnCheckin(v.enabled === true);
        }
      } catch (error) {
        logger.error("Error loading label settings:", error);
        showError("Failed to load label settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Render barcode in label preview
  useEffect(() => {
    if (labelTemplate?.fields.packageId) {
      const renderBarcode = () => {
        try {
          const JsBarcode = require("jsbarcode");
          const el = document.getElementById("label-preview-barcode");
          if (el) {
            JsBarcode(el, "PKG-001234", {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: true,
              fontSize: 13,
              margin: 4,
              font: "monospace",
              background: "transparent",
              textMargin: 4,
            });
          }
        } catch (e) {
          logger.error("Barcode render error:", e);
        }
      };
      // Immediate + delayed render to ensure DOM is ready
      renderBarcode();
      const timer = setTimeout(renderBarcode, 100);
      return () => clearTimeout(timer);
    }
  }, [labelTemplate]);

  // Handlers
  const handleUpdateLabelField = async (
    field: keyof LabelTemplate["fields"],
    value: boolean
  ) => {
    if (labelTemplate) {
      const updated = {
        ...labelTemplate,
        fields: { ...labelTemplate.fields, [field]: value },
      };
      setLabelTemplate(updated);

      try {
        await supabase
          .from("label_templates")
          .update({ fields: updated.fields })
          .eq("id", labelTemplate.id);
      } catch (error) {
        logger.error("Error updating label template:", error);
        showError("Failed to update label field");
      }
    }
  };

  const handleToggleAutoPrint = async () => {
    if (!org) return;
    const newVal = !autoPrintOnCheckin;
    setAutoPrintOnCheckin(newVal);
    try {
      await supabase.from("org_settings").upsert(
        {
          org_id: org.id,
          key: "auto_print_label",
          value: { enabled: newVal },
          updated_at: new Date().toISOString(),
          updated_by: currentUserId,
        },
        { onConflict: "org_id,key" }
      );
      showSuccess(newVal ? "Auto-print enabled" : "Auto-print disabled");
    } catch (err) {
      logger.error("Error saving auto-print setting:", err);
      setAutoPrintOnCheckin(!newVal); // revert on error
      showError("Failed to save auto-print setting");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-txt-secondary animate-spin" />
      </div>
    );
  }

  // Field definitions
  const LABEL_FIELDS: {
    key: keyof LabelTemplate["fields"];
    label: string;
    desc: string;
  }[] = [
    { key: "orgLogo", label: "Organization logo", desc: "Company logo displayed at the top of the label" },
    { key: "packageId", label: "Package ID (barcoded)", desc: "Barcode-encoded package identifier for scanning" },
    { key: "recipientName", label: "Ship-to name", desc: "Recipient / customer full name" },
    { key: "customerNumber", label: "Customer number", desc: "Unique registration number to identify the recipient" },
    { key: "agentName", label: "Agent name & contact", desc: "Agent company name, phone, and email" },
    { key: "billableWeight", label: "Billable weight", desc: "Billable weight in lbs or kg" },
    { key: "dimensions", label: "Dimensions", desc: "Package L × W × H when captured" },
    { key: "commodity", label: "Commodity", desc: "Commodity / contents description" },
    { key: "trackingNumber", label: "Tracking number", desc: "Carrier tracking number at label footer" },
  ];

  const PAPER_SIZES: { value: string; label: string; w: number; h: number }[] = [
    { value: "4x6", label: '4" × 6" (Shipping)', w: 100, h: 150 },
    { value: "4x4", label: '4" × 4" (Square)', w: 100, h: 100 },
    { value: "4x2", label: '4" × 2" (Small)', w: 100, h: 50 },
    { value: "2.25x1.25", label: '2.25" × 1.25" (Barcode)', w: 57, h: 32 },
  ];

  // Sample data for preview
  const sampleData = {
    packageId: "PKG-001234",
    recipientName: "John Doe",
    customerNumber: "ENV-00042",
    billableWeight: "2.5 lbs",
    agentName: "ENVIATO Miami",
    agentPhone: "+1 (305) 555-0100",
    agentEmail: "ops@enviato.com",
    trackingNumber: "1Z999AA10123456784",
    dimensions: "12 × 8 × 6 in",
    commodity: "Electronics",
    orgName: org?.name || "ENVIATO",
  };

  const handlePrintPreview = async () => {
    const fields = labelTemplate?.fields;
    if (!fields) return;

    const paperSize = labelTemplate?.paper_size || "4x6";
    const W = paperSize === "4x6" ? 4 : paperSize === "4x4" ? 4 : paperSize === "4x2" ? 4 : 2.25;
    const H = paperSize === "4x6" ? 6 : paperSize === "4x4" ? 4 : paperSize === "4x2" ? 2 : 1.25;
    const ph = Math.round(380 * (H / W)); // pixel height matching aspect ratio

    // Generate barcode data URL
    let barcodeDataUrl = "";
    if (fields.packageId) {
      const bCanvas = document.createElement("canvas");
      const JsBarcode = (await import("jsbarcode")).default;
      JsBarcode(bCanvas, sampleData.packageId, {
        format: "CODE128",
        width: 2,
        height: 55,
        displayValue: true,
        fontSize: 13,
        font: "monospace",
        margin: 6,
        background: "#ffffff",
        textMargin: 3,
      });
      barcodeDataUrl = bCanvas.toDataURL("image/png");
    }

    // Scale factors for HTML preview
    const pv = paperSize === "4x6" ? 1.27 : paperSize === "4x4" ? 1.04 : paperSize === "4x2" ? 0.74 : 0.53;
    const pw = 380;
    const pp = Math.round(14 * pv);
    const pps = Math.round(10 * pv);

    // Build HTML label (single source of truth for preview AND print)
    let labelHtml = "";
    if (fields.orgLogo) {
      labelHtml += `<div style="padding:${pps}px ${pp}px;border-bottom:2px solid #111;background:#f0f0f0;display:flex;align-items:center;gap:${Math.round(8 * pv)}px;">`;
      labelHtml += `<span style="font-size:${Math.round(16 * pv)}px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#111;">${sampleData.orgName}</span></div>`;
    }
    if (fields.packageId && barcodeDataUrl) {
      labelHtml += `<div style="text-align:center;padding:${pps}px ${pp}px;border-bottom:2px solid #111;"><img src="${barcodeDataUrl}" style="width:100%;height:${Math.round(60 * pv)}px;object-fit:contain;" /></div>`;
    }
    if (fields.recipientName || fields.customerNumber) {
      labelHtml += `<div style="padding:${pps}px ${pp}px;border-bottom:1px solid #ccc;">`;
      labelHtml += `<div style="font-size:${Math.round(10 * pv)}px;text-transform:uppercase;letter-spacing:1.5px;color:#777;font-weight:700;margin-bottom:${Math.round(3 * pv)}px;">Ship To</div>`;
      labelHtml += `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">`;
      if (fields.recipientName)
        labelHtml += `<span style="font-size:${Math.round(20 * pv)}px;font-weight:700;color:#111;line-height:1.2;">${sampleData.recipientName}</span>`;
      if (fields.customerNumber)
        labelHtml += `<span style="font-size:${Math.round(13 * pv)}px;font-weight:700;color:#111;font-family:monospace;letter-spacing:0.5px;white-space:nowrap;">${sampleData.customerNumber}</span>`;
      labelHtml += `</div></div>`;
    }
    if (fields.agentName) {
      labelHtml += `<div style="padding:${Math.round(8 * pv)}px ${pp}px;border-bottom:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;">`;
      labelHtml += `<div style="font-size:${Math.round(13 * pv)}px;font-weight:700;text-transform:uppercase;color:#111;letter-spacing:0.5px;">${sampleData.agentName}</div>`;
      labelHtml += `<div style="font-size:${Math.round(10 * pv)}px;color:#555;text-align:right;line-height:1.5;">${sampleData.agentPhone}<br/>${sampleData.agentEmail}</div>`;
      labelHtml += `</div>`;
    }
    if (fields.billableWeight || fields.dimensions) {
      labelHtml += `<div style="padding:${Math.round(8 * pv)}px ${pp}px;border-bottom:1px solid #ccc;display:flex;gap:${Math.round(24 * pv)}px;">`;
      if (fields.billableWeight) {
        labelHtml += `<div><div style="font-size:${Math.round(10 * pv)}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(2 * pv)}px;">Billable Weight</div>`;
        labelHtml += `<div style="font-size:${Math.round(15 * pv)}px;font-weight:700;color:#111;">${sampleData.billableWeight}</div></div>`;
      }
      if (fields.dimensions) {
        labelHtml += `<div><div style="font-size:${Math.round(10 * pv)}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(2 * pv)}px;">Dimensions</div>`;
        labelHtml += `<div style="font-size:${Math.round(15 * pv)}px;font-weight:700;color:#111;">${sampleData.dimensions}</div></div>`;
      }
      labelHtml += `</div>`;
    }
    if (fields.commodity) {
      labelHtml += `<div style="padding:${Math.round(8 * pv)}px ${pp}px;border-bottom:1px solid #ccc;">`;
      labelHtml += `<div style="font-size:${Math.round(10 * pv)}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(2 * pv)}px;">Commodity</div>`;
      labelHtml += `<div style="font-size:${Math.round(14 * pv)}px;font-weight:600;color:#111;">${sampleData.commodity}</div></div>`;
    }
    if (fields.trackingNumber) {
      labelHtml += `<div style="margin-top:auto;padding:${Math.round(8 * pv)}px ${pp}px;border-top:1px solid #ccc;text-align:center;background:#f8f8f8;">`;
      labelHtml += `<div style="font-size:${Math.round(10 * pv)}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(2 * pv)}px;">Tracking Number</div>`;
      labelHtml += `<div style="font-family:monospace;font-size:${Math.round(13 * pv)}px;font-weight:600;color:#111;letter-spacing:0.5px;">${sampleData.trackingNumber}</div></div>`;
    }

    // ── Modal ──
    const existingModal = document.getElementById("label-print-modal");
    if (existingModal) existingModal.remove();

    const modal = document.createElement("div");
    modal.id = "label-print-modal";
    modal.style.cssText =
      "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);";
    modal.innerHTML = `
      <div style="background:white;border-radius:12px;box-shadow:0 25px 50px rgba(0,0,0,0.25);width:${pw + 48}px;max-height:95vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <span style="font-size:15px;font-weight:600;color:#111;">Print Preview — ${paperSize}</span>
          <button id="label-modal-close" style="background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;font-size:20px;line-height:1;">✕</button>
        </div>
        <div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:20px 24px;background:#f3f4f6;">
          <div id="label-capture-target" style="width:${pw}px;height:${ph}px;border:2px solid #111;overflow:hidden;background:white;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;flex-direction:column;">
            ${labelHtml}
          </div>
        </div>
        <div style="display:flex;gap:10px;padding:14px 20px;border-top:1px solid #e5e7eb;justify-content:flex-end;">
          <button id="label-modal-cancel" style="padding:10px 20px;border:1px solid #d1d5db;background:white;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;">Close</button>
          <button id="label-modal-download" style="padding:10px 20px;border:1px solid #d1d5db;background:white;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;color:#374151;display:flex;align-items:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Save PDF
          </button>
          <button id="label-modal-print" style="padding:10px 20px;border:none;background:#3c83f6;color:white;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Print Label
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => {
      modal.remove();
    };
    modal.querySelector("#label-modal-close")?.addEventListener("click", closeModal);
    modal.querySelector("#label-modal-cancel")?.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Helper: capture the label HTML element as a PDF blob
    const captureLabelPdf = async (): Promise<Blob> => {
      const target = modal.querySelector("#label-capture-target") as HTMLElement;
      if (!target) throw new Error("Label element not found");
      const { captureElementAsPdf } = await import("@/lib/print-pdf");
      return captureElementAsPdf(target, W, H);
    };

    // Save PDF — capture the HTML preview as image, embed in PDF, download
    modal.querySelector("#label-modal-download")?.addEventListener("click", async () => {
      const btn = modal.querySelector("#label-modal-download") as HTMLButtonElement | null;
      if (btn) {
        btn.textContent = "Generating...";
        btn.disabled = true;
      }
      try {
        const blob = await captureLabelPdf();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `label-preview-${paperSize}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        logger.error("Save PDF error:", err);
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Save PDF`;
      }
    });

    // Print Label — send raw label HTML to a dedicated print document
    modal.querySelector("#label-modal-print")?.addEventListener("click", async () => {
      const btn = modal.querySelector("#label-modal-print") as HTMLButtonElement | null;
      if (btn) {
        btn.textContent = "Preparing...";
        btn.disabled = true;
      }
      try {
        const { printLabelHtml } = await import("@/lib/print-pdf");
        await printLabelHtml(labelHtml, W, H);
      } catch (err) {
        logger.error("Print error:", err);
      }
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print Label`;
      }
    });
  };

  return (
    <>
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui font-medium">
          <span>✓</span>
          {successMessage}
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed top-6 right-6 z-50 bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-md flex items-center gap-2 text-ui font-medium">
          <span>⚠</span>
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        <div className="bg-white border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-ui font-semibold text-txt-primary">Label template</h2>
                <p className="text-muted text-txt-tertiary mt-0.5">
                  Configure the fields shown on shipping labels. Labels are printed from the package detail page.
                </p>
              </div>
              <button onClick={handlePrintPreview} className="btn-primary flex items-center gap-2 text-meta">
                <Printer className="w-4 h-4" />
                Print preview
              </button>
            </div>
          </div>

          <div className="px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Field toggles + paper size */}
            <div className="space-y-6">
              {/* Paper size */}
              <div>
                <h3 className="text-meta font-semibold text-txt-primary tracking-tight mb-3">Label size</h3>
                <div className="grid grid-cols-2 gap-2">
                  {PAPER_SIZES.map((size) => (
                    <button
                      key={size.value}
                      onClick={async () => {
                        if (!labelTemplate) return;
                        const updated = {
                          ...labelTemplate,
                          paper_size: size.value,
                          label_size: { width: size.w, height: size.h },
                        };
                        setLabelTemplate(updated);
                        await supabase
                          .from("label_templates")
                          .update({
                            paper_size: size.value,
                            label_size: { width: size.w, height: size.h },
                          })
                          .eq("id", labelTemplate.id);
                      }}
                      className={`flex flex-col items-center gap-1 px-3 py-3 rounded-lg border-2 transition-all cursor-pointer text-center
                        ${
                          labelTemplate?.paper_size === size.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/30 text-txt-secondary"
                        }
                      `}
                    >
                      <span className="text-ui font-medium">{size.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Field toggles */}
              <div>
                <h3 className="text-meta font-semibold text-txt-primary tracking-tight mb-3">Fields to include</h3>
                <div className="space-y-1">
                  {LABEL_FIELDS.map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-md hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-ui font-medium text-txt-primary">{field.label}</p>
                        <p className="text-meta text-txt-tertiary mt-0.5">{field.desc}</p>
                      </div>
                      <button
                        onClick={() => handleUpdateLabelField(field.key, !labelTemplate?.fields[field.key])}
                        className={`w-11 h-6 rounded-full relative transition-colors duration-200 cursor-pointer shrink-0 ml-3 ${
                          labelTemplate?.fields[field.key] ? "bg-primary" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
                          style={{
                            transform: labelTemplate?.fields[field.key] ? "translateX(20px)" : "translateX(0)",
                          }}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-print on check-in */}
              <div>
                <h3 className="text-meta font-semibold text-txt-primary tracking-tight mb-3">Automation</h3>
                <div className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-md hover:bg-slate-50/80 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-ui font-medium text-txt-primary">Auto-print on check-in</p>
                    <p className="text-meta text-txt-tertiary mt-0.5">
                      Automatically print a label when a package is checked in
                    </p>
                  </div>
                  <button
                    onClick={handleToggleAutoPrint}
                    className={`w-11 h-6 rounded-full relative transition-colors duration-200 cursor-pointer shrink-0 ml-3 ${
                      autoPrintOnCheckin ? "bg-primary" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200"
                      style={{ transform: autoPrintOnCheckin ? "translateX(20px)" : "translateX(0)" }}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Live preview */}
            <div>
              <h3 className="text-meta font-semibold text-txt-primary tracking-tight mb-3">Live preview</h3>
              {(() => {
                // Responsive scale for preview based on paper size
                const ps = labelTemplate?.paper_size || "4x6";
                const pv = ps === "4x6" ? 1 : ps === "4x4" ? 0.82 : ps === "4x2" ? 0.58 : 0.42;
                const pw = ps === "4x6" ? 300 : ps === "4x4" ? 300 : ps === "4x2" ? 280 : 220;
                const pp = Math.round(14 * pv);
                const pps = Math.round(10 * pv);
                return (
                  <div className="flex items-center justify-center p-4 bg-slate-100 rounded-lg min-h-[200px]">
                    <div
                      className="bg-white shadow-lg"
                      style={{
                        width: `${pw}px`,
                        height: `${Math.round(pw * (ps === "4x6" ? 1.5 : ps === "4x4" ? 1 : ps === "4x2" ? 0.5 : 0.556))}px`,
                        border: "2px solid #111",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {/* Header */}
                      {labelTemplate?.fields.orgLogo && (
                        <div
                          style={{
                            padding: `${pps}px ${pp}px`,
                            borderBottom: "2px solid #111",
                            background: "#f0f0f0",
                            display: "flex",
                            alignItems: "center",
                            gap: `${Math.round(8 * pv)}px`,
                          }}
                        >
                          <span
                            style={{
                              fontSize: `${Math.round(16 * pv)}px`,
                              fontWeight: 800,
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              color: "#111",
                            }}
                          >
                            {sampleData.orgName}
                          </span>
                        </div>
                      )}
                      {/* Barcode */}
                      {labelTemplate?.fields.packageId && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: `${pps}px ${pp}px`,
                            borderBottom: "2px solid #111",
                          }}
                        >
                          <svg
                            id="label-preview-barcode"
                            style={{ width: "100%", height: `${Math.round(60 * pv)}px` }}
                          />
                        </div>
                      )}
                      {/* Ship-to + Customer Number */}
                      {(labelTemplate?.fields.recipientName || labelTemplate?.fields.customerNumber) && (
                        <div
                          style={{
                            padding: `${pps}px ${pp}px`,
                            borderBottom: "1px solid #ccc",
                          }}
                        >
                          <div
                            style={{
                              fontSize: `${Math.round(10 * pv)}px`,
                              textTransform: "uppercase",
                              letterSpacing: "1.5px",
                              color: "#777",
                              fontWeight: 700,
                              marginBottom: `${Math.round(3 * pv)}px`,
                            }}
                          >
                            Ship To
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            {labelTemplate?.fields.recipientName && (
                              <span
                                style={{
                                  fontSize: `${Math.round(20 * pv)}px`,
                                  fontWeight: 700,
                                  color: "#111",
                                  lineHeight: "1.2",
                                }}
                              >
                                {sampleData.recipientName}
                              </span>
                            )}
                            {labelTemplate?.fields.customerNumber && (
                              <span
                                style={{
                                  fontSize: `${Math.round(13 * pv)}px`,
                                  fontWeight: 700,
                                  color: "#111",
                                  fontFamily: "monospace",
                                  letterSpacing: "0.5px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {sampleData.customerNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Agent */}
                      {labelTemplate?.fields.agentName && (
                        <div
                          style={{
                            padding: `${Math.round(8 * pv)}px ${pp}px`,
                            borderBottom: "1px solid #ccc",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: `${Math.round(13 * pv)}px`,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "#111",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {sampleData.agentName}
                          </div>
                          <div
                            style={{
                              fontSize: `${Math.round(10 * pv)}px`,
                              color: "#555",
                              textAlign: "right",
                              lineHeight: "1.5",
                            }}
                          >
                            {sampleData.agentPhone}
                            <br />
                            {sampleData.agentEmail}
                          </div>
                        </div>
                      )}
                      {/* Weight + dimensions */}
                      {(labelTemplate?.fields.billableWeight || labelTemplate?.fields.dimensions) && (
                        <div
                          style={{
                            padding: `${Math.round(8 * pv)}px ${pp}px`,
                            borderBottom: "1px solid #ccc",
                            display: "flex",
                            gap: `${Math.round(24 * pv)}px`,
                          }}
                        >
                          {labelTemplate?.fields.billableWeight && (
                            <div>
                              <div
                                style={{
                                  fontSize: `${Math.round(10 * pv)}px`,
                                  textTransform: "uppercase",
                                  letterSpacing: "1px",
                                  color: "#777",
                                  fontWeight: 700,
                                  marginBottom: `${Math.round(2 * pv)}px`,
                                }}
                              >
                                Billable Weight
                              </div>
                              <div
                                style={{
                                  fontSize: `${Math.round(15 * pv)}px`,
                                  fontWeight: 700,
                                  color: "#111",
                                }}
                              >
                                {sampleData.billableWeight}
                              </div>
                            </div>
                          )}
                          {labelTemplate?.fields.dimensions && (
                            <div>
                              <div
                                style={{
                                  fontSize: `${Math.round(10 * pv)}px`,
                                  textTransform: "uppercase",
                                  letterSpacing: "1px",
                                  color: "#777",
                                  fontWeight: 700,
                                  marginBottom: `${Math.round(2 * pv)}px`,
                                }}
                              >
                                Dimensions
                              </div>
                              <div
                                style={{
                                  fontSize: `${Math.round(15 * pv)}px`,
                                  fontWeight: 700,
                                  color: "#111",
                                }}
                              >
                                {sampleData.dimensions}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Commodity */}
                      {labelTemplate?.fields.commodity && (
                        <div
                          style={{
                            padding: `${Math.round(8 * pv)}px ${pp}px`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: `${Math.round(10 * pv)}px`,
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              color: "#777",
                              fontWeight: 700,
                              marginBottom: `${Math.round(2 * pv)}px`,
                            }}
                          >
                            Commodity
                          </div>
                          <div
                            style={{
                              fontSize: `${Math.round(14 * pv)}px`,
                              fontWeight: 600,
                              color: "#111",
                            }}
                          >
                            {sampleData.commodity}
                          </div>
                        </div>
                      )}
                      {/* Tracking footer */}
                      {labelTemplate?.fields.trackingNumber && (
                        <div
                          style={{
                            marginTop: "auto",
                            padding: `${Math.round(8 * pv)}px ${pp}px`,
                            borderTop: "1px solid #ccc",
                            textAlign: "center",
                            background: "#f8f8f8",
                          }}
                        >
                          <div
                            style={{
                              fontSize: `${Math.round(10 * pv)}px`,
                              textTransform: "uppercase",
                              letterSpacing: "1px",
                              color: "#777",
                              fontWeight: 700,
                              marginBottom: `${Math.round(2 * pv)}px`,
                            }}
                          >
                            Tracking Number
                          </div>
                          <div
                            style={{
                              fontFamily: "monospace",
                              fontSize: `${Math.round(13 * pv)}px`,
                              fontWeight: 600,
                              color: "#111",
                              letterSpacing: "0.5px",
                            }}
                          >
                            {sampleData.trackingNumber}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              <p className="text-meta text-txt-tertiary mt-3 text-center">
                Print labels from the package detail page
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
