import type { GeneratedSurveyQuestion } from './types.js';

/**
 * Cheap, deterministic near-duplicate detection for generated questions, run
 * BEFORE the (paid) AI scoring call so obvious repeats never reach it. Uses
 * token-set Jaccard similarity on normalized text; the LLM's `diversity` score
 * is the second, semantic line of defense on top of this.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'do', 'does', 'you', 'your', 'to', 'of', 'and',
  'or', 'in', 'on', 'for', 'how', 'what', 'this', 'that', 'with', 'about', 'any',
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Drops questions whose normalized text is >= `threshold` similar to one already
 * kept (first occurrence wins). Also drops exact-normalized duplicates outright.
 */
export function dedupeQuestions(
  questions: GeneratedSurveyQuestion[],
  threshold = 0.6,
): GeneratedSurveyQuestion[] {
  const kept: { question: GeneratedSurveyQuestion; tokens: Set<string> }[] = [];

  for (const question of questions) {
    const tokens = tokenize(question.questionText);
    const isDuplicate = kept.some((k) => jaccard(k.tokens, tokens) >= threshold);
    if (!isDuplicate) {
      kept.push({ question, tokens });
    }
  }

  return kept.map((k) => k.question);
}
