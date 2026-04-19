/**
 * Database entity types for ENVIATO WMS.
 * These match the Supabase PostgreSQL schema (24 tables).
 * See references/database-schema.md for full column details.
 */

// ─── Core Entities ───────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  logo_icon_url: string | null;
  plan_tier: string;
  settings: Record<string, unknown> | null;
  address: Record<string, unknown> | null;
}

export type UserRole = "ORG_ADMIN" | "WAREHOUSE_STAFF" | "AGENT_ADMIN" | "AGENT_STAFF" | "CUSTOMER";

export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role_v2: UserRole | null;
  role_id: string | null;
  courier_group_id: string | null;
  agent_id: string | null;
  is_active: boolean;
}

export interface Agent {
  id: string;
  org_id: string;
  name: string;
  status: string;
  agent_code: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  business_name: string | null;
  trn: string | null;
}

export interface CourierGroup {
  id: string;
  org_id: string;
  code: string;
  name: string;
  country: string | null;
  rate_per_lb: number | null;
  volume_divisor: number;
  pricing_model: string;
  logo_url: string | null;
  deleted_at: string | null;
}

export interface Package {
  id: string;
  org_id: string;
  tracking_number: string;
  carrier: string | null;
  status: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  billable_weight: number | null;
  customer_id: string | null;
  courier_group_id: string | null;
  agent_id: string | null;
  awb_id: string | null;
  warehouse_location_id: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  // Joined fields
  customer?: Partial<User>;
  courier_group?: Partial<CourierGroup>;
  agent?: Partial<Agent>;
}

export interface Awb {
  id: string;
  org_id: string;
  awb_number: string;
  freight_type: "air" | "ocean";
  status: string;
  courier_group_id: string | null;
  total_pieces: number;
  total_weight: number;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  // Joined fields
  courier_group?: Partial<CourierGroup>;
}

export interface Invoice {
  id: string;
  org_id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
  // Joined fields
  customer?: Partial<User>;
}

export interface InvoiceLine {
  id: string;
  invoice_number: string;
  awb_id: string | null;
  package_id: string | null;
  billable_weight: number;
  rate_per_lb: number;
  line_total: number;
}

// ─── Settings / Config Entities ──────────────────────────────────

export interface PackageStatus {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  deleted_at: string | null;
}

export interface Tag {
  id: string;
  org_id: string;
  name: string;
  color: string;
  deleted_at: string | null;
}

export interface WarehouseLocation {
  id: string;
  org_id: string;
  name: string;
  code: string;
  customer_id: string | null;
  description: string | null;
  status: "active" | "inactive";
  deleted_at: string | null;
}

// ─── Permissions ─────────────────────────────────────────────────

export interface Role {
  id: string;
  org_id: string;
  name: string;
  base_role: UserRole;
  is_system: boolean;
}

export interface PermissionKey {
  id: string;
  permission_key: string;
  category: string;
  label: string;
  is_hard_constraint: boolean;
}

// ─── Notifications ───────────────────────────────────────────────

export type NotificationType = "awb_shipped" | "awb_arrived" | "package_received" | "invoice_ready";
export type NotificationChannel = "push" | "email" | "sms";

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string | null;
  read_at: string | null;
  sent_at: string;
  metadata: Record<string, unknown>;
}

// ─── Org Settings ────────────────────────────────────────────────

export interface OrgSetting {
  id: string;
  org_id: string;
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

// ─── Activity Log ────────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
