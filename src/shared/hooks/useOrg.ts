"use client";

import { useAuth } from "./useAuth";
import type { Organization } from "@/shared/types/database";

/**
 * Convenience hook to access just the current organization.
 *
 * Usage:
 *   const { org, orgId, loading } = useOrg();
 *
 * Replaces:
 *   const { data: orgRow } = await supabase.from("organizations").select("id").limit(1).single();
 *
 * This pattern was duplicated on packages, customers, invoices, AWBs, and settings pages.
 */
export function useOrg(): {
  org: Organization | null;
  orgId: string | null;
  loading: boolean;
} {
  const { org, loading } = useAuth();
  return {
    org,
    orgId: org?.id ?? null,
    loading,
  };
}
