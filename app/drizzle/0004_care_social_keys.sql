CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_familiar_id" uuid NOT NULL,
	"to_familiar_id" uuid NOT NULL,
	"utc_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spotter_familiar_id" uuid NOT NULL,
	"spotted_familiar_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_visit_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_pet_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_snack_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_play_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_from_familiar_id_familiars_id_fk" FOREIGN KEY ("from_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_to_familiar_id_familiars_id_fk" FOREIGN KEY ("to_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_spotter_familiar_id_familiars_id_fk" FOREIGN KEY ("spotter_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_spotted_familiar_id_familiars_id_fk" FOREIGN KEY ("spotted_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_owner_idx" ON "api_keys" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "gifts_pair_day_uq" ON "gifts" USING btree ("from_familiar_id","to_familiar_id","utc_date");--> statement-breakpoint
CREATE INDEX "gifts_to_idx" ON "gifts" USING btree ("to_familiar_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sightings_pair_uq" ON "sightings" USING btree ("spotter_familiar_id","spotted_familiar_id");--> statement-breakpoint
CREATE INDEX "sightings_spotted_idx" ON "sightings" USING btree ("spotted_familiar_id");--> statement-breakpoint
CREATE INDEX "familiars_last_visit_idx" ON "familiars" USING btree ("last_visit_at");--> statement-breakpoint
-- Care meters fall back to the last visit: backfill it from completed visits.
UPDATE "familiars" f
SET "last_visit_at" = v."at"
FROM (
  SELECT "familiar_id", max("created_at") AS "at"
  FROM "visits"
  WHERE "status" IN ('chain_pending', 'complete')
  GROUP BY "familiar_id"
) v
WHERE v."familiar_id" = f."id" AND f."last_visit_at" IS NULL;
