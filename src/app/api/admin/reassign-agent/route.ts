import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createAdminClient } from "@/lib/supabase-admin";
import { createRateLimiter } from "@/shared/lib/rate-limit";
import { checkCsrf } from "@/shared/lib/csrf";
import { logger } from "@/shared/lib/logger";

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

/**
 * POST /api/admin/reassign-agent
 *
 * Tier 6 §6 Q6 follow-through (see docs/audits/2026-04-21-q6-api-route-vs-direct-decision.md).
 *
 * Rewrites every agent_id mutation that used to travel from the browser to
 * PostgREST as a direct `supabase.from(...).update({ agent_id })` call.
 * Migration 030 now rejects those direct writes on `users` with SQLSTATE 42501;
 * this route is the blessed replacement for admin surfaces.
 *
 * Request body
 * ------------
 *   {
 *     "subject_table": "users" | "awbs" | "invoices",
 *     "subject_ids":   string[],    // 1..BULK_MAX UUIDs, must all belong to caller's org
 *     "new_agent_id":  string | null // null = unassign
 *   }
 *
 * Column inference
 * ----------------
 *   users    → agent_id             (recipient's primary agent)
 *   awbs     → agent_id             (shipment agent)
 *   invoices → billed_by_agent_id   (billing agent on the invoice)
 *
 * Response (mirrors /api/admin/delete shape so callers can reuse error UI)
 * ------------------------------------------------------------------------
 *   { updated: string[], failed: { id: string; message: string }[] }
 *
 * Role gates (match existing RLS — we intentionally pick the strictest path
 * so this route never permits something the old PostgREST call wouldn't have)
 * --------------------------------------------------------------------------
 *   users    → ORG_ADMIN only                  (migration 030 blocks
 *                                               everything else anyway;
 *                                               this is belt-and-suspenders)
 *   awbs     → ORG_ADMIN or WAREHOUSE_STAFF    (subset of awbs_update_v2;
 *                                               matches how the UI uses it)
 *   invoices → ORG_ADMIN or WAREHOUSE_STAFF    (subset of invoices_update_v2)
 *
 * Scope guards
 * ------------
 *   1. Every row in subject_ids must have org_id === caller.org_id.
 *   2. new_agent_id (if not null) must have org_id === caller.org_id
 *      (prevents cross-tenant linkage — an ORG_ADMIN can't accidentally
 *      point their customer at an agent owned by another organization).
 */

const BULK_MAX = 500;

type SubjectTable = "users" | "awbs" | "invoices";

const TABLE_COLUMN: Record<SubjectTable, "agent_id" | "billed_by_agent_id"> = {
  users: "agent_id",
  awbs: "agent_id",
  invoices: "billed_by_agent_id",
};

