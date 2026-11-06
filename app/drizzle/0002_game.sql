CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"period" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spark_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spark_ledger_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "sparks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "equipped" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_spin_date" text;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_claims" ADD CONSTRAINT "quest_claims_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spark_ledger" ADD CONSTRAINT "spark_ledger_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_familiar_item_uq" ON "inventory" USING btree ("familiar_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_claims_uq" ON "quest_claims" USING btree ("familiar_id","quest_id","period");--> statement-breakpoint
CREATE INDEX "spark_ledger_familiar_idx" ON "spark_ledger" USING btree ("familiar_id");