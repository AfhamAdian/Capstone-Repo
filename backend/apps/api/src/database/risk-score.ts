import { assertSupabaseClient } from '../config/supabase.js';
import type { RiskResult } from '../../../../libs/risk-engines/types.js';

export async function saveRiskScore(result: RiskResult): Promise<void> {
  const client = assertSupabaseClient();

  const { error } = await client
    .from('risk_scores') // assumes you have a table named "risk_scores" in Supabase
    .insert([
      {
        type: result.type,
        score: result.score,
        level: result.level,
        weights: result.weights,
        calculated_at: new Date().toISOString(),
      },
    ]);

  if (error) {
    throw new Error(`Failed to save risk score to database: ${error.message}`);
  }
}
