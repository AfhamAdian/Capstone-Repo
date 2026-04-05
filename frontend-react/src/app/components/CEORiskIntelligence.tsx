import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Area, AreaChart,
} from "recharts";
import { Users, Shuffle, Timer, AlertTriangle, TrendingDown, Flame } from "lucide-react";
import type { Project } from "../data/mockData";

interface Props {
  projects: Project[];
  navigate: (path: string) => void;
}

// ── Mock data for CEO risk categories ──

const burnoutSprintData = [
  { sprint: "S1", reviewTime: 18, blockerDensity: 2, velocityDrop: 0, rework: 8 },
  { sprint: "S2", reviewTime: 24, blockerDensity: 3, velocityDrop: 5, rework: 10 },
  { sprint: "S3", reviewTime: 32, blockerDensity: 4, velocityDrop: 12, rework: 14 },
  { sprint: "S4", reviewTime: 52, blockerDensity: 6, velocityDrop: 22, rework: 18 },
  { sprint: "S5", reviewTime: 48, blockerDensity: 5, velocityDrop: 18, rework: 15 },
  { sprint: "S6", reviewTime: 56, blockerDensity: 7, velocityDrop: 25, rework: 20 },
];

const scopeCreepData = [
  { sprint: "S1", reopenRate: 5, storyPtVariance: 8, epicCompletion: 92 },
  { sprint: "S2", reopenRate: 8, storyPtVariance: 12, epicCompletion: 88 },
  { sprint: "S3", reopenRate: 12, storyPtVariance: 18, epicCompletion: 82 },
  { sprint: "S4", reopenRate: 18, storyPtVariance: 25, epicCompletion: 74 },
  { sprint: "S5", reopenRate: 15, storyPtVariance: 20, epicCompletion: 78 },
  { sprint: "S6", reopenRate: 20, storyPtVariance: 28, epicCompletion: 70 },
];

const deliveryRiskData = [
  { sprint: "S1", sprintCompletion: 92, cycleTime: 3.2, leadTime: 4.1, prMergeTime: 6 },
  { sprint: "S2", sprintCompletion: 88, cycleTime: 3.8, leadTime: 4.8, prMergeTime: 8 },
  { sprint: "S3", sprintCompletion: 82, cycleTime: 4.5, leadTime: 5.6, prMergeTime: 12 },
  { sprint: "S4", sprintCompletion: 75, cycleTime: 5.2, leadTime: 7.1, prMergeTime: 18 },
  { sprint: "S5", sprintCompletion: 78, cycleTime: 4.8, leadTime: 6.5, prMergeTime: 14 },
  { sprint: "S6", sprintCompletion: 72, cycleTime: 5.8, leadTime: 8.2, prMergeTime: 22 },
];

const teamBurnoutByProject = [
  { name: "Legacy API", reviewHrs: 56, blockers: 7, velocityDrop: 25, risk: 78 },
  { name: "Payment Svc", reviewHrs: 42, blockers: 4, velocityDrop: 15, risk: 52 },
  { name: "Old Frontend", reviewHrs: 38, blockers: 5, velocityDrop: 18, risk: 58 },
  { name: "Mobile App", reviewHrs: 22, blockers: 2, velocityDrop: 8, risk: 28 },
];

const tooltipStyle = {
  borderRadius: "8px",
  border: "1px solid #E2E8F0",
  fontSize: "12px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
};

// ── Risk Score Card ──

