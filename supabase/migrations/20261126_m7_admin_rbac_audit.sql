BEGIN;

CREATE TABLE IF NOT EXISTS "admin_operators" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" text NOT NULL,
  "display_name" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "credential_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_operators_username_unique" ON "admin_operators" ("username");

CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer NOT NULL,
  "token_hash" text NOT NULL,
  "role_snapshot" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token_hash_unique" ON "admin_sessions" ("token_hash");

CREATE TABLE IF NOT EXISTS "admin_permissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  "resource" text NOT NULL,
  "action" text NOT NULL,
  "allowed" boolean DEFAULT false NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_permissions_role_resource_action_unique" ON "admin_permissions" ("role", "resource", "action");

CREATE TABLE IF NOT EXISTS "admin_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "operator_id" integer,
  "role_snapshot" text,
  "request_id" text,
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "before_hash" text,
  "event_hash" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "admin_audit_events_event_hash_unique" ON "admin_audit_events" ("event_hash");

COMMIT;
