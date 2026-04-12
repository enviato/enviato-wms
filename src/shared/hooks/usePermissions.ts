"use client";

import { useAuth } from "./useAuth";
import type { PermissionSet } from "@/shared/types/auth";

/**
 * Convenience hook to access just the permission set.
 *
 * Usage:
 *   const { isAdmin, hasPermission, role } = usePermissions();
 *   if (!hasPermission("packages:view")) return <AccessDenied />;
 *
 * Replaces the scattered pattern of:
 *   - Checking role_v2 === "ORG_ADMIN" || "WAREHOUSE_STAFF"
 *   - Fetching role_permissions and building a Set
 *   - Duplicated across Sidebar.tsx, TopNav.tsx, and each page
 */
export function usePermissions(): PermissionSet & { loading: boolean } {
  const { permissionSet, loading } = useAuth();
  return {
    ...permissionSet,
    loading,
  };
}
