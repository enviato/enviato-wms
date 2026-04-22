/**
 * Supabase query helpers with automatic soft-delete filtering.
 *
 * Usage:
 *   import { query, softDeleteQuery, softDelete } from "@/shared/lib/api";
 *
 *   // Normal query (no soft-delete filter)
 *   const { data } = await query("users").select("*");
 *
 *   // Query with automatic .is("deleted_at", null) filter
 *   const { data } = await softDeleteQuery("packages").select("*");
 *
 *   // Soft-delete a record
 *   await softDelete("packages", packageId);
 */

import { createClient } from "@/lib/supabase";
import type { SoftDeleteTable, SOFT_DELETE_TABLES } from "@/shared/types/common";

const SOFT_DELETE_TABLE_SET = new Set<string>([
  "packages",
  "invoices",
  "awbs",
  "courier_groups",
  "warehouse_locations",
  "tags",
  "package_statuses",
]);

/**
 * Get a raw Supabase query builder for any table.
 * Does NOT apply soft-delete filter — use softDeleteQuery() for that.
 */
export function query(table: string) {
  const supabase = createClient();
  return supabase.from(table);
}

/**
 * Get a Supabase query builder with .is("deleted_at", null) pre-applied.
 * Only works on soft-delete-enabled tables (throws otherwise).
 */
export function softDeleteQuery(table: SoftDeleteTable) {
  if (!SOFT_DELETE_TABLE_SET.has(table)) {
    throw new Error(
      `Table "${table}" is not a soft-delete table. Use query() instead.`
    );
  }
  const supabase = createClient();
  return supabase.from(table).select().is("deleted_at", null);
}

/**
 * Soft-delete a record by setting deleted_at = now().
 */
export async function softDelete(table: SoftDeleteTable, id: string) {
  const supabase = createClient();
  return supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
}

/**
 * Restore a soft-deleted record by setting deleted_at = null.
 */
export async function restoreSoftDelete(table: SoftDeleteTable, id: string) {
  const supabase = createClient();
  return supabase.from(table).update({ deleted_at: null }).eq("id", id);
}

/**
 * Fetch a single org setting by key.
 */
export async function getOrgSetting(orgId: string, key: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("value")
    .eq("org_id", orgId)
    .eq("key", key)
    .single();
  return data?.value ?? null;
}

/**
 * Upsert an org setting (insert or update by org_id + key).
 */
export async function setOrgSetting(
  orgId: string,
  key: string,
  value: unknown,
  userId?: string
) {
  const supabase = createClient();
  return supabase.from("org_settings").upsert(
    {
      org_id: orgId,
      key,
      value,
      updated_at: new Date().toISOString(),
      ...(userId ? { updated_by: userId } : {}),
    },
    { onConflict: "org_id,key" }
  );
}

/**
 * Reassign the agent_id (or billed_by_agent_id, on invoices) for one or more
 * rows. Calls POST /api/admin/reassign-agent — required for `users.agent_id`
 * since migration 030 (the column-pin trigger rejects direct client writes).
 *
 * Returns a Supabase-shaped { data, error } so callers can use the same
 * `if (!error) { ...optimistic update... }` pattern as the supabase-js calls
 * they're replacing.
 *
 * Example:
 *   const { error } = await reassignAgent("users", [customerId], newAgentId);
 *   if (!error) setRecipients(...);
 */
export async function reassignAgent(
  subjectTable: "users" | "awbs" | "invoices",
  subjectIds: string[],
  newAgentId: string | null
): Promise<{
  data: { updated: string[]; failed: { id: string; message: string }[] } | null;
  error: { message: string } | null;
}> {
  if (subjectIds.length === 0) {
    return { data: { updated: [], failed: [] }, error: null };
  }
  try {
    const res = await fetch("/api/admin/reassign-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject_table: subjectTable,
        subject_ids: subjectIds,
        new_agent_id: newAgentId,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      updated?: string[];
      failed?: { id: string; message: string }[];
      error?: string;
    };
    if (!res.ok) {
      return { data: null, error: { message: json.error || `HTTP ${res.status}` } };
    }
    return {
      data: { updated: json.updated || [], failed: json.failed || [] },
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { data: null, error: { message } };
  }
}
