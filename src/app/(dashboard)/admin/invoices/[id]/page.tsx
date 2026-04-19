"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { logger } from "@/shared/lib/logger";
import { SuccessToast } from "@/shared/components/forms";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  FileText,
  Send,
  DollarSign,
  Printer,
  Pencil,
  X,
  Check,
  Calendar,
  Package,
  Weight,
  Plus,
  Trash2,
  Percent,
} from "lucide-react";

/* ───────── Types ───────── */
type InvoiceDetail = {
  id: string;
  invoice_number: string;
  status: string;
  pricing_model: string;
  rate_per_lb: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  notes: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  customer_id: string;
  courier_group_id: string;
  billed_by_agent_id: string | null;
  org_id: string;
  payment_terms: string;
};

type CustomerInfo = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
};

type AgentInfo = {
  id: string;
  name: string;
  code: string;
  country: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  pricing_model: string;
  rate_per_lb: number;
  currency: string;
};

type BillingAgentInfo = {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
};

type InvoiceLine = {
  id: string;
  tracking_number: string | null;
  actual_weight: number | null;
  volume_weight: number | null;
  billable_weight: number | null;
  rate_per_lb: number | null;
  line_total: number;
  description: string | null;
  package_id: string | null;
  charge_type: string;
  awb_number?: string;
};

