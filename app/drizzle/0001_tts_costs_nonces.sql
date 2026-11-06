CREATE TABLE "tx_nonces" (
	"key" text PRIMARY KEY NOT NULL,
	"nonce" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "cost_currency" text;--> statement-breakpoint
ALTER TABLE "visits" ADD COLUMN "reply_audio_url" text;