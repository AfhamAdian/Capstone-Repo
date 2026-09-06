import { useCallback, useEffect, useState } from "react";

export interface SurveyTeamMember {
  n: string;
  r: string;
  e: string;
}

export interface SurveyGuidanceItem {
  id: string;
  text: string;
}

export interface ProjectSurveySettings {
  team: SurveyTeamMember[];
  guidance: SurveyGuidanceItem[];
}

const DEFAULT_TEAM: SurveyTeamMember[] = [
  { n: "Sarah Chen", r: "Engineering Manager", e: "s.chen@company.io" },
  { n: "Marcus Webb", r: "Product Manager", e: "m.webb@company.io" },
  { n: "Priya Nair", r: "Senior Engineer", e: "p.nair@company.io" },
  { n: "James Okafor", r: "Tech Lead", e: "j.okafor@company.io" },
  { n: "Lena Fischer", r: "QA Lead", e: "l.fischer@company.io" },
];

function storageKey(projectId: string) {
  return `pulse.survey-settings.${projectId}`;
}

/**
 * Guidance starts empty by default - with nothing saved, question generation
 * relies purely on the risk-score-driven health context. An admin opts in by
 * adding an instruction; an explicitly emptied list must stay empty across
 * reloads, not silently repopulate with starter text.
 */
export function loadProjectSurveySettings(projectId: string): ProjectSurveySettings {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return { team: DEFAULT_TEAM, guidance: [] };
    const parsed = JSON.parse(raw) as Partial<ProjectSurveySettings>;
    return {
      team: Array.isArray(parsed.team) && parsed.team.length > 0 ? parsed.team : DEFAULT_TEAM,
      guidance: Array.isArray(parsed.guidance) ? parsed.guidance : [],
    };
  } catch {
    return { team: DEFAULT_TEAM, guidance: [] };
  }
}

export function saveProjectSurveySettings(projectId: string, settings: ProjectSurveySettings) {
  localStorage.setItem(storageKey(projectId), JSON.stringify(settings));
}

export function guidanceToCustomPrompt(guidance: SurveyGuidanceItem[]): string | undefined {
  const text = guidance.map((item) => item.text.trim()).filter(Boolean).join("\n");
  return text || undefined;
}

export function useProjectSurveySettings(projectId: string) {
  const [settings, setSettings] = useState<ProjectSurveySettings>(() => loadProjectSurveySettings(projectId));

  useEffect(() => {
    setSettings(loadProjectSurveySettings(projectId));
  }, [projectId]);

  const update = useCallback((next: ProjectSurveySettings | ((prev: ProjectSurveySettings) => ProjectSurveySettings)) => {
    setSettings((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      saveProjectSurveySettings(projectId, resolved);
      return resolved;
    });
  }, [projectId]);

  return { settings, update, customGuidance: guidanceToCustomPrompt(settings.guidance), audienceSize: Math.max(1, settings.team.length) };
}
