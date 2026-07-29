import { assertSupabaseClient } from '../config/supabase.js';

export interface SubmittedAnswer {
  questionId: number;
  answerText?: string;
  answerScale?: number;
}

export async function insertResponse(bundleId: number, answers: SubmittedAnswer[]): Promise<number> {
  const client = assertSupabaseClient();

  const { data: response, error: responseError } = await client
    .from('surveyresponse')
    .insert([{ bundle_id: bundleId }])
    .select('id')
    .single();

  if (responseError || !response) {
    throw new Error(`Failed to create survey response: ${responseError?.message ?? 'No response row returned'}`);
  }

  const responseId = response.id as number;

  if (answers.length > 0) {
    const { error: answerError } = await client.from('surveyanswer').insert(
      answers.map((a) => ({
        response_id: responseId,
        question_id: a.questionId,
        answer_text: a.answerText ?? null,
        answer_scale: a.answerScale ?? null,
      })),
    );
    if (answerError) {
      throw new Error(`Failed to save survey answers for response ${responseId}: ${answerError.message}`);
    }
  }

  return responseId;
}

/** Which survey_ids (out of a candidate set) this submission touched, so the caller can check per-project completion. */
export async function getSurveyIdsForQuestions(questionIds: number[]): Promise<Map<number, number>> {
  const client = assertSupabaseClient();
  if (questionIds.length === 0) return new Map();

  const { data, error } = await client.from('surveyquestion').select('id, survey_id').in('id', questionIds);
  if (error) {
    throw new Error(`Failed to resolve survey_id for questions: ${error.message}`);
  }
  return new Map((data ?? []).map((q) => [q.id as number, q.survey_id as number]));
}
