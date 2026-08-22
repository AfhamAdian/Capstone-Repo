import { describe, expect, it } from 'vitest';
import { InvalidSurveyLinkError, validateSurveyAnswers } from './survey-response.service.js';
import type { SubmittedAnswer } from '../database/survey-response.js';
import type { SurveyQuestion } from '../database/survey.js';

const questions: SurveyQuestion[] = [
  { id: 1, category: 'delivery', questionText: 'How is delivery?', questionType: 'scale' },
  { id: 2, category: 'blockers', questionText: 'What is blocking you?', questionType: 'text' },
];

describe('validateSurveyAnswers', () => {
  it('accepts valid scale and text answers', () => {
    const answers: SubmittedAnswer[] = [
      { questionId: 1, answerScale: 4 },
      { questionId: 2, answerText: 'Waiting on design review' },
    ];
    expect(() => validateSurveyAnswers(answers, questions)).not.toThrow();
  });

  it('rejects duplicate question ids', () => {
    const answers: SubmittedAnswer[] = [
      { questionId: 1, answerScale: 3 },
      { questionId: 1, answerScale: 5 },
    ];
    expect(() => validateSurveyAnswers(answers, questions)).toThrow(InvalidSurveyLinkError);
  });

  it('rejects unknown question ids', () => {
    const answers: SubmittedAnswer[] = [{ questionId: 99, answerText: 'orphan' }];
    expect(() => validateSurveyAnswers(answers, questions)).toThrow(InvalidSurveyLinkError);
  });

  it('rejects invalid scale values', () => {
    expect(() => validateSurveyAnswers([{ questionId: 1, answerScale: 0 }], questions)).toThrow(InvalidSurveyLinkError);
    expect(() => validateSurveyAnswers([{ questionId: 1, answerScale: 6 }], questions)).toThrow(InvalidSurveyLinkError);
    expect(() => validateSurveyAnswers([{ questionId: 1, answerScale: 3, answerText: 'extra' }], questions)).toThrow(InvalidSurveyLinkError);
  });

  it('rejects empty or oversized text answers', () => {
    expect(() => validateSurveyAnswers([{ questionId: 2, answerText: '   ' }], questions)).toThrow(InvalidSurveyLinkError);
    expect(() => validateSurveyAnswers([{ questionId: 2, answerText: 'x'.repeat(4001) }], questions)).toThrow(InvalidSurveyLinkError);
    expect(() => validateSurveyAnswers([{ questionId: 2, answerText: 'ok', answerScale: 2 }], questions)).toThrow(InvalidSurveyLinkError);
  });

  it('trims text answers in place', () => {
    const answers: SubmittedAnswer[] = [{ questionId: 2, answerText: '  blocked on infra  ' }];
    validateSurveyAnswers(answers, questions);
    expect(answers[0]?.answerText).toBe('blocked on infra');
  });
});
