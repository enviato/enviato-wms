# §6 Q6 — API-route-vs-direct for privileged mutations: decision doc

**Status:** Open question from Tier 6 RLS audit (`docs/audits/2026-04-19-tier6-rls-audit.md` §6 Q6). This document frames the tradeoffs and proposes a convention. Decision pending.

**TL;DR proposal.** Keep direct-from-browser writes for routine, org-scoped, single-column edits where RLS already covers the threat model. Move privileged mutations — anything that changes `users.role_v2 / agent_id / role_id`, anything touching `user_permissions`, and any hard-delete or bulk reassignment — behind server routes that follow the existing `/api/admin/*` pattern. This is consistent with what the audit recommended and with the pattern the codebase has already standardized on for 7 routes.

---

## 1. What §6 Q6 actually asks

The audit framed it as:

> Per project positioning memory, most data flow goes direct Supabase → browser. Is that still the target? For privileged mutations (role/agent assignment, permission grants, invoice delete) the cleaner fix is "deny from client RLS, require `/api/v1/admin` route with service_role + explicit authz." That removes entire classes of RLS-subtlety bugs. Recommend yes for anything touching `users.role_v2`, `users.agent_id`, `user_permissions.*`, and any hard-delete.

The question is not "should we have a server layer at all" — we already do. It's "where should the boundary sit between RLS-only direct writes and server-mediated writes."

## 2. Current state in code (verified, not theoretical)

### 2.1 What's already behind server routes

Seven routes in `src/app/api/` already follow the same pattern:

| Route | What it does | Why server-side |
| --- | --- | --- |
| `admin/create-recipient` | Create CUSTOMER user (auth + public.users row) | Needs `auth.admin.createUser` — service-role only |
| `admin/delete` | Soft/hard delete across 7 allowed tables, cascade handling | Hard-delete + auth-user ban; multi-step txn |
| `admin/permanent-delete-user` | Hard-delete user row + auth account | Same — auth admin API + FK cascade |
| `admin/restore-user` | Clear `deleted_at`, unban auth | Auth admin API |
| `admin/unlink-agent` | Call `unlink_agent` SECURITY DEFINER RPC | Cross-table txn with privileged checks |
| `upload-photo` | Bucket auto-create + upload to Supabase Storage | Storage bucket admin + MIME validation |
| `delete-photo` | Remove file from Storage | Storage admin |

All seven share an established convention:

```
1. checkCsrf(req)                          // CSRF token
2. limiter.check(req)                      // per-route rate limit
3. createServerClient(anon) → getUser()    // identity from cookies (not body)
4. .from("users").select("role_v2,org_id") // role gate (anon key, RLS-bound)
5. createAdminClient()                     // service-role escalation
6. verify target.org_id === caller.org_id  // org-scope check
7. mutate with admin client                // bypasses RLS
8. logger.error on failure
```

This is reusable. The cost of adding an 8th, 9th, 10th route is low.

### 2.2 What still goes direct from the browser

Grep-verified writes from `src/app/(dashboard)/...` to privileged columns:

| File | Column written | Operation |
| --- | --- | --- |
| `admin/packages/page.tsx:677` | `users.agent_id` | Batch reassign customers' agent (in package edit flow) |
| `admin/packages/page.tsx:986` | `users.agent_id = NULL` | Unassign customer's agent |
| `admin/packages/page.tsx:1012` | `users.agent_id` | Assign customer's agent inline |
| `admin/customers/page.tsx:488` | `users.agent_id` | Batch reassign customers' agent |
| `admin/customers/[id]/page.tsx:151` | `users.{agent_id, pricing_tier_id, first_name, last_name, email, phone}` | Customer detail save (multi-col; includes `agent_id`) |
| `admin/awbs/page.tsx:350` | `awbs.agent_id` | Batch reassign AWB to agent |
| `admin/invoices/page.tsx:270` | `invoices.billed_by_agent_id` | Batch reassign invoice biller |
| `admin/customers/page.tsx:502, 710` + `[id]/page.tsx:503` + `settings/users/UserSettings.tsx:298, 463` | `users.is_active` | Toggle/batch toggle activation |

**No client-side writes today** to `users.role_v2`, `users.role_id`, or `user_permissions.*`. Verified by grep. Those threats are theoretical — nothing in the UI surface mutates them. That matters for prioritization (§5).

### 2.3 What RLS actually allows today

`users_update_v2` (baseline L1882-1885):

