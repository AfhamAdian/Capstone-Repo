


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."tool_category_type" AS ENUM (
    'version_control',
    'project_management',
    'ci_cd',
    'code_quality'
);


ALTER TYPE "public"."tool_category_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_survey_response"("p_survey_id" integer, "p_submission_key" "uuid", "p_answers" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  response_id integer;
BEGIN
  SELECT id INTO response_id
  FROM public.survey_response
  WHERE survey_id = p_survey_id
    AND submission_key = p_submission_key;
  IF response_id IS NOT NULL THEN
    RETURN response_id;
  END IF;

  PERFORM 1
  FROM public.survey
  WHERE id = p_survey_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'survey is not accepting responses';
  END IF;

  INSERT INTO public.survey_response (survey_id, submission_key, answers)
  VALUES (p_survey_id, p_submission_key, COALESCE(p_answers, '[]'::jsonb))
  ON CONFLICT (survey_id, submission_key) DO NOTHING
  RETURNING id INTO response_id;

  IF response_id IS NULL THEN
    SELECT id INTO response_id
    FROM public.survey_response
    WHERE survey_id = p_survey_id
      AND submission_key = p_submission_key;
  END IF;

  RETURN response_id;
END;
$$;


ALTER FUNCTION "public"."submit_survey_response"("p_survey_id" integer, "p_submission_key" "uuid", "p_answers" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."User" (
    "id" integer NOT NULL,
    "company_id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "password_hash" "text" NOT NULL,
    "created_at" timestamp without time zone,
    "discord_user_id" character varying,
    "role" character varying(50) DEFAULT 'member'::character varying NOT NULL,
    CONSTRAINT "User_role_check" CHECK ((("role")::"text" = ANY ((ARRAY['admin'::character varying, 'member'::character varying])::"text"[])))
);


ALTER TABLE "public"."User" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."User_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."User_id_seq" OWNED BY "public"."User"."id";



CREATE TABLE IF NOT EXISTS "public"."actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_ids" "text"[] NOT NULL,
    "problem" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "action_taken" "text" NOT NULL,
    "action_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "effectiveness" integer,
    "logged_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "actions_effectiveness_check" CHECK ((("effectiveness" >= 1) AND ("effectiveness" <= 5)))
);


ALTER TABLE "public"."actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cicdmetrics" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "pipeline_success_rate_percent" numeric,
    "avg_pipeline_duration_minutes" numeric,
    "flaky_test_count" integer,
    "test_coverage_percent" numeric,
    "test_failure_rate_percent" numeric,
    "avg_pipeline_runs_per_pr" numeric,
    "deployments_per_week" numeric,
    "deployment_failure_rate_percent" numeric,
    "mttr_hours" numeric,
    "time_to_prod_hours" numeric
);


ALTER TABLE "public"."cicdmetrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cicdmetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cicdmetrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cicdmetrics_id_seq" OWNED BY "public"."cicdmetrics"."id";



CREATE TABLE IF NOT EXISTS "public"."codeownershipconcentration" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "path" "text" NOT NULL,
    "top_contributor_percent" numeric(5,2),
    "is_flagged" boolean
);


ALTER TABLE "public"."codeownershipconcentration" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."codeownershipconcentration_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."codeownershipconcentration_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."codeownershipconcentration_id_seq" OWNED BY "public"."codeownershipconcentration"."id";



CREATE TABLE IF NOT EXISTS "public"."codequalitymetrics" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "technical_debt_ratio" numeric,
    "technical_debt_minutes" numeric,
    "maintainability_rating" numeric,
    "code_smells" integer,
    "duplicated_lines_density" numeric,
    "bugs" integer,
    "reliability_rating" numeric,
    "vulnerabilities" integer,
    "security_rating" numeric,
    "critical_vulnerabilities" integer,
    "high_vulnerabilities" integer,
    "coverage" numeric,
    "lines_of_code" integer,
    "quality_gate_status" character varying,
    "new_bugs" integer,
    "new_vulnerabilities" integer,
    "new_code_smells" integer,
    "new_coverage" numeric,
    "new_duplicated_lines_density" numeric,
    "new_technical_debt" numeric
);


