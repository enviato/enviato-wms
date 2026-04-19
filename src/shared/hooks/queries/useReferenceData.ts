/**
 * Reference-data query hooks (React Query).
 *
 * These wrap the small "taxonomy" queries that every list and detail
 * page re-fetches on mount:
 *   - customers      (users WHERE role = 'customer')
 *   - courier_groups (shipping/airline/ocean taxonomy)
 *   - agents         (active agent accounts)
 *   - package_statuses
 *   - tags
 *
 * Why hooks (not inline fetches):
 *   - Shared QueryClient cache means the *first* page in a nav chain
 *     fetches; every subsequent page within the 5-min staleTime
 *     window reads from cache — no network hit.
 *   - staleTime here is tuned per-entity: config tables (statuses,
 *     tags, courier_groups) rarely change, so they get longer stale.
 *     Customer/agent lists change more often, so shorter stale.
 *   - refetchOnWindowFocus is inherited from QueryProvider; that
 *     keeps the cache reasonably fresh when users tab back in.
 *
 * Usage:
 *   const { data: customers = [], isLoading } = useCustomers();
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";

// ─────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────

export type CustomerRef = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  agent_id: string | null;
  email: string | null;
  customer_number: string | null;
  phone: string | null;
};

export type CourierGroupRef = {
  id: string;
  code: string;
  name: string;
  type: "shipping" | "airline" | "ocean" | null;
  logo_url: string | null;
};

export type AgentRef = {
  id: string;
  name: string;
  company_name: string | null;
  agent_code: string | null;
};

export type PackageStatusRef = {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  sort_order: number | null;
  is_system: boolean | null;
  deleted_at: string | null;
};

export type TagRef = {
  id: string;
  name: string;
  color: string | null;
};

// ─────────────────────────────────────────────────────
// Query keys (single source of truth — invalidate via
// these if a mutation changes reference data)
// ─────────────────────────────────────────────────────

export const referenceDataKeys = {
  customers: ["reference", "customers"] as const,
  courierGroups: ["reference", "courier_groups"] as const,
  agents: ["reference", "agents"] as const,
  packageStatuses: ["reference", "package_statuses"] as const,
  tags: ["reference", "tags"] as const,
};

// ─────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────

/**
 * Customers (users with role='customer', not soft-deleted).
 *
 * staleTime: 2 min — customers get added/edited semi-frequently.
 */
export function useCustomers() {
  return useQuery<CustomerRef[]>({
    queryKey: referenceDataKeys.customers,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("users")
        .select(
          "id, first_name, last_name, agent_id, email, customer_number, phone"
        )
        .eq("role", "customer")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as CustomerRef[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Courier groups (shipping + airline + ocean taxonomy).
 *
 * staleTime: 10 min — config table, rarely changes.
 */
export function useCourierGroups() {
  return useQuery<CourierGroupRef[]>({
    queryKey: referenceDataKeys.courierGroups,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("courier_groups")
        .select("id, code, name, type, logo_url")
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as CourierGroupRef[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Active agents (status='active', not soft-deleted), sorted by name.
 *
 * staleTime: 5 min.
 */
export function useAgents() {
  return useQuery<AgentRef[]>({
    queryKey: referenceDataKeys.agents,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("agents")
        .select("id, name, company_name, agent_code")
        .eq("status", "active")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as AgentRef[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Package status taxonomy, sorted by sort_order.
 *
 * staleTime: 15 min — this is admin-configured static data.
 */
export function usePackageStatuses() {
  return useQuery<PackageStatusRef[]>({
    queryKey: referenceDataKeys.packageStatuses,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("package_statuses")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PackageStatusRef[];
    },
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Tags, sorted alphabetically.
 *
 * staleTime: 10 min.
 */
export function useTags() {
  return useQuery<TagRef[]>({
    queryKey: referenceDataKeys.tags,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tags")
        .select("id, name, color")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TagRef[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
