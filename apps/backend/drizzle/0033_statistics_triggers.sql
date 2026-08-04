-- --- Tables ---------------------------------------------------------------
CREATE TABLE "stat_current" (
  "scope_type"    text NOT NULL,
  "scope_id"      text NOT NULL,
  "metric"        text NOT NULL,
  "dimension_key" text NOT NULL DEFAULT '',
  "value"         numeric NOT NULL,
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("scope_type", "scope_id", "metric", "dimension_key")
);
--> statement-breakpoint
CREATE INDEX "stat_current_metric_idx" ON "stat_current" ("metric");
--> statement-breakpoint

CREATE TABLE "stat_snapshot_monthly" (
  "scope_type"    text NOT NULL,
  "scope_id"      text NOT NULL,
  "metric"        text NOT NULL,
  "dimension_key" text NOT NULL DEFAULT '',
  "year"          smallint NOT NULL,
  "month"         smallint NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "value"         numeric NOT NULL,
  PRIMARY KEY ("scope_type", "scope_id", "metric", "dimension_key", "year", "month")
);
--> statement-breakpoint
CREATE INDEX "stat_snapshot_monthly_metric_idx" ON "stat_snapshot_monthly" ("metric", "year", "month");
--> statement-breakpoint

-- --- Helpers --------------------------------------------------------------
-- Returns (organisation_id) rows for `p_org_id` and every ancestor via
-- organisations.parent_id. Used by every rollup path.
-- NOTE: the brief's requirements referred to a table `organisation` with a
-- column `parent_organisation_id`; the real schema (see
-- apps/backend/src/infrastructure/database/schema/organisations.ts) names
-- these `organisations` (plural) and `parent_id`. Using the real names here.
CREATE OR REPLACE FUNCTION statistics_org_and_ancestors(p_org_id uuid)
RETURNS TABLE (organisation_id uuid) AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id FROM organisations WHERE id = p_org_id
    UNION ALL
    SELECT o.id, o.parent_id
    FROM organisations o
    JOIN ancestors a ON o.id = a.parent_id
  )
  SELECT id FROM ancestors;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- Adjust rank_count for a single (user, rank, delta). Applies to every org
