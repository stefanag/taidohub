CREATE TYPE "public"."feedback_entity_type" AS ENUM('grading', 'session', 'technique', 'pattern', 'general');--> statement-breakpoint
CREATE TYPE "public"."feedback_reaction_type" AS ENUM('thumbs_up', 'heart', 'pray', 'strong', 'fire', 'noted', 'thank_you', 'will_work_on_it');--> statement-breakpoint
CREATE TABLE "feedback_comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" uuid,
	"body" text NOT NULL,
	"instructor_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_reaction" (
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"reaction" "feedback_reaction_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_reaction_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_read_status" (
	"thread_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_read_status_thread_id_user_id_pk" PRIMARY KEY("thread_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "feedback_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"student_id" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback_comment" ADD CONSTRAINT "feedback_comment_thread_id_feedback_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."feedback_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_comment" ADD CONSTRAINT "feedback_comment_parent_id_feedback_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."feedback_comment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reaction" ADD CONSTRAINT "feedback_reaction_comment_id_feedback_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."feedback_comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_reaction" ADD CONSTRAINT "feedback_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_read_status" ADD CONSTRAINT "feedback_read_status_thread_id_feedback_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."feedback_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_read_status" ADD CONSTRAINT "feedback_read_status_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_thread" ADD CONSTRAINT "feedback_thread_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_thread" ADD CONSTRAINT "feedback_thread_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_comment_thread_id_idx" ON "feedback_comment" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "feedback_comment_parent_id_idx" ON "feedback_comment" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "feedback_comment_author_id_idx" ON "feedback_comment" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "feedback_comment_created_at_idx" ON "feedback_comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_reaction_comment_id_idx" ON "feedback_reaction" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_thread_entity_student_unique" ON "feedback_thread" USING btree ("entity_type","entity_id","student_id");--> statement-breakpoint
CREATE INDEX "feedback_thread_student_id_idx" ON "feedback_thread" USING btree ("student_id");