- USING: caller is in target's org AND (`role_v2 = ORG_ADMIN` OR `id = auth.uid()`).
- WITH CHECK: same, plus on **self-update** the WITH CHECK pins `role_v2 / agent_id / role_id` to current values (F-1/F-2 fix from migration 016).
- For **ORG_ADMIN-updates-other**, the WITH CHECK does NOT pin those columns. So an ORG_ADMIN can today change another user's `role_v2`, `agent_id`, or `role_id` directly from the browser. The UI just doesn't expose it for `role_v2` / `role_id`.

`user_perms_{insert,update,delete}_v2` (baseline L1851-1862): all gated to ORG_ADMIN-in-target's-org. Permissive enough that an ORG_ADMIN could grant arbitrary permissions client-side if a UI ever wired it up.

So the live attack surface is narrow today, but the policy gives more than the UI uses. That gap is where future bugs hide.

## 3. The two architectures, side by side

### A. RLS-only direct (status quo for the routes in §2.2)

Browser holds an authenticated Supabase client (anon key + JWT). It calls `.from("users").update({ agent_id: x })`. RLS evaluates on the row and decides.

### B. Server route + service_role + explicit authz (status quo for the routes in §2.1)

Browser POSTs JSON to `/api/admin/...`. Server: re-checks identity from session cookie, role-gates against `public.users`, verifies target ownership, then mutates with service_role (bypasses RLS).

### Tradeoffs

| Dimension | RLS-only direct | Server route + service_role |
| --- | --- | --- |
| **Authz source of truth** | Single (RLS policy) | Dual (RLS + route handler). Route handler is the actual gate; RLS becomes a backstop. |
| **Subtle-bug risk** | High. Every column-level rule needs an `IS NOT DISTINCT FROM` clause; easy to forget for ORG_ADMIN-updates-other. F-1/F-2 were exactly this class. | Low. Authz is explicit, in TS, with control flow. Reviewers can read it like normal code. |
| **Latency** | 1 round-trip (browser → PostgREST → Postgres). | 2 round-trips per call (browser → Next API → Postgres ×2: one anon for getUser/role-check, one admin for mutation). Adds ~50–150 ms per privileged action — acceptable for admin operations. |
| **Auditability / observability** | Log shows up only via Postgres-side `activity_log` trigger (if installed) or Supabase logs. Coarse. | Server-side `logger` call with structured context (caller, action, target, result). Fits Vercel logs, datadog, etc. |
| **Rate limiting** | Supabase global limits only. | Per-route `createRateLimiter` (already in use). |
| **CSRF protection** | No CSRF model — Supabase JWT goes in header, not cookie, so cross-origin scripts can't forge requests. Safe by default. | `checkCsrf(req)` token required (already in use). |
| **Bulk operations** | Each row is a separate PostgREST round-trip; client-side `Promise.all` (which is what the admin pages do today) saturates the connection pool fast. | Single POST → server can do the bulk in one txn or with one in-process loop, much kinder to Supabase pooling. |
| **Validation** | Constrained to what RLS / CHECK constraints can express in SQL. Hard to express "only allow `agent_id` ∈ this caller's accessible-agents subtree." | Plain TS, anything goes. Easy to call `get_accessible_agent_ids(caller)` and intersect with the requested target. |
| **Service-role blast radius** | Zero — service-role key never leaves the server. | Larger — every server route with service-role needs to be threat-modelled individually. A bug in a route's authz check is now a tenant-isolation bug. |
| **Testability** | RLS regression tests in `tests/rls/` (good coverage, BEGIN/ROLLBACK isolation). | Need integration tests against the actual route handler. Not trivial — none exist today for the 7 admin routes. |
| **Refactor cost** | Free — the policy is already there. | Moderate — for each browser site, write a route + change the call site to fetch. |
| **Failure mode if RLS regresses** | Silent client-side success → cross-tenant write. | Server-side check still rejects (defense in depth). |
| **Failure mode if route handler has a bug** | N/A | Service-role with a buggy authz check = potential cross-tenant write. Bugs are in TS code where reviewers can read them, but the bug class is more dangerous. |

### Key asymmetry the table doesn't show

In RLS-only direct, the worst bug is "we forgot a column-pin in WITH CHECK and a malicious admin can promote themselves." In server-route, the worst bug is "we forgot to compare `target.org_id` to `caller.org_id` and a malicious admin can mutate any tenant's row." Both are catastrophic. The difference is that the first is **harder to detect in code review** (you have to reason about RLS clauses interacting with PostgREST request shape), and the second is **easier to test** (a single integration test catches it). That's the real argument for server routes on privileged paths — not that they're more secure in theory, but that bugs in them are more likely to be caught.

