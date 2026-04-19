import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";
import { logger } from "@/shared/lib/logger";

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const ALLOWED_TABLES = ["awbs", "users", "packages", "invoices", "invoice_lines", "courier_groups", "agent_edges"];

/**
 * Tables that support soft-delete via a `deleted_at` column.
 * Records in these tables are archived (not permanently removed).
 */
const SOFT_DELETE_TABLES = ["packages", "invoices", "awbs", "courier_groups", "users"];

/**
 * Tables whose child records need handling before deletion
 * to avoid FK constraint violations (error code 23503).
 * action: "delete" = remove child rows, "nullify" = set FK to null
 */
const CASCADE_MAP: Record<
  string,
  { table: string; fk: string; action: "delete" | "nullify" }[]
> = {
  invoices: [
    { table: "invoice_lines", fk: "invoice_id", action: "delete" },
    { table: "packages", fk: "invoice_id", action: "nullify" },
  ],
  awbs: [{ table: "packages", fk: "awb_id", action: "nullify" }],
};

/**
 * Server-side admin delete route.
 * - Verifies the caller is an authenticated ORG_ADMIN (super admin)
 * - Uses service role key to bypass RLS for the actual delete
 */
export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;
  const limited = limiter.check(req);
  if (limited) return limited;

  try {
    /* ── 1. Authenticate the caller via their session cookie ── */
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options: CookieOptions;
            }[]
          ) {
            // API routes don't need to set cookies
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    /* ── 2. Check that the user is ORG_ADMIN ── */
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role_v2 !== "ORG_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden — only organization admins can delete records" },
        { status: 403 }
      );
    }

    const callerOrgId = profile.org_id;

    /* ── 3. Parse request ── */
    const { table, ids } = (await req.json()) as {
      table: string;
      ids: string[];
    };

    if (!table || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: table, ids" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json(
        { error: `Table "${table}" is not allowed` },
        { status: 403 }
      );
    }

    /* ── 4. Verify all target records belong to caller's org ── */
    const admin = createAdminClient();

    // Tables without org_id (agent_edges, invoice_lines) are child records
    // handled via CASCADE_MAP; their parents are already org-scoped.
    const ORG_SCOPED_TABLES = ["awbs", "users", "packages", "invoices", "courier_groups"];
    if (ORG_SCOPED_TABLES.includes(table)) {
      const { data: records, error: fetchError } = await admin
        .from(table)
        .select("id, org_id")
        .in("id", ids);

      if (fetchError) {
        return NextResponse.json({ error: "Failed to verify record ownership" }, { status: 500 });
      }

      const foreignRecords = (records || []).filter((r: { org_id: string }) => r.org_id !== callerOrgId);
      if (foreignRecords.length > 0) {
        return NextResponse.json(
          { error: "Forbidden — one or more records do not belong to your organization" },
          { status: 403 }
        );
      }
    }

    /* ── 5. Perform deletes with admin client (bypasses RLS) ── */

    /* Handle child records first to avoid FK constraint violations */
    const cascades = CASCADE_MAP[table];
    if (cascades) {
      for (const { table: childTable, fk, action } of cascades) {
        if (action === "delete") {
          await admin.from(childTable).delete().in(fk, ids);
        } else {
          await admin.from(childTable).update({ [fk]: null }).in(fk, ids);
        }
      }
    }

    const useSoftDelete = SOFT_DELETE_TABLES.includes(table);

    const results = await Promise.all(
      ids.map(async (id) => {
        if (useSoftDelete) {
          // Soft-delete: set deleted_at timestamp instead of removing the row
          const { data, error } = await admin
            .from(table)
            .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
            .eq("id", id)
            .is("deleted_at", null)
            .select("id");
          return { id, data, error };
        } else {
          // Hard-delete for tables without soft-delete support (users, invoice_lines)
          const { data, error } = await admin
            .from(table)
            .delete()
            .eq("id", id)
            .select("id");
          return { id, data, error };
        }
      })
    );

    const deleted: string[] = [];
    const failed: { id: string; message: string }[] = [];

    // If soft-deleting users, ban their auth accounts so they can't log in
    // (but keep the auth record so it can be restored later)
    if (table === "users") {
      for (const r of results) {
        if (!r.error && r.data && r.data.length > 0) {
          try {
            await admin.auth.admin.updateUserById(r.id, {
              ban_duration: "876600h", // ~100 years = effectively permanent
            });
          } catch (authErr) {
            logger.warn(`Failed to ban auth user ${r.id}`, { error: authErr });
          }
        }
      }
    }

    for (const r of results) {
      if (r.error) {
        failed.push({
          id: r.id,
          message:
            r.error.code === "23503"
              ? "Has dependent records — remove them first"
              : r.error.message || "Unknown error",
        });
      } else if (!r.data || r.data.length === 0) {
        failed.push({ id: r.id, message: "Record not found" });
      } else {
        deleted.push(r.id);
      }
    }

    return NextResponse.json({ deleted, failed });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    logger.error("Admin delete error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
