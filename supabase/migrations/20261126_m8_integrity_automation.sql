BEGIN;

CREATE TABLE IF NOT EXISTS "integrity_proofs" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "subject_id" text,
  "algorithm_version" text DEFAULT 'PROOF-v1' NOT NULL,
  "hash" text NOT NULL,
  "signature" text,
  "result" text NOT NULL,
  "blocked_reason" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integrity_proofs_result_valid" CHECK ("result" IN ('PASS', 'FAIL'))
);

CREATE TABLE IF NOT EXISTS "automation_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "trigger" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "lease_until" timestamp with time zone,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "steps_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "operator_id" integer,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automation_jobs_trigger_valid" CHECK ("trigger" IN ('CRON', 'ADMIN', 'SYSTEM'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "automation_jobs_idempotency_unique" ON "automation_jobs" ("idempotency_key");

COMMIT;