## 4. Proposed convention

A two-axis decision matrix. For any mutation, classify on:

- **Privilege level** of the column being written
- **Cross-row impact** of the operation

```
                          │  Single-row, scoped to    │  Multi-row, batch,
                          │  caller's natural lane    │  or cross-tenant impact
──────────────────────────┼───────────────────────────┼───────────────────────────
  Routine column          │   DIRECT (RLS-only)       │   DIRECT, but consider
  (e.g. is_active,        │                           │   server route if N > 50
   pricing_tier_id,       │                           │   or for activity_log
   notes, addresses)      │                           │   coalescing
──────────────────────────┼───────────────────────────┼───────────────────────────
  Privileged column       │   SERVER ROUTE            │   SERVER ROUTE
  (role_v2, agent_id,     │   (required)              │   (required)
   role_id,               │                           │
   permission grants,     │                           │
   hard-delete,           │                           │
   billing reassignment)  │                           │
```

**Rationale:**

- Privileged columns are exactly the surface where RLS subtlety bugs cost the most. Move them to TS where they're easier to read, test, and log.
- Routine columns benefit from the direct path's lower latency and simpler client code. RLS is enough — the worst RLS bug for `is_active` is "wrong row got toggled," which is recoverable.
- Bulk operations get a server route mostly for connection-pool kindness, not security. The threshold (~50 rows) is a soft heuristic; below that, client-side `Promise.all` is fine.

### Concrete column classification for ENVIATO

**Privileged (require server route):**

- `users.role_v2`, `users.role_id`, `users.agent_id`
- `user_permissions.*` (all writes)
- Any hard-delete on tenant data (`users`, `agents`, `invoices`, `awbs`, `packages` — but these already go through `/api/admin/delete`)
- `agents.parent_id` / `agent_edges.*` (tree restructuring — already covered by `/api/admin/unlink-agent` for one direction)
- `invoices.billed_by_agent_id` and `invoices.billed_to_agent_id` when changed in bulk
- Any change to `org_id` on any row (cross-tenant moves — should probably just be forbidden)

**Routine (direct is fine):**

