CREATE TABLE "pending_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"params" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_via" text NOT NULL,
	"result_entity_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "origin" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_operation" ADD CONSTRAINT "pending_operation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_operation_creator_status_idx" ON "pending_operation" USING btree ("created_by_user_id","status","created_at");