CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "familiars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"ens_node" text NOT NULL,
	"owner" text NOT NULL,
	"species" text NOT NULL,
	"color" text NOT NULL,
	"style_seed" text NOT NULL,
	"day" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"resolver" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mood" text,
	"portrait_url" text,
	"last_visit_date" text,
	"memory_ciphertext" text,
	"memory_root" text,
	"hatch_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "familiars_label_unique" UNIQUE("label"),
	CONSTRAINT "familiars_ens_node_unique" UNIQUE("ens_node")
);
--> statement-breakpoint
CREATE TABLE "feed_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"swapper" text NOT NULL,
	"quote" jsonb NOT NULL,
	"feed_amount" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"feeder" text NOT NULL,
	"amount" text NOT NULL,
	"visits_credited" integer NOT NULL,
	"visits_used" integer DEFAULT 0 NOT NULL,
	"block_number" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"step" text NOT NULL,
	"model" text NOT NULL,
	"request_id" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost" text,
	"provider" text,
	"tee_verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" text PRIMARY KEY NOT NULL,
	"privy_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_privy_user_id_unique" UNIQUE("privy_user_id")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"utc_date" text NOT NULL,
	"kind" text NOT NULL,
	"paid_by" text NOT NULL,
	"feed_id" uuid,
	"status" text NOT NULL,
	"transcript_hash" text,
	"mood" text,
	"reply" text,
	"image_url" text,
	"image_hash" text,
	"video_url" text,
	"video_job_id" text,
	"video_status" text DEFAULT 'none' NOT NULL,
	"memory_root" text,
	"request_ids_hash" text,
	"renew_tx" text,
	"records_tx" text,
	"log_tx" text,
	"chain_attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "familiars" ADD CONSTRAINT "familiars_owner_users_address_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_quotes" ADD CONSTRAINT "feed_quotes_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "familiars_owner_uq" ON "familiars" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "feeds_tx_log_uq" ON "feeds" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "feeds_familiar_idx" ON "feeds" USING btree ("familiar_id");--> statement-breakpoint
CREATE INDEX "receipts_visit_idx" ON "receipts" USING btree ("visit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_familiar_day_uq" ON "visits" USING btree ("familiar_id","day");--> statement-breakpoint
CREATE INDEX "visits_status_idx" ON "visits" USING btree ("status");