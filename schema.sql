


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."User" (
    "id" integer NOT NULL,
    "company_id" integer NOT NULL,
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "password_hash" "text" NOT NULL,
    "created_at" timestamp without time zone,
    "discord_user_id" character varying
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
    "joined_at" timestamp without time zone,
    "last_survey_sent_at" timestamp with time zone
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
    "is_active" boolean
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
    "status" character varying DEFAULT 'sent'::character varying NOT NULL,
    "source" character varying NOT NULL,
    "trigger" character varying NOT NULL,
    "custom_guidance" "text",
    "target_count" integer DEFAULT 0 NOT NULL,
    "response_count" integer DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "period_month" "date",
    "first_sent_at" timestamp with time zone,
    "questions_modified_at" timestamp with time zone
);


ALTER TABLE "public"."survey" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveyanswer_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveyanswer_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveyanswer" (
    "id" integer DEFAULT "nextval"('"public"."surveyanswer_id_seq"'::"regclass") NOT NULL,
    "response_id" integer NOT NULL,
    "question_id" integer NOT NULL,
    "answer_text" "text",
    "answer_scale" integer
);


ALTER TABLE "public"."surveyanswer" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveybundle_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveybundle_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveybundle" (
    "id" integer DEFAULT "nextval"('"public"."surveybundle_id_seq"'::"regclass") NOT NULL,
    "user_id" integer,
    "cycle_id" character varying NOT NULL,
    "status" character varying DEFAULT 'pending'::character varying NOT NULL,
    "scheduled_send_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notified_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "mode" character varying DEFAULT 'shared'::character varying NOT NULL
);


ALTER TABLE "public"."surveybundle" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveybundlesurvey_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveybundlesurvey_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveybundlesurvey" (
    "id" integer DEFAULT "nextval"('"public"."surveybundlesurvey_id_seq"'::"regclass") NOT NULL,
    "bundle_id" integer NOT NULL,
    "survey_id" integer NOT NULL,
    "project_member_id" integer
);


ALTER TABLE "public"."surveybundlesurvey" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveycategory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveycategory_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveycategory" (
    "id" integer DEFAULT "nextval"('"public"."surveycategory_id_seq"'::"regclass") NOT NULL,
    "key" character varying NOT NULL,
    "label" character varying NOT NULL,
    "description" "text",
    "rubric_category" character varying NOT NULL,
    "is_builtin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."surveycategory" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveyinsight_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveyinsight_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveyinsight" (
    "id" integer DEFAULT "nextval"('"public"."surveyinsight_id_seq"'::"regclass") NOT NULL,
    "survey_id" integer NOT NULL,
    "ai_insight" "text",
    "themes" "text"[],
    "delivery_score" numeric,
    "code_quality_score" numeric,
    "cicd_score" numeric,
    "team_health_score" numeric,
    "blockers_score" numeric,
    "ai_model" character varying,
    "generated_at" timestamp with time zone
);


ALTER TABLE "public"."surveyinsight" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveyquestion_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveyquestion_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveyquestion" (
    "id" integer DEFAULT "nextval"('"public"."surveyquestion_id_seq"'::"regclass") NOT NULL,
    "survey_id" integer NOT NULL,
    "category" character varying NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" character varying NOT NULL,
    "order_index" integer NOT NULL
);


ALTER TABLE "public"."surveyquestion" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveyresponse_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveyresponse_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveyresponse" (
    "id" integer DEFAULT "nextval"('"public"."surveyresponse_id_seq"'::"regclass") NOT NULL,
    "bundle_id" integer NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."surveyresponse" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."surveyschedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."surveyschedule_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveyschedule" (
    "id" integer DEFAULT "nextval"('"public"."surveyschedule_id_seq"'::"regclass") NOT NULL,
    "project_id" integer NOT NULL,
    "period_month" "date" NOT NULL,
    "round" smallint NOT NULL,
    "scheduled_send_at" timestamp with time zone NOT NULL,
    "survey_id" integer,
    "questions_generated_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."surveyschedule" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."riskscore"
    ADD CONSTRAINT "riskscore_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."riskscore"
    ADD CONSTRAINT "riskscore_project_snapshot_id_key" UNIQUE ("project_snapshot_id");



ALTER TABLE ONLY "public"."survey"
    ADD CONSTRAINT "survey_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyanswer"
    ADD CONSTRAINT "surveyanswer_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveybundle"
    ADD CONSTRAINT "surveybundle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveybundlesurvey"
    ADD CONSTRAINT "surveybundlesurvey_bundle_survey_unique" UNIQUE ("bundle_id", "survey_id");



ALTER TABLE ONLY "public"."surveybundlesurvey"
    ADD CONSTRAINT "surveybundlesurvey_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveycategory"
    ADD CONSTRAINT "surveycategory_key_unique" UNIQUE ("key");



ALTER TABLE ONLY "public"."surveycategory"
    ADD CONSTRAINT "surveycategory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyinsight"
    ADD CONSTRAINT "surveyinsight_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyinsight"
    ADD CONSTRAINT "surveyinsight_survey_id_key" UNIQUE ("survey_id");