function RiskScoreCard({
  icon: Icon,
  title,
  score,
  trigger,
  iconBg,
  iconColor,
  borderColor,
}: {
  icon: typeof Users;
  title: string;
  score: number;
  trigger: string;
  iconBg: string;
  iconColor: string;
  borderColor: string;
}) {
  const getScoreColor = (s: number) =>
    s >= 60 ? "text-red-600" : s >= 35 ? "text-amber-600" : "text-green-600";
  const getBarColor = (s: number) =>
    s >= 60 ? "bg-red-500" : s >= 35 ? "bg-amber-500" : "bg-green-500";
  const getLabel = (s: number) =>
    s >= 60 ? "High" : s >= 35 ? "Medium" : "Low";

  return (
    <Card className={`border-slate-200 bg-white/80 backdrop-blur-sm border-l-4 ${borderColor}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`h-9 w-9 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
          </div>
          <Badge
            variant="outline"
            className={`text-xs ${getScoreColor(score)}`}
          >
            {getLabel(score)}
          </Badge>
        </div>
        <p className="text-xs text-slate-500 mb-1">{title}</p>
        <p className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}</p>
        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2 mb-2">
          <div
            className={`h-full rounded-full ${getBarColor(score)}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">{trigger}</p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──

export function CEORiskIntelligence({ projects, navigate }: Props) {
  // Compute aggregate risk scores from the 6 canonical fields
  const avgTeamHealthRisk = Math.round(projects.reduce((s, p) => s + p.teamHealthRisk, 0) / projects.length);
  const avgEngProcessRisk = Math.round(projects.reduce((s, p) => s + p.engineeringProcessRisk, 0) / projects.length);
  const avgDeliveryRisk   = Math.round(projects.reduce((s, p) => s + p.deliveryRisk, 0) / projects.length);

  return (
    <div className="space-y-6 mb-8">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <h2 className="text-lg font-semibold text-slate-900">Organizational Risk Intelligence</h2>
        <Badge variant="outline" className="text-xs">CEO View</Badge>
      </div>

      {/* 3 Risk Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <RiskScoreCard
          icon={Flame}
          title="Team Health Risk"
          score={avgTeamHealthRisk}
          trigger="PR review >48h + velocity drop 25% + rework 20%"
          iconBg="bg-orange-100"
          iconColor="text-orange-600"
          borderColor="border-l-orange-500"
        />
        <RiskScoreCard
          icon={Shuffle}
          title="Engineering Process Risk"
          score={avgEngProcessRisk}
          trigger="Reopen rate >15% + story point variance >20% + epic completion <75%"
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          borderColor="border-l-purple-500"
        />
        <RiskScoreCard
          icon={Timer}
          title="Delivery Risk"
          score={avgDeliveryRisk}
          trigger="Sprint completion <75% + cycle time >5d + PR merge time >18h"
          iconBg="bg-red-100"
          iconColor="text-red-600"
          borderColor="border-l-red-500"
        />
      </div>

      {/* Charts Row 1: Burnout + Scope Creep */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Burnout Indicators */}
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Burnout Risk Indicators
            </CardTitle>
            <CardDescription>PR review time (h) & rework % over sprints</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={burnoutSprintData}>
                <defs>
                  <linearGradient id="burnoutReview" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sprint" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  type="monotone"
                  dataKey="reviewTime"
                  name="PR Review Time (h)"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#burnoutReview)"
                />
                <Line
                  type="monotone"
                  dataKey="rework"
                  name="Rework %"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#EF4444" }}
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey="velocityDrop"
                  name="Velocity Drop %"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#8B5CF6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-5 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-orange-500" />
                <span className="text-[10px] text-slate-500">Review Time</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-red-500 rounded" />
                <span className="text-[10px] text-slate-500">Rework %</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-violet-500 rounded" />
                <span className="text-[10px] text-slate-500">Velocity Drop</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scope Creep Indicators */}
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-violet-500" />
              Scope Creep Indicators
            </CardTitle>
            <CardDescription>Reopen rate, story point variance & epic completion</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={scopeCreepData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sprint" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fill: "#64748B", fontSize: 12 }} unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748B", fontSize: 12 }} unit="%" domain={[50, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="reopenRate"
                  name="Reopen Rate %"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#EF4444" }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="storyPtVariance"
                  name="Story Pt Variance %"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#F59E0B" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="epicCompletion"
                  name="Epic Completion %"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#10B981" }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-5 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-red-500 rounded" />
                <span className="text-[10px] text-slate-500">Reopen Rate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-amber-500 rounded" />
                <span className="text-[10px] text-slate-500">SP Variance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-green-500 rounded" />
                <span className="text-[10px] text-slate-500">Epic Completion</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Delivery Risk + Team Burnout by Project */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery / Schedule Risk Trend */}
        <Card className="lg:col-span-2 border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4 text-red-500" />
              Delivery Risk Trend
            </CardTitle>
            <CardDescription>Sprint completion %, cycle time & lead time (DORA)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={deliveryRiskData}>
                <defs>
                  <linearGradient id="deliveryCompletion" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sprint" tick={{ fill: "#64748B", fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fill: "#64748B", fontSize: 12 }} unit="%" domain={[50, 100]} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748B", fontSize: 12 }} unit="d" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="sprintCompletion"
                  name="Sprint Completion %"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#deliveryCompletion)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="leadTime"
                  name="Lead Time (days)"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#EF4444" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cycleTime"
                  name="Cycle Time (days)"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#F59E0B" }}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-5 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-500" />
                <span className="text-[10px] text-slate-500">Sprint Completion</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-red-500 rounded" />
                <span className="text-[10px] text-slate-500">Lead Time</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-amber-500 rounded" />
                <span className="text-[10px] text-slate-500">Cycle Time</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Burnout by Project */}
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Burnout Risk by Project</CardTitle>
            <CardDescription>Teams most at risk</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {teamBurnoutByProject.map((team) => {
                const riskColor =
                  team.risk >= 60
                    ? "text-red-600"
                    : team.risk >= 40
                    ? "text-amber-600"
                    : "text-green-600";
                const barColor =
                  team.risk >= 60
                    ? "bg-red-500"
                    : team.risk >= 40
                    ? "bg-amber-500"
                    : "bg-green-500";

                return (
                  <div key={team.name} className="p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <button
                        className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors"
                        onClick={() => {
                          const proj = projects.find((p) => p.name.includes(team.name.split(" ")[0]));
                          if (proj) navigate(`/project/${proj.id}`);
                        }}
                      >
                        {team.name}
                      </button>
                      <span className={`text-lg font-bold ${riskColor}`}>{team.risk}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${team.risk}%` }}
                      />
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span>Review: {team.reviewHrs}h</span>
                      <span>Blockers: {team.blockerDensity}</span>
                      <span>Vel. Drop: {team.velocityDrop}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}