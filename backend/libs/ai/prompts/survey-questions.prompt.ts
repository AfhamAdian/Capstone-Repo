import type { GenerateSurveyQuestionsInput, SurveyHealthContext, SurveyIncidentSignals } from '../types.js';

const DEFAULT_CATEGORIES = ['delivery', 'codeQuality', 'cicd', 'teamHealth', 'blockers'];

function asPercent(value: number): number {
  const raw = value <= 1 ? value * 100 : value;
  return Math.round(raw);
}

function formatCount(value: number, singular: string, plural: string): string {
  const n = Math.round(value);
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Human-readable last-cycle incidents for Gemini and the survey review UI. Never includes people or ticket ids. */
export function formatSurveyIncidents(incidents?: SurveyIncidentSignals | null): string[] {
  if (!incidents) return [];
  const lines: string[] = [];

  if (incidents.spilloverRatio !== null) {
    const pct = asPercent(incidents.spilloverRatio);
    const streak =
      incidents.consecutiveSpilloverCount !== null && incidents.consecutiveSpilloverCount > 1
        ? ` across ${Math.round(incidents.consecutiveSpilloverCount)} consecutive sprints`
        : '';
    lines.push(`About ${pct}% of committed sprint work spilled into the next sprint${streak}.`);
  } else if (incidents.consecutiveSpilloverCount !== null && incidents.consecutiveSpilloverCount > 0) {
    lines.push(`Spillover in ${formatCount(incidents.consecutiveSpilloverCount, 'sprint', 'consecutive sprints')}.`);
  }

  if (incidents.midSprintAdditions !== null && incidents.midSprintAdditions > 0) {
    const churn =
      incidents.scopeChurnRatio !== null ? ` (about ${asPercent(incidents.scopeChurnRatio)}% of sprint scope)` : '';
    lines.push(`${formatCount(incidents.midSprintAdditions, 'ticket was', 'tickets were')} added after the sprint started${churn}.`);
  } else if (incidents.scopeChurnRatio !== null && asPercent(incidents.scopeChurnRatio) > 0) {
    lines.push(`About ${asPercent(incidents.scopeChurnRatio)}% of sprint scope was added after the sprint started.`);
  }

  if (incidents.blockedItemsCount !== null && incidents.blockedItemsCount > 0) {
    lines.push(`${formatCount(incidents.blockedItemsCount, 'ticket is', 'tickets are')} currently blocked.`);
  }
  if (incidents.overdueItemsCount !== null && incidents.overdueItemsCount > 0) {
    lines.push(`${formatCount(incidents.overdueItemsCount, 'ticket is', 'tickets are')} past its due date.`);
  }
  if (incidents.stalePrCount !== null && incidents.stalePrCount > 0) {
    lines.push(`${formatCount(incidents.stalePrCount, 'pull request has', 'pull requests have')} gone stale.`);
  }
  if (incidents.prCycleTimeHours !== null) {
    lines.push(`Average time to first PR review is about ${Math.round(incidents.prCycleTimeHours)} hours.`);
  }
  if (incidents.deploymentsPerWeek !== null) {
    lines.push(`${formatCount(incidents.deploymentsPerWeek, 'deployment', 'deployments')} in the last week.`);
  }
  if (incidents.deploymentFailureRatePercent !== null && incidents.deploymentFailureRatePercent > 0) {
    lines.push(`About ${asPercent(incidents.deploymentFailureRatePercent)}% of recent deployments failed.`);
  } else if (incidents.pipelineSuccessRatePercent !== null) {
    lines.push(`Pipeline success rate is about ${asPercent(incidents.pipelineSuccessRatePercent)}%.`);
  }
  if (incidents.commitsPerWeek !== null) {
    lines.push(`${formatCount(incidents.commitsPerWeek, 'commit', 'commits')} in the last week.`);
  }

  return lines;
}

export function formatSurveyHealthContext(context?: SurveyHealthContext): string {
  if (!context || context.source === 'unavailable') {
    const incidents = formatSurveyIncidents(context?.incidents);
    if (incidents.length === 0) {
      return 'Project health context: no calculated project health score is available yet.';
    }
    return `Project health context: no calculated score yet.\nRecent incidents from the last sync:\n${incidents.map((line) => `- ${line}`).join('\n')}`;
  }
  const score = (value: number | null) => (value === null ? 'unavailable' : value.toFixed(1));
  const incidents = formatSurveyIncidents(context.incidents);
  const incidentBlock =
    incidents.length > 0
      ? `\nRecent incidents from the last sync (ask about these situations, not generic mood):\n${incidents.map((line) => `- ${line}`).join('\n')}`
      : '';
  return `Project health context captured at ${context.capturedAt}:
- Overall: ${score(context.overallScore)}
- Delivery: ${score(context.scores.delivery)}
- Code quality: ${score(context.scores.codeQuality)}
- CI/CD: ${score(context.scores.cicd)}
- Team health: ${score(context.scores.teamHealth)}
- Blockers: ${score(context.scores.blockers)}
- Overall trend delta: ${score(context.trendDelta)}${incidentBlock}`;
}

export function buildSurveyQuestionsPrompt(input: GenerateSurveyQuestionsInput): string {
  const categories = input.categories && input.categories.length > 0 ? input.categories : DEFAULT_CATEGORIES;
  return `You are helping a software engineering manager draft a short developer pulse survey.

Project: ${input.projectName}
Reason this survey is being sent: ${input.trigger}
${input.customGuidance ? `Additional guidance from the admin: ${input.customGuidance}` : ''}

${formatSurveyHealthContext(input.healthContext)}

Generate 6-8 distinct survey questions covering these health categories: ${categories.join(', ')}.
Use the health context to prioritize weak or declining areas and any listed incidents.
If an incident is listed for a category (spillover, failed deploys, blocked work, stale PRs, mid-sprint scope changes), ask about that situation rather than a generic morale question.
Do not mention numeric scores, percentages, people, or ticket/PR identifiers in the questions.
Do not assume the score is correct — treat incidents as the situation to explore.
Do not repeat or lightly reword the same underlying question.
Each question must be tagged with exactly one category. Mix "scale" (1-5 rating) and "text" (free response) question types.
Keep questions short, neutral, and non-leading. Do not ask for names or identifying details - responses are anonymous.

Respond with ONLY a JSON array, no markdown fences, no commentary, matching this shape (category must be one of: ${categories.join(', ')}):
[{"category": string, "questionText": string, "questionType": "text" | "scale"}]`;
}
