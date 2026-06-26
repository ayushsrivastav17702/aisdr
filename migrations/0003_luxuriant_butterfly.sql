CREATE TABLE "target_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"domain" text NOT NULL,
	"name" text,
	"added_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "target_accounts_tenant_domain_uniq" ON "target_accounts" USING btree ("tenant_id","domain");