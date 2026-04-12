/**
 * Auth-related types for the ENVIATO WMS permission system.
 */

import type { User, UserRole, Organization } from "./database";

/** The auth user returned by supabase.auth.getUser() */
export interface AuthUser {
  id: string;
  email: string;
}

/** Combined auth state: Supabase auth user + WMS user profile + org */
export interface AuthState {
  /** Supabase auth user (from auth.getUser()) */
  authUser: AuthUser | null;
  /** WMS user profile (from users table) */
  user: User | null;
  /** Current organization */
  org: Organization | null;
  /** Whether auth is still loading */
  loading: boolean;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
}

/** Permission check result */
export interface PermissionSet {
  /** Raw role from user profile */
  role: UserRole | null;
  /** Whether user has full admin access (ORG_ADMIN or WAREHOUSE_STAFF) */
  isAdmin: boolean;
  /** Granted permission keys (from role_permissions + user_permissions) */
  permissions: Set<string>;
  /** Check if user has a specific permission */
  hasPermission: (key: string) => boolean;
}

/** Standard permission keys used across the app */
export const PERMISSION_KEYS = {
  PACKAGES_VIEW: "packages:view",
  CUSTOMERS_VIEW: "customers:view",
  SHIPMENTS_VIEW: "shipments:view",
  INVOICES_VIEW: "invoices:view",
  ANALYTICS_VIEW: "analytics:view",
  SETTINGS_VIEW: "settings:view",
} as const;

export type PermissionKeyValue = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];