- Display fields: `first_name`, `last_name`, `phone`, `aliases`, `address_*`
- `is_active` toggle (within caller's org, RLS handles)
- `pricing_tier_id` (within org, no cross-tenant blast)
- Package-level edits: status, notes, dimensions, tracking
- Soft-delete via `deleted_at` (RLS already gates, and there's no auth-side cleanup needed)

## 5. What to migrate, in order

**P1 — Privileged column writes that exist today and are `agent_id` reassignment.** These are the active gap. Add one route, point the four call sites at it.

1. New `/api/admin/reassign-agent` (POST). Body: `{ subject_table: "users"|"awbs"|"invoices"|"packages", subject_id: uuid, new_agent_id: uuid|null, column?: "agent_id"|"billed_by_agent_id" }`. Server validates: caller is ORG_ADMIN (or WAREHOUSE_STAFF where applicable), `subject` belongs to caller's org, `new_agent_id` (if non-null) belongs to caller's org, optional: `new_agent_id` is in `get_accessible_agent_ids(caller)`. Then `admin.from(subject_table).update({ [column]: new_agent_id }).eq("id", subject_id)`.

2. Replace direct calls at:
   - `admin/packages/page.tsx:677, 986, 1012`
   - `admin/customers/page.tsx:488`
   - `admin/customers/[id]/page.tsx:151` (the `agent_id` field of the multi-column update; rest stays direct)
   - `admin/awbs/page.tsx:350`
   - `admin/invoices/page.tsx:270`

3. Tighten RLS on `users` to deny client-side `agent_id` mutation in WITH CHECK even for ORG_ADMIN. Same column-pin pattern as F-1/F-2 self-update guard, but applied to the ORG_ADMIN branch:
   ```sql
   -- Sketch only.
   WITH CHECK (
     org_id = auth_org_id() AND (
       (auth_role_v2() = 'ORG_ADMIN' AND
         agent_id IS NOT DISTINCT FROM (SELECT u.agent_id FROM users u WHERE u.id = users.id) AND
         role_v2 IS NOT DISTINCT FROM (SELECT u.role_v2 FROM users u WHERE u.id = users.id) AND
         role_id IS NOT DISTINCT FROM (SELECT u.role_id FROM users u WHERE u.id = users.id))
       OR (id = auth.uid() AND ... [existing self-update pins] ...)
     )
   )
   ```
   Detail: the self-reference subquery shape may need a different formulation; this is the intent, not the final SQL. The point is RLS becomes a backstop that fails closed if a future caller tries to bypass the route.

**P2 — Defensive routes for surfaces the UI doesn't use yet but RLS allows.** No code change to call sites; just close the door before someone walks through it.

4. New `/api/admin/grant-permission` and `/api/admin/revoke-permission` for `user_permissions.*`. Plus a follow-up RLS migration that revokes direct INSERT/UPDATE/DELETE on `user_permissions` from `authenticated`, leaving only SELECT. Result: even if a UI later does `supabase.from("user_permissions").insert(...)`, it'll fail loudly instead of silently succeeding for ORG_ADMIN.

5. New `/api/admin/set-user-role` for `users.role_v2 / role_id` changes. Follows once the column-pin in (3) is in place.

**P3 — Bulk reassignment ergonomics.** Today's `Promise.all` over per-row updates in `admin/customers/page.tsx:488` etc. issues N PostgREST calls. Replace with a single POST to `/api/admin/reassign-agent` with `{ ids: uuid[] }` and one server-side bulk update. Only worth doing once (1) is in place — combine the work.

**Out of scope, intentionally:**

- The `is_active` toggle. RLS gates it correctly, the UI does it inline, the worst failure is "wrong user gets disabled" which is reversible. Not worth a route.
- Soft-delete. Already direct, RLS-gated, and the cleanup path (auth ban) only matters for `users` which already has its own route.
- Display-only field edits in the customer detail page. Direct is fine.

## 6. What this convention is NOT

- **It is not "deprecate RLS."** RLS stays. It's the backstop for direct routes (which still exist for routine writes) and the second line of defense for server routes (which can still get authz wrong).
- **It is not a license to skip the column pins in `users_update_v2`.** Those should be tightened (P1 step 3) regardless of whether the routes ship — they cost almost nothing and they fail closed.
- **It is not "every mutation gets a route."** Routine writes stay direct. Adding routes everywhere has its own bug class (handler-authz bugs that touch service-role) and adds latency to user-facing flows.

## 7. Risks and gaps to close before shipping P1

- **No integration tests for the existing 7 admin routes.** The new route should ship with at least one test that asserts: (a) cross-tenant target is rejected; (b) non-ORG_ADMIN caller is rejected; (c) `new_agent_id` outside caller's org is rejected. Pattern can mirror `tests/rls/*.sql` if we want SQL-level, or a Playwright/Vitest harness if we want HTTP-level. SQL-level is faster to write and runs in the same CI.
- **CSRF token plumbing.** `checkCsrf` already in place; new route gets it for free. But the client side has to send the token — confirm `useCsrfToken` (or whatever the existing hook is) is used everywhere admin pages issue mutations after the migration. Worth a one-time grep audit.
- **Service-role key sprawl.** Each new route adds another caller of `createAdminClient()`. Pattern is fine but the mental overhead grows. Consider, after P1+P2, a thin wrapper helper that bundles "auth → role-gate → org-scope → admin client" into one helper and lets each route just declare the policy declaratively. Future refactor, not a blocker.
- **Audit log coverage.** None of the existing routes write to `activity_log` directly. The new route should, so privileged mutations are queryable post-hoc. Today only Postgres triggers populate it.
- **Behavioral parity.** The current direct calls return PostgREST error shapes; the route returns `{ error: string }`. UI error handling needs to be uniform — easy fix but worth catching during the call-site swap.

## 8. Decision needed

To unblock P1:

1. Approve the convention in §4 as the rule going forward.
2. Approve the P1 scope (one new route, six call-site swaps, one column-pin RLS tightening) as the next migration batch (would be 030).
3. Defer P2 / P3 to follow-up batches once P1 lands.

Once approved, the implementation is mechanical: ~150 LOC for the route, ~40 LOC of call-site swaps, ~30 LOC for the migration, plus a test file. Estimate one focused session.

---

## Appendix — Files surveyed for this doc

- `docs/audits/2026-04-19-tier6-rls-audit.md` — §6 Q6 framing
- `src/lib/supabase-admin.ts` — `createAdminClient()` definition
- `src/app/api/admin/{create-recipient,delete,permanent-delete-user,restore-user,unlink-agent}/route.ts` — existing pattern
- `src/app/api/{upload-photo,delete-photo}/route.ts` — storage pattern
- `src/app/(dashboard)/admin/{packages,customers,awbs,invoices}/**/page.tsx` — direct-from-browser write sites
- `src/modules/settings/users/UserSettings.tsx` — `is_active` direct writes
- `supabase/_ci_baseline.sql` L1851-1885 — `user_permissions` and `users` policies