ALTER TABLE "public"."codequalitymetrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."codequalitymetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."codequalitymetrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."codequalitymetrics_id_seq" OWNED BY "public"."codequalitymetrics"."id";



CREATE TABLE IF NOT EXISTS "public"."company" (
    "id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."company" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."company_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."company_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."company_id_seq" OWNED BY "public"."company"."id";



CREATE TABLE IF NOT EXISTS "public"."leadtimetrend" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "sprint_name" character varying(255),
    "avg_lead_time_days" numeric(10,2)
);


ALTER TABLE "public"."leadtimetrend" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."leadtimetrend_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."leadtimetrend_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."leadtimetrend_id_seq" OWNED BY "public"."leadtimetrend"."id";



CREATE TABLE IF NOT EXISTS "public"."metricweight" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "metric_name" character varying(100) NOT NULL,
    "weight" numeric(5,4) NOT NULL,
    "updated_at" timestamp without time zone
);


ALTER TABLE "public"."metricweight" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."metricweight_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."metricweight_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."metricweight_id_seq" OWNED BY "public"."metricweight"."id";



CREATE TABLE IF NOT EXISTS "public"."project" (
    "id" integer NOT NULL,
    "company_id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "description" "text",
    "created_at" timestamp without time zone,
    "owner" character varying(255),
    "repo" character varying(255),
    "JIRA_TOKEN" "text",
    "JIRA_EMAIL" "text",
    "JIRA_BASE_URL" "text",
    "JIRA_PROJECT_KEY" "text",
    "JIRA_BOARD_ID" "text",
    "GITHUB_TOKEN" "text",
    "sonar_token" "text",
    "sonar_organization" "text",
    "sonar_project_key" "text",
    "sonar_base_url" "text",
    "pending_survey" boolean DEFAULT false NOT NULL,
    "pending_survey_trigger" character varying
);


ALTER TABLE "public"."project" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."project_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."project_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."project_id_seq" OWNED BY "public"."project"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."projecthealthscore_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projecthealthscore_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projecthealthscore" (
    "id" integer DEFAULT "nextval"('"public"."projecthealthscore_id_seq"'::"regclass") NOT NULL,
    "project_id" integer NOT NULL,
    "project_snapshot_id" integer,
    "survey_id" integer,
    "delivery_score" numeric,
    "code_quality_score" numeric,
    "cicd_score" numeric,
    "team_health_score" numeric,
    "blockers_score" numeric,
    "overall_score" numeric,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."projecthealthscore" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projectmanagementmetrics" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "sprint_completion_rate" numeric(5,2),
    "issue_cycle_time_avg_days" numeric(10,2),
    "throughput_per_week" integer,
    "carryover_rate" numeric(5,2),
    "scope_creep_rate" numeric(5,2),
    "estimation_accuracy" numeric(5,2),
    "blocked_items_count" integer,
    "blocked_items_avg_age_days" numeric(10,2),
    "overdue_items_count" integer,
    "lead_time_avg_days" numeric(10,2),
    "lead_time_median_days" numeric(10,2),
    "lead_time_p95_days" numeric(10,2),
    "lead_time_variance" numeric(10,2),
    "spillover_ratio" numeric(5,2),
    "story_point_spillover" numeric(10,2),
    "consecutive_spillover_count" integer,
    "carryover_avg_age_days" numeric(10,2),
    "blocked_ticket_percent" numeric(5,2),
    "avg_blocked_duration_days" numeric(10,2),
    "max_blocked_duration_days" numeric(10,2),
    "blocked_reentry_count" integer,
    "mid_sprint_additions" integer,
    "scope_churn_ratio" numeric(5,2),
    "priority_change_count" integer,
    "removed_scope_ratio" numeric(5,2),
    "in_progress_avg_age_days" numeric(10,2),
    "stale_ticket_ratio" numeric(5,2),
    "state_movement_count" integer,
    "health_score" numeric(5,2)
);


ALTER TABLE "public"."projectmanagementmetrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projectmanagementmetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projectmanagementmetrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projectmanagementmetrics_id_seq" OWNED BY "public"."projectmanagementmetrics"."id";



