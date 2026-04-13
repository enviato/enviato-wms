/**
 * Shared label HTML builder
 *
 * Generates the inner HTML for a shipping label based on the active
 * label template and package data.  Used by:
 *   – Package detail page  (manual "Print Label")
 *   – Add-package page     (auto-print on check-in)
 *   – Settings page        (preview uses its own inline version)
 */

import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LabelFields = {
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

export type LabelTemplateRow = {
  id: string;
  name: string;
  fields: LabelFields;
  paper_size: string;
  label_size: { width: number; height: number };
  is_default: boolean;
};

export type PackageData = {
  id: string;
  tracking_number: string;
  carrier?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  billable_weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dim_unit?: string | null;
  commodity?: string | null;
  org_id: string;
  customer_id?: string | null;
  customer?: {
    id: string;
    first_name: string;
    last_name: string;
    agent_id?: string | null;
  } | null;
};

export type BuildLabelResult = {
  labelHtml: string;
  widthInches: number;
  heightInches: number;
};

/* ------------------------------------------------------------------ */
/*  Helper: paper-size → inches                                       */
/* ------------------------------------------------------------------ */

function paperDimensions(ps: string): { W: number; H: number } {
  switch (ps) {
    case "4x4":
      return { W: 4, H: 4 };
    case "4x2":
      return { W: 4, H: 2 };
    case "2.25x1.25":
      return { W: 2.25, H: 1.25 };
    default:
      return { W: 4, H: 6 }; // 4x6 default
  }
}

function scaleForPaper(ps: string): number {
  switch (ps) {
    case "4x4":
      return 1.04;
    case "4x2":
      return 0.74;
    case "2.25x1.25":
      return 0.53;
    default:
      return 1.27; // 4x6
  }
}

/* ------------------------------------------------------------------ */
/*  buildLabelHtml                                                     */
/* ------------------------------------------------------------------ */

/**
 * Builds the label inner-HTML for a given package.
 *
 * Fetches the default label template, agent info, org info, and
 * generates a CODE128 barcode — everything needed to produce the
 * complete label markup.
 *
 * Returns the HTML string plus the label dimensions in inches so
 * the caller can pass them straight to `printLabelHtml()`.
 */
export async function buildLabelHtml(
  pkg: PackageData
): Promise<BuildLabelResult | null> {
  const supabase = createClient();

  // 1. Fetch default label template
  const { data: tmpl } = await supabase
    .from("label_templates")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .single();

  if (!tmpl) return null;

  const fields = tmpl.fields as LabelFields;
  const paperSize = tmpl.paper_size || "4x6";
  const { W, H } = paperDimensions(paperSize);
  const pv = scaleForPaper(paperSize);
  const pp = Math.round(14 * pv);
  const pps = Math.round(10 * pv);

  // 2. Fetch agent + customer number
  let agentName = "";
  let agentPhone = "";
  let agentEmail = "";
  let customerNumber = "";

  if ((fields.agentName || fields.customerNumber) && pkg.customer) {
    const { data: custData } = await supabase
      .from("users")
      .select(
        "customer_number, agent_id, agent:agents!users_agent_id_fkey(name, company_name, phone, email)"
      )
      .eq("id", pkg.customer.id)
      .single();

    if (custData?.customer_number) customerNumber = custData.customer_number;

    const agentData = custData?.agent as
      | { name: string; company_name?: string; phone?: string; email?: string }
      | { name: string; company_name?: string; phone?: string; email?: string }[]
      | null;

    if (agentData) {
      const a = Array.isArray(agentData) ? agentData[0] : agentData;
      agentName = a?.company_name || a?.name || "";
      agentPhone = a?.phone || "";
      agentEmail = a?.email || "";
    }
  }

  // 3. Fetch org info
  let orgName = "";
  let orgLogoUrl = "";
  if (fields.orgLogo) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", pkg.org_id)
      .single();
    if (orgData) {
      orgName = orgData.name || "";
      orgLogoUrl = orgData.logo_url || "";
    }
  }

  // 4. Compute display values
  const recipientName = pkg.customer
    ? `${pkg.customer.first_name} ${pkg.customer.last_name}`
    : "—";
  const billableWeight = pkg.billable_weight
    ? `${pkg.billable_weight} ${pkg.weight_unit || "lbs"}`
    : pkg.weight
    ? `${pkg.weight} ${pkg.weight_unit || "lbs"}`
    : "—";
  const packageIdStr = pkg.id.substring(0, 8).toUpperCase();
  const hasDims = pkg.length && pkg.width && pkg.height;
  const dimsStr = hasDims
    ? `${pkg.length} x ${pkg.width} x ${pkg.height} ${pkg.dim_unit || "in"}`
    : "";
  const commodityStr = pkg.commodity || "";

  // 5. Generate barcode
  let barcodeDataUrl = "";
  if (fields.packageId) {
    const bCanvas = document.createElement("canvas");
    const JsBarcode = (await import("jsbarcode")).default;
    JsBarcode(bCanvas, `PKG-${packageIdStr}`, {
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

  // 6. Build HTML
  let labelHtml = "";

  if (fields.orgLogo && orgName) {
    labelHtml += `<div style="padding:${pps}px ${pp}px;border-bottom:2px solid #111;background:#f0f0f0;display:flex;align-items:center;gap:${Math.round(
      8 * pv
    )}px;">`;
    if (orgLogoUrl) {
      labelHtml += `<img src="${orgLogoUrl}" style="height:${Math.round(
        24 * pv
      )}px;object-fit:contain;" crossorigin="anonymous" />`;
    }
    labelHtml += `<span style="font-size:${Math.round(
      16 * pv
    )}px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#111;">${orgName}</span></div>`;
  }

  if (fields.packageId && barcodeDataUrl) {
    labelHtml += `<div style="text-align:center;padding:${pps}px ${pp}px;border-bottom:2px solid #111;"><img src="${barcodeDataUrl}" style="width:100%;height:${Math.round(
      60 * pv
    )}px;object-fit:contain;" /></div>`;
  }

  if (fields.recipientName || (fields.customerNumber && customerNumber)) {
    labelHtml += `<div style="padding:${pps}px ${pp}px;border-bottom:1px solid #ccc;">`;
    labelHtml += `<div style="font-size:${Math.round(
      10 * pv
    )}px;text-transform:uppercase;letter-spacing:1.5px;color:#777;font-weight:700;margin-bottom:${Math.round(
      3 * pv
    )}px;">Ship To</div>`;
    labelHtml += `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;">`;
    if (fields.recipientName) {
      labelHtml += `<span style="font-size:${Math.round(
        20 * pv
      )}px;font-weight:700;color:#111;line-height:1.2;">${recipientName}</span>`;
    }
    if (fields.customerNumber && customerNumber) {
      labelHtml += `<span style="font-size:${Math.round(
        13 * pv
      )}px;font-weight:700;color:#111;font-family:monospace;letter-spacing:0.5px;white-space:nowrap;">${customerNumber}</span>`;
    }
    labelHtml += `</div></div>`;
  }

  if (fields.agentName && agentName) {
    labelHtml += `<div style="padding:${Math.round(
      8 * pv
    )}px ${pp}px;border-bottom:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;">`;
    labelHtml += `<div style="font-size:${Math.round(
      13 * pv
    )}px;font-weight:700;text-transform:uppercase;color:#111;letter-spacing:0.5px;">${agentName}</div>`;
    if (agentPhone || agentEmail) {
      labelHtml += `<div style="font-size:${Math.round(
        10 * pv
      )}px;color:#555;text-align:right;line-height:1.5;">`;
      if (agentPhone) labelHtml += agentPhone;
      if (agentPhone && agentEmail) labelHtml += "<br/>";
      if (agentEmail) labelHtml += agentEmail;
      labelHtml += `</div>`;
    }
    labelHtml += `</div>`;
  }

  if (
    (fields.billableWeight && billableWeight !== "—") ||
    (fields.dimensions && dimsStr)
  ) {
    labelHtml += `<div style="padding:${Math.round(
      8 * pv
    )}px ${pp}px;border-bottom:1px solid #ccc;display:flex;gap:${Math.round(
      24 * pv
    )}px;">`;
    if (fields.billableWeight && billableWeight !== "—") {
      labelHtml += `<div><div style="font-size:${Math.round(
        10 * pv
      )}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(
        2 * pv
      )}px;">Billable Weight</div>`;
      labelHtml += `<div style="font-size:${Math.round(
        15 * pv
      )}px;font-weight:700;color:#111;">${billableWeight}</div></div>`;
    }
    if (fields.dimensions && dimsStr) {
      labelHtml += `<div><div style="font-size:${Math.round(
        10 * pv
      )}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(
        2 * pv
      )}px;">Dimensions</div>`;
      labelHtml += `<div style="font-size:${Math.round(
        15 * pv
      )}px;font-weight:700;color:#111;">${dimsStr}</div></div>`;
    }
    labelHtml += `</div>`;
  }

  if (fields.commodity && commodityStr) {
    labelHtml += `<div style="padding:${Math.round(
      8 * pv
    )}px ${pp}px;border-bottom:1px solid #ccc;">`;
    labelHtml += `<div style="font-size:${Math.round(
      10 * pv
    )}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(
      2 * pv
    )}px;">Commodity</div>`;
    labelHtml += `<div style="font-size:${Math.round(
      14 * pv
    )}px;font-weight:600;color:#111;">${commodityStr}</div></div>`;
  }

  if (fields.trackingNumber) {
    labelHtml += `<div style="margin-top:auto;padding:${Math.round(
      8 * pv
    )}px ${pp}px;border-top:1px solid #ccc;text-align:center;background:#f8f8f8;">`;
    labelHtml += `<div style="font-size:${Math.round(
      10 * pv
    )}px;text-transform:uppercase;letter-spacing:1px;color:#777;font-weight:700;margin-bottom:${Math.round(
      2 * pv
    )}px;">Tracking Number</div>`;
    labelHtml += `<div style="font-family:monospace;font-size:${Math.round(
      13 * pv
    )}px;font-weight:600;color:#111;letter-spacing:0.5px;">${pkg.tracking_number}</div></div>`;
  }

  return { labelHtml, widthInches: W, heightInches: H };
}

/* ------------------------------------------------------------------ */
/*  Auto-print helper                                                  */
/* ------------------------------------------------------------------ */

/**
 * Check if auto-print on check-in is enabled for the org.
 */
export async function isAutoPrintEnabled(): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("key", "auto_print_label")
    .maybeSingle();

  if (!data?.value) return false;
  const v = data.value as { enabled?: boolean };
  return v.enabled === true;
}

/**
 * Full auto-print flow: check setting → build label → print.
 *
 * Call this right after a successful package insert.
 * It's fire-and-forget safe — errors are caught and logged.
 */
export async function autoPrintLabel(pkg: PackageData): Promise<void> {
  try {
    const enabled = await isAutoPrintEnabled();
    if (!enabled) return;

    const result = await buildLabelHtml(pkg);
    if (!result) {
      logger.warn("Auto-print: no label template configured");
      return;
    }

    const { printLabelHtml } = await import("@/lib/print-pdf");
    await printLabelHtml(result.labelHtml, result.widthInches, result.heightInches);
  } catch (err) {
    logger.error("Auto-print label error", err);
  }
}
