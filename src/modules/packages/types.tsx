"use client";

import React from "react";

/* ─────────── Types ─────────── */
export type PackageDetail = {
  id: string;
  org_id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  weight: number | null;
  weight_unit: string;
  length: number | null;
  width: number | null;
  height: number | null;
  dim_unit: string;
  volume_weight: number | null;
  billable_weight: number | null;
  package_type: string;
  condition_tags: string[] | null;
  commodity: string | null;
  notes: string | null;
  checked_in_at: string;
  checked_in_by: string | null;
  customer_id: string;
  courier_group_id: string | null;
  awb_id: string | null;
  customer?: { id: string; first_name: string; last_name: string; email: string; customer_number?: string; agent?: { id: string; name: string; agent_code?: string | null; company_name?: string | null } | null } | null;
  courier_group?: { code: string; name: string } | null;
  awb?: { id: string; awb_number: string; status: string } | null;
  photos?: PhotoRecord[];
  checked_in_user?: { first_name: string; last_name: string } | null;
};

export type PhotoRecord = {
  id: string;
  storage_url: string;
  storage_path: string | null;
  photo_type: string;
  sort_order: number;
};

export type OtherPackage = {
  id: string;
  tracking_number: string;
  carrier: string;
  status: string;
  checked_in_at: string;
  weight: number | null;
  weight_unit: string;
};

export type ActivityLog = {
  id: string;
  action: string;
  metadata: { description?: string; [key: string]: unknown } | null;
  created_at: string;
  user?: { first_name: string; last_name: string } | null;
};

export type CustomerOption = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
};

export type TagDefinition = {
  id: string;
  name: string;
  color: string;
};

/* ─────────── Status Config ─────────── */
export const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  checked_in:      { label: "In Warehouse",  bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500" },
  assigned_to_awb: { label: "On AWB",        bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500" },
  in_transit:      { label: "In Transit",     bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-500" },
  received_at_dest:{ label: "Received",       bg: "bg-violet-50",   text: "text-violet-700",  dot: "bg-violet-500" },
  delivered:       { label: "Delivered",       bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400" },
  returned:        { label: "Returned",        bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-500" },
  lost:            { label: "Lost",            bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-500" },
};

/* ─────────── Activity Timeline SVG Illustrations ─────────── */
/* Each is a 16×16 SVG rendered inside a 30px circle node */
export const ActivityIllustrations: Record<string, { svg: React.ReactNode; color: string; bg: string; label: string }> = {
  checked_in: {
    label: "Checked In",
    color: "#059669",
    bg: "#ecfdf5",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Box with down arrow — package arriving into warehouse */}
        <rect x="3" y="5" width="10" height="8" rx="1.5" stroke="#059669" strokeWidth="1.5" fill="none" />
        <path d="M6 5V3.5A2 2 0 0 1 10 3.5V5" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 8v3M6.5 9.5L8 11l1.5-1.5" stroke="#059669" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  shipped: {
    label: "Shipped",
    color: "#2563eb",
    bg: "#eff6ff",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Box with up arrow — package leaving */}
        <rect x="3" y="5" width="10" height="8" rx="1.5" stroke="#2563eb" strokeWidth="1.5" fill="none" />
        <path d="M8 10V7M6.5 8.5L8 7l1.5 1.5" stroke="#2563eb" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 5V3h6v2" stroke="#2563eb" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  awb_assigned: {
    label: "Assigned to AWB",
    color: "#7c3aed",
    bg: "#f5f3ff",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Airplane silhouette — AWB / air waybill */}
        <path d="M2.5 8.5L7 7l1-4.5L9.5 7l4.5 1.5-4.5 1L9.5 14 8 9.5l-4.5-1z" stroke="#7c3aed" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  received_at_dest: {
    label: "Received at Destination",
    color: "#7c3aed",
    bg: "#f5f3ff",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Location pin with checkmark — arrived */}
        <path d="M8 14s-4.5-4-4.5-6.5a4.5 4.5 0 0 1 9 0C12.5 10 8 14 8 14z" stroke="#7c3aed" strokeWidth="1.4" fill="none" />
        <path d="M6 7l1.5 1.5L10 6" stroke="#7c3aed" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  invoiced: {
    label: "Invoiced",
    color: "#0891b2",
    bg: "#ecfeff",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Receipt/invoice with dollar sign */}
        <path d="M4 2h8a1 1 0 0 1 1 1v10.5l-2-1-2 1-2-1-2 1V3a1 1 0 0 1 1-1z" stroke="#0891b2" strokeWidth="1.4" fill="none" />
        <path d="M8 5.5v5M9.2 6.8c0-.7-.5-1.3-1.2-1.3s-1.2.5-1.2 1.1c0 .7.5 1 1.2 1.2s1.2.5 1.2 1.2c0 .7-.5 1.3-1.2 1.3s-1.2-.5-1.2-1.2" stroke="#0891b2" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
  reassigned: {
    label: "Customer Reassigned",
    color: "#d97706",
    bg: "#fffbeb",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Two person silhouettes with arrow between — reassignment */}
        <circle cx="5" cy="5.5" r="2" stroke="#d97706" strokeWidth="1.3" fill="none" />
        <path d="M2 12c0-1.7 1.3-3 3-3" stroke="#d97706" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.5 7h4M12 5.5l1.5 1.5L12 8.5" stroke="#d97706" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="11.5" cy="4" r="1.5" stroke="#d97706" strokeWidth="1.2" fill="none" />
      </svg>
    ),
  },
  edited: {
    label: "Edited",
    color: "#4b5563",
    bg: "#f3f4f6",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Pencil writing on paper */}
        <path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5z" stroke="#4b5563" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
        <path d="M9 4l3 3" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M3 13h3" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  deleted: {
    label: "Deleted",
    color: "#dc2626",
    bg: "#fef2f2",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Trash can illustration */}
        <path d="M3.5 5h9l-.8 8.5a1 1 0 0 1-1 .9H5.3a1 1 0 0 1-1-.9L3.5 5z" stroke="#dc2626" strokeWidth="1.4" fill="none" />
        <path d="M2.5 5h11" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M6 3.5V2.5h4v1" stroke="#dc2626" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.5 7.5v4M9.5 7.5v4" stroke="#dc2626" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
  photo_added: {
    label: "Photo Added",
    color: "#059669",
    bg: "#ecfdf5",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Camera with plus — photo added */}
        <rect x="2" y="4.5" width="12" height="9" rx="1.5" stroke="#059669" strokeWidth="1.4" fill="none" />
        <circle cx="8" cy="9" r="2.5" stroke="#059669" strokeWidth="1.3" fill="none" />
        <path d="M5.5 4.5L6.5 3h3l1 1.5" stroke="#059669" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M12 6.5v2M11 7.5h2" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  photo_removed: {
    label: "Photo Removed",
    color: "#dc2626",
    bg: "#fef2f2",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Camera with X — photo removed */}
        <rect x="2" y="4.5" width="12" height="9" rx="1.5" stroke="#dc2626" strokeWidth="1.4" fill="none" />
        <circle cx="8" cy="9" r="2.5" stroke="#dc2626" strokeWidth="1.3" fill="none" />
        <path d="M5.5 4.5L6.5 3h3l1 1.5" stroke="#dc2626" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M11 6l2 2M13 6l-2 2" stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  status_changed: {
    label: "Status Changed",
    color: "var(--primary)",
    bg: "var(--primary-light)",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Two circular arrows — status cycle/change */}
        <path d="M12.5 6A4.5 4.5 0 0 0 4 5.5" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3.5 10A4.5 4.5 0 0 0 12 10.5" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M5.5 4l-1.5 1.5L5.5 7" stroke="var(--primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 12l1.5-1.5-1.5-1.5" stroke="var(--primary)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  customer_matched: {
    label: "Customer Matched",
    color: "#059669",
    bg: "#ecfdf5",
    svg: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        {/* Person with checkmark — customer identified */}
        <circle cx="8" cy="5" r="2.5" stroke="#059669" strokeWidth="1.4" fill="none" />
        <path d="M3.5 13.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        <path d="M10.5 3l1.5 1.5L15 2" stroke="#059669" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

