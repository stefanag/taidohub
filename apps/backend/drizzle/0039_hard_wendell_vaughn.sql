CREATE TABLE "training_goal" (
	"user_id" text PRIMARY KEY NOT NULL,
	"target_rank_id" uuid,
	"target_date" date,
	"sessions_per_week" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_session_item" (
	"session_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	CONSTRAINT "training_session_item_session_id_content_type_content_id_pk" PRIMARY KEY("session_id","content_type","content_id")
);
--> statement-breakpoint
CREATE TABLE "training_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"duration_minutes" integer,
	"kind" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_goal" ADD CONSTRAINT "training_goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_goal" ADD CONSTRAINT "training_goal_target_rank_id_belt_ranks_id_fk" FOREIGN KEY ("target_rank_id") REFERENCES "public"."belt_ranks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_item" ADD CONSTRAINT "training_session_item_session_id_training_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_session_user_date_idx" ON "training_session" USING btree ("user_id","date");