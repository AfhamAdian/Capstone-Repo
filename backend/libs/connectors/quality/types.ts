/**
 * Code Quality connector types and interfaces
 */

export type CodeQualityProvider = 'sonarqube';

export interface CodeQualityCredentials {
  token: string;
  baseUrl?: string; // Defaults to SonarCloud; override for self-hosted SonarQube
}

export interface CodeQualityProject {
  projectKey: string; // SonarQube/SonarCloud project (component) key
  organization?: string; // SonarCloud organization key
}

export interface CodeQualityConnectorOptions {
  qualityGatePassRateLookbackDays?: number; // window for the alert_status history call
  hotspotWorstOffendersLimit?: number; // top N files returned by hotspot file breakdown
}

export interface CreateCodeQualityConnectorInput {
  provider: CodeQualityProvider;
  credentials: CodeQualityCredentials;
  project: CodeQualityProject;
  options?: CodeQualityConnectorOptions;
}
