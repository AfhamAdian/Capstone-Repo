/**
 * SonarQube (Code Quality) Connector Implementation
 *
 * Fetches project-level quality metrics from SonarQube / SonarCloud:
 * - one `measures/component` call for the 17 metric values
 * - one `qualitygates/project_status` call for the gate status
 */

import { ICodeQualityConnector } from '../connector.interface.js';
import { CreateCodeQualityConnectorInput } from '../types.js';
import { QualityGateStatus, SonarQubeMetricsResponse } from '../sonarqube-metrics.types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';

const DEFAULT_BASE_URL = 'https://sonarcloud.io';

/**
 * Metric keys requested in a single measures/component call.
 * Kept aligned with SonarQubeMetricsResponse.metrics.
 */
const METRIC_KEYS = [
  // Maintainability
  'sqale_debt_ratio',
  'sqale_index',
  'sqale_rating',
  'code_smells',
  'duplicated_lines_density',
  // Reliability
  'bugs',
  'reliability_rating',
  // Security
  'vulnerabilities',
  'security_rating',
  // Coverage
  'coverage',
  // Size
  'ncloc',
  // New code
  'new_bugs',
  'new_vulnerabilities',
  'new_code_smells',
  'new_coverage',
  'new_duplicated_lines_density',
  'new_technical_debt',
] as const;

/** Shape of a single measure returned by the SonarQube API. */
interface SonarMeasure {
  metric: string;
  value?: string;
  period?: { value?: string };
  periods?: Array<{ value?: string }>;
}

export class SonarQubeConnector implements ICodeQualityConnector, IConnector {
  private readonly credentials: { token: string; baseUrl: string };
  private readonly project: { projectKey: string; organization?: string };

  constructor(input: CreateCodeQualityConnectorInput) {
    if (!input.credentials.token) {
      throw new Error('SonarQube token is required');
    }
    if (!input.project.projectKey) {
      throw new Error('SonarQube project key is required');
    }

    const baseUrl = input.credentials.baseUrl || DEFAULT_BASE_URL;

    this.credentials = {
      token: input.credentials.token,
      baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    };

    this.project = {
      projectKey: input.project.projectKey,
      organization: input.project.organization,
    };
  }

  async getData(): Promise<ConnectorOutput> {
    const now = new Date();

    const [measures, qualityGateStatus, vulnerabilitySeverities] = await Promise.all([
      this.fetchMeasures(),
      this.fetchQualityGateStatus(),
      this.fetchVulnerabilitySeverities(),
    ]);

    const num = (key: string): number | null => this.toNumber(measures.get(key));

    const metrics: SonarQubeMetricsResponse = {
      generatedAt: now.toISOString(),
      project: {
        projectKey: this.project.projectKey,
        organization: this.project.organization ?? '',
      },
      metrics: {
        // Maintainability
        technicalDebtRatio: num('sqale_debt_ratio'),
        technicalDebtMinutes: num('sqale_index'),
        maintainabilityRating: num('sqale_rating'),
        codeSmells: num('code_smells'),
        duplicatedLinesDensity: num('duplicated_lines_density'),
        // Reliability
        bugs: num('bugs'),
        reliabilityRating: num('reliability_rating'),
        // Security
        vulnerabilities: num('vulnerabilities'),
        securityRating: num('security_rating'),
        criticalVulnerabilities: vulnerabilitySeverities.critical,
        highVulnerabilities: vulnerabilitySeverities.high,
        // Coverage
        coverage: num('coverage'),
        // Size
        linesOfCode: num('ncloc'),
        // Overall gate
        qualityGateStatus,
        // New code
        newBugs: num('new_bugs'),
        newVulnerabilities: num('new_vulnerabilities'),
        newCodeSmells: num('new_code_smells'),
        newCoverage: num('new_coverage'),
        newDuplicatedLinesDensity: num('new_duplicated_lines_density'),
        newTechnicalDebt: num('new_technical_debt'),
      },
    };

    return {
      tool: 'sonarqube',
      provider: 'sonarqube',
      data: metrics,
      fetchedAt: now,
    };
  }

  private async fetchWithAuth(url: string): Promise<any> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.credentials.token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SonarQube API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Fetch all metric values in one call and index them by metric key.
   * For new-code metrics the value lives under `period`/`periods`, not `value`.
   */
  private async fetchMeasures(): Promise<Map<string, string>> {
    const url =
      `${this.credentials.baseUrl}/api/measures/component` +
      `?component=${encodeURIComponent(this.project.projectKey)}` +
      `&metricKeys=${METRIC_KEYS.join(',')}`;

    const data = await this.fetchWithAuth(url);
    const measures: SonarMeasure[] = data?.component?.measures ?? [];

    const valuesByMetric = new Map<string, string>();
    for (const measure of measures) {
      const value = measure.value ?? measure.period?.value ?? measure.periods?.[0]?.value;
      if (measure.metric && value !== undefined) {
        valuesByMetric.set(measure.metric, value);
      }
    }

    return valuesByMetric;
  }

  private async fetchQualityGateStatus(): Promise<QualityGateStatus | null> {
    const url =
      `${this.credentials.baseUrl}/api/qualitygates/project_status` +
      `?projectKey=${encodeURIComponent(this.project.projectKey)}`;

    const data = await this.fetchWithAuth(url);
    const status = data?.projectStatus?.status;

    return status === 'OK' || status === 'ERROR' ? status : null;
  }

  /**
   * Fetch open-vulnerability counts split by severity, via a single issues
   * search using the `severities` facet. Critical = BLOCKER + CRITICAL, High = MAJOR.
   * Note: SonarQube's Clean Code taxonomy is migrating severities; on newer
   * instances the facet may be empty, in which case counts are null.
   */
  private async fetchVulnerabilitySeverities(): Promise<{ critical: number | null; high: number | null }> {
    const url =
      `${this.credentials.baseUrl}/api/issues/search` +
      `?componentKeys=${encodeURIComponent(this.project.projectKey)}` +
      `&types=VULNERABILITY&resolved=false&facets=severities&ps=1`;

    const data = await this.fetchWithAuth(url);
    const facet = data?.facets?.find((f: { property?: string }) => f.property === 'severities');

    if (!facet?.values || facet.values.length === 0) {
      return { critical: null, high: null };
    }

    const countBySeverity = new Map<string, number>();
    for (const entry of facet.values as Array<{ val?: string; count?: number }>) {
      if (entry.val) {
        countBySeverity.set(entry.val, entry.count ?? 0);
      }
    }

    const critical = (countBySeverity.get('BLOCKER') ?? 0) + (countBySeverity.get('CRITICAL') ?? 0);
    const high = countBySeverity.get('MAJOR') ?? 0;

    return { critical, high };
  }

  private toNumber(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
