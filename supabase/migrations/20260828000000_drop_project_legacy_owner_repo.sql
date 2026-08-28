-- Drop all legacy per-tool columns from project. Credentials/identity now live in
-- projecttoolintegration.config (github {owner, repo, token}; jira/sonarqube {token, ...})
alter table public.project
  drop column if exists owner,
  drop column if exists repo,
  drop column if exists "JIRA_TOKEN",
  drop column if exists "JIRA_EMAIL",
  drop column if exists "JIRA_BASE_URL",
  drop column if exists "JIRA_PROJECT_KEY",
  drop column if exists "JIRA_BOARD_ID",
  drop column if exists "GITHUB_TOKEN",
  drop column if exists sonar_token,
  drop column if exists sonar_organization,
  drop column if exists sonar_project_key,
  drop column if exists sonar_base_url;