/* Fallback illustration for unknown actions */
export const DefaultActivityIllustration = {
  color: "#6b7280",
  bg: "#f3f4f6",
  svg: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      {/* Clipboard — generic activity */}
      <rect x="3.5" y="1.5" width="9" height="13" rx="1.5" stroke="#6b7280" strokeWidth="1.4" fill="none" />
      <path d="M6 1.5h4v1.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V1.5z" stroke="#6b7280" strokeWidth="1.2" fill="none" />
      <path d="M6 7h4M6 9.5h3" stroke="#6b7280" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  ),
};

export const getActivityConfig = (action: string) => ActivityIllustrations[action] || DefaultActivityIllustration;
export const getActivityLabel = (action: string) => ActivityIllustrations[action]?.label || action.replace(/_/g, " ");

/* ─────────── Standard Carriers (fixed options) ─────────── */
export const STANDARD_CARRIERS = [
  { value: "Amazon", label: "Amazon" },
  { value: "Aramex", label: "Aramex" },
  { value: "Canada Post", label: "Canada Post" },
  { value: "DHL", label: "DHL" },
  { value: "FedEx", label: "FedEx" },
  { value: "LaserShip", label: "LaserShip" },
  { value: "OnTrac", label: "OnTrac" },
  { value: "Royal Mail", label: "Royal Mail" },
  { value: "SF Express", label: "SF Express" },
  { value: "TNT", label: "TNT" },
  { value: "UPS", label: "UPS" },
  { value: "USPS", label: "USPS" },
  { value: "Other", label: "Other" },
];

export const PACKAGE_TYPES = [
  { value: "bag", label: "Bag" },
  { value: "box", label: "Box" },
  { value: "envelope", label: "Envelope" },
  { value: "pallet", label: "Pallet" },
  { value: "other", label: "Other" },
];

export const COMMODITIES = [
  { value: "documents", label: "Documents" },
  { value: "electronics", label: "Electronics" },
  { value: "clothing", label: "Clothing & Apparel" },
  { value: "books", label: "Books & Media" },
  { value: "fragile", label: "Fragile Items" },
  { value: "perishable", label: "Perishable" },
  { value: "hazmat", label: "Hazardous Materials" },
  { value: "gift", label: "Gift/Personal" },
  { value: "other", label: "Other" },
];

/* ─────────── Helpers ─────────── */
export const computeVolumeWeight = (l: number | null, w: number | null, h: number | null, unit: string) => {
  if (l == null || w == null || h == null) return null;
  const divisor = unit === "cm" ? 5000 : 139;
  return Math.round(((l * w * h) / divisor) * 100) / 100;
};

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

export const fmtRelative = (iso: string) => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
};
