/**
 * Jira connector types
 */

/**
 * Jira project metrics response
 */
export interface JiraMetricsResponse {
  generatedAt: string;
  project: {
    key: string;
    name: string;
    id: string;
  };
  metrics: {
    // TODO: Define Jira-specific metrics
    // Common project management metrics:
    // - Active issues count
    // - Average time to resolution
    // - Issue velocity
    // - Team workload distribution
    // - Priority distribution
    // - Status distribution
    // - Team capacity vs assigned work
    // - Overdue issues
    [key: string]: any;
  };
}
