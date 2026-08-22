import { createHash } from 'node:crypto';

export interface ActionEmbeddingSource {
  problem: string;
  reason: string;
  actionTaken: string;
}

function normalizeField(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

export function buildActionEmbeddingText(source: ActionEmbeddingSource): string {
  return [
    `Problem: ${normalizeField(source.problem)}`,
    `Root cause: ${normalizeField(source.reason)}`,
    `Action taken: ${normalizeField(source.actionTaken)}`,
  ].join('\n');
}

export function hashEmbeddingText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
