ALTER TABLE "user_content_progress" DROP COLUMN "notes";
--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD COLUMN "student_notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_content_progress" ADD COLUMN "instructor_notes" text DEFAULT '' NOT NULL;
