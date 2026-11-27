BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "age_status" text DEFAULT 'UNVERIFIED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "date_of_birth" date,
  ADD COLUMN IF NOT EXISTS "age_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "terms_version_accepted" text,
  ADD COLUMN IF NOT EXISTS "kyc_status" text DEFAULT 'NOT_STARTED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_level" text DEFAULT '0' NOT NULL,
  ADD COLUMN IF NOT EXISTS "kyc_provider_ref" text,
  ADD COLUMN IF NOT EXISTS "kyc_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "kyc_expires_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "country_at_signup" text,
  ADD COLUMN IF NOT EXISTS "sanctions_status" text DEFAULT 'NOT_SCREENED' NOT NULL,
  ADD COLUMN IF NOT EXISTS "referrer_user_id" integer,
  ADD COLUMN IF NOT EXISTS "lifetime_withdrawn_usd" numeric(12, 2) DEFAULT '0' NOT NULL;

CREATE TABLE IF NOT EXISTS "kyc_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "reviewer_operator_id" integer,
  "decision" text NOT NULL,
  "reason" text,
  "evidence_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "jurisdiction_checks" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "request_id" text,
  "country" text,
  "source" text DEFAULT 'TRUSTED_HEADER' NOT NULL,
  "trusted_header_signature" text,
  "decision" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "kyc_reviews_user_decision_created_unique" ON "kyc_reviews" ("user_id", "decision", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_checks_request_country_unique" ON "jurisdiction_checks" ("request_id", "country");

COMMIT;
