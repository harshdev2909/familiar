-- Credit Familiars that existed before Sparks: the welcome gift plus each night already lived.
-- Idempotent via the unique ledger ref.
INSERT INTO "spark_ledger" ("familiar_id", "delta", "reason", "ref")
SELECT "id", 50 + 10 * "day", 'backfill', 'backfill:' || "id"
FROM "familiars"
ON CONFLICT ("ref") DO NOTHING;
--> statement-breakpoint
UPDATE "familiars" f
SET "sparks" = f."sparks" + (50 + 10 * f."day"),
    "xp" = f."xp" + (20 + 20 * f."day")
WHERE EXISTS (SELECT 1 FROM "spark_ledger" l WHERE l."ref" = 'backfill:' || f."id")
  AND f."xp" = 0;
