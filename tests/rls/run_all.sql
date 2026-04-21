-- tests/rls/run_all.sql
-- Convenience runner — concatenates every RLS regression test in dependency
-- order. Use with psql:
--
--   psql "$DATABASE_URL" -f tests/rls/run_all.sql
--
-- For Supabase MCP execute_sql, run each file individually instead — \i is a
-- psql client meta-command and won't work in execute_sql.
--
-- Order: cross-tenant baseline first (broadest invariant), then findings in
-- severity order so a failure tells you the worst-broken thing first.

\echo '====================================================================='
\echo 'ENVIATO RLS regression suite'
\echo 'On any TEST FAIL the next file does NOT run — fix the regression first.'
\echo '====================================================================='

\echo ''
\echo '--- cross-tenant isolation (baseline) ---'
\i tests/rls/cross_tenant_isolation.sql

\echo ''
\echo '--- F-1: self-escalation to ORG_ADMIN ---'
\i tests/rls/F1_self_escalation.sql

\echo ''
\echo '--- F-2: agent_id hijack ---'
\i tests/rls/F2_agent_id_hijack.sql

\echo ''
\echo '--- F-3: unassigned-package carve-out ---'
\i tests/rls/F3_unassigned_packages.sql

\echo ''
\echo '--- F-12: FOR ALL role gates ---'
\i tests/rls/F12_for_all_role_gates.sql

\echo ''
\echo '--- F-4 / HP5: customer read surface ---'
\i tests/rls/F4_customer_read_surface.sql

\echo ''
\echo '--- F-5: invoice_lines UPDATE/DELETE ---'
\i tests/rls/F5_invoice_lines_mutations.sql

\echo ''
\echo '--- F-7: role_v2 backfill invariant ---'
\i tests/rls/F7_role_v2_backfill.sql

\echo ''
\echo '--- F-8: invoices RBAC/RLS alignment (026) ---'
\i tests/rls/F8_invoices_rbac_rls_alignment.sql

\echo ''
\echo '--- F-9: package_photos parent-binding (025) ---'
\i tests/rls/F9_package_photos_parent_binding.sql

\echo ''
\echo '--- F-10: global reference tables readable-but-not-writable ---'
\i tests/rls/F10_global_reference_tables.sql

\echo ''
\echo '--- F-6b: get_accessible_agent_ids JWT-first (027/028) ---'
\i tests/rls/F6b_get_accessible_agent_ids_jwt.sql

\echo ''
\echo '====================================================================='
\echo 'All tests passed. Tier 6 (016-028) + F-8 + F-9 + F-10 + F-6b covered.'
\echo '====================================================================='
