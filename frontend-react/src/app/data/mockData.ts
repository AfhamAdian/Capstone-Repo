export type UserRole = "CEO" | "CTO" | "PM" | "Developer";

export interface Project {
  id: string;
  name: string;
  group: string;
  lastActivity: string;
  visibility: "Public" | "Private";
  members: number;
  status: "Tracked" | "Untracked";
  // ── The 6 canonical risk scores (0-100, higher = worse) ──
  ciCdReliabilityRisk: number;
  codeQualityRisk: number;
  deliveryRisk: number;
  engineeringProcessRisk: number;
  securityRisk: number;
  teamHealthRisk: number;
  // ── Derived (computed from the 6) ──
  overallRisk: number; // avg of the 6
  riskTrend: "up" | "down" | "stable";
  // ── Metrics (counts, rates, durations — NOT risk scores) ──
  qualityScore: number;
  securityHigh: number;
  securityBlocker: number;
  reliabilityHigh: number;
  reliabilityBlocker: number;
  maintainabilityHigh: number;
  maintainabilityBlocker: number;
  issues: number;
  openMRs: number;
  openMilestones: number;
  leadTime: number;       // days
  spilloverRate: number;  // %
  blockedWork: number;    // %
  scopeChurn: number;     // %
  coverage: number;       // %
  complexity: number;     // 1-10
  prCycleTime: number;    // hours
}

export interface Issue {
  id: string;
  projectName: string;
  projectId: string;
  type: "Quality Drop" | "CI Failure" | "Issues Increase" | "Delivery Risk" | "Technical Debt" | "Security Vulnerability";
  severity: "Critical" | "High" | "Medium" | "Low";
  message: string;
  timestamp: string;
  rootCause?: string;
  suggestedAction?: string;
  riskType: "delivery" | "security" | "quality" | "cicd" | "engineering" | "teamhealth";
}

export const mockProjects: Project[] = [
  {
    id: "1",
    name: "Capstone-Repo",
    group: "capstone",
    lastActivity: "5 hours ago",
    visibility: "Public",
    members: 2,
    status: "Tracked",
    ciCdReliabilityRisk: 0,
    codeQualityRisk: 0,
    deliveryRisk: 0,
    engineeringProcessRisk: 0,
    securityRisk: 0,
    teamHealthRisk: 0,
    overallRisk: 0,
    riskTrend: "stable",
    qualityScore: 85,
    securityHigh: 0,
    securityBlocker: 0,
    reliabilityHigh: 0,
    reliabilityBlocker: 0,
    maintainabilityHigh: 0,
    maintainabilityBlocker: 0,
    issues: 0,
    openMRs: 0,
    openMilestones: 0,
    leadTime: 3.2,
    spilloverRate: 10,
    blockedWork: 5,
    scopeChurn: 12,
    coverage: 85,
    complexity: 4,
    prCycleTime: 8,
  },
  {
    id: "2",
    name: "NiramoyAI",
    group: "AI",
    lastActivity: "yesterday",
    visibility: "Public",
    members: 2,
    status: "Tracked",
    ciCdReliabilityRisk: 0,
    codeQualityRisk: 0,
    deliveryRisk: 0,
    engineeringProcessRisk: 0,
    securityRisk: 0,
    teamHealthRisk: 0,
    overallRisk: 0,
    riskTrend: "stable",
    qualityScore: 78,
    securityHigh: 0,
    securityBlocker: 0,
    reliabilityHigh: 0,
    reliabilityBlocker: 0,
    maintainabilityHigh: 1,
    maintainabilityBlocker: 0,
    issues: 4,
    openMRs: 1,
    openMilestones: 0,
    leadTime: 3.6,
    spilloverRate: 12,
    blockedWork: 7,
    scopeChurn: 14,
    coverage: 84,
    complexity: 4,
    prCycleTime: 10,
  }
];

export const mockIssues: Issue[] = [
  {
    id: "1",
    projectName: "NiramoyAI",
    projectId: "2",
    type: "Delivery Risk",
    severity: "Critical",
    message: "Delivery risk increased from 58% to 78% in the last sprint",
    timestamp: "2 hours ago",
    rootCause: "High spillover rate (45%) and significant scope churn (38%) indicate poor sprint planning and requirement stability issues.",
    suggestedAction: "Implement stricter sprint commitment rules, improve story refinement process, and conduct mid-sprint checkpoints to identify blockers early.",
    riskType: "delivery",
  },
  {
    id: "2",
    projectName: "Capstone-Repo",
    projectId: "1",
    type: "Technical Debt",
    severity: "High",
    message: "Code quality risk increased by 15 points this week",
    timestamp: "5 hours ago",
    rootCause: "Multiple quick fixes without proper refactoring, increasing code complexity from 5 to 6.5 average.",
    suggestedAction: "Schedule a technical debt reduction sprint. Allocate 20% of next sprint capacity to refactoring high-complexity modules.",
    riskType: "quality",
  },
  {
    id: "3",
    projectName: "Capstone-Repo",
    projectId: "1",
    type: "Issues Increase",
    severity: "Medium",
    message: "Open issues increased by 40% this week",
    timestamp: "1 day ago",
    rootCause: "Recent feature release introduced regression bugs. QA coverage was 60% below standard.",
    suggestedAction: "Increase test coverage for new features, implement automated regression testing, and schedule bug bash session.",
    riskType: "quality",
  },
  {
    id: "4",
    projectName: "NiramoyAI",
    projectId: "2",
    type: "Security Vulnerability",
    severity: "Critical",
    message: "Security risk score at 85 — 1 blocker-level vulnerability detected",
    timestamp: "3 hours ago",
    rootCause: "Outdated dependency with known CVE. Library version is 2 major versions behind.",
    suggestedAction: "Immediately update to latest stable version. Run full security scan and penetration test after update.",
    riskType: "security",
  },
];

export const mockHistoricalData = [
  { month: "Jan 2024", score: 65, coverage: 53, ci: 70, risk: 45 },
  { month: "Feb 2024", score: 68, coverage: 58, ci: 72, risk: 42 },
  { month: "Mar 2024", score: 72, coverage: 62, ci: 78, risk: 38 },
  { month: "Apr 2024", score: 79, coverage: 68, ci: 82, risk: 32 },
  { month: "May 2024", score: 78, coverage: 72, ci: 85, risk: 35 },
  { month: "Jun 2024", score: 82, coverage: 75, ci: 88, risk: 30 },
];

export const sprintRiskData = [
  { sprint: "Sprint 1", deliveryRisk: 35, ciCdReliabilityRisk: 28 },
  { sprint: "Sprint 2", deliveryRisk: 42, ciCdReliabilityRisk: 32 },
  { sprint: "Sprint 3", deliveryRisk: 38, ciCdReliabilityRisk: 40 },
  { sprint: "Sprint 4", deliveryRisk: 45, ciCdReliabilityRisk: 38 },
];

// Current user context (in real app, this would come from auth)
export const currentUser = {
  name: "Afham Adian",
  email: "afham.adian@company.com",
  role: "CTO" as UserRole,
};