CREATE TABLE IF NOT EXISTS "public"."projectmember" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "role" character varying(50) NOT NULL,
    "joined_at" timestamp without time zone
);


ALTER TABLE "public"."projectmember" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projectmember_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projectmember_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projectmember_id_seq" OWNED BY "public"."projectmember"."id";



CREATE TABLE IF NOT EXISTS "public"."projectsnapshot" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "snapshot_time" timestamp without time zone NOT NULL,
    "created_at" timestamp without time zone
);


ALTER TABLE "public"."projectsnapshot" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projectsnapshot_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projectsnapshot_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projectsnapshot_id_seq" OWNED BY "public"."projectsnapshot"."id";



CREATE TABLE IF NOT EXISTS "public"."projecttoolintegration" (
    "id" integer NOT NULL,
    "project_id" integer NOT NULL,
    "tool_category" character varying(50) NOT NULL,
    "tool_name" character varying(100) NOT NULL,
    "external_project_id" character varying(255) NOT NULL,
    "last_synced_at" timestamp without time zone,
    "is_active" boolean,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."projecttoolintegration" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."projecttoolintegration_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."projecttoolintegration_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."projecttoolintegration_id_seq" OWNED BY "public"."projecttoolintegration"."id";



CREATE TABLE IF NOT EXISTS "public"."riskscore" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "project_snapshot_id" integer NOT NULL,
    "cicd_reliability_score" double precision,
    "code_qaulity_score" double precision,
    "delivery_score" double precision,
    "engineering_process_score" double precision,
    "security_risk_score" double precision,
    "team_health_score" double precision,
    "blockers_score" double precision
);


ALTER TABLE "public"."riskscore" OWNER TO "postgres";


COMMENT ON TABLE "public"."riskscore" IS 'riskscore of each project snapshot';



ALTER TABLE "public"."riskscore" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."riskscore_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."survey_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."survey_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey" (
    "id" integer DEFAULT "nextval"('"public"."survey_id_seq"'::"regclass") NOT NULL,
    "project_id" integer NOT NULL,
    "status" character varying DEFAULT 'draft'::character varying NOT NULL,
    "source" character varying NOT NULL,
    "trigger" character varying NOT NULL,
    "custom_guidance" "text",
    "target_count" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "period_month" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_send_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "close_reason" character varying,
    "analysis_error" "text",
    "health_context" "jsonb",
    "questions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cycle_id" character varying,
    "expires_at" timestamp with time zone,
    "notified_at" timestamp with time zone,
    "delivery" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "insight" "jsonb",
    CONSTRAINT "survey_questions_array_check" CHECK (("jsonb_typeof"("questions") = 'array'::"text")),
    CONSTRAINT "survey_source_check" CHECK ((("source")::"text" = ANY ((ARRAY['manual'::character varying, 'auto_pulse'::character varying])::"text"[]))),
    CONSTRAINT "survey_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'paused'::character varying, 'closed'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'failed'::character varying])::"text"[])))
);


ALTER TABLE "public"."survey" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."survey_response_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."survey_response_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_response" (
    "id" integer DEFAULT "nextval"('"public"."survey_response_id_seq"'::"regclass") NOT NULL,
    "survey_id" integer NOT NULL,
    "submission_key" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "survey_response_answers_array_check" CHECK (("jsonb_typeof"("answers") = 'array'::"text"))
);


ALTER TABLE "public"."survey_response" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."versioncontrolmetrics" (
    "id" integer NOT NULL,
    "snapshot_id" integer NOT NULL,
    "issues_closed_per_week" integer,
    "issue_cycle_time_avg_days" numeric(10,2),
    "pr_review_coverage_percent" numeric(5,2),
    "review_per_pr_avg" numeric(10,2),
    "self_merged_pr_rate_percent" numeric(5,2),
    "time_to_first_review_avg_hours" numeric(10,2),
    "files_modified_gte_10_times" integer,
    "files_modified_by_gte_3_people" integer,
    "commit_with_issue_ref_percent" numeric(5,2),
    "commit_with_body_percent" numeric(5,2),
    "commit_following_convention_percent" numeric(5,2),
    "stale_pr_count" integer,
    "long_lived_branches_count" integer,
    "pr_revert_rate_percent" numeric(5,2),
    "bus_factor" integer,
    "active_contributions_per_week" integer,
    "review_network_density" numeric(10,4),
    "dependency_update_lag_avg_days" numeric(10,2),
    "health_score" numeric(5,2)
);


