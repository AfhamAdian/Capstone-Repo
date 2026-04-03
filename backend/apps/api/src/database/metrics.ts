import { assertSupabaseClient } from '../config/supabase.js';
import type { GitHubMetricsResponse } from '../../../../libs/connectors/vcs/github-metrics.types.js';

/**
 * Supabase doesn't use a traditional ORM but provides a Data API over your Postgres database.
 * Because the GitHub metrics have a complex nested structure, the best approach is to store
 * the entire metrics object in a `JSONB` data type column. This allows you to store the nested data easily
 * and query inside the JSON objects later without creating 20+ separate columns.
 */
export async function saveGitHubMetrics(data: GitHubMetricsResponse): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('github_metrics') // Ensure you have this table created in Supabase
    .insert([
      {
        owner: data.repo.owner,
        repo: data.repo.repo,
        full_name: data.repo.fullName,
        generated_at: data.generatedAt,
        // Storing the complex nested object as a JSONB field
        metrics_data: data.metrics,
      },
    ]);

  if (error) {
    throw new Error(`Failed to save GitHub metrics to database: ${error.message}`);
  }
}
