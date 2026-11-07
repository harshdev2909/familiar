CREATE TABLE "diaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"familiar_id" uuid NOT NULL,
	"week" text NOT NULL,
	"text" text NOT NULL,
	"mood_line" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_familiar_id" uuid NOT NULL,
	"to_familiar_id" uuid NOT NULL,
	"give_item" text NOT NULL,
	"want_item" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "walk_members" (
	"walk_id" uuid NOT NULL,
	"familiar_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "walk_members_pk" PRIMARY KEY("walk_id","familiar_id")
);
--> statement-breakpoint
CREATE TABLE "walks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_familiar_id" uuid NOT NULL,
	"status" text DEFAULT 'gathering' NOT NULL,
	"image_url" text,
	"utc_date" text NOT NULL,
	"started_at" timestamp with time zone,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "familiars" ADD COLUMN "last_need_push_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "in_person" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "met_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_from_familiar_id_familiars_id_fk" FOREIGN KEY ("from_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_to_familiar_id_familiars_id_fk" FOREIGN KEY ("to_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_members" ADD CONSTRAINT "walk_members_walk_id_walks_id_fk" FOREIGN KEY ("walk_id") REFERENCES "public"."walks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walk_members" ADD CONSTRAINT "walk_members_familiar_id_familiars_id_fk" FOREIGN KEY ("familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_host_familiar_id_familiars_id_fk" FOREIGN KEY ("host_familiar_id") REFERENCES "public"."familiars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diaries_familiar_week_uq" ON "diaries" USING btree ("familiar_id","week");--> statement-breakpoint
CREATE INDEX "push_subscriptions_owner_idx" ON "push_subscriptions" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "trades_from_idx" ON "trades" USING btree ("from_familiar_id","status");--> statement-breakpoint
CREATE INDEX "trades_to_idx" ON "trades" USING btree ("to_familiar_id","status");--> statement-breakpoint
CREATE INDEX "walk_members_familiar_idx" ON "walk_members" USING btree ("familiar_id");--> statement-breakpoint
CREATE INDEX "walks_host_day_idx" ON "walks" USING btree ("host_familiar_id","utc_date");--> statement-breakpoint
CREATE INDEX "walks_status_idx" ON "walks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "walks_day_idx" ON "walks" USING btree ("utc_date");