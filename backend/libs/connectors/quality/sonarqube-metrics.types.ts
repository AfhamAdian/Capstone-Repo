/**
 * SonarQube metrics return types
 *
 * 18 metrics (12 core + 6 new-code). See instructions/SONARQUBE_METRICS.md.
 * All values are nullable: a metric can be absent if the project has not been
 * analyzed for it (e.g. coverage requires a coverage report upload).
 */

export type QualityGateStatus = 'OK' | 'ERROR';

export interface SonarQubeMetricsResponse {
  generatedAt: string;
  project: {
    projectKey: string;
    organization: string;
  };
  metrics: {
    // Maintainability
    technicalDebtRatio: number | null; // sqale_debt_ratio (%)
    technicalDebtMinutes: number | null; // sqale_index (raw minutes)
    maintainabilityRating: number | null; // sqale_rating (1=A .. 5=E)
    codeSmells: number | null;
    duplicatedLinesDensity: number | null; // %

    // Reliability
    bugs: number | null;
    reliabilityRating: number | null; // 1=A .. 5=E

    // Security
    vulnerabilities: number | null;
    securityRating: number | null; // 1=A .. 5=E
    criticalVulnerabilities: number | null; // BLOCKER + CRITICAL severities
    highVulnerabilities: number | null; // MAJOR severity

    // Coverage
    coverage: number | null; // % — null until coverage reporting is configured

    // Size (normalizer)
    linesOfCode: number | null; // ncloc

    // Overall gate
    qualityGateStatus: QualityGateStatus | null;

    // New code (trajectory)
    newBugs: number | null;
    newVulnerabilities: number | null;
    newCodeSmells: number | null;
    newCoverage: number | null; // %
    newDuplicatedLinesDensity: number | null; // %
    newTechnicalDebt: number | null; // minutes
  };
}
