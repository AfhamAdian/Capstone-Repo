import { useParams, Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Label } from "../components/ui/label";
import { mockHistoricalData } from "../data/mockData";
import { ArrowLeft, RefreshCw, ExternalLink, AlertTriangle, TrendingUp, Clock, GitPullRequest, Users, Zap, Code2, AlertCircle, Target, EyeOff, Activity, Shield, Timer, BarChart3, Gauge } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Area, AreaChart } from "recharts";
import { RiskGauge } from "../components/RiskGauge";
import { TrendArrow } from "../components/TrendArrow";
import { ActionPanel } from "../components/ActionPanel";
import { MetricCard } from "../components/MetricCard";
import { Slider } from "../components/ui/slider";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useUser } from "../context/UserContext";
import { useProjects } from "../context/ProjectDataContext";

export function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getProjectById } = useProjects();
  const project = getProjectById(id ?? "");
  const [velocityAdjustment, setVelocityAdjustment] = useState([0]);
  const [scopeAdjustment, setScopeAdjustment] = useState([0]);
  const { isProjectTracked, trackProject, untrackProject, user } = useUser();

  if (!project) {
    return (
      <div className="p-8">
        <p>Project not found</p>
      </div>
    );
  }

  const deliveryMetrics = [
    { name: "Lead Time", value: `${project.leadTime}d`, target: "< 5d", status: project.leadTime < 5 ? "good" : "bad" },
    { name: "Spillover", value: `${project.spilloverRate}%`, target: "< 20%", status: project.spilloverRate < 20 ? "good" : "bad" },
    { name: "Blocked Work", value: `${project.blockedWork}%`, target: "< 10%", status: project.blockedWork < 10 ? "good" : "bad" },
    { name: "Scope Churn", value: `${project.scopeChurn}%`, target: "< 15%", status: project.scopeChurn < 15 ? "good" : "bad" },
    { name: "Stale Tickets", value: Math.floor(project.issues * 0.15), target: "< 5", status: Math.floor(project.issues * 0.15) < 5 ? "good" : "bad" },
  ];

  const riskBreakdown = [
    { name: "Lead Time", value: 30, fill: "#EF4444" },
    { name: "Spillover", value: 25, fill: "#F59E0B" },
    { name: "Blocked Work", value: 20, fill: "#F97316" },
    { name: "Scope Churn", value: 15, fill: "#FB923C" },
    { name: "Stale Tickets", value: 10, fill: "#FDBA74" },
  ];

  const sprintTrend = [
    { sprint: "Sprint 1", risk: 35, forecast: null },
    { sprint: "Sprint 2", risk: 42, forecast: null },
    { sprint: "Sprint 3", risk: 38, forecast: null },
    { sprint: "Sprint 4", risk: project.deliveryRisk, forecast: null },
    { sprint: "Sprint 5", risk: null, forecast: project.deliveryRisk + 5 },
    { sprint: "Sprint 6", risk: null, forecast: project.deliveryRisk + 3 },
  ];

  const technicalMetrics = [
    { name: "Maintainability", value: project.maintainabilityHigh + project.maintainabilityBlocker, severity: "High", target: "< 5" },
    { name: "Reliability", value: project.reliabilityHigh + project.reliabilityBlocker, severity: "Medium", target: "< 3" },
    { name: "Security", value: project.securityHigh + project.securityBlocker, severity: "Critical", target: "0" },
    { name: "Coverage", value: `${project.coverage}%`, severity: project.coverage < 80 ? "Warning" : "Good", target: "> 80%" },
    { name: "Complexity", value: project.complexity, severity: project.complexity > 5 ? "High" : "Low", target: "< 5" },
  ];

  const severityDistribution = [
    { name: "Blocker", value: project.securityBlocker + project.reliabilityBlocker + project.maintainabilityBlocker, color: "#DC2626" },
    { name: "Critical", value: 2, color: "#EF4444" },
    { name: "High", value: project.securityHigh + project.reliabilityHigh + project.maintainabilityHigh, color: "#F59E0B" },
    { name: "Medium", value: 5, color: "#F97316" },
  ];

  const hotFiles = [
    { file: "src/api/legacy-controller.ts", complexity: 8.5, changes: 23, issues: 5, risk: 92 },
    { file: "src/services/payment-service.ts", complexity: 7.2, changes: 18, issues: 3, risk: 78 },
    { file: "src/utils/data-processor.ts", complexity: 6.8, changes: 15, issues: 4, risk: 72 },
    { file: "src/components/Dashboard.tsx", complexity: 5.9, changes: 12, issues: 2, risk: 58 },
  ];

  // Simulation calculations
  const calculateSimulatedRisk = () => {
    const velocityImpact = velocityAdjustment[0] * 0.3;
    const scopeImpact = scopeAdjustment[0] * 0.4;
    return Math.max(0, Math.min(100, project.deliveryRisk - velocityImpact + scopeImpact));
  };

  const simulatedRisk = calculateSimulatedRisk();

  // === Team Lead / Manager: Flow & Delivery + CI/CD Metrics ===
  const flowMetricCards = [
    { label: "Cycle Time", value: "4.2d", sub: "Median In Progress → Done", status: "warning" as const, target: "< 3d" },
    { label: "PR Cycle Time", value: `${project.prCycleTime}h`, sub: "Median created → merged", status: project.prCycleTime <= 12 ? "good" as const : "bad" as const, target: "< 12h" },
    { label: "Throughput", value: "38", sub: "Story points this sprint", status: "good" as const, target: "> 30 pts" },
    { label: "Velocity", value: "34", sub: "Avg pts / sprint (6 sprints)", status: "good" as const, target: "> 30 pts" },
    { label: "Predictability", value: "72%", sub: "Velocity variance σ = 6.2", status: "warning" as const, target: "> 80%" },
    { label: "Build Success", value: "87%", sub: "Last 30 days (Jenkins)", status: "warning" as const, target: "> 95%" },
  ];

  const velocityTrendData = [
    { sprint: "S1", planned: 40, delivered: 32, variance: -8 },
    { sprint: "S2", planned: 38, delivered: 36, variance: -2 },
    { sprint: "S3", planned: 42, delivered: 28, variance: -14 },
    { sprint: "S4", planned: 36, delivered: 35, variance: -1 },
    { sprint: "S5", planned: 40, delivered: 38, variance: -2 },
    { sprint: "S6", planned: 38, delivered: 34, variance: -4 },
  ];

  const cycleTimeTrendData = [
    { week: "W1", cycleTime: 3.8, prCycleTime: 8.2, reviewTime: 4.5 },
    { week: "W2", cycleTime: 4.5, prCycleTime: 10.1, reviewTime: 6.2 },
    { week: "W3", cycleTime: 3.2, prCycleTime: 7.8, reviewTime: 3.8 },
    { week: "W4", cycleTime: 5.1, prCycleTime: 12.4, reviewTime: 7.1 },
    { week: "W5", cycleTime: 4.2, prCycleTime: 9.6, reviewTime: 5.3 },
    { week: "W6", cycleTime: 3.9, prCycleTime: 8.9, reviewTime: 4.8 },
  ];

  const cicdMetrics = [
    { stage: "Build", success: 92, avgDuration: "3m 12s", failures: 8 },
    { stage: "Unit Tests", success: 88, avgDuration: "5m 45s", failures: 12 },
    { stage: "Integration", success: 95, avgDuration: "8m 30s", failures: 5 },
    { stage: "Deploy (Staging)", success: 97, avgDuration: "2m 18s", failures: 3 },
  ];

  // === CTO: Technical Debt & Maintainability Metrics ===
  const techDebtCards = [
    { label: "Tech Debt Ratio", value: "8.2%", sub: "sqale_index / ncloc", status: "warning" as const, target: "< 5%" },
    { label: "Code Churn", value: "12.4%", sub: "Weekly additions+deletions / ncloc", status: "warning" as const, target: "< 10%" },
    { label: "Code Smell Density", value: "3.1", sub: "Per 1k lines (SonarQube)", status: "good" as const, target: "< 5" },
    { label: "Duplication", value: "6.8%", sub: "Duplicated lines %", status: "warning" as const, target: "< 3%" },
    { label: "Security Risk", value: "3", sub: "Critical + High vulns", status: project.securityHigh + project.securityBlocker > 0 ? "bad" as const : "good" as const, target: "0" },
    { label: "Maintainability", value: "B", sub: "SonarQube rating", status: "warning" as const, target: "A" },
  ];

  const maintainabilityTrendData = [
    { month: "Sep", rating: 2.8, debtRatio: 6.1, churn: 9.2 },
    { month: "Oct", rating: 2.5, debtRatio: 6.8, churn: 11.0 },
    { month: "Nov", rating: 2.3, debtRatio: 7.2, churn: 10.5 },
    { month: "Dec", rating: 2.6, debtRatio: 7.8, churn: 13.2 },
    { month: "Jan", rating: 2.1, debtRatio: 8.0, churn: 12.8 },
    { month: "Feb", rating: 2.4, debtRatio: 8.2, churn: 12.4 },
  ];

  const qualityGateTrendData = [
    { month: "Sep", smells: 18, vulns: 1, bugs: 4, coverage: 82 },
    { month: "Oct", smells: 21, vulns: 2, bugs: 3, coverage: 80 },
    { month: "Nov", smells: 19, vulns: 1, bugs: 5, coverage: 78 },
    { month: "Dec", smells: 24, vulns: 3, bugs: 6, coverage: 76 },
    { month: "Jan", smells: 22, vulns: 2, bugs: 4, coverage: project.coverage },
    { month: "Feb", smells: 23, vulns: 3, bugs: 3, coverage: project.coverage },
  ];

  const isManager = user.role === "Manager";
  const isCTO = user.role === "CTO";

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          className="mb-4"
          onClick={() => navigate("/tracked")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              {project.name}
            </h1>
            <p className="text-slate-600 mt-2">{project.group}</p>
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Risk Trend:</span>
                <TrendArrow trend={project.riskTrend} showBackground />
              </div>
              <Badge className="bg-gradient-to-r from-purple-600 to-pink-600">
                Next Sprint: {project.deliveryRisk + 5}% 
                <span className="ml-1 text-xs opacity-75">(±8%)</span>
              </Badge>
            </div>
          </div>
          <div className="flex gap-3">
            {isProjectTracked(project.id) ? (
              <Button
                variant="outline"
                className="border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                onClick={() => untrackProject(project.id)}
              >
                <Target className="h-4 w-4 mr-2" />
                Tracking
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => trackProject(project.id)}
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Track Project
              </Button>
            )}
            <Button variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in GitLab
            </Button>
            <Button 
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              onClick={() => navigate("/actions")}
            >
              View Actions
            </Button>
          </div>
        </div>
      </div>

      {/* Risk Overview — all 6 canonical scores */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Delivery Risk", value: project.deliveryRisk, color: "text-orange-600" },
          { label: "Security Risk", value: project.securityRisk, color: "text-red-600" },
          { label: "Code Quality Risk", value: project.codeQualityRisk, color: "text-blue-600" },
          { label: "CI/CD Reliability", value: project.ciCdReliabilityRisk, color: "text-indigo-600" },
          { label: "Eng. Process Risk", value: project.engineeringProcessRisk, color: "text-violet-600" },
          { label: "Team Health Risk", value: project.teamHealthRisk, color: "text-emerald-600" },
        ].map((risk) => (
          <Card key={risk.label} className="border-slate-200 bg-white/80 backdrop-blur-sm text-center">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs text-slate-500 font-medium">{risk.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex justify-center pb-4 px-4">
              <RiskGauge value={risk.value} size="md" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Lead: Flow & Delivery + CI/CD Metric Cards */}
      {isManager && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Flow & Delivery Metrics</h2>
            <Badge variant="outline" className="text-xs">Team Lead View</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {flowMetricCards.map((m) => (
              <Card key={m.label} className="border-slate-200 bg-white/80 backdrop-blur-sm">
                <CardContent className="pt-5 pb-4 px-4">
                  <p className="text-xs text-slate-500 mb-1 truncate">{m.label}</p>
                  <p className={`text-2xl font-bold ${m.status === "good" ? "text-slate-900" : m.status === "warning" ? "text-amber-600" : "text-red-600"}`}>
                    {m.value}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">{m.sub}</p>
                  <p className={`text-[10px] mt-1.5 ${m.status === "good" ? "text-green-600" : m.status === "warning" ? "text-amber-600" : "text-red-600"}`}>
                    Target: {m.target}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* CTO: Technical Debt & Maintainability Cards */}
      {isCTO && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-slate-900">Technical Debt & Maintainability</h2>
            <Badge variant="outline" className="text-xs">CTO View</Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {techDebtCards.map((m) => (
              <Card key={m.label} className="border-slate-200 bg-white/80 backdrop-blur-sm">
                <CardContent className="pt-5 pb-4 px-4">
                  <p className="text-xs text-slate-500 mb-1 truncate">{m.label}</p>
                  <p className={`text-2xl font-bold ${m.status === "good" ? "text-slate-900" : m.status === "warning" ? "text-amber-600" : "text-red-600"}`}>
                    {m.value}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">{m.sub}</p>
                  <p className={`text-[10px] mt-1.5 ${m.status === "good" ? "text-green-600" : m.status === "warning" ? "text-amber-600" : "text-red-600"}`}>
                    Target: {m.target}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Tabs defaultValue="delivery" className="space-y-6">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="delivery">Delivery Risk</TabsTrigger>
          <TabsTrigger value="technical">Technical Risk</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
        </TabsList>

        <TabsContent value="delivery" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {deliveryMetrics.map((metric) => (
              <Card key={metric.name} className="border-slate-200 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">{metric.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-slate-900">{metric.value}</p>
                  </div>
                  <p className={`text-xs mt-1 ${metric.status === "good" ? "text-green-600" : "text-red-600"}`}>
                    Target: {metric.target}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Risk Breakdown (Weighted Contribution)</CardTitle>
                <CardDescription>How each factor contributes to delivery risk</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={riskBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {riskBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {riskBreakdown.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: item.fill }} />
                      <span className="text-xs text-slate-600">{item.name} ({item.value}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-gradient-to-br from-orange-50 to-red-50 border-l-4 border-l-orange-600">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Root Cause Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Primary Issue</h4>
                  <p className="text-sm text-slate-700">
                    High spillover rate (45%) indicates poor sprint planning and requirement instability. 
                    {project.scopeChurn}% scope churn suggests stakeholder alignment issues.
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-orange-200">
                  <h4 className="font-semibold text-slate-900 mb-2 text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-600" />
                    Suggested Action
                  </h4>
                  <p className="text-sm text-slate-700">
                    1. Implement mid-sprint checkpoints<br/>
                    2. Reduce sprint commitment by 20%<br/>
                    3. Establish stricter change control process
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>4-Sprint Delivery Risk Trend + Forecast</CardTitle>
              <CardDescription>Historical performance with projected next sprint risk</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={sprintTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="sprint" tick={{ fill: "#64748B" }} />
                  <YAxis tick={{ fill: "#64748B" }} domain={[0, 100]} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    stroke="#EF4444"
                    strokeWidth={3}
                    name="Actual Risk"
                    dot={{ fill: "#EF4444", r: 6 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    stroke="#A855F7"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    name="Forecasted Risk"
                    dot={{ fill: "#A855F7", r: 6 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-4 justify-center">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-8 bg-red-500 rounded"></div>
                  <span className="text-xs text-slate-600">Actual</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-8 bg-purple-500 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 4px, white 4px, white 8px)" }}></div>
                  <span className="text-xs text-slate-600">Forecast (75% confidence)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="technical" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {technicalMetrics.map((metric) => (
              <Card key={metric.name} className="border-slate-200 bg-white/80 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-600">{metric.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-slate-900">{metric.value}</p>
                  </div>
                  <Badge
                    variant={metric.severity === "Critical" || metric.severity === "High" ? "destructive" : "secondary"}
                    className="mt-2 text-xs"
                  >
                    {metric.severity}
                  </Badge>
                  <p className="text-xs text-slate-500 mt-1">Target: {metric.target}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Severity Distribution</CardTitle>
                <CardDescription>Issues by severity level</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={severityDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fill: "#64748B" }} />
                    <YAxis tick={{ fill: "#64748B" }} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {severityDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Technical Debt Summary</CardTitle>
                <CardDescription>Estimated effort to resolve</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Code Smells</span>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">23</p>
                      <p className="text-xs text-slate-500">~18h effort</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Duplicated Blocks</span>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">8</p>
                      <p className="text-xs text-slate-500">~12h effort</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700">Cognitive Complexity</span>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">156</p>
                      <p className="text-xs text-slate-500">~24h effort</p>
                    </div>
                  </div>
                  <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-semibold text-blue-900">Total Estimated: ~54 hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5 text-red-600" />
                Hot Files (High Risk)
              </CardTitle>
              <CardDescription>Files requiring immediate attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold">File Path</TableHead>
                      <TableHead className="font-semibold text-center">Complexity</TableHead>
                      <TableHead className="font-semibold text-center">Changes (30d)</TableHead>
                      <TableHead className="font-semibold text-center">Issues</TableHead>
                      <TableHead className="font-semibold text-center">Risk Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hotFiles.map((file, index) => (
                      <TableRow key={index} className="hover:bg-slate-50">
                        <TableCell>
                          <div className="font-mono text-xs text-slate-900">{file.file}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={file.complexity > 7 ? "destructive" : "secondary"}>
                            {file.complexity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium text-slate-900">{file.changes}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={file.issues > 3 ? "destructive" : "secondary"}>
                            {file.issues}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className={`h-8 w-24 rounded ${file.risk >= 70 ? "bg-red-500" : "bg-orange-500"}`} />
                            <span className="font-bold text-slate-900 min-w-[40px] text-right">{file.risk}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Risk Movement Timeline</CardTitle>
              <CardDescription>Historical risk evolution with sprint markers</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={mockHistoricalData}>
                  <defs>
                    <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fill: "#64748B" }} />
                  <YAxis tick={{ fill: "#64748B" }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="risk" stroke="#EF4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRisk)" />
                  <Line type="monotone" dataKey="score" stroke="#10B981" strokeWidth={2} name="Quality" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Sprint Milestones & Events</CardTitle>
              <CardDescription>Key events impacting project risk</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div className="w-0.5 h-full bg-slate-200 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h4 className="font-semibold text-slate-900">Sprint 4: Risk Spike</h4>
                    <p className="text-sm text-slate-600 mt-1">Scope changes increased risk from 38% to {project.deliveryRisk}%</p>
                    <p className="text-xs text-slate-500 mt-1">Feb 10, 2024</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="w-0.5 h-full bg-slate-200 mt-2"></div>
                  </div>
                  <div className="flex-1 pb-8">
                    <h4 className="font-semibold text-slate-900">Sprint 3: Process Improvement</h4>
                    <p className="text-sm text-slate-600 mt-1">Implemented daily standups, risk decreased 4%</p>
                    <p className="text-xs text-slate-500 mt-1">Jan 28, 2024</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">Sprint 2: Team Expansion</h4>
                    <p className="text-sm text-slate-600 mt-1">2 new developers onboarded</p>
                    <p className="text-xs text-slate-500 mt-1">Jan 15, 2024</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulation" className="space-y-6">
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 via-white to-pink-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-purple-600" />
                What-If Scenario Simulator
              </CardTitle>
              <CardDescription>Adjust parameters to forecast risk impact</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="font-semibold text-slate-900">Team Velocity Adjustment</Label>
                    <Badge variant="outline">{velocityAdjustment[0] > 0 ? "+" : ""}{velocityAdjustment[0]}%</Badge>
                  </div>
                  <Slider
                    value={velocityAdjustment}
                    onValueChange={setVelocityAdjustment}
                    min={-50}
                    max={50}
                    step={5}
                    className="mb-2"
                  />
                  <p className="text-xs text-slate-600">Simulate impact of increasing/decreasing team productivity</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Label className="font-semibold text-slate-900">Scope Adjustment</Label>
                    <Badge variant="outline">{scopeAdjustment[0] > 0 ? "+" : ""}{scopeAdjustment[0]}%</Badge>
                  </div>
                  <Slider
                    value={scopeAdjustment}
                    onValueChange={setScopeAdjustment}
                    min={-50}
                    max={50}
                    step={5}
                    className="mb-2"
                  />
                  <p className="text-xs text-slate-600">Add or remove scope from next sprint commitment</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-lg">Current Risk</CardTitle>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    <RiskGauge value={project.deliveryRisk} size="md" />
                  </CardContent>
                </Card>

                <Card className="border-purple-300 bg-gradient-to-br from-purple-100 to-pink-100">
                  <CardHeader>
                    <CardTitle className="text-lg">Simulated Risk</CardTitle>
                  </CardHeader>
                  <CardContent className="flex justify-center">
                    <RiskGauge value={simulatedRisk} size="md" />
                  </CardContent>
                </Card>
              </div>

              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Impact Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Risk Change</span>
                      <span className={`font-bold ${simulatedRisk < project.deliveryRisk ? "text-green-600" : simulatedRisk > project.deliveryRisk ? "text-red-600" : "text-slate-900"}`}>
                        {simulatedRisk < project.deliveryRisk ? "-" : "+"}{Math.abs(simulatedRisk - project.deliveryRisk).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <span className="text-sm text-slate-700">Recommended Action</span>
                      <Badge className={simulatedRisk < project.deliveryRisk ? "bg-green-600" : "bg-red-600"}>
                        {simulatedRisk < project.deliveryRisk ? "Implement Changes" : "Reconsider"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-slate-700">
                      {velocityAdjustment[0] > 0 && scopeAdjustment[0] < 0 ? (
                        "✅ Optimal: Increasing velocity while reducing scope will significantly lower risk."
                      ) : velocityAdjustment[0] < 0 && scopeAdjustment[0] > 0 ? (
                        "⚠️ Warning: Reducing velocity and increasing scope will substantially increase risk."
                      ) : (
                        "ℹ️ Adjust the sliders to see how different scenarios impact project risk."
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Team Lead: Flow & CI/CD Charts */}
      {isManager && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">Velocity & Cycle Time Analysis</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Velocity Trend</CardTitle>
                <CardDescription>Planned vs delivered story points per sprint</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={velocityTrendData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="sprint" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }} />
                    <Bar dataKey="planned" name="Planned" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="delivered" name="Delivered" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-slate-300" />
                    <span className="text-xs text-slate-500">Planned</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span className="text-xs text-slate-500">Delivered</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Cycle Time Breakdown</CardTitle>
                <CardDescription>Issue cycle time, PR cycle time & review wait (weekly)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={cycleTimeTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="week" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} unit="h" />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }} />
                    <Line type="monotone" dataKey="cycleTime" name="Issue Cycle Time" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4, fill: "#3B82F6" }} />
                    <Line type="monotone" dataKey="prCycleTime" name="PR Cycle Time" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4, fill: "#8B5CF6" }} />
                    <Line type="monotone" dataKey="reviewTime" name="Review Wait" stroke="#F59E0B" strokeWidth={2} dot={{ r: 4, fill: "#F59E0B" }} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-5 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0.5 bg-blue-500 rounded" />
                    <span className="text-xs text-slate-500">Issue</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0.5 bg-violet-500 rounded" />
                    <span className="text-xs text-slate-500">PR</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0.5 bg-amber-500 rounded" />
                    <span className="text-xs text-slate-500">Review Wait</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-blue-600" />
                CI/CD Pipeline Health
              </CardTitle>
              <CardDescription>Stage-level success rates, average duration & failure counts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {cicdMetrics.map((stage) => (
                  <div key={stage.stage} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <p className="text-xs text-slate-500 mb-2">{stage.stage}</p>
                    <div className="flex items-end gap-1 mb-2">
                      <span className={`text-2xl font-bold ${stage.success >= 95 ? "text-green-600" : stage.success >= 90 ? "text-amber-600" : "text-red-600"}`}>
                        {stage.success}%
                      </span>
                      <span className="text-xs text-slate-400 mb-1">success</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full ${stage.success >= 95 ? "bg-green-500" : stage.success >= 90 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${stage.success}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>{stage.avgDuration} avg</span>
                      <span>{stage.failures} failures</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CTO: Tech Debt & Maintainability Charts */}
      {isCTO && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-slate-900">Code Health Trends</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>Tech Debt Ratio & Code Churn</CardTitle>
                <CardDescription>6-month trend from SonarQube + Git</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={maintainabilityTrendData}>
                    <defs>
                      <linearGradient id="colorDebtCTO" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorChurnCTO" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} unit="%" />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="debtRatio" name="Tech Debt Ratio" stroke="#F59E0B" strokeWidth={2} fill="url(#colorDebtCTO)" />
                    <Area type="monotone" dataKey="churn" name="Code Churn" stroke="#EF4444" strokeWidth={2} fill="url(#colorChurnCTO)" />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span className="text-xs text-slate-500">Debt Ratio</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span className="text-xs text-slate-500">Code Churn</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle>SonarQube Quality Gate</CardTitle>
                <CardDescription>Code smells, vulnerabilities, bugs & coverage over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={qualityGateTrendData} barGap={1} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748B", fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }} />
                    <Bar yAxisId="left" dataKey="smells" name="Code Smells" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="vulns" name="Vulnerabilities" fill="#EF4444" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="bugs" name="Bugs" fill="#F97316" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="coverage" name="Coverage" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: "#10B981" }} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-amber-500" />
                    <span className="text-xs text-slate-500">Smells</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span className="text-xs text-slate-500">Vulns</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-orange-500" />
                    <span className="text-xs text-slate-500">Bugs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-0.5 bg-green-500 rounded" />
                    <span className="text-xs text-slate-500">Coverage</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Maintainability Rating Trend</CardTitle>
              <CardDescription>SonarQube maintainability rating over 6 months (A is best)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={maintainabilityTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    domain={[1, 4]}
                    ticks={[1, 2, 3, 4]}
                    tickFormatter={(v: number) => ["", "A", "B", "C", "D"][v] || ""}
                    reversed
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #E2E8F0", fontSize: "12px" }}
                    formatter={(value: number) => [["", "A", "B", "C", "D"][Math.round(value)] || value, "Rating"]}
                  />
                  <Line type="monotone" dataKey="rating" name="Rating" stroke="#8B5CF6" strokeWidth={3} dot={{ r: 5, fill: "#8B5CF6", strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}