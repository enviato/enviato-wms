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