/* ───────── Constants ───────── */
const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: "Draft", bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  sent: { label: "Sent", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  paid: { label: "Paid", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  overdue: { label: "Overdue", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  cancelled: { label: "Cancelled", bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-300" },
};

const formatCurrency = (amount: number, currency: string = "USD") => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const PAYMENT_TERMS: { value: string; label: string; days: number | null }[] = [
  { value: "due_on_receipt", label: "Due on Receipt", days: 0 },
  { value: "net_7", label: "Net 7", days: 7 },
  { value: "net_15", label: "Net 15", days: 15 },
  { value: "net_30", label: "Net 30", days: 30 },
  { value: "net_45", label: "Net 45", days: 45 },
  { value: "net_60", label: "Net 60", days: 60 },
  { value: "net_90", label: "Net 90", days: 90 },
  { value: "custom", label: "Custom", days: null },
];

const getTermsLabel = (val: string) => PAYMENT_TERMS.find((t) => t.value === val)?.label || val;

const computeDueDate = (createdAt: string, terms: string): string | null => {
  const t = PAYMENT_TERMS.find((p) => p.value === terms);
  if (!t || t.days == null) return null;
  const d = new Date(createdAt);
  d.setDate(d.getDate() + t.days);
  return d.toISOString().split("T")[0];
};

/* ───────── Component ───────── */
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [billingAgent, setBillingAgent] = useState<BillingAgentInfo | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  /* Edit state */
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [editDueDate, setEditDueDate] = useState("");
  const [editingTaxRate, setEditingTaxRate] = useState(false);
  const [editTaxRate, setEditTaxRate] = useState("");

  /* Extra charge state */
  const [showAddCharge, setShowAddCharge] = useState(false);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeType, setChargeType] = useState<"flat" | "per_lb" | "percent">("flat");
  const [chargeWeight, setChargeWeight] = useState("");

  /* Discount state */
  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat"); // flat $ or %

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  /* ───────── Load data ───────── */
  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    /* Invoice */
    const { data: invData } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();
    if (invData) {
      /* Backfill due_date if terms is set but due_date is missing */
      const terms = invData.payment_terms || "due_on_receipt";
      if (terms !== "custom" && !invData.due_date) {
        const computed = computeDueDate(invData.created_at, terms);
        if (computed) {
          await supabase.from("invoices").update({ due_date: computed }).eq("id", invData.id);
          invData.due_date = computed;
        }
      }
      setInvoice(invData as InvoiceDetail);
    }

    /* Parallelize the 4 independent fetches that all hang off invData:
       customer, courier group agent, billing agent, invoice lines.
       Using null-returning fallbacks keeps the tuple destructure uniform. */
    const [custRes, agentRes, baRes, linesRes] = await Promise.all([
      invData?.customer_id
        ? supabase
            .from("users")
            .select("id, first_name, last_name, email, phone")
            .eq("id", invData.customer_id)
            .single()
        : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
      invData?.courier_group_id
        ? supabase
            .from("courier_groups")
            .select("id, name, code, country, contact_email, contact_phone, pricing_model, rate_per_lb, currency")
            .eq("id", invData.courier_group_id)
            .single()
        : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
      invData?.billed_by_agent_id
        ? supabase
            .from("agents")
            .select("id, name, company_name, email, phone")
            .eq("id", invData.billed_by_agent_id)
            .single()
        : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
      invData
        ? supabase
            .from("invoice_lines")
            .select("*")
            .eq("invoice_id", invData.id)
            .order("tracking_number")
        : Promise.resolve({ data: null, error: null } as { data: null; error: null }),
    ]);

    if (custRes.data) setCustomer(custRes.data as CustomerInfo);
    if (agentRes.data) setAgent(agentRes.data as AgentInfo);
    if (baRes.data) setBillingAgent(baRes.data as BillingAgentInfo);

    /* Invoice lines with AWB info */
    if (invData) {
      const { data: linesData, error: linesError } = linesRes as {
        data: Array<Record<string, unknown>> | null;
        error: unknown;
      };
      if (linesError) logger.error("Error loading invoice lines:", linesError);

      if (linesData && linesData.length > 0) {
        /* Look up AWB numbers from package → awb (only for package lines, not fee/discount lines) */
        const packageIds = linesData
          .map((l: Record<string, unknown>) => l.package_id as string | null)
          .filter((id): id is string => !!id);
        let pkgData: Array<{ id: string; awb_id: string | null }> | null = null;
        if (packageIds.length > 0) {
          const { data } = await supabase
            .from("packages")
            .select("id, awb_id")
            .in("id", packageIds);
          pkgData = data as Array<{ id: string; awb_id: string | null }> | null;
        }

        const awbIds = Array.from(new Set((pkgData || []).filter((p: Record<string, unknown>) => p.awb_id).map((p: Record<string, unknown>) => p.awb_id as string)));
        let awbMap: Record<string, string> = {};
        if (awbIds.length > 0) {
          const { data: awbData } = await supabase
            .from("awbs")
            .select("id, awb_number")
            .in("id", awbIds);
          if (awbData) {
            for (const a of awbData) {
              awbMap[a.id] = a.awb_number;
            }
          }
        }

        const pkgAwbMap: Record<string, string> = {};
        if (pkgData) {
          for (const p of pkgData as Array<{ id: string; awb_id: string | null }>) {
            if (p.awb_id && awbMap[p.awb_id]) pkgAwbMap[p.id] = awbMap[p.awb_id];
          }
        }

        setLines(
          linesData.map((l: Record<string, unknown>) => ({
            ...l,
            awb_number: pkgAwbMap[l.package_id as string] || "—",
          })) as InvoiceLine[]
        );
      } else {
        setLines([]);
      }
    }

    setLoading(false);
  };

  /* ───────── Status actions ───────── */
  const updateStatus = async (newStatus: string) => {
    if (!invoice) return;
    setSaving(true);
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (newStatus === "paid") updatePayload.paid_at = new Date().toISOString();
    const { error } = await supabase.from("invoices").update(updatePayload).eq("id", invoice.id);
    if (!error) {
      setInvoice({ ...invoice, status: newStatus, paid_at: newStatus === "paid" ? new Date().toISOString() : invoice.paid_at });
      showSuccess(`Invoice marked as ${newStatus}`);
    }
    setSaving(false);
  };

  /* ───────── Save edits ───────── */
  const saveNotes = async () => {
    if (!invoice) return;
    setSaving(true);
    const { error } = await supabase.from("invoices").update({ notes: editNotes }).eq("id", invoice.id);
    if (!error) {
      setInvoice({ ...invoice, notes: editNotes });
      setEditingNotes(false);
      showSuccess("Notes updated");
    }
    setSaving(false);
  };

  const saveDueDate = async () => {
    if (!invoice) return;
    setSaving(true);
    const { error } = await supabase.from("invoices").update({ due_date: editDueDate || null }).eq("id", invoice.id);
    if (!error) {
      setInvoice({ ...invoice, due_date: editDueDate || null });
      setEditingDueDate(false);
      showSuccess("Due date updated");
    }
    setSaving(false);
  };

  const saveTaxRate = async () => {
    if (!invoice) return;
    setSaving(true);
    const taxRate = parseFloat(editTaxRate) || 0;
    const taxAmount = Number(invoice.subtotal) * (taxRate / 100);
    const total = Number(invoice.subtotal) + taxAmount;
    const { error } = await supabase.from("invoices").update({ tax_rate: taxRate, tax_amount: taxAmount, total }).eq("id", invoice.id);
    if (!error) {
      setInvoice({ ...invoice, tax_rate: taxRate, tax_amount: taxAmount, total });
      setEditingTaxRate(false);
      showSuccess("Tax rate updated");
    }
    setSaving(false);
  };

  /* ───────── Recalculate invoice totals from line items ───────── */
  const recalcInvoiceTotals = async (updatedLines: InvoiceLine[]) => {
    if (!invoice) return;
    const newSubtotal = updatedLines.reduce((sum, l) => sum + Number(l.line_total || 0), 0);
    const taxAmount = newSubtotal * (Number(invoice.tax_rate) / 100);
    const total = newSubtotal + taxAmount;
    await supabase.from("invoices").update({ subtotal: newSubtotal, tax_amount: taxAmount, total }).eq("id", invoice.id);
    setInvoice({ ...invoice, subtotal: newSubtotal, tax_amount: taxAmount, total });
  };

  /* ───────── Add extra charge line ───────── */
  const addExtraCharge = async () => {
    if (!invoice || !chargeDesc.trim() || !chargeAmount) return;
    setSaving(true);
    const val = parseFloat(chargeAmount) || 0;
    if (val <= 0) { setSaving(false); return; }

    let lineTotal = 0;
    let billableWeight: number | null = null;
    let ratePerLb: number | null = null;
    let desc = chargeDesc.trim();

    if (chargeType === "flat") {
      lineTotal = val;
    } else if (chargeType === "per_lb") {
      const wt = parseFloat(chargeWeight) || 0;
      billableWeight = wt;
      ratePerLb = val;
      lineTotal = Math.round(wt * val * 100) / 100;
      desc = `${desc} (${wt} lbs × $${val.toFixed(2)}/lb)`;
    } else if (chargeType === "percent") {
      const currentSubtotal = lines
        .filter((l) => l.charge_type !== "percent" || l.id) // include existing lines
        .reduce((sum, l) => sum + Number(l.line_total || 0), 0);
      lineTotal = Math.round(currentSubtotal * (val / 100) * 100) / 100;
      desc = `${desc} (${val}%)`;
    }

    const { data: newLine, error } = await supabase
      .from("invoice_lines")
      .insert({
        invoice_id: invoice.id,
        tracking_number: null,
        actual_weight: null,
        volume_weight: null,
        billable_weight: billableWeight,
        rate_per_lb: ratePerLb,
        line_total: lineTotal,
        description: desc,
        package_id: null,
        charge_type: chargeType,
      })
      .select("*")
      .single();
    if (error) { logger.error("Error adding charge:", error); }
    if (!error && newLine) {
      const updatedLines = [...lines, { ...newLine, awb_number: "" } as InvoiceLine];
      setLines(updatedLines);
      await recalcInvoiceTotals(updatedLines);
      setChargeDesc("");
      setChargeAmount("");
      setChargeWeight("");
      setChargeType("flat");
      setShowAddCharge(false);
      showSuccess("Charge added");
    }
    setSaving(false);
  };

  /* ───────── Remove a line item ───────── */
  const removeLineItem = async (lineId: string) => {
    if (!invoice) return;
    setSaving(true);
    const { error } = await supabase.from("invoice_lines").delete().eq("id", lineId);
    if (!error) {
      const updatedLines = lines.filter((l) => l.id !== lineId);
      setLines(updatedLines);
      await recalcInvoiceTotals(updatedLines);
      showSuccess("Line item removed");
    }
    setSaving(false);
  };

  /* ───────── Apply discount as a negative line item ───────── */
  const applyDiscount = async () => {
    if (!invoice || !discountValue) return;
    setSaving(true);
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) { setSaving(false); return; }

    const currentSubtotal = lines.reduce((sum, l) => sum + Number(l.line_total || 0), 0);
    const discountAmount = discountType === "percent"
      ? currentSubtotal * (val / 100)
      : val;
    const desc = discountType === "percent"
      ? `Discount (${val}%)`
      : "Discount";

    const { data: newLine, error } = await supabase
      .from("invoice_lines")
      .insert({
        invoice_id: invoice.id,
        tracking_number: null,
        actual_weight: null,
        volume_weight: null,
        billable_weight: null,
        rate_per_lb: null,
        line_total: -discountAmount,
        description: desc,
        package_id: null,
        charge_type: discountType === "percent" ? "percent" : "flat",
      })
      .select("*")
      .single();
    if (!error && newLine) {
      const updatedLines = [...lines, { ...newLine, awb_number: "" } as InvoiceLine];
      setLines(updatedLines);
      await recalcInvoiceTotals(updatedLines);
      setDiscountValue("");
      setEditingDiscount(false);
      showSuccess("Discount applied");
    }
    setSaving(false);
  };

  /* ───────── Print ───────── */
  const handlePrint = () => {
    window.print();
  };

  /* ───────── Computed ───────── */
  const packageLines = lines.filter((l) => !!l.package_id && !!l.tracking_number);
  const totalPackages = packageLines.length;
  const totalBillableWeight = packageLines.reduce((sum, l) => sum + Number(l.billable_weight || 0), 0);
  /* Split discount lines out of the rendered line items so they show in totals */
  const discountLines = lines.filter((l) => Number(l.line_total) < 0);
  const nonDiscountLines = lines.filter((l) => Number(l.line_total) >= 0);
  const totalDiscount = discountLines.reduce((sum, l) => sum + Math.abs(Number(l.line_total || 0)), 0);
  const preDiscountSubtotal = nonDiscountLines.reduce((sum, l) => sum + Number(l.line_total || 0), 0);

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle size={32} className="text-txt-tertiary mx-auto mb-2" />
            <p className="text-txt-secondary">Invoice not found</p>
            <button onClick={() => router.push("/admin/invoices")} className="btn-primary mt-4 cursor-pointer">Back to Invoices</button>
          </div>
        </div>
      </div>
    );
  }

  const sc = statusConfig[invoice.status];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Success Toast */}
      <SuccessToast message={successMessage} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* ───────── Back + Actions bar ───────── */}
        <div className="flex items-center justify-between mb-5 print:hidden">
          <button
            onClick={() => router.push("/admin/invoices")}
            className="flex items-center gap-1.5 text-ui-sm text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            Back to Invoices
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center gap-1.5 text-ui cursor-pointer"
            >
              <Printer size={13} />
              Print
            </button>
            {invoice.status === "draft" && (
              <button
                onClick={() => updateStatus("sent")}
                disabled={saving}
                className="btn-primary flex items-center gap-1.5 text-ui cursor-pointer bg-blue-600 hover:bg-blue-700"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send Invoice
              </button>
            )}
            {(invoice.status === "sent" || invoice.status === "overdue") && (
              <button
                onClick={() => updateStatus("paid")}
                disabled={saving}
                className="btn-primary flex items-center gap-1.5 text-ui cursor-pointer bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <DollarSign size={13} />}
                Mark as Paid
              </button>
            )}
          </div>
        </div>

        {/* ───────── Invoice Card ───────── */}
        <div className="max-w-4xl mx-auto bg-white border border-border rounded-lg shadow-sm overflow-hidden">
          {/* Invoice header */}
          <div className="px-8 py-6 border-b border-border">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-txt-primary">{invoice.invoice_number}</h1>
                {sc && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-meta mt-2 ${sc.bg} ${sc.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                    {sc.label}
                  </span>
                )}
              </div>
              <div className="text-right text-ui-sm text-txt-secondary space-y-1">
                <p><span className="font-medium text-txt-primary">Invoice Date:</span> {formatDate(invoice.created_at)}</p>
                {/* Terms */}
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-medium text-txt-primary">Terms:</span>
                  {invoice.status === "draft" ? (
                    <select
                      value={invoice.payment_terms}
                      onChange={async (e) => {
                        const newTerms = e.target.value;
                        const newDue = newTerms === "custom" ? invoice.due_date : computeDueDate(invoice.created_at, newTerms);
                        await supabase.from("invoices").update({ payment_terms: newTerms, due_date: newDue }).eq("id", invoice.id);
                        setInvoice({ ...invoice, payment_terms: newTerms, due_date: newDue });
                        showSuccess("Terms updated");
                      }}
                      className="text-ui-sm border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer print:border-none print:appearance-none"
                    >
                      {PAYMENT_TERMS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{getTermsLabel(invoice.payment_terms)}</span>
                  )}
                </div>
                {/* Due Date */}
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-medium text-txt-primary">Due Date:</span>
                  {invoice.payment_terms === "custom" && editingDueDate ? (
                    <span className="flex items-center gap-1">
                      <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="text-ui-sm border border-primary rounded px-1.5 py-0.5 focus:outline-none" />
                      <button onClick={saveDueDate} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check size={14} /></button>
                      <button onClick={() => setEditingDueDate(false)} className="p-0.5 text-txt-tertiary hover:bg-surface-hover rounded cursor-pointer"><X size={14} /></button>
                    </span>
                  ) : invoice.payment_terms === "custom" && invoice.status === "draft" ? (
                    <span className="group/due flex items-center gap-1 cursor-pointer" onClick={() => { setEditDueDate(invoice.due_date || ""); setEditingDueDate(true); }}>
                      {formatDate(invoice.due_date)}
                      <Pencil size={11} className="text-txt-tertiary opacity-0 group-hover/due:opacity-100 transition-opacity print:hidden" />
                    </span>
                  ) : (
                    <span>{formatDate(invoice.due_date || invoice.created_at)}</span>
                  )}
                </div>
                {invoice.paid_at && <p><span className="font-medium text-emerald-600">Paid:</span> {formatDate(invoice.paid_at)}</p>}
              </div>
            </div>
          </div>

          {/* Agent + Customer info */}
          <div className="px-8 py-5 grid grid-cols-2 gap-8 border-b border-border">
            <div>
              <p className="text-meta text-txt-tertiary uppercase tracking-wider mb-2">From (Agent)</p>
              {billingAgent ? (
                <div className="space-y-0.5 text-ui-sm">
                  <p className="font-semibold text-txt-primary">{billingAgent.company_name || billingAgent.name}</p>
                  {billingAgent.email && <p className="text-txt-secondary">{billingAgent.email}</p>}
                  {billingAgent.phone && <p className="text-txt-secondary">{billingAgent.phone}</p>}
                </div>
              ) : agent ? (
                <div className="space-y-0.5 text-ui-sm">
                  <p className="font-semibold text-txt-primary">{agent.name}</p>
                  {agent.country && <p className="text-txt-secondary">{agent.country}</p>}
                  {agent.contact_email && <p className="text-txt-secondary">{agent.contact_email}</p>}
                  {agent.contact_phone && <p className="text-txt-secondary">{agent.contact_phone}</p>}
                </div>
              ) : (
                <p className="text-muted text-txt-tertiary">No agent info</p>
              )}
            </div>
            <div>
              <p className="text-meta text-txt-tertiary uppercase tracking-wider mb-2">Bill To (Customer)</p>
              {customer ? (
                <div className="space-y-0.5 text-ui-sm">
                  <p className="font-semibold text-txt-primary">{customer.first_name} {customer.last_name}</p>
                  <p className="text-txt-secondary">{customer.email}</p>
                  {customer.phone && <p className="text-txt-secondary">{customer.phone}</p>}
                </div>
              ) : (
                <p className="text-muted text-txt-tertiary">No customer info</p>
              )}
            </div>
          </div>

          {/* Line items table */}
          <div className="px-8 py-5 border-b border-border">
            <table className="w-full">
              <thead>
                <tr className="text-ui text-[#6b7280] border-b border-border">
                  <th className="text-left pb-2.5 pr-3">Tracking #</th>
                  <th className="text-left pb-2.5 pr-3">AWB / BOL</th>
                  <th className="text-right pb-2.5 pr-3">Billable Wt</th>
                  <th className="text-right pb-2.5 pr-3">Rate / lb</th>
                  <th className="text-right pb-2.5 pr-3">Total</th>
                  <th className="w-8 pb-2.5 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {nonDiscountLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted text-txt-tertiary">
                      No line items
                    </td>
                  </tr>
                ) : (
                  nonDiscountLines.map((line) => {
                    const isPackageLine = !!line.package_id && !!line.tracking_number;
                    const hasWeight = line.billable_weight != null && Number(line.billable_weight) > 0;
                    const hasRate = line.rate_per_lb != null && Number(line.rate_per_lb) > 0;
                    return (
                      <tr key={line.id} className="border-b border-[#f0f0f1] hover:bg-[#fafbfc] transition-colors">
                        <td className="py-2.5 pr-3">
                          {isPackageLine ? (
                            <span
                              className="text-ui font-mono text-primary cursor-pointer hover:underline"
                              onClick={() => router.push(`/admin/packages/${line.package_id}`)}
                            >
                              {line.tracking_number}
                            </span>
                          ) : (
                            <span className="text-ui text-txt-secondary italic">
                              {line.description || "—"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-ui text-txt-secondary font-mono" style={{ fontWeight: 400 }}>
                          {isPackageLine ? (line.awb_number || "—") : ""}
                        </td>
                        <td className="py-2.5 pr-3 text-ui text-txt-primary text-right" style={{ fontWeight: 400 }}>
                          {hasWeight ? `${Number(line.billable_weight).toFixed(1)} lbs` : ""}
                        </td>
                        <td className="py-2.5 pr-3 text-ui text-txt-secondary text-right" style={{ fontWeight: 400 }}>
                          {hasRate ? formatCurrency(Number(line.rate_per_lb)) : !isPackageLine && line.charge_type === "flat" ? "Flat" : !isPackageLine && line.charge_type === "percent" ? "%" : ""}
                        </td>
                        <td className="py-2.5 pr-3 text-ui text-right text-txt-primary">
                          {formatCurrency(Number(line.line_total))}
                        </td>
                        <td className="py-2.5 text-right print:hidden">
                          {!isPackageLine && invoice.status === "draft" && (
                            <button
                              onClick={() => removeLineItem(line.id)}
                              className="p-1 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Remove"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Add charge / discount buttons — draft only */}
            {invoice.status === "draft" && (
              <div className="mt-3 print:hidden">
                {showAddCharge ? (
                  <div className="flex items-center gap-2 p-3 bg-[#f8fafc] rounded-lg border border-border flex-wrap">
                    <input
                      type="text"
                      placeholder="Description"
                      value={chargeDesc}
                      onChange={(e) => setChargeDesc(e.target.value)}
                      className="flex-1 min-w-0 text-ui-sm border border-border rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <select
                      value={chargeType}
                      onChange={(e) => { setChargeType(e.target.value as "flat" | "per_lb" | "percent"); setChargeAmount(""); setChargeWeight(""); }}
                      className="text-ui-sm border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="flat">Flat Rate</option>
                      <option value="per_lb">Per Lb</option>
                      <option value="percent">Percentage</option>
                    </select>
                    {chargeType === "per_lb" && (
                      <>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Wt"
                          value={chargeWeight}
                          onChange={(e) => setChargeWeight(e.target.value)}
                          className="w-20 text-ui-sm border border-border rounded px-2.5 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <span className="text-txt-tertiary text-ui-sm">lbs ×</span>
                      </>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-txt-tertiary text-ui-sm">{chargeType === "percent" ? "%" : "$"}</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={chargeAmount}
                        onChange={(e) => setChargeAmount(e.target.value)}
                        className="w-20 text-ui-sm border border-border rounded px-2.5 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {chargeType === "per_lb" && <span className="text-txt-tertiary text-ui-sm">/lb</span>}
                    </div>
                    <button onClick={addExtraCharge} disabled={saving || !chargeDesc.trim() || !chargeAmount || (chargeType === "per_lb" && !chargeWeight)} className="btn-primary text-meta flex items-center gap-1 cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Add
                    </button>
                    <button onClick={() => { setShowAddCharge(false); setChargeDesc(""); setChargeAmount(""); setChargeWeight(""); setChargeType("flat"); }} className="btn-secondary text-meta cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : editingDiscount ? (
                  <div className="flex items-center gap-2 p-3 bg-[#f8fafc] rounded-lg border border-border">
                    <span className="text-ui-sm text-txt-secondary">Discount:</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="w-24 text-ui-sm border border-border rounded px-2.5 py-1.5 text-right focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <select
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as "flat" | "percent")}
                        className="text-ui-sm border border-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="flat">$ Flat</option>
                        <option value="percent">% Percent</option>
                      </select>
                    </div>
                    <button onClick={applyDiscount} disabled={saving || !discountValue} className="btn-primary text-meta flex items-center gap-1 cursor-pointer disabled:opacity-50">
                      {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      Apply
                    </button>
                    <button onClick={() => { setEditingDiscount(false); setDiscountValue(""); }} className="btn-secondary text-meta cursor-pointer">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowAddCharge(true)}
                      className="flex items-center gap-1.5 text-ui-sm text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    >
                      <Plus size={13} />
                      Add charge
                    </button>
                    <button
                      onClick={() => setEditingDiscount(true)}
                      className="flex items-center gap-1.5 text-ui-sm text-primary hover:text-primary/80 transition-colors cursor-pointer"
                    >
                      <Percent size={13} />
                      Add discount
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="px-8 py-5 flex justify-between items-start">
            {/* Left: summary stats */}
            <div className="flex items-center gap-6 text-ui-sm text-txt-secondary">
              <span className="flex items-center gap-1.5">
                <Package size={14} className="text-txt-tertiary" />
                {totalPackages} package{totalPackages !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <Weight size={14} className="text-txt-tertiary" />
                {totalBillableWeight.toFixed(1)} lbs total
              </span>
            </div>

            {/* Right: money totals */}
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-ui-sm">
                <span className="text-txt-secondary">Subtotal</span>
                <span className="text-txt-primary">{formatCurrency(preDiscountSubtotal, invoice.currency)}</span>
              </div>
              {discountLines.map((dl) => (
                <div key={dl.id} className="flex justify-between text-ui-sm items-center group/discount">
                  <span className="text-txt-secondary flex items-center gap-1 min-w-0">
                    <span className="truncate">{dl.description || "Discount"}</span>
                    {invoice.status === "draft" && (
                      <button
                        onClick={() => removeLineItem(dl.id)}
                        className="p-0.5 text-txt-tertiary hover:text-red-500 hover:bg-red-50 rounded transition-colors cursor-pointer opacity-0 group-hover/discount:opacity-100 print:hidden flex-shrink-0"
                        title="Remove discount"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </span>
                  <span className="text-red-600 flex-shrink-0">-{formatCurrency(Math.abs(Number(dl.line_total)), invoice.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between text-ui-sm items-center">
                <span className="text-txt-secondary flex items-center gap-1">
                  Tax
                  {editingTaxRate ? (
                    <span className="flex items-center gap-1 ml-1">
                      <input type="number" value={editTaxRate} onChange={(e) => setEditTaxRate(e.target.value)} className="w-14 text-ui-sm border border-primary rounded px-1 py-0.5 text-right focus:outline-none" step="0.1" />
                      <span className="text-txt-tertiary">%</span>
                      <button onClick={saveTaxRate} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check size={12} /></button>
                      <button onClick={() => setEditingTaxRate(false)} className="p-0.5 text-txt-tertiary hover:bg-surface-hover rounded cursor-pointer"><X size={12} /></button>
                    </span>
                  ) : (
                    <span
                      className="group/tax flex items-center gap-1 cursor-pointer ml-1"
                      onClick={() => { setEditTaxRate(String(invoice.tax_rate || 0)); setEditingTaxRate(true); }}
                    >
                      ({invoice.tax_rate || 0}%)
                      <Pencil size={10} className="text-txt-tertiary opacity-0 group-hover/tax:opacity-100 transition-opacity print:hidden" />
                    </span>
                  )}
                </span>
                <span className="text-txt-primary">{formatCurrency(Number(invoice.tax_amount || 0), invoice.currency)}</span>
              </div>
              <div className="flex justify-between text-ui font-bold pt-2 border-t border-border">
                <span className="text-txt-primary">Total Due</span>
                <span className="text-txt-primary">{formatCurrency(Number(invoice.total), invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="px-8 py-4 border-t border-border bg-[#fafbfc]">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-meta text-txt-tertiary uppercase tracking-wider">Notes</p>
              {!editingNotes && (
                <button
                  onClick={() => { setEditNotes(invoice.notes || ""); setEditingNotes(true); }}
                  className="p-0.5 text-txt-tertiary hover:text-txt-primary transition-colors cursor-pointer print:hidden"
                >
                  <Pencil size={11} />
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full text-ui-sm border border-primary rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Add notes..."
                />
                <div className="flex gap-2">
                  <button onClick={saveNotes} disabled={saving} className="btn-primary text-meta flex items-center gap-1 cursor-pointer">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Save
                  </button>
                  <button onClick={() => setEditingNotes(false)} className="btn-secondary text-meta cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-ui-sm text-txt-secondary">{invoice.notes || "No notes"}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
