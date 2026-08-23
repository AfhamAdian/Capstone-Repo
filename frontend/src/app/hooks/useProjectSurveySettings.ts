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

const DEFAULT_GUIDANCE: SurveyGuidanceItem[] = [
  { id: "g1", text: "Ask about specific blockers preventing sprint completion. Focus on cross-team dependencies." },
  { id: "g2", text: "Probe team confidence in current sprint goals — is the scope realistic?" },
  { id: "g3", text: "Explore communication and process pain points." },
  { id: "g4", text: "Ask about workload balance and signs of unsustainable pace." },
];

function storageKey(projectId: string) {
  return `pulse.survey-settings.${projectId}`;
}

export function loadProjectSurveySettings(projectId: string): ProjectSurveySettings {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return { team: DEFAULT_TEAM, guidance: DEFAULT_GUIDANCE };
    const parsed = JSON.parse(raw) as Partial<ProjectSurveySettings>;
    return {
      team: Array.isArray(parsed.team) && parsed.team.length > 0 ? parsed.team : DEFAULT_TEAM,
      guidance: Array.isArray(parsed.guidance) && parsed.guidance.length > 0 ? parsed.guidance : DEFAULT_GUIDANCE,
    };
  } catch {
    return { team: DEFAULT_TEAM, guidance: DEFAULT_GUIDANCE };
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