-- the user is a member of + all ancestors + the platform row.
-- Idempotent for a single (user, rank, +1)/(user, rank, -1) call pair.
CREATE OR REPLACE FUNCTION apply_rank_delta(
  p_user_id text,
  p_rank_id uuid,
  p_delta int
) RETURNS void AS $$
BEGIN
  -- Platform row
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  VALUES ('platform', '__platform__', 'rank_count', p_rank_id::text, p_delta, now())
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

  -- Per-org + ancestors (via user's memberships), deduplicated per user: a
  -- user holding two memberships whose ancestor chains share a node (e.g.
  -- two clubs under the same federation) must only count once at that
  -- shared ancestor, not once per membership row.
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', o.organisation_id::text, 'rank_count', p_rank_id::text, p_delta, now()
  FROM (
    SELECT DISTINCT a.organisation_id
    FROM organisation_membership m
    CROSS JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a
    WHERE m.user_id = p_user_id
  ) o
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- --- rank_history triggers ------------------------------------------------
-- We only care about PASS rows. The trigger determines the effect of THIS
-- row on the user's "current rank" and issues +1 / -1 accordingly.
CREATE OR REPLACE FUNCTION on_rank_history_change() RETURNS trigger AS $$
DECLARE
  v_prev_current_rank uuid;
  v_new_current_rank  uuid;
BEGIN
  -- Compute the user's current rank BEFORE and AFTER this row.
  -- The current rank is the latest PASS row by (date DESC, created_at DESC).
  IF TG_OP = 'INSERT' THEN
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass' AND id <> NEW.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass' AND id <> OLD.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

  ELSE -- UPDATE
    -- Rare; treat as delete-then-insert on the user's history.
    SELECT rank_id INTO v_prev_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass' AND id <> OLD.id
    ORDER BY date DESC, created_at DESC LIMIT 1;

    SELECT rank_id INTO v_new_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;
  END IF;

  IF v_prev_current_rank IS DISTINCT FROM v_new_current_rank THEN
    IF v_prev_current_rank IS NOT NULL THEN
      PERFORM apply_rank_delta(
        COALESCE(NEW.user_id, OLD.user_id),
        v_prev_current_rank,
        -1
      );
    END IF;
    IF v_new_current_rank IS NOT NULL THEN
      PERFORM apply_rank_delta(
        COALESCE(NEW.user_id, OLD.user_id),
        v_new_current_rank,
        +1
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER rank_history_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON rank_history
FOR EACH ROW EXECUTE FUNCTION on_rank_history_change();
--> statement-breakpoint

-- --- organisation_membership triggers ------------------------------------
-- On INSERT: increment membership_count[role] for org + ancestors + platform;
--            also copy the user's current rank_count into every newly-covered
--            org row (they may have already had a rank before joining).
-- On DELETE: reverse.
-- On UPDATE: handled as delete-old / insert-new when either role or
--            organisation_id changes; user_id shouldn't change.
CREATE OR REPLACE FUNCTION on_membership_change() RETURNS trigger AS $$
DECLARE
  v_current_rank uuid;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    -- Decrement membership_count for OLD role.
    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    VALUES ('platform', '__platform__', 'membership_count', OLD.role::text, -1, now())
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    SELECT 'organisation', a.organisation_id::text, 'membership_count', OLD.role::text, -1, now()
    FROM statistics_org_and_ancestors(OLD.organisation_id) a
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    -- Remove user's rank_count from the org's ancestor rows for THIS org,
    -- but only for ancestors not still covered by another membership this
    -- user holds (e.g. user leaves Org-A but remains in Org-B, both under
    -- Fed-X: Fed-X's rank_count must NOT be decremented).
    SELECT rank_id INTO v_current_rank
    FROM rank_history
    WHERE user_id = OLD.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    IF v_current_rank IS NOT NULL THEN
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', a.organisation_id::text, 'rank_count', v_current_rank::text, -1, now()
      FROM statistics_org_and_ancestors(OLD.organisation_id) a
      WHERE NOT EXISTS (
        SELECT 1
        FROM organisation_membership m
        CROSS JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a2
        WHERE m.user_id = OLD.user_id
          AND m.id <> OLD.id
          AND a2.organisation_id = a.organisation_id
      )
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    VALUES ('platform', '__platform__', 'membership_count', NEW.role::text, +1, now())
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
    SELECT 'organisation', a.organisation_id::text, 'membership_count', NEW.role::text, +1, now()
    FROM statistics_org_and_ancestors(NEW.organisation_id) a
    ON CONFLICT (scope_type, scope_id, metric, dimension_key)
    DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();

    SELECT rank_id INTO v_current_rank
    FROM rank_history
    WHERE user_id = NEW.user_id AND result = 'pass'
    ORDER BY date DESC, created_at DESC LIMIT 1;

    -- Only increment ancestors NOT already covered by another membership
    -- this user holds (e.g. user already in Org-A joins Org-B, both under
    -- Fed-X: Fed-X's rank_count must NOT be double-incremented).
    IF v_current_rank IS NOT NULL THEN
      INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
      SELECT 'organisation', a.organisation_id::text, 'rank_count', v_current_rank::text, +1, now()
      FROM statistics_org_and_ancestors(NEW.organisation_id) a
      WHERE NOT EXISTS (
        SELECT 1
        FROM organisation_membership m
        CROSS JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a2
        WHERE m.user_id = NEW.user_id
          AND m.id <> NEW.id
          AND a2.organisation_id = a.organisation_id
      )
      ON CONFLICT (scope_type, scope_id, metric, dimension_key)
      DO UPDATE SET value = stat_current.value + EXCLUDED.value, updated_at = now();
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER organisation_membership_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON organisation_membership
FOR EACH ROW EXECUTE FUNCTION on_membership_change();
--> statement-breakpoint

-- --- user_content_progress trigger ---------------------------------------
-- coverage_pct = 100 * (competent count for user across requirement set) /
--                requirement set size for the user's current rank.
-- The "requirement set" a user is graded against = the active one(s) for
-- their current rank (v1 simplification: UNION across all active
-- requirement_set rows for that rank; see brief ambiguity resolution).
-- This trigger recomputes for the affected user when any of their progress
-- rows change.
--
-- NOTE: the brief's requirements referred to a `user_content_progress.
-- entity_id` column and a `rank_requirement` join table with a
-- `rank_requirement_id` FK on rank_requirement_technique/pattern. Neither
-- exists in the real schema:
--   - user_content_progress is polymorphic via technique_id/pattern_id
--     (see apps/backend/src/infrastructure/database/schema/
--     user-content-progress.ts) -> using COALESCE(technique_id, pattern_id).
--   - rank_requirement_technique/pattern carry rank_id + set_id directly
--     (see .../schema/grading-requirements.ts); there is no intermediate
--     rank_requirement table -> joining requirement_set directly on set_id.
CREATE OR REPLACE FUNCTION on_user_content_progress_change() RETURNS trigger AS $$
DECLARE
  v_user_id text := COALESCE(NEW.user_id, OLD.user_id);
  v_current_rank uuid;
  v_competent int;
  v_total int;
  v_pct numeric;
BEGIN
  SELECT rank_id INTO v_current_rank
  FROM rank_history
  WHERE user_id = v_user_id AND result = 'pass'
  ORDER BY date DESC, created_at DESC LIMIT 1;

  IF v_current_rank IS NULL THEN
    -- No current rank -> nothing to write; clear any stale row.
    DELETE FROM stat_current
    WHERE scope_type = 'user' AND scope_id = v_user_id AND metric = 'content_coverage_pct';
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Count distinct competent techniques + patterns for THIS user across
  -- the active requirement set(s) for their current rank.
  SELECT COUNT(DISTINCT COALESCE(p.technique_id, p.pattern_id)) INTO v_competent
  FROM user_content_progress p
  WHERE p.user_id = v_user_id AND p.status = 'competent';

  SELECT COUNT(DISTINCT req_id) INTO v_total
  FROM (
    SELECT rrt.technique_id AS req_id
    FROM rank_requirement_technique rrt
    JOIN requirement_set rs ON rs.id = rrt.set_id
    WHERE rrt.rank_id = v_current_rank AND rs.is_active = true
    UNION
    SELECT rrp.pattern_id AS req_id
    FROM rank_requirement_pattern rrp
    JOIN requirement_set rs ON rs.id = rrp.set_id
    WHERE rrp.rank_id = v_current_rank AND rs.is_active = true
  ) required;

  IF v_total = 0 THEN
    DELETE FROM stat_current
    WHERE scope_type = 'user' AND scope_id = v_user_id AND metric = 'content_coverage_pct';
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_pct := LEAST(100, (100.0 * v_competent) / v_total);

  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  VALUES ('user', v_user_id, 'content_coverage_pct', v_current_rank::text, v_pct, now())
  ON CONFLICT (scope_type, scope_id, metric, dimension_key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER user_content_progress_stats_aiud
AFTER INSERT OR UPDATE OR DELETE ON user_content_progress
FOR EACH ROW EXECUTE FUNCTION on_user_content_progress_change();
--> statement-breakpoint

-- --- rebuild_all ---------------------------------------------------------
-- Truncates stat_current and recomputes every real-time metric from source
-- tables. Idempotent, safe to call any time.
CREATE OR REPLACE FUNCTION rebuild_all() RETURNS void AS $$
BEGIN
  TRUNCATE stat_current;

  -- rank_count: platform
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'platform', '__platform__', 'rank_count', rh.rank_id::text, COUNT(*), now()
  FROM (
    SELECT DISTINCT ON (user_id) user_id, rank_id
    FROM rank_history WHERE result = 'pass'
    ORDER BY user_id, date DESC, created_at DESC
  ) rh
  GROUP BY rh.rank_id;

  -- rank_count: per organisation (with ancestor rollup, deduplicated by
  -- user: a user with two memberships whose ancestor chains share a node
  -- counts once at that shared ancestor, not once per membership).
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', pairs.organisation_id::text, 'rank_count', pairs.rank_id::text, COUNT(*), now()
  FROM (
    SELECT DISTINCT rh.user_id, rh.rank_id, a.organisation_id
    FROM (
      SELECT DISTINCT ON (user_id) user_id, rank_id
      FROM rank_history WHERE result = 'pass'
      ORDER BY user_id, date DESC, created_at DESC
    ) rh
    JOIN organisation_membership m ON m.user_id = rh.user_id
    JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
  ) pairs
  GROUP BY pairs.organisation_id, pairs.rank_id;

  -- membership_count: platform
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'platform', '__platform__', 'membership_count', role::text, COUNT(*), now()
  FROM organisation_membership GROUP BY role;

  -- membership_count: per organisation (ancestor rollup)
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'organisation', a.organisation_id::text, 'membership_count', m.role::text, COUNT(*), now()
  FROM organisation_membership m
  JOIN LATERAL statistics_org_and_ancestors(m.organisation_id) a ON true
  GROUP BY a.organisation_id, m.role;

  -- coverage_pct: per user with a current rank (mirrors the trigger's formula).
  -- Simple CTE version for the bootstrap.
  INSERT INTO stat_current (scope_type, scope_id, metric, dimension_key, value, updated_at)
  SELECT 'user', cur.user_id, 'content_coverage_pct', cur.rank_id::text,
         LEAST(100, (100.0 * cov.competent) / NULLIF(req.total, 0)), now()
  FROM (
    SELECT DISTINCT ON (user_id) user_id, rank_id
    FROM rank_history WHERE result = 'pass'
    ORDER BY user_id, date DESC, created_at DESC
  ) cur
  JOIN LATERAL (
    SELECT COUNT(DISTINCT COALESCE(technique_id, pattern_id)) AS competent
    FROM user_content_progress WHERE user_id = cur.user_id AND status = 'competent'
  ) cov ON true
  JOIN LATERAL (
    SELECT COUNT(DISTINCT req_id) AS total FROM (
      SELECT rrt.technique_id AS req_id
      FROM rank_requirement_technique rrt
      JOIN requirement_set rs ON rs.id = rrt.set_id
      WHERE rrt.rank_id = cur.rank_id AND rs.is_active = true
      UNION
      SELECT rrp.pattern_id AS req_id
      FROM rank_requirement_pattern rrp
      JOIN requirement_set rs ON rs.id = rrp.set_id
      WHERE rrp.rank_id = cur.rank_id AND rs.is_active = true
    ) x
  ) req ON true
  WHERE req.total > 0;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Bootstrap: populate everything from current source-table state.
SELECT rebuild_all();
