/**
 * SonarQube metrics return types
 *
 * 21 metrics chosen for code quality health scoring. See sonar-metrics.md.
 * All values are nullable: a metric can be absent if the project has not been
 * analyzed for it (e.g. coverage requires a coverage report upload).
 */

export interface SonarQubeMetricsResponse {
  generatedAt: string;
  project: {
    projectKey: string;
    organization: string;
  };
  metrics: {
    // Maintainability
    maintainabilityRating: number | null; // sqale_rating (1=A .. 5=E)
    codeSmells: number | null; // code_smells
    newCodeSmells: number | null; // new_code_smells
    duplicatedLinesDensity: number | null; // duplicated_lines_density (%)
    newDuplicatedLinesDensity: number | null; // new_duplicated_lines_density (%)
    newTechnicalDebt: number | null; // new_technical_debt (minutes)

    // Complexity
    cyclomaticComplexity: number | null; // complexity
    cognitiveComplexity: number | null; // cognitive_complexity

    // Reliability
    reliabilityRating: number | null; // reliability_rating (1=A .. 5=E)
    reliabilityRemediationEffort: number | null; // reliability_remediation_effort (minutes)
    newBugs: number | null; // new_bugs

    // Security
    securityRating: number | null; // security_rating (1=A .. 5=E)
    securityHotspots: number | null; // security_hotspots (count)
    securityReviewRating: number | null; // security_review_rating (1=A .. 5=E)
    securityRemediationEffort: number | null; // security_remediation_effort (minutes)
    newVulnerabilities: number | null; // new_vulnerabilities
    hotspotFilesWorstOffenders: Array<{ file: string; hotspotCount: number }>; // top files by unresolved hotspot count

    // Coverage
    coverage: number | null; // coverage (%) — null until coverage reporting is configured
    newCoverage: number | null; // new_coverage (%)

    // Size (normalizer)
    linesOfCode: number | null; // ncloc

    // Overall gate (trend, not a single snapshot)
    qualityGatePassRatePercent: number | null; // % of analyses in the lookback window with status OK
  };
}
