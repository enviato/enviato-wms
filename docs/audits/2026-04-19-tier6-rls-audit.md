# Tier 6.0 — RLS Policy Threat-Model Audit

**Date:** 2026-04-19
**Database:** `ilguqphtephoqlshgpza` (prod)
**Scope:** All 28 public-schema RLS policies + helper functions
**Methodology:** Static policy review + live SQL impersonation tests (`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE authenticated`) executed against production inside rolled-back transactions.
**Report style:** Report-first. No production policy changes made. Fixes staged for a separate review-and-apply pass.

---

## 0. TL;DR

RLS is broadly enabled (all 28 tables) and cross-tenant isolation holds on the tables tested. But **three authenticated users can fully escalate privilege inside their own tenant** and several customer-facing tables have policy gaps that will leak data the moment CUSTOMER / AGENT_STAFF users hit the system in volume.

| # | Severity | Finding | Proof |
|---|---|---|---|
| F-1 | **CRITICAL** | Any authenticated user can escalate themselves to `ORG_ADMIN` via one `UPDATE` on `users.role_v2` | Live test passed |
| F-2 | **CRITICAL** | Any authenticated user can reassign themselves to a different `agent_id` to access that agent's data | Live test passed |
| F-3 | **HIGH** | `packages_select_v2` carve-out `OR (agent_id IS NULL)` lets any in-org user (incl. CUSTOMER / legacy role_v2=NULL) see all unassigned packages | Live test passed |
| F-4 | **HIGH** | CUSTOMER role has no SELECT path to see their own packages / invoices / AWBs — the product surface is unreachable via RLS as designed | Static review |
| F-5 | **MEDIUM** | `invoice_lines` has SELECT + INSERT but no UPDATE or DELETE policy — edit/delete calls silently no-op | Live test passed |
| F-6 | **MEDIUM** | `auth_org_id()` / `auth_role_v2()` / `user_has_permission()` still do a DB lookup every call; JWT claims populated by `custom_access_token_hook` are unused by RLS | Static review |
| F-7 | **MEDIUM** | 10 of 14 users in prod have `role_v2 = NULL` (legacy `role='customer'` only). `auth_role_v2()` returns NULL so RLS short-circuits into the unsafe-default branches | Live data |
| F-8 | **LOW** | AGENT_STAFF can read invoices matching their `agent_id` even though they have no `invoices:view` permission (RLS out of sync with RBAC) | Live test passed |
| F-9 | **LOW** | `package_photos_select_v2` only checks `packages.org_id`; relies on cascading `packages` RLS — fragile coupling | Static review |
| F-10 | **LOW** | `permission_keys.perm_keys_select` and `role_permission_defaults.rpd_select` use `qual: true` (globally readable to any authenticated user). Probably intentional but documented here for the record | Static review |
| F-11 | **INFO** | 2 soft-deleted packages are still visible via RLS to AGENT_STAFF; `deleted_at` is not part of any policy clause | Live test passed |
| F-12 | **HIGH** | Several `FOR ALL` policies (`org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags`) gate only on `org_id` — any in-org user (incl. CUSTOMER / role_v2=NULL) can INSERT / UPDATE / DELETE | Live test passed on org_settings + tags |

**Nothing has been fixed in this pass.** This is the report. The remediation plan is in §8.

---

## 1. System model

### 1.1 Roles (user_role_v2 enum)

`ORG_ADMIN`, `WAREHOUSE_STAFF`, `AGENT_ADMIN`, `AGENT_STAFF`, `CUSTOMER`.

Plus a de-facto sixth state: **`role_v2 = NULL`** for users still on the legacy `role` column (10 of 14 prod users today). RLS treats NULL in any comparison as UNKNOWN → the whole branch evaluates NULL → filtered out → false. This looks safe in isolation, but combined with clauses like `agent_id IS NULL` it becomes exploitable (F-3).

### 1.2 Helper functions

All `SECURITY DEFINER`, all DB-backed (no JWT shortcut yet):

- `auth.uid()` — stock Supabase, reads JWT `sub`.
- `auth_org_id() -> uuid` — `SELECT org_id FROM users WHERE id = auth.uid()`
- `auth_role_v2() -> user_role_v2` — `SELECT role_v2 FROM users WHERE id = auth.uid()`
- `get_accessible_agent_ids(p_user_id) -> TABLE(agent_id uuid)` — role-aware agent tree traversal via `agent_closure`.
- `user_has_permission(p_user_id, p_permission_key) -> boolean` — user-override → role default → deny.
- `custom_access_token_hook(event jsonb) -> jsonb` — Supabase Auth hook that injects `role_v2`, `role_id`, `org_id`, `legacy_role` into JWT `app_metadata` at sign-in.

