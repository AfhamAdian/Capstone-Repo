import { assertSupabaseClient } from '../config/supabase.js';

export interface SubmittedAnswer {
  questionId: number;
  answerText?: string;
  answerScale?: number;
}

export async function insertResponse(bundleId: number, submissionKey: string, answers: SubmittedAnswer[]): Promise<number> {
  const client = assertSupabaseClient();

  const { data, error } = await client.rpc('submit_survey_response', {
    p_bundle_id: bundleId,
    p_submission_key: submissionKey,
    p_answers: answers,
  });
  if (error || typeof data !== 'number') {
    throw new Error(`Failed to save survey response: ${error?.message ?? 'No response id returned'}`);
  }
  return data;
}

