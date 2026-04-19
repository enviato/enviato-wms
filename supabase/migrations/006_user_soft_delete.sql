-- =========================================================
-- 006: User soft-delete support
-- =========================================================
-- Adds deleted_at and deleted_by columns to the users table
-- to support archiving users instead of hard-deleting them.
-- This preserves audit trails on packages, invoices, and
-- other records that reference users via foreign keys.
-- =========================================================

-- 1. Add soft-delete columns
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid DEFAULT NULL
    REFERENCES public.users(id);

-- 2. Partial index for fast lookups of active (non-deleted) users
CREATE INDEX IF NOT EXISTS idx_users_deleted_at
  ON public.users(deleted_at) WHERE deleted_at IS NULL;

-- 3. RLS policy: allow org admins to update deleted_at/deleted_by
-- (existing UPDATE policies should cover this, but adding explicit
--  soft-delete awareness if needed in future)
