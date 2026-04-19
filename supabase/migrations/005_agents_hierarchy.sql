-- ============================================================
-- 005: Agent hierarchy tables (agent_edges & agent_closure)
-- Both tables include org_id (NOT NULL) for multi-tenancy
-- ============================================================

-- ── 1. agent_edges: parent → child relationships ──

CREATE TABLE IF NOT EXISTS agent_edges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  parent_agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  child_agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_agent_id, child_agent_id),
  CHECK (parent_agent_id <> child_agent_id)
);

-- Each child can only have one parent
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_edges_child_unique
  ON agent_edges (child_agent_id);

-- ── 2. agent_closure: transitive closure for efficient hierarchy queries ──

CREATE TABLE IF NOT EXISTS agent_closure (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL,
  ancestor_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  descendant_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  depth         INT NOT NULL DEFAULT 0,
  UNIQUE (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_closure_ancestor
  ON agent_closure (ancestor_id);
CREATE INDEX IF NOT EXISTS idx_agent_closure_descendant
  ON agent_closure (descendant_id);

-- ── 3. Trigger function: maintain closure table on edge insert ──

CREATE OR REPLACE FUNCTION maintain_agent_closure_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := NEW.org_id;

  -- Add the direct relationship
  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  VALUES (v_org_id, NEW.parent_agent_id, NEW.child_agent_id, 1)
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- Add transitive relationships: all ancestors of parent → new child
  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, ac.ancestor_id, NEW.child_agent_id, ac.depth + 1
  FROM agent_closure ac
  WHERE ac.descendant_id = NEW.parent_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- Add transitive relationships: parent → all descendants of child
  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, NEW.parent_agent_id, ac.descendant_id, ac.depth + 1
  FROM agent_closure ac
  WHERE ac.ancestor_id = NEW.child_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  -- Add transitive: all ancestors of parent → all descendants of child
  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT v_org_id, p.ancestor_id, c.descendant_id, p.depth + c.depth + 1
  FROM agent_closure p, agent_closure c
  WHERE p.descendant_id = NEW.parent_agent_id
    AND c.ancestor_id = NEW.child_agent_id
  ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Trigger function: maintain closure table on edge delete ──

CREATE OR REPLACE FUNCTION maintain_agent_closure_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Rebuild the entire closure table
  DELETE FROM agent_closure;

  -- Re-insert all direct edges with org_id
  INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
  SELECT org_id, parent_agent_id, child_agent_id, 1
  FROM agent_edges;

  -- Iteratively add transitive closure until no more rows added
  LOOP
    INSERT INTO agent_closure (org_id, ancestor_id, descendant_id, depth)
    SELECT DISTINCT ae.org_id, ac.ancestor_id, ae.child_agent_id, ac.depth + 1
    FROM agent_closure ac
    JOIN agent_edges ae ON ae.parent_agent_id = ac.descendant_id
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_closure ex
      WHERE ex.ancestor_id = ac.ancestor_id
        AND ex.descendant_id = ae.child_agent_id
    );

    IF NOT FOUND THEN EXIT; END IF;
  END LOOP;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Attach triggers ──

DROP TRIGGER IF EXISTS trg_agent_closure_insert ON agent_edges;
CREATE TRIGGER trg_agent_closure_insert
  AFTER INSERT ON agent_edges
  FOR EACH ROW EXECUTE FUNCTION maintain_agent_closure_insert();

DROP TRIGGER IF EXISTS trg_agent_closure_delete ON agent_edges;
CREATE TRIGGER trg_agent_closure_delete
  AFTER DELETE ON agent_edges
  FOR EACH ROW EXECUTE FUNCTION maintain_agent_closure_delete();

-- ── 6. RLS policies ──

ALTER TABLE agent_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_closure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read agent_edges"
  ON agent_edges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read agent_closure"
  ON agent_closure FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert agent_edges"
  ON agent_edges FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete agent_edges"
  ON agent_edges FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert agent_closure"
  ON agent_closure FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete agent_closure"
  ON agent_closure FOR DELETE TO authenticated USING (true);

-- ── 7. Ensure users.agent_id FK exists ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'users_agent_id_fkey'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;
