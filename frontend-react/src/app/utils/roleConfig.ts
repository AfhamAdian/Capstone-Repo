import { UserRole } from "../context/UserContext";

export interface RoleConfig {
  dashboardMetrics: string[];
  riskCategories: string[];
  insights: string[];
  features: string[];
}

export const roleConfigurations: Record<UserRole, RoleConfig> = {
  CEO: {
    dashboardMetrics: ["projectCount", "overallRisk", "scopeCreep", "predictability"],
    riskCategories: ["Delivery/Schedule Risk", "Team Productivity Risk", "Scope Creep Risk", "Resource/Capacity Risk", "Predictability Risk"],
    insights: ["business-impact", "schedule-delivery", "resource-capacity"],
    features: ["executive-summary", "high-level-metrics", "business-kpis"],
  },
  CTO: {
    dashboardMetrics: ["technicalDebt", "qualityScore", "securityRisks", "architectureHealth"],
    riskCategories: ["Quality/Defect Risk", "Technical Debt Risk", "Deployment/Integration Risk", "Security Risk", "Maintainability/Architecture Risk"],
    insights: ["technical-debt", "code-quality", "security-vulnerabilities"],
    features: ["technical-metrics", "code-analysis", "security-dashboard"],
  },
  Manager: {
    dashboardMetrics: ["projectCount", "overallRisk", "teamHealth", "deliveryRisk"],
    riskCategories: ["Delivery/Schedule Risk", "Quality/Defect Risk", "Deployment/Integration Risk", "Team Productivity Risk", "Scope Creep Risk", "Resource/Capacity Risk", "Predictability Risk"],
    insights: ["team-productivity", "delivery-schedule", "quality-metrics"],
    features: ["team-management", "sprint-tracking", "resource-planning"],
  },
  Developer: {
    dashboardMetrics: ["technicalDebt", "qualityScore", "activeIssues", "prMetrics"],
    riskCategories: ["Quality/Defect Risk", "Technical Debt Risk", "Team Productivity Risk", "Maintainability/Architecture Risk"],
    insights: ["code-quality", "technical-debt", "my-contributions"],
    features: ["code-metrics", "pr-reviews", "issue-tracking"],
  },
};

export function getRoleSpecificProjects(role: UserRole, projects: any[]) {
  // Filter or sort projects based on role priorities
  switch (role) {
    case "CEO":
      // CEO sees projects sorted by business impact / overall risk
      return projects.sort((a, b) => b.overallRisk - a.overallRisk).slice(0, 5);
    case "CTO":
      // CTO sees projects with high technical risks
      return projects.sort((a, b) => b.technicalRisk - a.technicalRisk).slice(0, 5);
    case "Manager":
      // Manager sees all tracked projects sorted by delivery risk
      return projects.sort((a, b) => b.deliveryRisk - a.deliveryRisk);
    case "Developer":
      // Developer sees projects with active issues and technical debt
      return projects.filter(p => p.technicalRisk > 30 || p.qualityScore < 70).slice(0, 5);
    default:
      return projects;
  }
}

export function getRoleName(role: UserRole): string {
  return role === "Manager" ? "Team Lead" : role;
}

export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case "CEO":
      return "Executive overview with business-critical insights and strategic metrics";
    case "CTO":
      return "Technical health monitoring with focus on quality, security, and architecture";
    case "Manager":
      return "Team and project management view with delivery and resource insights";
    case "Developer":
      return "Code-level metrics and technical debt tracking for active development";
    default:
      return "Project management intelligence platform";
  }
}
