"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";
import NotificationBell from "@/modules/notifications/components/NotificationBell";
import { SuccessToast } from "@/shared/components/forms";
import {
  ArrowLeft,
  Package,
  Users,
  Weight,
  Plane,
  Ship,
  MapPin,
  Calendar,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  ChevronDown,
  ChevronRight,
  Check,
  Search,
} from "lucide-react";

/* ───────── Types ───────── */
type AwbDetail = {
  id: string;
  awb_number: string;
  freight_type: string;
  airline_or_vessel: string | null;
  origin: string | null;
  destination: string | null;
  status: string;
  total_pieces: number;
  total_weight: number | null;
  departure_date: string | null;
  arrival_date: string | null;
  courier_group_id: string;
  notes: string | null;
  created_at: string;
  courier_group?: {
    id: string;
    name: string;
    code: string;
    country: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    pricing_model: string;
    rate_per_lb: number;
    currency: string;
  } | null;
};

type PackageRow = {
  id: string;
  tracking_number: string;
  customer_id: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  volume_weight: number | null;
  billable_weight: number | null;
  status: string;
  invoice_id: string | null;
  carrier: string | null;
  commodity: string | null;
  customer?: { id: string; first_name: string; last_name: string; email: string; phone: string | null; pricing_tier_id: string | null; agent_id: string | null } | null;
};

type PricingTierInfo = {
  id: string;
  name: string;
  base_rate_per_lb: number;
  delivery_fee: number;
  hazmat_fee: number;
  currency: string;
  commodity_rates: { commodity_name: string; rate_per_lb: number }[];
};

type CustomerGroup = {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  pricing_tier_id: string | null;
  agent_id: string | null;
  packages: PackageRow[];
  package_count: number;
  total_billable_weight: number;
  invoice_status: string | null; // null = not invoiced, or 'draft'|'sent'|'paid'|'overdue'|'cancelled'
  invoice_id: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  customer_id: string;
};