ALTER TABLE "public"."versioncontrolmetrics" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."versioncontrolmetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."versioncontrolmetrics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."versioncontrolmetrics_id_seq" OWNED BY "public"."versioncontrolmetrics"."id";



ALTER TABLE ONLY "public"."User" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."User_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cicdmetrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cicdmetrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."codeownershipconcentration" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."codeownershipconcentration_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."codequalitymetrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."codequalitymetrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."company" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."company_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."leadtimetrend" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."leadtimetrend_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."metricweight" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."metricweight_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."project_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projectmanagementmetrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projectmanagementmetrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projectmember" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projectmember_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projectsnapshot" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projectsnapshot_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."projecttoolintegration" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."projecttoolintegration_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."versioncontrolmetrics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."versioncontrolmetrics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actions"
    ADD CONSTRAINT "actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cicdmetrics"
    ADD CONSTRAINT "cicdmetrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cicdmetrics"
    ADD CONSTRAINT "cicdmetrics_snapshot_id_key" UNIQUE ("snapshot_id");



ALTER TABLE ONLY "public"."codeownershipconcentration"
    ADD CONSTRAINT "codeownershipconcentration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."codequalitymetrics"
    ADD CONSTRAINT "codequalitymetrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."codequalitymetrics"
    ADD CONSTRAINT "codequalitymetrics_snapshot_id_key" UNIQUE ("snapshot_id");



ALTER TABLE ONLY "public"."company"
    ADD CONSTRAINT "company_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leadtimetrend"
    ADD CONSTRAINT "leadtimetrend_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metricweight"
    ADD CONSTRAINT "metricweight_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."metricweight"
    ADD CONSTRAINT "metricweight_project_id_metric_name_key" UNIQUE ("project_id", "metric_name");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "project_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projecthealthscore"
    ADD CONSTRAINT "projecthealthscore_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projectmanagementmetrics"
    ADD CONSTRAINT "projectmanagementmetrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projectmanagementmetrics"
    ADD CONSTRAINT "projectmanagementmetrics_snapshot_id_key" UNIQUE ("snapshot_id");



ALTER TABLE ONLY "public"."projectmember"
    ADD CONSTRAINT "projectmember_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projectmember"
    ADD CONSTRAINT "projectmember_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."projectsnapshot"
    ADD CONSTRAINT "projectsnapshot_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projecttoolintegration"
    ADD CONSTRAINT "projecttoolintegration_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projecttoolintegration"
    ADD CONSTRAINT "projecttoolintegration_project_tool_uniq" UNIQUE ("project_id", "tool_name");



ALTER TABLE ONLY "public"."riskscore"
    ADD CONSTRAINT "riskscore_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."riskscore"
    ADD CONSTRAINT "riskscore_project_snapshot_id_key" UNIQUE ("project_snapshot_id");



ALTER TABLE ONLY "public"."survey"
    ADD CONSTRAINT "survey_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_response"
    ADD CONSTRAINT "survey_response_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_response"
    ADD CONSTRAINT "survey_response_survey_submission_unique" UNIQUE ("survey_id", "submission_key");



ALTER TABLE ONLY "public"."versioncontrolmetrics"
    ADD CONSTRAINT "versioncontrolmetrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."versioncontrolmetrics"
    ADD CONSTRAINT "versioncontrolmetrics_snapshot_id_key" UNIQUE ("snapshot_id");



CREATE INDEX "idx_actions_action_date" ON "public"."actions" USING "btree" ("action_date" DESC);



CREATE INDEX "idx_actions_pending" ON "public"."actions" USING "btree" ("effectiveness") WHERE ("effectiveness" IS NULL);



CREATE INDEX "idx_actions_project_ids" ON "public"."actions" USING "gin" ("project_ids");