ALTER TABLE ONLY "public"."surveyquestion"
    ADD CONSTRAINT "surveyquestion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyresponse"
    ADD CONSTRAINT "surveyresponse_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyschedule"
    ADD CONSTRAINT "surveyschedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveyschedule"
    ADD CONSTRAINT "surveyschedule_unique" UNIQUE ("project_id", "period_month", "round");



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



CREATE INDEX "survey_project_id_idx" ON "public"."survey" USING "btree" ("project_id");



CREATE INDEX "survey_source_period_idx" ON "public"."survey" USING "btree" ("project_id", "source", "period_month");



CREATE INDEX "surveyanswer_question_id_idx" ON "public"."surveyanswer" USING "btree" ("question_id");



CREATE INDEX "surveybundle_cycle_id_idx" ON "public"."surveybundle" USING "btree" ("cycle_id");



CREATE INDEX "surveybundle_user_id_idx" ON "public"."surveybundle" USING "btree" ("user_id");



CREATE INDEX "surveybundlesurvey_bundle_id_idx" ON "public"."surveybundlesurvey" USING "btree" ("bundle_id");



CREATE INDEX "surveybundlesurvey_survey_id_idx" ON "public"."surveybundlesurvey" USING "btree" ("survey_id");



CREATE INDEX "surveyquestion_survey_id_idx" ON "public"."surveyquestion" USING "btree" ("survey_id");



CREATE INDEX "surveyschedule_due_gen_idx" ON "public"."surveyschedule" USING "btree" ("scheduled_send_at") WHERE ("questions_generated_at" IS NULL);



CREATE INDEX "surveyschedule_due_send_idx" ON "public"."surveyschedule" USING "btree" ("scheduled_send_at") WHERE ("sent_at" IS NULL);



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



ALTER TABLE ONLY "public"."surveyanswer"
    ADD CONSTRAINT "surveyanswer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."surveyquestion"("id");



ALTER TABLE ONLY "public"."surveyanswer"
    ADD CONSTRAINT "surveyanswer_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."surveyresponse"("id");



ALTER TABLE ONLY "public"."surveybundle"
    ADD CONSTRAINT "surveybundle_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id");



ALTER TABLE ONLY "public"."surveybundlesurvey"
    ADD CONSTRAINT "surveybundlesurvey_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."surveybundle"("id");



ALTER TABLE ONLY "public"."surveybundlesurvey"
    ADD CONSTRAINT "surveybundlesurvey_project_member_id_fkey" FOREIGN KEY ("project_member_id") REFERENCES "public"."projectmember"("id");



ALTER TABLE ONLY "public"."surveybundlesurvey"
    ADD CONSTRAINT "surveybundlesurvey_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."surveyinsight"
    ADD CONSTRAINT "surveyinsight_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."surveyquestion"
    ADD CONSTRAINT "surveyquestion_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."surveyresponse"
    ADD CONSTRAINT "surveyresponse_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "public"."surveybundle"("id");



ALTER TABLE ONLY "public"."surveyschedule"
    ADD CONSTRAINT "surveyschedule_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id");



ALTER TABLE ONLY "public"."surveyschedule"
    ADD CONSTRAINT "surveyschedule_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."survey"("id");



ALTER TABLE ONLY "public"."versioncontrolmetrics"
    ADD CONSTRAINT "versioncontrolmetrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."projectsnapshot"("id");



ALTER TABLE "public"."cicdmetrics" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



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



GRANT ALL ON SEQUENCE "public"."surveyanswer_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveyanswer_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveyanswer_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveyanswer" TO "anon";
GRANT ALL ON TABLE "public"."surveyanswer" TO "authenticated";
GRANT ALL ON TABLE "public"."surveyanswer" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveybundle_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveybundle_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveybundle_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveybundle" TO "anon";
GRANT ALL ON TABLE "public"."surveybundle" TO "authenticated";
GRANT ALL ON TABLE "public"."surveybundle" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveybundlesurvey_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveybundlesurvey_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveybundlesurvey_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveybundlesurvey" TO "anon";
GRANT ALL ON TABLE "public"."surveybundlesurvey" TO "authenticated";
GRANT ALL ON TABLE "public"."surveybundlesurvey" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveycategory_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveycategory_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveycategory_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveycategory" TO "anon";
GRANT ALL ON TABLE "public"."surveycategory" TO "authenticated";
GRANT ALL ON TABLE "public"."surveycategory" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveyinsight_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveyinsight_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveyinsight_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveyinsight" TO "anon";
GRANT ALL ON TABLE "public"."surveyinsight" TO "authenticated";
GRANT ALL ON TABLE "public"."surveyinsight" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveyquestion_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveyquestion_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveyquestion_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveyquestion" TO "anon";
GRANT ALL ON TABLE "public"."surveyquestion" TO "authenticated";
GRANT ALL ON TABLE "public"."surveyquestion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveyresponse_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveyresponse_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveyresponse_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveyresponse" TO "anon";
GRANT ALL ON TABLE "public"."surveyresponse" TO "authenticated";
GRANT ALL ON TABLE "public"."surveyresponse" TO "service_role";



GRANT ALL ON SEQUENCE "public"."surveyschedule_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."surveyschedule_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."surveyschedule_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."surveyschedule" TO "anon";
GRANT ALL ON TABLE "public"."surveyschedule" TO "authenticated";
GRANT ALL ON TABLE "public"."surveyschedule" TO "service_role";



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