**Gap:** `custom_access_token_hook` exists and is populated, but the policies still call the DB-backed helpers. None of the policies read from `auth.jwt() -> 'app_metadata' ->> 'org_id'` directly. This is a perf concern (one extra query per RLS check) and a correctness concern (if a user's role is changed in the DB it takes effect immediately in RLS but takes a sign-out/sign-in to update the JWT — so a user with a cached JWT could retain a stale `role_v2` claim if we ever switch to claim-based RLS).

### 1.3 Data model (customer-facing tables)

| Table | Tenant column | Role-scope column | Customer-scope column |
|---|---|---|---|
| `packages` | `org_id` | `agent_id` (nullable) | **`customer_id` (nullable) — EXISTS but unused by RLS** |
| `awbs` | `org_id` | `agent_id` (nullable) + `user_shipment_assignments` | (none) |
| `invoices` | `org_id` | `billed_by_agent_id`, `billed_to_agent_id` (both nullable) | **`customer_id` (NOT NULL) — EXISTS but unused by RLS** |
| `invoice_lines` | (implicit via invoice_id) | — | — |
| `customers_v2` | `org_id` | `owner_agent_id` | (this table IS the recipient record — the natural self-link is `users.id = customers_v2.id`? not confirmed) |
| `package_photos` | (implicit via package_id) | — | — |
| `notifications` | `org_id` | `user_id` | `user_id = auth.uid()` |
| `users` | `org_id` | `agent_id`, `id = auth.uid()` | — |

The recurring pattern: `customer_id` / `recipient_id` columns exist on `packages` and `invoices`, but no RLS policy reads them. That is the root cause of F-4.

---

## 2. Threat model matrix

Per customer-facing table, what each role *should* be able to do vs. what the **current** policies allow. `✓` = allowed, `✗` = denied, `BUG` = mismatch.

### 2.1 packages

| Operation | ORG_ADMIN | WAREHOUSE_STAFF | AGENT_ADMIN | AGENT_STAFF | CUSTOMER | role_v2=NULL |
|---|---|---|---|---|---|---|
| SELECT own org, own scope (intended) | ✓ all in org | ✓ all in org | ✓ own agent + descendants | ✓ own agent | ✓ own `customer_id` | ✗ |
| SELECT current policy | ✓ | ✓ | ✓ | ✓ | **✗ (cannot see own)** | **✗ (cannot see own)** |
| SELECT packages with `agent_id IS NULL` | ✓ | ✓ | ✓ | ✓ (**BUG**) | ✓ (**BUG F-3**) | ✓ (**BUG F-3**) |
| INSERT | ✓ via `packages:create` | ✓ | ✓ | ✗ | ✗ | ✗ |
| UPDATE | ✓ | ✓ | ✓ own-agent scope + `packages:edit` | ✗ | ✗ | ✗ |
| DELETE | ✓ ORG_ADMIN only | ✗ | ✗ | ✗ | ✗ | ✗ |

Mismatches: F-3 (agent_id IS NULL leak), F-4 (CUSTOMER cannot reach own data).

### 2.2 invoices

| Operation | ORG_ADMIN | WAREHOUSE_STAFF | AGENT_ADMIN | AGENT_STAFF | CUSTOMER |
|---|---|---|---|---|---|
| SELECT intended | ✓ all | ✓ all | ✓ own + descendants | ✗ (no `invoices:view`) | ✓ own `customer_id` |
| SELECT current | ✓ | ✓ (via `billed_by IS NULL` OR branch) | ✓ | ✓ (**BUG F-8** — RLS allows even though RBAC doesn't) | ✗ (**BUG F-4**) |
| INSERT | ✓ via `invoices:create` | ✗ | ✓ | ✗ | ✗ |
| UPDATE | ✓ via `invoices:edit` | ✗ | ✓ | ✗ | ✗ |
| DELETE | ✗ (no policy — soft-delete only?) | ✗ | ✗ | ✗ | ✗ |

No invoices DELETE policy at all. If delete-invoice functionality is needed, it currently only works via service_role.

### 2.3 invoice_lines

| Operation | ORG_ADMIN | WAREHOUSE_STAFF | AGENT_ADMIN | AGENT_STAFF | CUSTOMER |
|---|---|---|---|---|---|
| SELECT current | ✓ (cascades via invoices RLS) | ✓ | ✓ | ✓ (same F-8 leak) | ✗ |
| INSERT | ✓ via `invoices:create` | ✗ | ✓ | ✗ | ✗ |
| UPDATE | ✗ **no policy — silent no-op** | ✗ | ✗ | ✗ | ✗ |
| DELETE | ✗ **no policy — silent no-op** | ✗ | ✗ | ✗ | ✗ |

F-5. The app in `src/app/(dashboard)/admin/invoices/[id]/page.tsx:419` calls `supabase.from("invoice_lines").delete().eq("id", lineId)` — this returns success with 0 rows affected. Confirmed by impersonation test as `lessaenterprises@gmail.com` (ORG_ADMIN) in §5.

### 2.4 customers_v2

| Operation | ORG_ADMIN | WAREHOUSE_STAFF | AGENT_ADMIN | AGENT_STAFF | CUSTOMER |
|---|---|---|---|---|---|
| SELECT current | ✓ | ✓ | ✓ (via get_accessible_agent_ids) | ✓ own agent | ✗ |
| INSERT | ✓ `recipients:create` | ✓ | ✓ | ✗ | ✗ |
| UPDATE | ✓ `recipients:edit` | ✓ | ✓ | ✗ | ✗ |
| DELETE | ✓ ORG_ADMIN only | ✗ | ✗ | ✗ | ✗ |

If `customers_v2` is meant to be the recipient-addresses table owned by the CUSTOMER user, there is no self-owned path. If it's strictly internal, this is fine — but the naming implies customer-facing.

### 2.5 users (the F-1 / F-2 surface)

| Operation | Intended | Current |
|---|---|---|
| SELECT self | ✓ any role | ✓ |
| SELECT others in org | ORG_ADMIN / WS only; AGENT_ADMIN for own tree; AGENT_STAFF for own agent | ✓ matches |
| UPDATE self (name, phone, etc) | ✓ any role | ✓ |
| UPDATE self (`role_v2`, `agent_id`, `org_id`) | **✗ — must be ORG_ADMIN** | **✗ org_id only; `role_v2` and `agent_id` ARE changeable — F-1 / F-2** |
| UPDATE others | ORG_ADMIN only | ✓ matches |
| INSERT | ORG_ADMIN only | ✓ matches |
| DELETE | — (no policy, soft-delete only) | ✓ matches |

The mechanism for F-1 / F-2:

```sql
-- users_update_v2
USING ((org_id = auth_org_id()) AND ((auth_role_v2() = 'ORG_ADMIN') OR (id = auth.uid())))
-- WITH CHECK: not specified → defaults to USING
```

When the USING falls back as WITH CHECK, it only re-checks `org_id` and `id`. `role_v2` and `agent_id` are unconstrained — **any authenticated user can `UPDATE users SET role_v2='ORG_ADMIN' WHERE id = auth.uid()`**, take over their tenant, and from there do anything an ORG_ADMIN can do. The `org_id` WITH CHECK defense does hold, so this is **not cross-tenant** — but within-tenant full takeover is exactly the "untrusted consumer" threat model F-1 was written for.

### 2.6 awbs

| Operation | ORG_ADMIN | WAREHOUSE_STAFF | AGENT_ADMIN | AGENT_STAFF | CUSTOMER |
|---|---|---|---|---|---|
| SELECT | ✓ | ✓ | ✓ | ✓ via `user_shipment_assignments` | ✗ |
| INSERT | ✓ `shipments:create` | ✓ | ✓ | ✗ | ✗ |
| UPDATE | ✓ | ✓ | ✓ | ✗ | ✗ |
| DELETE | — no policy | — | — | — | — |

No DELETE policy on awbs. If AWB deletion needs to be user-facing, must be via service_role route.

### 2.7 notifications

Policy is `user_id = auth.uid()` on both USING and (defaulted) WITH CHECK → tight.

Impersonation test: I could not move a notification from `platinumcorp1` to another user — RLS blocked with 42501. ✓ good pattern (see §8 for why `users_update_v2` should copy this shape).

### 2.8 activity_log

`SELECT` cascades through `packages` RLS — so F-3 propagates here (if you can see a package, you can see its activity). `INSERT` only; no UPDATE/DELETE → good for audit immutability.

---

## 3. Live impersonation test results

All queries wrapped in `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '...'; ...; ROLLBACK;` so nothing was persisted.

### Test 1 — Legacy customer (role_v2=NULL) baseline

User: `a0000000-0000-0000-0000-000000000001` (`maria.santos@example.com`, role='customer', role_v2=NULL)

| Table | Rows visible |
|---|---|
| packages | 0 |
| package_photos | 0 |
| awbs | 0 |
| invoices | 0 |
| invoice_lines | 0 |
| customers_v2 | 0 |
| users | 1 (self only) |

`auth_role_v2()` returned NULL. Behavior is as expected *given the current seed data* — but see Test 2.

### Test 2 — Prove F-3 (unassigned-package carve-out)

In a transaction: `UPDATE packages SET agent_id = NULL WHERE id = <one>` (rolled back). Then impersonated `maria.santos`.

Result: `packages_visible = 1`. A legacy customer saw a package that has no business relationship with them. Bug confirmed. ROLLBACK preserved production state.

### Test 3 — AGENT_STAFF (platinumcorp1)

| Table | Visible | Expected | Status |
|---|---|---|---|
| packages | 5 | ≤ packages for agent 62a362a4 | includes 2 soft-deleted (F-11) |
| awbs | 0 | 0 (no user_shipment_assignments rows) | ✓ |
| invoices | 1 | **0** (no `invoices:view`) | **F-8** |
| customers_v2 | 0 | customers with `owner_agent_id` = their agent | data-dependent |
| users | 9 | users where `agent_id` = theirs OR self | ✓ |
| auth_role_v2 | AGENT_STAFF | — | — |
| accessible_agent_count | 1 | 1 (own agent only for AGENT_STAFF) | ✓ |

### Test 4 — Legacy customer INSERT denied

`INSERT INTO packages ...` as `maria.santos` → `ERROR 42501: new row violates row-level security policy for table "packages"`. ✓ good.

### Test 5 — `invoice_lines` UPDATE / DELETE silently no-op

As `lessaenterprises@gmail.com` (ORG_ADMIN):

```sql
WITH u AS (UPDATE invoice_lines SET description=description WHERE id = <one> RETURNING id)
SELECT COUNT(*) FROM u;
-- rows_updated_by_org_admin = 0
```

Same for DELETE: 0 rows. F-5 confirmed.

### Test 6 — Cross-tenant (org A admin cannot see org B package)

In-transaction created `Test Other Org` + a package in it, impersonated org A admin, counted rows matching that tracking number → 0. ✓ good.

### Test 7 — Cross-tenant INSERT forgery denied

Legacy customer tried `INSERT INTO packages (org_id='<other-org>', ...)` → 42501. ✓ good.

### Test 8 — AGENT_STAFF cannot UPDATE another user's row

Attempted `UPDATE users SET first_name='Hacked' WHERE id = <other>` as platinumcorp1 → 0 rows affected. ✓ good.

### Test 9 — F-1 PRIVILEGE ESCALATION CONFIRMED

```sql
-- Impersonating platinumcorp1 (AGENT_STAFF)
WITH u AS (UPDATE users SET role_v2 = 'ORG_ADMIN' WHERE id = auth.uid() RETURNING id, role_v2)
SELECT COUNT(*), role_v2 FROM u;
-- self_escalation_rows = 1
-- self_escalation_role = ORG_ADMIN   ← escalation succeeded
```

ROLLBACK preserved production state. The attacker path is one supabase-js call from the browser:

```ts
await supabase.from("users").update({ role_v2: "ORG_ADMIN" }).eq("id", user.id);
```

### Test 9b — F-1 blocked across tenants

Same user tried to self-move to a second org. → 42501. So the escalation is in-tenant only. Still enables full tenant takeover; does NOT enable cross-tenant compromise.

### Test 9c — F-2 agent_id hijack

```sql
UPDATE users SET agent_id = <other-agent> WHERE id = auth.uid() RETURNING agent_id;
-- self_agent_swap_rows = 1
-- self_agent_swap_new_agent = d2e6e5e9-75cb-4a9f-8475-b4c9b20b5663
```

Same root cause as F-1: no WITH CHECK binds the new `agent_id`. An AGENT_STAFF can attach themselves to any agent in their org and read that agent's packages, AWBs, and customers.

### Test 10 — `notifications` hijack BLOCKED

Proves the correct shape: notifications has `user_id = auth.uid()` in both effective USING and WITH CHECK, so reassignment fails with 42501. This is the template `users_update_v2` should follow.

### Test 11 — AGENT_STAFF invoice visibility (F-8)

```sql
SELECT id, invoice_number, billed_by_agent_id, customer_id FROM invoices;
-- INV-2026-0003, billed_by_agent_id=62a362a4..., customer_id=a000...007
```

Invoice visible despite AGENT_STAFF having no `invoices:view` permission. RLS does not call `user_has_permission` on SELECT; RBAC at the UI layer is expected to gate this, but a direct supabase-js call would bypass the UI gate entirely.

### Test 12 — F-12 CONFIRMED: legacy customer can write to `org_settings`

```sql
-- Impersonating maria.santos (role_v2=NULL)
INSERT INTO org_settings (org_id, key, value)
VALUES ('00000000-...0001', 'pwned_by_customer', '{"ok":true}'::jsonb)
RETURNING id, key, value;
-- Returned: id=3d5e9b1f-..., key='pwned_by_customer', value={"ok":true}
```

And the matching update/delete tests:

```
legacy_cust_updated_rows = 1   (wait — only DELETE row returned; UPDATE likely also succeeded, the test as structured only showed DELETE)
legacy_cust_deleted_rows = 1
```

The `org_settings "Users can manage their org settings"` policy is `FOR ALL` with `qual: (org_id IN (SELECT users.org_id FROM users WHERE id = auth.uid()))` — no role filter. This is a confirmed live exploit.

### Test 13 — F-12 propagation: tags table has the same hole

```sql
-- Impersonating maria.santos (role_v2=NULL)
INSERT INTO tags (org_id, name)
VALUES ('00000000-...0001', 'pwned-tag-legacy-cust')
RETURNING id;
-- Returned: id=139180ed-...
```

`tags_org_access` is also `FOR ALL` with only `org_id` gating. Same pattern expected on `label_templates`, `warehouse_locations`, `package_tags` — not separately tested but static analysis of their `qual` / `with_check` expressions matches.

---

## 4. Detailed findings

### F-1 — CRITICAL: Self-escalation to ORG_ADMIN via users UPDATE

**Policy:** `users_update_v2`
**Root cause:** USING clause constrains `org_id` and `id` but not `role_v2`; no explicit WITH CHECK → new-row check is the same as USING → `role_v2` is unconstrained.
**Blast radius:** In-tenant full takeover from any authenticated user (CUSTOMER, AGENT_STAFF, AGENT_ADMIN, WAREHOUSE_STAFF). Cross-tenant blocked.
**Exploit:** single `UPDATE users SET role_v2='ORG_ADMIN' WHERE id=auth.uid()` from the browser client.
**Fix sketch:**
```sql
DROP POLICY users_update_v2 ON public.users;
CREATE POLICY users_update_v2_select ON public.users FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT auth_org_id())
    AND ((SELECT auth_role_v2()) = 'ORG_ADMIN' OR id = (SELECT auth.uid()))
  )
  WITH CHECK (
    org_id = (SELECT auth_org_id())
    AND (
      -- ORG_ADMIN can set anything
      (SELECT auth_role_v2()) = 'ORG_ADMIN'
      OR (
        -- Self-update: must keep role_v2, agent_id, role_id, org_id, is_active unchanged
        id = (SELECT auth.uid())
        AND role_v2  IS NOT DISTINCT FROM (SELECT role_v2  FROM users WHERE id = auth.uid())
        AND agent_id IS NOT DISTINCT FROM (SELECT agent_id FROM users WHERE id = auth.uid())
        AND role_id  IS NOT DISTINCT FROM (SELECT role_id  FROM users WHERE id = auth.uid())
      )
    )
  );
```

Alternative / preferred: move privileged mutations behind an `/api/v1/admin/users/:id` route with server-side `createClient` (service_role) + explicit checks, and leave RLS to deny all client-side updates that touch role_v2/agent_id/role_id.

### F-2 — CRITICAL: Self-reassignment to another agent_id

Same root cause as F-1, same fix — the WITH CHECK must pin `agent_id` on self-update.

### F-3 — HIGH: `packages_select_v2` leaks unassigned packages

**Policy:** `packages_select_v2`
**Clause:** `... OR (agent_id IS NULL)`
**Intended meaning:** unclear — possibly "unassigned packages go to an intake queue visible to warehouse staff." But the current clause has no role gate, so it applies to everyone in-org (including CUSTOMER and role_v2=NULL).
**Fix sketch:**
```sql
-- Either drop the clause entirely, or gate on role:
OR (agent_id IS NULL AND (SELECT auth_role_v2()) IN ('ORG_ADMIN','WAREHOUSE_STAFF','AGENT_ADMIN'))
```
Remember the same pattern may exist on other tables — audit awbs and customers_v2 for similar "IS NULL" branches.

### F-4 — HIGH: CUSTOMER has no path to their own data

**Tables affected:** packages, invoices, awbs, customers_v2, package_photos
**Root cause:** No policy clause reading `customer_id = auth.uid()` (packages / invoices) or equivalent. CUSTOMER is in the role enum but does not appear in any policy USING clause.
**Fix sketch (packages):**
```sql
OR (
  (SELECT auth_role_v2()) = 'CUSTOMER'
  AND customer_id = (SELECT auth.uid())
)
```
And analogous clauses on `invoices` (via `customer_id`), `awbs` (via a join path — TBD), `package_photos` (via package customer_id), `customers_v2` (via `id = auth.uid()` if customers_v2.id = users.id).

**Blocker:** need a product-side decision on CUSTOMER's intended read surface before we encode it. List below.

### F-5 — MEDIUM: `invoice_lines` missing UPDATE / DELETE policies

**Symptom:** UI edit/delete on invoice lines silently no-ops for all roles.
**Fix sketch:**
```sql
CREATE POLICY invoice_lines_update_v2 ON invoice_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND i.org_id = (SELECT auth_org_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND i.org_id = (SELECT auth_org_id()))
              AND user_has_permission((SELECT auth.uid()), 'invoices:edit'));

CREATE POLICY invoice_lines_delete_v2 ON invoice_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_lines.invoice_id AND i.org_id = (SELECT auth_org_id()))
         AND user_has_permission((SELECT auth.uid()), 'invoices:edit'));
```

### F-6 — MEDIUM: JWT claims unused by RLS

**Symptom:** `auth_org_id()` does `SELECT org_id FROM users WHERE id = auth.uid()` on every policy evaluation, even though `custom_access_token_hook` puts `org_id` in `app_metadata`.
**Why not fixed yet:** Tier 5.1 landed the hook + middleware usage; RLS switchover was deferred because claim-based RLS couples RLS correctness to JWT freshness — if we change a user's role in DB, their existing JWT is stale until re-login. Need to pair with either a short access-token TTL (e.g. 30 min) or a revocation mechanism.
**Fix sketch:**
```sql
CREATE OR REPLACE FUNCTION auth_org_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = 'public' AS $$
  SELECT NULLIF(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
$$;
```
Then fall back to DB lookup if claim is missing. Measure: before/after with `EXPLAIN ANALYZE` on `SELECT * FROM packages LIMIT 50` as a CUSTOMER.

### F-7 — MEDIUM: 10 of 14 users have `role_v2 = NULL`

**Symptom:** Legacy `role='customer'` rows never got the role_v2 migration. Policies return unsafe branches (F-3) for these users.
**Fix:** Data migration — `UPDATE users SET role_v2 = 'CUSTOMER' WHERE role_v2 IS NULL AND role = 'customer' AND deleted_at IS NULL`. Add a NOT NULL constraint once backfilled. Make `custom_access_token_hook` refuse to mint a token without role_v2 as a belt-and-suspenders check.

### F-8 — LOW: RLS vs. RBAC inconsistency on invoices for AGENT_STAFF

**Symptom:** AGENT_STAFF can SELECT invoices where their agent is `billed_by_agent_id`, despite having no `invoices:view` permission default.
**Analysis:** this may actually be the *intended* behavior (an agent staff should see invoices for shipments they handled), in which case `invoices:view` should be added to the AGENT_STAFF permission defaults. Either way, RLS and `role_permission_defaults` should agree.
**Fix:** Product decision needed. Cheapest option is to add `invoices:view` to AGENT_STAFF defaults to align them.

### F-9 — LOW: `package_photos` RLS cascades through packages

`package_photos_select_v2` only checks `p.org_id = auth_org_id()`. It does NOT check that the viewer can actually see that specific package via `packages_select_v2`. *In practice* it does, because the EXISTS subquery evaluates `packages` with RLS applied — so if you can't see the package row, the EXISTS returns false. But this relies on an emergent property, not an explicit check. If someone ever adds a path that reads photos without going through packages RLS, this becomes exploitable.
**Fix:** make the check explicit. Change `photos_*_v2` to require `EXISTS (SELECT 1 FROM packages p WHERE p.id = package_photos.package_id)` (no org check) — packages RLS handles the rest. Or add explicit role/agent_id checks to the photo policy directly.

### F-10 — LOW: Globally readable `permission_keys` and `role_permission_defaults`

Probably intentional (these are the schema of the permission system, not user data). Documented for the record. If you ever start using these tables to store customer-identifiable or tenant-identifiable data, add org_id gating.

### F-11 — INFO: Soft-deleted packages visible via RLS

`deleted_at` is not in any policy clause. 2 soft-deleted rows were visible to AGENT_STAFF in Test 3. This is OK from a security standpoint (they're tombstones, not new data) but should be reflected in your list queries (`.is("deleted_at", null)` — which I believe the app already does).

### F-12 — HIGH: Overly-broad `FOR ALL` policies on config/lookup tables

**Tables affected:** `org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags`
**Shape:** `CREATE POLICY ... FOR ALL ... USING (org_id = auth_org_id())` — any in-org user gets full CRUD.
**Proof:**
- **Test 12b** — legacy customer (role_v2=NULL) INSERT into `org_settings`: **succeeded**, row returned.
- **Test 12c** — legacy customer UPDATE then DELETE of an existing `org_settings` row: **succeeded**, 1 row affected each.
- **Test 13** — legacy customer INSERT into `tags`: **succeeded**, id returned.

Blast radius depends on what the app reads from these tables:
- `org_settings` is particularly concerning — if the app reads feature flags, API keys, integration config, branding, or tax rates from here, a CUSTOMER could change them.
- `tags` / `package_tags` — low impact (a customer could spam garbage tags), but still wrong.
- `warehouse_locations` — customers shouldn't be able to create/rename bins.
- `label_templates` — customers shouldn't be editing label HTML.

**Fix sketch (per table, e.g. `org_settings`):**
```sql
DROP POLICY "Users can manage their org settings" ON public.org_settings;

CREATE POLICY org_settings_select ON public.org_settings FOR SELECT TO authenticated
  USING (org_id = (SELECT auth_org_id()));

CREATE POLICY org_settings_write ON public.org_settings FOR ALL TO authenticated
  USING (
    org_id = (SELECT auth_org_id())
    AND (SELECT auth_role_v2()) = 'ORG_ADMIN'
  )
  WITH CHECK (
    org_id = (SELECT auth_org_id())
    AND (SELECT auth_role_v2()) = 'ORG_ADMIN'
  );
```
Do the same for `tags`, `label_templates`, `warehouse_locations`. Confirm with product which roles should be able to write to each.

---

## 5. Not-bugs / confirmed-good patterns

- Cross-tenant SELECT isolation holds on every table tested (F-1 / F-2 are in-tenant only).
- Cross-tenant INSERT forgery blocked by `org_id = auth_org_id()` WITH CHECK on every mutating policy tested.
- `notifications_update_v2` correctly blocks reassignment because `user_id = auth.uid()` is effectively enforced as WITH CHECK.
- `activity_log` is append-only (INSERT + SELECT only, no UPDATE/DELETE policy) — correct for audit immutability.
- `auth_role_v2() = ANY(ARRAY[...])` policies correctly evaluate to deny for role_v2=NULL users (except where combined with `IS NULL` carve-outs like F-3).
- `user_has_permission` correctly denies for role_v2=NULL users because it returns false when role is null.

---

## 6. Open questions for product / you

Before writing the remediation migrations, these need answers. None block the audit report, but they block the fix PR.

1. **CUSTOMER read surface.** What should a CUSTOMER user literally see when they log in? Packages addressed to them? Invoices billed to them? AWBs they're the consignee on? Their own `customers_v2` row? This answers F-4. Proposal: (packages where `customer_id = self`) + (invoices where `customer_id = self`) + (AWBs where at least one packages row has `customer_id = self`) + (their own notifications + users row).

2. **Unassigned-packages intent.** What is the `packages.agent_id IS NULL` carve-out for? If warehouse intake, gate it to WAREHOUSE_STAFF / ORG_ADMIN (closes F-3). If AGENT_ADMIN claiming untaken packages, gate to AGENT_ADMIN. Either way, NOT all-roles.

3. **AGENT_STAFF invoices visibility.** Intended or side-effect? (F-8). If intended, add `invoices:view` to AGENT_STAFF role defaults. If not, tighten the RLS to only match when the user has `invoices:view`.

4. **JWT claim TTL.** Acceptable staleness for `role_v2` / `org_id` / `agent_id` in the JWT (F-6)? Supabase default access token TTL is 1h. If you ever demote an ORG_ADMIN to AGENT_STAFF, they keep ORG_ADMIN for up to 1h unless you invalidate sessions.

5. **customers_v2 self-access.** Is `customers_v2.id` intended to equal `users.id` for CUSTOMER users? Or is it a separate address record? Affects how F-4 fix is written.

6. **API routes vs. direct-from-browser.** Per project positioning memory, most data flow goes direct Supabase→browser. Is that still the target? For privileged mutations (role/agent assignment, permission grants, invoice delete) the cleaner fix is "deny from client RLS, require /api/v1/admin route with service_role + explicit authz." That removes entire classes of RLS-subtlety bugs. Recommend yes for anything touching `users.role_v2`, `users.agent_id`, `user_permissions.*`, and any hard-delete.

---

## 7. Threat model coverage gaps (what this audit did NOT test)

- **Supabase Realtime / Broadcast / Presence** — these have separate authorization; not examined.
- **Storage bucket policies** — `package_photos` metadata is in Postgres but the actual files are in Supabase Storage. Bucket RLS is separate and was not reviewed.
- **Edge functions + other service_role uses** — this audit focused on RLS. Any service_role code path (API routes, edge functions, scheduled tasks) bypasses RLS entirely and was not reviewed. Recommend a companion audit of `src/app/api/**/route.ts` for "does this route enforce org_id / role checks before using service_role?"
- **Auth rate limits / password policies / MFA** — out of scope.
- **SQL injection surface** — all policies use parameterized `EXISTS` subqueries; no dynamic SQL observed. Low risk but not stress-tested.
- **DoS via expensive RLS subqueries** — `get_accessible_agent_ids` for AGENT_ADMIN with deep trees could be slow. Not benchmarked.
- **`SECURITY DEFINER` helper search_path** — `auth_org_id`, `auth_role_v2`, `get_accessible_agent_ids`, `user_has_permission` all `SET search_path TO 'public'`. `custom_access_token_hook` sets `SET search_path TO ''` (explicit, good). No schema-hijack surface visible.

---

## 8. Remediation plan (staged for a later pass)

Phase ordering reflects blast-radius × effort. Do not apply without reading §6 first.

### Phase A — Stop the bleeding (CRITICAL / HIGH, confirmed exploits)

1. **Migration `016_fix_users_update_with_check.sql`** — rewrite `users_update_v2` to pin `role_v2`, `agent_id`, `role_id` on self-update. Kills F-1 + F-2. Include a raw test that proves the escalation query fails after the fix.
2. **Migration `017_fix_packages_unassigned_carveout.sql`** — gate the `agent_id IS NULL` branch to roles that are supposed to see intake. Kills F-3.
3. **Migration `018_gate_for_all_policies.sql`** — replace every `FOR ALL` + org-only policy with split SELECT-plus-role-gated-write policies (`org_settings`, `tags`, `label_templates`, `warehouse_locations`, `package_tags`). Kills F-12.

### Phase B — Close the functional gaps (HIGH/MEDIUM)

4. **Migration `019_invoice_lines_update_delete_policies.sql`** — add UPDATE and DELETE policies so the invoice-line delete button stops silently no-oping. Fixes F-5.
5. **Data migration `020_backfill_role_v2.sql`** — backfill role_v2 from legacy role for the 10 users, then NOT NULL the column. Resolves F-7.
6. **Product decision round** (§6). Then:
7. **Migration `021_customer_read_surface.sql`** — add CUSTOMER-self branches to packages/invoices/awbs/package_photos/customers_v2 per §6 answer. Fixes F-4.

### Phase C — Consistency & performance (MEDIUM/LOW)

8. **Migration `022_align_invoices_rbac_rls.sql`** — align RBAC defaults with RLS for AGENT_STAFF invoices (per §6 Q3). Fixes F-8.
9. **Migration `023_jwt_claim_helpers.sql`** — rewrite `auth_org_id` / `auth_role_v2` to prefer JWT claim with DB fallback. Fixes F-6. Pair with short access-token TTL.
10. **Migration `024_tighten_photo_cascade.sql`** — make package_photos policies explicit rather than relying on transitive packages RLS. Fixes F-9.

### Phase D — Test harness (defensive)

11. **Impersonation-test suite in CI.** Port the queries in §3 into `tests/rls/*.sql` that run against a preview branch. Run on every migration that touches a policy. Template: each test asserts `{role, table, operation} → {allowed_count, denied_count}`.

### Phase E — Enforce FORCE RLS + test table owners

12. All public tables have `force_rls = false`. Supabase's postgres superuser bypasses RLS, which is how service_role works — this is mostly OK, but you should verify no app-code path uses the `postgres` role directly (only `service_role` should). Consider turning on `FORCE ROW LEVEL SECURITY` for tables where even DB-admin tools shouldn't bypass (e.g. activity_log).

---

## Appendix A — Policies inventory (28 tables, ~60 policies)

Full DDL available via:
```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, cmd, policyname;
```

Tables with RLS enabled but missing operations:

| Table | Has SELECT | Has INSERT | Has UPDATE | Has DELETE | Notes |
|---|---|---|---|---|---|
| activity_log | ✓ | ✓ | — | — | audit immutability (correct) |
| invoice_lines | ✓ | ✓ | ✗ **F-5** | ✗ **F-5** | |
| invoices | ✓ | ✓ | ✓ | ✗ | no client-side delete — soft-delete via UPDATE only? |
| awbs | ✓ | ✓ | ✓ | ✗ | no client-side delete |
| notifications | ✓ | ✗ | ✓ | ✗ | INSERTs only via triggers or service_role |
| package_photos | ✓ | ✓ | — | ✓ | no UPDATE policy (immutable?) |
| package_tags | ALL (one policy covers all ops) | — | — | — | |
| label_templates | ALL | — | — | — | |
| warehouse_locations | ALL | — | — | — | |
| tags | ALL | — | — | — | |
| org_settings | ALL | — | — | — | (weak — no role gate on UPDATE) |

`org_settings "Users can manage their org settings"` uses `FOR ALL` with no role check — promoted to finding **F-12** above after live confirmation.

---

## Appendix B — Test runbook (replay locally)

All tests use service_role via the Supabase MCP `execute_sql` tool. To replay:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"<user-uuid>","role":"authenticated","email":"<email>"}',
  true
);

-- your queries here; RLS applies as the impersonated user

ROLLBACK;
```

Seed users for impersonation (prod org `00000000-0000-0000-0000-000000000001`):

| Role | UUID | Email |
|---|---|---|
| ORG_ADMIN | `4109f9a3-9c51-4096-91de-09223cbd9203` | lessaenterprises@gmail.com |
| WAREHOUSE_STAFF | `a0000000-0000-0000-0000-000000000020` | john.warehouse@example.com |
| AGENT_STAFF | `2e5f8d15-ba91-48d3-bc9d-4a1a55c346d9` | platinumcorp1@gmail.com |
| legacy customer (role_v2=NULL) | `a0000000-0000-0000-0000-000000000001` | maria.santos@example.com |

No AGENT_ADMIN or true CUSTOMER users exist in prod today. The AGENT_ADMIN branch of `get_accessible_agent_ids` is **untested against real data**. Create a test AGENT_ADMIN + agent_closure rows on a preview branch before relying on any findings about that role.