CREATE INDEX "idx_project_snapshot" ON "public"."projectsnapshot" USING "btree" ("project_id", "snapshot_time");



CREATE INDEX "idx_snapshot_project_time" ON "public"."projectsnapshot" USING "btree" ("project_id", "snapshot_time" DESC);



CREATE INDEX "projecthealthscore_project_id_idx" ON "public"."projecthealthscore" USING "btree" ("project_id", "computed_at" DESC);



CREATE UNIQUE INDEX "survey_auto_month_idx" ON "public"."survey" USING "btree" ("project_id", "period_month") WHERE (("source")::"text" = 'auto_pulse'::"text");



CREATE UNIQUE INDEX "survey_auto_pulse_period_idx" ON "public"."survey" USING "btree" ("project_id", "period_month") WHERE ((("source")::"text" = 'auto_pulse'::"text") AND ("period_month" IS NOT NULL));



CREATE UNIQUE INDEX "survey_cycle_id_idx" ON "public"."survey" USING "btree" ("cycle_id") WHERE ("cycle_id" IS NOT NULL);



CREATE INDEX "survey_project_id_idx" ON "public"."survey" USING "btree" ("project_id");



CREATE INDEX "survey_response_survey_id_idx" ON "public"."survey_response" USING "btree" ("survey_id");



CREATE INDEX "survey_source_period_idx" ON "public"."survey" USING "btree" ("project_id", "source", "period_month");



ALTER TABLE ONLY "public"."User"
    ADD CONSTRAINT "User_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."cicdmetrics"
    ADD CONSTRAINT "cicdmetrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."codeownershipconcentration"
    ADD CONSTRAINT "codeownershipconcentration_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."codequalitymetrics"
    ADD CONSTRAINT "codequalitymetrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."leadtimetrend"
    ADD CONSTRAINT "leadtimetrend_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."metricweight"
    ADD CONSTRAINT "metricweight_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."project"
    ADD CONSTRAINT "project_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id");



ALTER TABLE ONLY "public"."projecthealthscore"
    ADD CONSTRAINT "projecthealthscore_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."projecthealthscore"
    ADD CONSTRAINT "projecthealthscore_snapshot_id_fkey" FOREIGN KEY ("project_snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."projecthealthscore"
    ADD CONSTRAINT "projecthealthscore_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."projectmanagementmetrics"
    ADD CONSTRAINT "projectmanagementmetrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE ONLY "public"."projectmember"
    ADD CONSTRAINT "projectmember_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."projectmember"
    ADD CONSTRAINT "projectmember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id");