const TABLE_ROLE_GATE: Record<SubjectTable, readonly string[]> = {
  users: ["ORG_ADMIN"] as const,
  awbs: ["ORG_ADMIN", "WAREHOUSE_STAFF"] as const,
  invoices: ["ORG_ADMIN", "WAREHOUSE_STAFF"] as const,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;
  const limited = limiter.check(req);
  if (limited) return limited;

  try {
    /* ── 1. Authenticate caller via session cookie ── */
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
            // API routes don't set cookies
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

    /* ── 2. Resolve caller profile (role + org) ── */
    const { data: profile } = await supabase
      .from("users")
      .select("role_v2, org_id")
      .eq("id", user.id)
      .single();

    if (!profile || !profile.role_v2 || !profile.org_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const callerOrgId = profile.org_id;
    const callerRole = profile.role_v2;

    /* ── 3. Parse + validate body ── */
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      subject_table,
      subject_ids,
      new_agent_id,
    } = (body ?? {}) as {
      subject_table?: unknown;
      subject_ids?: unknown;
      new_agent_id?: unknown;
    };

    if (
      typeof subject_table !== "string" ||
      !(subject_table in TABLE_COLUMN)
    ) {
      return NextResponse.json(
        {
          error:
            'subject_table must be one of: "users", "awbs", "invoices"',
        },
        { status: 400 }
      );
    }

    const table = subject_table as SubjectTable;
    const column = TABLE_COLUMN[table];

    if (
      !Array.isArray(subject_ids) ||
      subject_ids.length === 0 ||
      subject_ids.length > BULK_MAX ||
      !subject_ids.every(
        (id) => typeof id === "string" && UUID_RE.test(id)
      )
    ) {
      return NextResponse.json(
        {
          error: `subject_ids must be a non-empty array of UUIDs (max ${BULK_MAX})`,
        },
        { status: 400 }
      );
    }

    if (
      new_agent_id !== null &&
      (typeof new_agent_id !== "string" || !UUID_RE.test(new_agent_id))
    ) {
      return NextResponse.json(
        { error: "new_agent_id must be a UUID or null" },
        { status: 400 }
      );
    }

    const ids = subject_ids as string[];
    const newAgentId = new_agent_id as string | null;

    /* ── 4. Role gate (table-specific) ── */
    const allowed = TABLE_ROLE_GATE[table];
    if (!allowed.includes(callerRole)) {
      return NextResponse.json(
        {
          error: `Forbidden — role ${callerRole} cannot reassign agent on ${table}`,
        },
        { status: 403 }
      );
    }

    /* ── 5. Org-scope guards (subjects + target agent) ── */
    const admin = createAdminClient();

    // 5a. Every subject row must belong to the caller's org.
    const { data: subjectRows, error: subjectsErr } = await admin
      .from(table)
      .select("id, org_id")
      .in("id", ids);

    if (subjectsErr) {
      logger.error("reassign-agent: failed to load subjects", subjectsErr);
      return NextResponse.json(
        { error: "Failed to verify record ownership" },
        { status: 500 }
      );
    }

    const foundIds = new Set((subjectRows || []).map((r: { id: string }) => r.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    const foreign = (subjectRows || []).filter(
      (r: { org_id: string }) => r.org_id !== callerOrgId
    );

    if (missing.length > 0 || foreign.length > 0) {
      return NextResponse.json(
        {
          error:
            "Forbidden — one or more records do not belong to your organization",
        },
        { status: 403 }
      );
    }

    // 5b. If reassigning to a specific agent, that agent must also be in the org.
    if (newAgentId) {
      const { data: agent, error: agentErr } = await admin
        .from("agents")
        .select("id, org_id")
        .eq("id", newAgentId)
        .maybeSingle();

      if (agentErr) {
        logger.error("reassign-agent: failed to load target agent", agentErr);
        return NextResponse.json(
          { error: "Failed to verify target agent" },
          { status: 500 }
        );
      }

      if (!agent || agent.org_id !== callerOrgId) {
        return NextResponse.json(
          {
            error:
              "Forbidden — target agent does not belong to your organization",
          },
          { status: 403 }
        );
      }
    }

    /* ── 6. Perform updates (bypasses RLS; migration 030's trigger lets
     *     service_role through via rolbypassrls). Single SQL UPDATE covers
     *     the whole batch — no per-id Promise.all round trips, so we stay
     *     well under PostgREST's connection limit when callers pass 500 IDs. */
    const { data: updatedRows, error: updateErr } = await admin
      .from(table)
      .update({ [column]: newAgentId })
      .in("id", ids)
      .select("id");

    if (updateErr) {
      logger.error("reassign-agent: update failed", {
        table,
        column,
        error: updateErr,
      });
      return NextResponse.json(
        { error: updateErr.message || "Update failed" },
        { status: 500 }
      );
    }

    const updated = (updatedRows || []).map((r: { id: string }) => r.id);
    const updatedSet = new Set(updated);
    const failed = ids
      .filter((id) => !updatedSet.has(id))
      .map((id) => ({ id, message: "Row not updated" }));

    return NextResponse.json({ updated, failed });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    logger.error("reassign-agent error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