/* ───────── Constants ───────── */
const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  packing: { label: "Packing", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  shipped: { label: "Shipped", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "In Transit", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  arrived: { label: "Arrived", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  cleared: { label: "Cleared", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  delivered: { label: "Delivered", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const pkgStatusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  checked_in: { label: "Checked In", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  assigned_to_awb: { label: "Assigned", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  in_transit: { label: "In Transit", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  received_at_dest: { label: "Received", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  delivered: { label: "Delivered", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  returned: { label: "Returned", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  lost: { label: "Lost", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

const invoiceStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-600" },
  sent: { label: "Sent", bg: "bg-blue-50", text: "text-blue-700" },
  paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700" },
  overdue: { label: "Overdue", bg: "bg-red-50", text: "text-red-700" },
  cancelled: { label: "Cancelled", bg: "bg-slate-50", text: "text-slate-500" },
};

/* ───────── Component ───────── */
export default function AwbDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [awb, setAwb] = useState<AwbDetail | null>(null);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tierCache, setTierCache] = useState<Record<string, PricingTierInfo>>({});

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  /* ───────── Load AWB + packages + invoices ───────── */
  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    /* AWB + packages in parallel — both only depend on the URL id. */
    const [{ data: awbData }, { data: pkgData }] = await Promise.all([
      supabase
        .from("awbs")
        .select(`*, courier_group:courier_groups(id, name, code, country, contact_email, contact_phone, pricing_model, rate_per_lb, currency)`)
        .eq("id", id)
        .single(),
      supabase
        .from("packages")
        .select(`id, tracking_number, customer_id, weight, length, width, height, volume_weight, billable_weight, status, invoice_id, carrier, commodity, customer:users!packages_customer_id_fkey(id, first_name, last_name, email, phone, pricing_tier_id, agent_id)`)
        .eq("awb_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);
    if (awbData) setAwb(awbData as AwbDetail);
    /* Supabase returns foreign key as array — normalize to single object */
    const pkgs: PackageRow[] = (pkgData || []).map((p: Record<string, unknown>) => ({
      ...p,
      customer: Array.isArray(p.customer) ? p.customer[0] || null : p.customer || null,
    })) as PackageRow[];
    setPackages(pkgs);

    /* Get existing invoices for this AWB's packages */
    const invoiceIdSet = new Set(pkgs.filter((p) => p.invoice_id).map((p) => p.invoice_id!));
    const invoiceIds = Array.from(invoiceIdSet);
    let invoiceMap: Record<string, InvoiceRow> = {};
    if (invoiceIds.length > 0) {
      const { data: invData } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, customer_id")
        .in("id", invoiceIds)
        .is("deleted_at", null);
      if (invData) {
        for (const inv of invData as InvoiceRow[]) {
          invoiceMap[inv.id] = inv;
        }
      }
    }

    /* Group packages by customer */
    const groupMap: Record<string, CustomerGroup> = {};
    for (const pkg of pkgs) {
      const custId = pkg.customer_id || "unassigned";
      if (!groupMap[custId]) {
        groupMap[custId] = {
          customer_id: custId,
          customer_name: pkg.customer ? `${pkg.customer.first_name} ${pkg.customer.last_name}`.trim() : "Unassigned",
          customer_email: pkg.customer?.email || "",
          pricing_tier_id: pkg.customer?.pricing_tier_id || null,
          agent_id: pkg.customer?.agent_id || null,
          packages: [],
          package_count: 0,
          total_billable_weight: 0,
          invoice_status: null,
          invoice_id: null,
        };
      }
      groupMap[custId].packages.push(pkg);
      groupMap[custId].package_count += 1;
      groupMap[custId].total_billable_weight += Number(pkg.billable_weight || 0);

      /* Check invoice status from the package's invoice_id */
      if (pkg.invoice_id && invoiceMap[pkg.invoice_id]) {
        const inv = invoiceMap[pkg.invoice_id];
        groupMap[custId].invoice_status = inv.status;
        groupMap[custId].invoice_id = inv.id;
      }
    }

    const groups = Object.values(groupMap).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    setCustomerGroups(groups);

    /* Preload pricing tiers for all customers that have one assigned */
    const uniqueTierIds = [...new Set(groups.map((g) => g.pricing_tier_id).filter(Boolean))] as string[];
    if (uniqueTierIds.length > 0) {
      const { data: tiersData } = await supabase
        .from("pricing_tiers")
        .select("id, name, base_rate_per_lb, delivery_fee, hazmat_fee, currency")
        .in("id", uniqueTierIds)
        .eq("is_active", true);
      if (tiersData) {
        /* Fetch all tiers' commodity rates in a single round trip, then group. */
        const tierIds = tiersData.map((t) => t.id);
        const { data: allRates } = await supabase
          .from("pricing_tier_commodity_rates")
          .select("pricing_tier_id, commodity_name, rate_per_lb")
          .in("pricing_tier_id", tierIds);

        const ratesByTier: Record<string, Array<{ commodity_name: string; rate_per_lb: number }>> = {};
        for (const r of (allRates ?? []) as Array<{
          pricing_tier_id: string;
          commodity_name: string;
          rate_per_lb: number;
        }>) {
          if (!ratesByTier[r.pricing_tier_id]) ratesByTier[r.pricing_tier_id] = [];
          ratesByTier[r.pricing_tier_id].push({
            commodity_name: r.commodity_name,
            rate_per_lb: r.rate_per_lb,
          });
        }

        const newCache: Record<string, PricingTierInfo> = {};
        for (const t of tiersData) {
          newCache[t.id] = { ...t, commodity_rates: ratesByTier[t.id] || [] };
        }
        setTierCache(newCache);
      }
    }

    setLoading(false);
  };

  /* ───────── Invoice number generation ───────── */
  const generateInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const { data } = await supabase
      .from("invoices")
      .select("invoice_number")
      .like("invoice_number", `${prefix}%`)
      .order("invoice_number", { ascending: false })
      .limit(1);
    let nextNum = 1;
    if (data && data.length > 0) {
      const lastNum = parseInt(data[0].invoice_number.replace(prefix, ""), 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  };

  /* ───────── Fetch pricing tier (with caching) ───────── */
  const fetchPricingTier = async (tierId: string): Promise<PricingTierInfo | null> => {
    if (tierCache[tierId]) return tierCache[tierId];

    const { data: tier } = await supabase
      .from("pricing_tiers")
      .select("id, name, base_rate_per_lb, delivery_fee, hazmat_fee, currency")
      .eq("id", tierId)
      .eq("is_active", true)
      .single();
    if (!tier) return null;

    const { data: rates } = await supabase
      .from("pricing_tier_commodity_rates")
      .select("commodity_name, rate_per_lb")
      .eq("pricing_tier_id", tierId);

    const tierInfo: PricingTierInfo = {
      ...tier,
      commodity_rates: rates || [],
    };
    setTierCache((prev) => ({ ...prev, [tierId]: tierInfo }));
    return tierInfo;
  };

  /* ───────── Resolve rate for a single package ───────── */
  const resolvePackageRate = (
    pkg: PackageRow,
    tier: PricingTierInfo | null,
    fallbackRate: number
  ): number => {
    if (!tier) return fallbackRate;
    // Check for commodity-specific override first
    if (pkg.commodity) {
      const override = tier.commodity_rates.find(
        (cr) => cr.commodity_name.toLowerCase() === pkg.commodity!.toLowerCase()
      );
      if (override) return override.rate_per_lb;
    }
    return tier.base_rate_per_lb;
  };

  /* ───────── Generate invoice for a single customer ───────── */
  const generateInvoiceForCustomer = async (group: CustomerGroup) => {
    if (!awb || !awb.courier_group || group.customer_id === "unassigned") return;
    setGeneratingSingle(group.customer_id);

    try {
      const agent = awb.courier_group;
      const invoiceNumber = await generateInvoiceNumber();
      const fallbackRate = Number(agent.rate_per_lb) || 0;

      /* Look up the customer's pricing tier */
      const tier = group.pricing_tier_id
        ? await fetchPricingTier(group.pricing_tier_id)
        : null;

      const currency = tier?.currency || agent.currency || "USD";

      /* Build invoice lines — each package may have a different rate */
      const lines = group.packages.map((pkg) => {
        const rate = resolvePackageRate(pkg, tier, fallbackRate);
        const billableWt = Number(pkg.billable_weight || 0);
        return {
          tracking_number: pkg.tracking_number,
          actual_weight: Number(pkg.weight || 0),
          volume_weight: Number(pkg.volume_weight || 0),
          billable_weight: billableWt,
          rate_per_lb: rate,
          line_total: billableWt * rate,
          package_id: pkg.id,
          description: pkg.commodity
            ? `Package ${pkg.tracking_number} (${pkg.commodity})`
            : `Package ${pkg.tracking_number}`,
        };
      });

      const lineSubtotal = lines.reduce((sum, l) => sum + l.line_total, 0);

      /* Add tier fees (delivery + hazmat) when a tier is assigned */
      const deliveryFee = tier?.delivery_fee || 0;
      const hazmatFee = tier?.hazmat_fee || 0;
      const feesTotal = deliveryFee + hazmatFee;
      const subtotal = lineSubtotal + feesTotal;

      /* Fetch org_id dynamically */
      const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
      if (!orgRow) { logger.error("No organization found"); return; }

      /* Create the invoice — billed_by_agent_id is the customer's parent agent */
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          org_id: orgRow.id,
          courier_group_id: awb.courier_group_id,
          customer_id: group.customer_id,
          billed_by_agent_id: group.agent_id,
          invoice_number: invoiceNumber,
          status: "draft",
          pricing_model: agent.pricing_model || "gross_weight",
          rate_per_lb: tier?.base_rate_per_lb ?? fallbackRate,
          subtotal,
          tax_rate: 0,
          tax_amount: 0,
          total: subtotal,
          currency,
        })
        .select("id")
        .single();

      if (invErr || !invoice) {
        logger.error("Error creating invoice", invErr);
        return;
      }

      /* Create invoice lines — package lines + fee lines */
      const invoiceLines: Record<string, unknown>[] = lines.map((l) => ({
        invoice_id: invoice.id,
        package_id: l.package_id,
        tracking_number: l.tracking_number,
        actual_weight: l.actual_weight,
        volume_weight: l.volume_weight,
        billable_weight: l.billable_weight,
        rate_per_lb: l.rate_per_lb,
        line_total: l.line_total,
        description: l.description,
        charge_type: "package",
      }));

      /* Add delivery fee line if applicable */
      if (deliveryFee > 0) {
        invoiceLines.push({
          invoice_id: invoice.id,
          package_id: null,
          tracking_number: null,
          actual_weight: null,
          volume_weight: null,
          billable_weight: null,
          rate_per_lb: null,
          line_total: deliveryFee,
          description: "Delivery Fee",
          charge_type: "flat",
        });
      }

      /* Add hazmat fee line if applicable */
      if (hazmatFee > 0) {
        invoiceLines.push({
          invoice_id: invoice.id,
          package_id: null,
          tracking_number: null,
          actual_weight: null,
          volume_weight: null,
          billable_weight: null,
          rate_per_lb: null,
          line_total: hazmatFee,
          description: "Hazmat Fee",
          charge_type: "flat",
        });
      }

      const { error: linesErr } = await supabase.from("invoice_lines").insert(invoiceLines);
      if (linesErr) logger.error("Error creating invoice lines", linesErr);

      /* Link packages to the invoice */
      const packageIds = group.packages.map((p) => p.id);
      await supabase.from("packages").update({ invoice_id: invoice.id }).in("id", packageIds);

      showSuccess(`Invoice ${invoiceNumber} created for ${group.customer_name}`);
      await loadData();
    } finally {
      setGeneratingSingle(null);
    }
  };

  /* ───────── Generate all invoices ───────── */
  const generateAllInvoices = async () => {
    const uninvoiced = customerGroups.filter((g) => !g.invoice_status && g.customer_id !== "unassigned");
    if (uninvoiced.length === 0) return;
    setGenerating(true);
    try {
      for (const group of uninvoiced) {
        await generateInvoiceForCustomer(group);
      }
      showSuccess(`${uninvoiced.length} invoice${uninvoiced.length > 1 ? "s" : ""} generated`);
    } finally {
      setGenerating(false);
    }
  };

  /* ───────── Toggle customer expand ───────── */
  const toggleCustomerExpand = (custId: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(custId)) next.delete(custId); else next.add(custId);
      return next;
    });
  };

  /* ───────── Search filter ───────── */
  const filteredCustomerGroups = customerGroups.filter((group) => {
    if (!search) return true;
    const q = search.toLowerCase();
    // Match customer name or email
    if (group.customer_name.toLowerCase().includes(q)) return true;
    if (group.customer_email.toLowerCase().includes(q)) return true;
    // Match any tracking number in the group
    if (group.packages.some((pkg) => pkg.tracking_number.toLowerCase().includes(q))) return true;
    // Match carrier
    if (group.packages.some((pkg) => pkg.carrier?.toLowerCase().includes(q))) return true;
    return false;
  });

  // When searching, auto-expand groups that have matching tracking numbers (but not customer name matches)
  const searchExpandedIds = new Set<string>();
  if (search) {
    const q = search.toLowerCase();
    for (const group of filteredCustomerGroups) {
      if (group.packages.some((pkg) => pkg.tracking_number.toLowerCase().includes(q) || pkg.carrier?.toLowerCase().includes(q))) {
        searchExpandedIds.add(group.customer_id);
      }
    }
  }

  /* ───────── Computed stats ───────── */
  const totalCustomers = customerGroups.filter((g) => g.customer_id !== "unassigned").length;
  const totalPackages = packages.length;
  const totalBillableWeight = packages.reduce((sum, p) => sum + Number(p.billable_weight || 0), 0);
  const uninvoicedCount = customerGroups.filter((g) => !g.invoice_status && g.customer_id !== "unassigned").length;

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!awb) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle size={32} className="text-txt-tertiary mx-auto mb-2" />
            <p className="text-txt-secondary">Shipment not found</p>
            <button onClick={() => router.push("/admin/awbs")} className="btn-primary mt-4 cursor-pointer">Back to Shipments</button>
          </div>
        </div>
      </div>
    );
  }

  const sc = statusConfig[awb.status];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Success Toast */}
      <SuccessToast message={successMessage} />

      {/* ════════ Header ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => router.push("/admin/awbs")}
            className="p-1.5 text-txt-tertiary hover:text-txt-primary hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <h2 className="text-title text-txt-primary">
            <span className="font-mono">{awb.awb_number}</span>
          </h2>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-meta ${awb.freight_type === "ocean" ? "bg-blue-50 text-blue-700" : "bg-sky-50 text-sky-700"}`}>
            {awb.freight_type === "ocean" ? <Ship size={12} /> : <Plane size={12} />}
            {awb.freight_type === "ocean" ? "Ocean" : "Air"}
          </span>
          {sc && (
            <span className={`status-badge ${sc.bg} ${sc.text}`}>
              <span className={`status-dot ${sc.dot}`} />
              {sc.label}
            </span>
          )}
          <div className="relative w-full max-w-sm ml-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers or tracking #..."
              className="w-full h-9 pl-10 pr-4 bg-slate-50 border border-border rounded text-ui text-txt-primary placeholder:text-txt-placeholder focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors"
            />
          </div>
        </div>
        <NotificationBell />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* ───────── Shipment meta row ───────── */}
        <div className="flex items-center gap-4 text-ui-sm text-txt-secondary flex-wrap">
          {awb.courier_group && (
            <span className="flex items-center gap-1.5">
              <Users size={13} className="text-txt-tertiary" />
              {awb.courier_group.name}
            </span>
          )}
          {awb.airline_or_vessel && (
            <span className="flex items-center gap-1.5">
              {awb.freight_type === "ocean" ? <Ship size={13} className="text-txt-tertiary" /> : <Plane size={13} className="text-txt-tertiary" />}
              {awb.airline_or_vessel}
            </span>
          )}
          {(awb.origin || awb.destination) && (
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="text-txt-tertiary" />
              {awb.origin || "—"} → {awb.destination || "—"}
            </span>
          )}
          {awb.departure_date && (
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-txt-tertiary" />
              {new Date(awb.departure_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {/* ───────── Summary Stats ───────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-border rounded-lg px-4 py-3">
            <p className="text-meta text-txt-tertiary uppercase tracking-wide">Customers</p>
            <p className="text-2xl font-bold text-txt-primary mt-1">{totalCustomers}</p>
          </div>
          <div className="bg-white border border-border rounded-lg px-4 py-3">
            <p className="text-meta text-txt-tertiary uppercase tracking-wide">Packages</p>
            <p className="text-2xl font-bold text-txt-primary mt-1">{totalPackages}</p>
          </div>
          <div className="bg-white border border-border rounded-lg px-4 py-3">
            <p className="text-meta text-txt-tertiary uppercase tracking-wide">Billable Weight</p>
            <p className="text-2xl font-bold text-txt-primary mt-1">{totalBillableWeight.toFixed(1)} <span className="text-ui-sm text-txt-tertiary" style={{ fontWeight: 400 }}>lbs</span></p>
          </div>
          <div className="bg-white border border-border rounded-lg px-4 py-3">
            <p className="text-meta text-txt-tertiary uppercase tracking-wide">Rate / lb</p>
            <p className="text-2xl font-bold text-txt-primary mt-1">
              {awb.courier_group ? `$${Number(awb.courier_group.rate_per_lb).toFixed(2)}` : "—"}
            </p>
            {Object.keys(tierCache).length > 0 && (
              <p className="text-meta text-primary mt-0.5">Tier pricing active</p>
            )}
          </div>
        </div>

        {/* ───────── Customer Breakdown + Invoice Generation ───────── */}
        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-txt-tertiary" />
              <h2 className="text-ui font-semibold text-txt-primary">Customer Breakdown</h2>
              {uninvoicedCount > 0 && (
                <span className="text-meta text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  {uninvoicedCount} not invoiced
                </span>
              )}
              {search && (
                <span className="text-meta text-txt-tertiary bg-surface-secondary px-2 py-0.5 rounded-full">
                  {filteredCustomerGroups.length}/{customerGroups.length}
                </span>
              )}
            </div>
            {uninvoicedCount > 0 && (
              <button
                onClick={generateAllInvoices}
                disabled={generating}
                className="btn-primary flex items-center gap-1.5 text-ui cursor-pointer"
              >
                {generating ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                Generate All Invoices ({uninvoicedCount})
              </button>
            )}
          </div>

          {filteredCustomerGroups.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Package size={24} className="text-txt-tertiary mx-auto mb-2" />
              <p className="text-muted text-txt-secondary">
                {search ? "No customers or packages match your search" : "No packages assigned to this shipment yet"}
              </p>
              {search && (
                <button onClick={() => setSearch("")} className="text-meta text-primary hover:text-primary/80 mt-1 cursor-pointer">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_100px_120px_130px_140px] gap-2 px-4 py-2 bg-[#f4f5f7] text-ui text-[#6b7280] border-b border-border">
                <span>Customer</span>
                <span className="text-center">Packages</span>
                <span className="text-right">Billable Weight</span>
                <span className="text-center">Invoice</span>
                <span className="text-right">Action</span>
              </div>

              {filteredCustomerGroups.map((group) => {
                const isExpanded = expandedCustomers.has(group.customer_id) || searchExpandedIds.has(group.customer_id);
                const invSc = group.invoice_status ? invoiceStatusConfig[group.invoice_status] : null;
                const cachedTier = group.pricing_tier_id ? tierCache[group.pricing_tier_id] : null;
                const displayRate = cachedTier ? cachedTier.base_rate_per_lb : Number(awb.courier_group?.rate_per_lb || 0);
                const estimatedTotal = group.total_billable_weight * displayRate
                  + (cachedTier?.delivery_fee || 0)
                  + (cachedTier?.hazmat_fee || 0);

                return (
                  <div key={group.customer_id} className="border-b border-border last:border-b-0">
                    {/* Customer row */}
                    <div
                      className="grid grid-cols-[1fr_100px_120px_130px_140px] gap-2 px-4 py-2.5 items-center hover:bg-surface-hover transition-colors cursor-pointer"
                      onClick={() => toggleCustomerExpand(group.customer_id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? <ChevronDown size={14} className="text-txt-tertiary shrink-0" /> : <ChevronRight size={14} className="text-txt-tertiary shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-ui text-txt-primary truncate">{group.customer_name}</p>
                          <p className="text-meta text-txt-tertiary truncate">{group.customer_email}</p>
                        </div>
                      </div>
                      <p className="text-ui text-txt-primary text-center">{group.package_count}</p>
                      <p className="text-ui text-txt-primary text-right" style={{ fontWeight: 400 }}>{group.total_billable_weight.toFixed(1)} lbs</p>
                      <div className="text-center">
                        {invSc ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (group.invoice_id) router.push(`/admin/invoices/${group.invoice_id}`); }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-meta ${invSc.bg} ${invSc.text} cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            {invSc.label}
                          </button>
                        ) : (
                          <span className="text-meta text-txt-tertiary">Not invoiced</span>
                        )}
                      </div>
                      <div className="text-right">
                        {!group.invoice_status && group.customer_id !== "unassigned" ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); generateInvoiceForCustomer(group); }}
                            disabled={generatingSingle === group.customer_id || generating}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-meta text-primary bg-primary/5 border border-primary/20 rounded-md hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {generatingSingle === group.customer_id ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <FileText size={11} />
                            )}
                            Invoice
                          </button>
                        ) : group.invoice_status ? (
                          <span className="text-meta text-txt-tertiary">${estimatedTotal.toFixed(2)}</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Expanded packages */}
                    {isExpanded && (
                      <div className="bg-[#fafbfc] border-t border-border">
                        <div className="grid grid-cols-[1fr_100px_80px_80px_100px_90px] gap-2 px-4 py-1.5 pl-10 text-ui text-[#9ca3af]">
                          <span>Tracking #</span>
                          <span>Carrier</span>
                          <span className="text-right">Weight</span>
                          <span className="text-right">Vol. Wt</span>
                          <span className="text-right">Billable Wt</span>
                          <span className="text-center">Status</span>
                        </div>
                        {group.packages.map((pkg) => {
                          const psc = pkgStatusConfig[pkg.status];
                          return (
                            <div
                              key={pkg.id}
                              className="grid grid-cols-[1fr_100px_80px_80px_100px_90px] gap-2 px-4 py-1.5 pl-10 items-center hover:bg-[#eef6fc] transition-colors cursor-pointer border-t border-[#f0f0f1]"
                              onClick={() => router.push(`/admin/packages/${pkg.id}`)}
                            >
                              <span className="text-ui font-mono text-txt-primary truncate">{pkg.tracking_number}</span>
                              <span className="text-ui text-txt-secondary truncate" style={{ fontWeight: 400 }}>{pkg.carrier || "—"}</span>
                              <span className="text-ui text-txt-secondary text-right" style={{ fontWeight: 400 }}>{pkg.weight ? `${Number(pkg.weight).toFixed(1)}` : "—"}</span>
                              <span className="text-ui text-txt-secondary text-right" style={{ fontWeight: 400 }}>{pkg.volume_weight ? `${Number(pkg.volume_weight).toFixed(1)}` : "—"}</span>
                              <span className="text-ui text-txt-primary text-right">{pkg.billable_weight ? `${Number(pkg.billable_weight).toFixed(1)} lbs` : "—"}</span>
                              <div className="text-center">
                                {psc && (
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${psc.bg} ${psc.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${psc.dot}`} />
                                    {psc.label}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