ALTER TABLE ONLY "public"."projectsnapshot"
    ADD CONSTRAINT "projectsnapshot_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."projecttoolintegration"
    ADD CONSTRAINT "projecttoolintegration_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."riskscore"
    ADD CONSTRAINT "riskscore_project_snapshot_id_fkey" FOREIGN KEY ("project_snapshot_id") REFERENCES "public"."projectsnapshot"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."survey"
    ADD CONSTRAINT "survey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."survey_response"
    ADD CONSTRAINT "survey_response_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."versioncontrolmetrics"
    ADD CONSTRAINT "versioncontrolmetrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE "public"."cicdmetrics" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_survey_response"("p_survey_id" integer, "p_submission_key" "uuid", "p_answers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_survey_response"("p_survey_id" integer, "p_submission_key" "uuid", "p_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_survey_response"("p_survey_id" integer, "p_submission_key" "uuid", "p_answers" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."User" TO "anon";
GRANT ALL ON TABLE "public"."User" TO "authenticated";
GRANT ALL ON TABLE "public"."User" TO "service_role";



GRANT ALL ON SEQUENCE "public"."User_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."User_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."User_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."actions" TO "anon";
GRANT ALL ON TABLE "public"."actions" TO "authenticated";
GRANT ALL ON TABLE "public"."actions" TO "service_role";



GRANT ALL ON TABLE "public"."cicdmetrics" TO "anon";
GRANT ALL ON TABLE "public"."cicdmetrics" TO "authenticated";
GRANT ALL ON TABLE "public"."cicdmetrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cicdmetrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cicdmetrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cicdmetrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."codeownershipconcentration" TO "anon";
GRANT ALL ON TABLE "public"."codeownershipconcentration" TO "authenticated";
GRANT ALL ON TABLE "public"."codeownershipconcentration" TO "service_role";



GRANT ALL ON SEQUENCE "public"."codeownershipconcentration_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."codeownershipconcentration_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."codeownershipconcentration_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."codequalitymetrics" TO "anon";
GRANT ALL ON TABLE "public"."codequalitymetrics" TO "authenticated";
GRANT ALL ON TABLE "public"."codequalitymetrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."codequalitymetrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."codequalitymetrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."codequalitymetrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."company" TO "anon";
GRANT ALL ON TABLE "public"."company" TO "authenticated";
GRANT ALL ON TABLE "public"."company" TO "service_role";



GRANT ALL ON SEQUENCE "public"."company_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."company_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."company_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."leadtimetrend" TO "anon";
GRANT ALL ON TABLE "public"."leadtimetrend" TO "authenticated";
GRANT ALL ON TABLE "public"."leadtimetrend" TO "service_role";



GRANT ALL ON SEQUENCE "public"."leadtimetrend_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leadtimetrend_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leadtimetrend_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."metricweight" TO "anon";
GRANT ALL ON TABLE "public"."metricweight" TO "authenticated";
GRANT ALL ON TABLE "public"."metricweight" TO "service_role";



GRANT ALL ON SEQUENCE "public"."metricweight_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."metricweight_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."metricweight_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."project" TO "anon";
GRANT ALL ON TABLE "public"."project" TO "authenticated";
GRANT ALL ON TABLE "public"."project" TO "service_role";



GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."project_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projecthealthscore_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projecthealthscore_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projecthealthscore_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."projecthealthscore" TO "anon";
GRANT ALL ON TABLE "public"."projecthealthscore" TO "authenticated";
GRANT ALL ON TABLE "public"."projecthealthscore" TO "service_role";



GRANT ALL ON TABLE "public"."projectmanagementmetrics" TO "anon";
GRANT ALL ON TABLE "public"."projectmanagementmetrics" TO "authenticated";
GRANT ALL ON TABLE "public"."projectmanagementmetrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projectmanagementmetrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projectmanagementmetrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projectmanagementmetrics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."projectmember" TO "anon";
GRANT ALL ON TABLE "public"."projectmember" TO "authenticated";
GRANT ALL ON TABLE "public"."projectmember" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projectmember_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projectmember_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projectmember_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."projectsnapshot" TO "anon";
GRANT ALL ON TABLE "public"."projectsnapshot" TO "authenticated";
GRANT ALL ON TABLE "public"."projectsnapshot" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projectsnapshot_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projectsnapshot_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projectsnapshot_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."projecttoolintegration" TO "anon";
GRANT ALL ON TABLE "public"."projecttoolintegration" TO "authenticated";
GRANT ALL ON TABLE "public"."projecttoolintegration" TO "service_role";



GRANT ALL ON SEQUENCE "public"."projecttoolintegration_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."projecttoolintegration_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."projecttoolintegration_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."riskscore" TO "anon";
GRANT ALL ON TABLE "public"."riskscore" TO "authenticated";
GRANT ALL ON TABLE "public"."riskscore" TO "service_role";



GRANT ALL ON SEQUENCE "public"."riskscore_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."riskscore_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."riskscore_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."survey_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."survey_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."survey_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."survey" TO "anon";
GRANT ALL ON TABLE "public"."survey" TO "authenticated";
GRANT ALL ON TABLE "public"."survey" TO "service_role";



GRANT ALL ON SEQUENCE "public"."survey_response_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."survey_response_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."survey_response_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."survey_response" TO "anon";
GRANT ALL ON TABLE "public"."survey_response" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_response" TO "service_role";



GRANT ALL ON TABLE "public"."versioncontrolmetrics" TO "anon";
GRANT ALL ON TABLE "public"."versioncontrolmetrics" TO "authenticated";
GRANT ALL ON TABLE "public"."versioncontrolmetrics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."versioncontrolmetrics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."versioncontrolmetrics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."versioncontrolmetrics_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







