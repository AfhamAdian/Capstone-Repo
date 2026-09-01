/**
 * SonarQube (Code Quality) Connector Implementation
 *
 * Fetches project-level quality metrics from SonarQube / SonarCloud:
 * - one `measures/component` call for the batched metric values
 * - one `measures/search_history` call for quality gate pass rate over time
 * - one `hotspots/search` call (paginated) for worst-offender files by unresolved hotspot count
 */

import { ICodeQualityConnector } from '../connector.interface.js';
import { CreateCodeQualityConnectorInput } from '../types.js';
import { SonarQubeMetricsResponse } from '../sonarqube-metrics.types.js';
import type { IConnector, ConnectorOutput } from '@libs/sync/index.js';

const DEFAULT_BASE_URL = 'https://sonarcloud.io';
const DEFAULT_QUALITY_GATE_PASS_RATE_LOOKBACK_DAYS = 90;
const DEFAULT_HOTSPOT_WORST_OFFENDERS_LIMIT = 5;
const PAGE_SIZE = 500; // SonarQube API page size cap for hotspots/search; also within measures/search_history's limit

/**
 * Metric keys requested in a single measures/component call.
 * Kept aligned with SonarQubeMetricsResponse.metrics.
 */
const METRIC_KEYS = [
  // Maintainability
  'sqale_rating',
  'code_smells',
  'duplicated_lines_density',
  // Complexity
  'complexity',
  'cognitive_complexity',
  // Reliability
  'reliability_rating',
  'reliability_remediation_effort',
  // Security
  'security_rating',
  'security_hotspots',
  'security_review_rating',
  'security_remediation_effort',
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

/** Shape of a single history entry returned by measures/search_history. */
interface SonarMeasureHistoryEntry {
  value?: string;
}

/** Shape of a single hotspot returned by the SonarQube API. */
interface SonarHotspot {
  component?: string;
}

export class SonarQubeConnector implements ICodeQualityConnector, IConnector {
  private readonly credentials: { token: string; baseUrl: string };
  private readonly project: { projectKey: string; organization?: string };
  private readonly options: {
    qualityGatePassRateLookbackDays: number;
    hotspotWorstOffendersLimit: number;
  };

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

    this.options = {
      qualityGatePassRateLookbackDays:
        input.options?.qualityGatePassRateLookbackDays ?? DEFAULT_QUALITY_GATE_PASS_RATE_LOOKBACK_DAYS,
      hotspotWorstOffendersLimit:
        input.options?.hotspotWorstOffendersLimit ?? DEFAULT_HOTSPOT_WORST_OFFENDERS_LIMIT,
    };
  }

  async getData(): Promise<ConnectorOutput> {
    const now = new Date();

    const [measures, qualityGatePassRatePercent, hotspotFilesWorstOffenders] = await Promise.all([
      this.fetchMeasures(),
      this.fetchQualityGatePassRate(),
      this.fetchWorstOffenderHotspotFiles(),
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
        maintainabilityRating: num('sqale_rating'),
        codeSmells: num('code_smells'),
        newCodeSmells: num('new_code_smells'),
        duplicatedLinesDensity: num('duplicated_lines_density'),
        newDuplicatedLinesDensity: num('new_duplicated_lines_density'),
        newTechnicalDebt: num('new_technical_debt'),
        // Complexity
        cyclomaticComplexity: num('complexity'),
        cognitiveComplexity: num('cognitive_complexity'),
        // Reliability
        reliabilityRating: num('reliability_rating'),
        reliabilityRemediationEffort: num('reliability_remediation_effort'),
        newBugs: num('new_bugs'),
        // Security
        securityRating: num('security_rating'),
        securityHotspots: num('security_hotspots'),
        securityReviewRating: num('security_review_rating'),
        securityRemediationEffort: num('security_remediation_effort'),
        newVulnerabilities: num('new_vulnerabilities'),
        hotspotFilesWorstOffenders,
        // Coverage
        coverage: num('coverage'),
        newCoverage: num('new_coverage'),
        // Size
        linesOfCode: num('ncloc'),
        // Overall gate (trend)
        qualityGatePassRatePercent,
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

  /**
   * Fetch quality gate status (`alert_status`) history over the configured
   * lookback window and compute the percentage of analyses that passed.
   */
  private async fetchQualityGatePassRate(): Promise<number | null> {
    const from = this.daysAgoDateString(this.options.qualityGatePassRateLookbackDays);

    const values = await this.fetchAllPages<string>(
      (page) =>
        `${this.credentials.baseUrl}/api/measures/search_history` +
        `?component=${encodeURIComponent(this.project.projectKey)}` +
        `&metrics=alert_status&from=${from}&p=${page}&ps=${PAGE_SIZE}`,
      (data) => {
        const history: SonarMeasureHistoryEntry[] = data?.measures?.[0]?.history ?? [];
        return history
          .map((entry) => entry.value)
          .filter((value): value is string => value !== undefined);
      },
      (data) => data?.paging?.total ?? 0,
    );

    if (values.length === 0) return null;

    const passed = values.filter((value) => value === 'OK').length;
    return Math.round((passed / values.length) * 100);
  }

  /**
   * Fetch unresolved (TO_REVIEW) security hotspots and group them by file to
   * surface the worst-offender files, capped at `hotspotWorstOffendersLimit`.
   */
  private async fetchWorstOffenderHotspotFiles(): Promise<Array<{ file: string; hotspotCount: number }>> {
    const hotspots = await this.fetchAllPages<SonarHotspot>(
      (page) =>
        `${this.credentials.baseUrl}/api/hotspots/search` +
        `?projectKey=${encodeURIComponent(this.project.projectKey)}` +
        `&status=TO_REVIEW&p=${page}&ps=${PAGE_SIZE}`,
      (data) => data?.hotspots ?? [],
      (data) => data?.paging?.total ?? 0,
    );

    const prefix = `${this.project.projectKey}:`;
    const countByFile = new Map<string, number>();
    for (const hotspot of hotspots) {
      if (!hotspot.component) continue;
      const file = hotspot.component.startsWith(prefix)
        ? hotspot.component.slice(prefix.length)
        : hotspot.component;
      countByFile.set(file, (countByFile.get(file) ?? 0) + 1);
    }

    return Array.from(countByFile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.options.hotspotWorstOffendersLimit)
      .map(([file, hotspotCount]) => ({ file, hotspotCount }));
  }

  /**
   * Generic paginator for SonarQube's `paging: { pageIndex, pageSize, total }`
   * response shape. Calls `buildUrl(page)` until all pages have been fetched,
   * flattening each page's items via `extractItems`.
   */
  private async fetchAllPages<T>(
    buildUrl: (page: number) => string,
    extractItems: (data: any) => T[],
    extractTotal: (data: any) => number,
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    let total = Infinity;

    while ((page - 1) * PAGE_SIZE < total) {
      const data = await this.fetchWithAuth(buildUrl(page));
      items.push(...extractItems(data));
      total = extractTotal(data);
      page += 1;
    }

    return items;
  }

  private daysAgoDateString(days: number): string {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  private toNumber(raw: string | undefined): number | null {
    if (raw === undefined) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
