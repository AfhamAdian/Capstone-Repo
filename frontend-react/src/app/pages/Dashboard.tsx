import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { mockProjects, sprintRiskData } from "../data/mockData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, AlertTriangle, FolderKanban, Target, Filter, Calendar, Users, Shield, Code, GitPullRequest } from "lucide-react";
import { Link, useNavigate } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { RiskGauge } from "../components/RiskGauge";
import { TrendArrow } from "../components/TrendArrow";
import { MetricCard } from "../components/MetricCard";
import { InsightPanel } from "../components/InsightPanel";
import { useUser } from "../context/UserContext";
import { getRoleDescription } from "../utils/roleConfig";
import { CEORiskIntelligence } from "../components/CEORiskIntelligence";

export function Dashboard() {
  const [dateFilter, setDateFilter] = useState("last-30-days");
  const [teamFilter, setTeamFilter] = useState("all");
  const navigate = useNavigate();
  const { user } = useUser();
  
  const trackedProjects = mockProjects.filter((p) => p.status === "Tracked");
  const avgQuality = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.qualityScore, 0) / trackedProjects.length
  );
  const avgOverallRisk = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.overallRisk, 0) / trackedProjects.length
  );
  const avgSecurityRisk = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.securityRisk, 0) / trackedProjects.length
  );
  const avgDeliveryRisk = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.deliveryRisk, 0) / trackedProjects.length
  );
  const criticalRiskProjects = trackedProjects.filter((p) => p.overallRisk >= 70).length;
  const securityIssues = trackedProjects.reduce((sum, p) => sum + p.securityHigh + p.securityBlocker, 0);

  // Sort projects by overall risk (descending)
  const sortedProjects = [...trackedProjects].sort((a, b) => b.overallRisk - a.overallRisk);
  
  // Role-specific project sorting
  const getRoleSpecificProjects = () => {
    switch (user.role) {
      case "CEO":
        return [...trackedProjects].sort((a, b) => b.overallRisk - a.overallRisk);
      case "CTO":
        return [...trackedProjects].sort((a, b) => b.codeQualityRisk - a.codeQualityRisk);
      case "Manager":
        return [...trackedProjects].sort((a, b) => b.deliveryRisk - a.deliveryRisk);
      case "Developer":
        return trackedProjects.filter(p => p.codeQualityRisk > 40 || p.securityRisk > 30);
      default:
        return sortedProjects;
    }
  };

  const roleSpecificProjects = getRoleSpecificProjects();

  const riskDistribution = [
    { name: "Low Risk", value: trackedProjects.filter(p => p.overallRisk < 40).length, color: "#10B981" },
    { name: "Medium Risk", value: trackedProjects.filter(p => p.overallRisk >= 40 && p.overallRisk < 70).length, color: "#F59E0B" },
    { name: "High Risk", value: trackedProjects.filter(p => p.overallRisk >= 70).length, color: "#EF4444" },
  ];

  const COLORS = ["#10B981", "#F59E0B", "#EF4444"];

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      {/* Header with Filters */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              Dashboard Overview
            </h1>
            <p className="text-slate-600 mt-2">{getRoleDescription(user.role)}</p>
          </div>
          <div className="flex gap-3">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[180px] border-slate-200">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last-7-days">Last 7 days</SelectItem>
                <SelectItem value="last-30-days">Last 30 days</SelectItem>
                <SelectItem value="last-90-days">Last 90 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[180px] border-slate-200">
                <Users className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                <SelectItem value="backend-team">Backend Team</SelectItem>
                <SelectItem value="frontend-team">Frontend Team</SelectItem>
                <SelectItem value="mobile-team">Mobile Team</SelectItem>
                <SelectItem value="data-engineering">Data Engineering</SelectItem>
              </SelectContent>
            </Select>

            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Primary Stats - Role Specific */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {user.role === "CEO" && (
          <>
            <MetricCard
              title="Total Projects"
              value={mockProjects.length}
              icon={FolderKanban}
              trend={{ value: "+12% from last month", isPositive: true }}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
            />
            <MetricCard
              title="Critical Risk Projects"
              value={criticalRiskProjects}
              icon={AlertTriangle}
              iconBgColor="bg-red-100"
              iconColor="text-red-600"
            />
            <MetricCard
              title="Avg Security Risk"
              value={`${avgSecurityRisk}%`}
              icon={Shield}
              trend={{ value: "-5% from last week", isPositive: true }}
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
            />
            <MetricCard
              title="Avg Overall Risk"
              value={`${avgOverallRisk}%`}
              icon={Target}
              trend={{ value: "-3% from last week", isPositive: true }}
              iconBgColor="bg-purple-100"
              iconColor="text-purple-600"
            />
          </>
        )}
        
        {user.role === "CTO" && (
          <>
            <MetricCard
              title="Avg Quality Score"
              value={`${avgQuality}%`}
              icon={Code}
              trend={{ value: "+3% from last week", isPositive: true }}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
            />
            <MetricCard
              title="Avg Security Risk"
              value={`${avgSecurityRisk}%`}
              icon={Shield}
              trend={{ value: "-6% from last week", isPositive: true }}
              iconBgColor="bg-red-100"
              iconColor="text-red-600"
            />
            <MetricCard
              title="Security Issues"
              value={securityIssues}
              icon={AlertTriangle}
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
            />
            <MetricCard
              title="High Code Quality Risk"
              value={trackedProjects.filter(p => p.codeQualityRisk >= 60).length}
              icon={Code}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
            />
          </>
        )}
        
        {user.role === "Manager" && (
          <>
            <MetricCard
              title="Tracked Projects"
              value={trackedProjects.length}
              icon={Target}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
            />
            <MetricCard
              title="Avg Delivery Risk"
              value={`${avgDeliveryRisk}%`}
              icon={TrendingUp}
              trend={{ value: "-5% from last week", isPositive: true }}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
            />
            <MetricCard
              title="At Risk Projects"
              value={trackedProjects.filter(p => p.deliveryRisk >= 60).length}
              icon={AlertTriangle}
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
            />
            <MetricCard
              title="Team Velocity"
              value="85%"
              icon={Users}
              trend={{ value: "+2% from last sprint", isPositive: true }}
              iconBgColor="bg-purple-100"
              iconColor="text-purple-600"
            />
          </>
        )}
        
        {user.role === "Developer" && (
          <>
            <MetricCard
              title="Active Projects"
              value={roleSpecificProjects.length}
              icon={Code}
              iconBgColor="bg-blue-100"
              iconColor="text-blue-600"
            />
            <MetricCard
              title="Avg Code Quality"
              value={`${avgQuality}%`}
              icon={Target}
              trend={{ value: "+4% improvement", isPositive: true }}
              iconBgColor="bg-green-100"
              iconColor="text-green-600"
            />
            <MetricCard
              title="Security Alerts"
              value={trackedProjects.filter(p => p.securityRisk >= 50).length}
              icon={Shield}
              iconBgColor="bg-orange-100"
              iconColor="text-orange-600"
            />
            <MetricCard
              title="Open PRs"
              value="12"
              icon={GitPullRequest}
              iconBgColor="bg-indigo-100"
              iconColor="text-indigo-600"
            />
          </>
        )}
      </div>

      {/* Where to Focus This Week */}
      <InsightPanel
        title="Where to Focus This Week"
        description="AI-recommended priorities based on risk trends and business impact"
        variant="warning"
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-orange-200">
            <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-red-700 font-bold text-sm">1</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 mb-1">Capstone-Repo - Primary Demo Project</h4>
              <p className="text-sm text-slate-600 mb-2">
                This is the main project shown in the demo with the active repository link and tracked status.
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate("/project/1")}>
                View Project
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-white rounded-lg border border-orange-200">
            <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-orange-700 font-bold text-sm">2</span>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-slate-900 mb-1">NiramoyAI - Secondary Demo Project</h4>
              <p className="text-sm text-slate-600 mb-2">
                This is the second tracked project in the demo and is included in the portfolio overview.
              </p>
              <Button size="sm" variant="outline" onClick={() => navigate("/project/2")}>
                View Project
              </Button>
            </div>
          </div>
        </div>
      </InsightPanel>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 my-8">
        <Card className="lg:col-span-2 border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>4-Sprint Risk Trend</CardTitle>
            <CardDescription>Delivery vs CI/CD Reliability risk evolution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={sprintRiskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="sprint" tick={{ fill: "#64748B" }} />
                <YAxis tick={{ fill: "#64748B" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #E2E8F0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="deliveryRisk"
                  stroke="#F59E0B"
                  strokeWidth={3}
                  name="Delivery Risk"
                  dot={{ fill: "#F59E0B", r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="ciCdReliabilityRisk"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  name="CI/CD Reliability Risk"
                  dot={{ fill: "#3B82F6", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>Current project risk levels</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={riskDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-4">
              {riskDistribution.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-sm text-slate-600">{entry.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CEO: Organizational Risk Intelligence */}
      {user.role === "CEO" && <CEORiskIntelligence projects={trackedProjects} navigate={navigate} />}

      {/* Project Risk Ranking Table */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Project Risk Ranking</CardTitle>
              <CardDescription>Sorted by overall risk score (highest first)</CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate("/tracked")}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-semibold">Project</TableHead>
                  <TableHead className="font-semibold text-center">Delivery</TableHead>
                  <TableHead className="font-semibold text-center">Security</TableHead>
                  <TableHead className="font-semibold text-center">Code Quality</TableHead>
                  <TableHead className="font-semibold text-center">CI/CD</TableHead>
                  <TableHead className="font-semibold text-center">Avg Risk</TableHead>
                  <TableHead className="font-semibold text-center">Trend</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roleSpecificProjects.slice(0, 5).map((project) => (
                  <TableRow key={project.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div>
                        <Link
                          to={`/project/${project.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs text-slate-500">{project.group}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <RiskGauge value={project.deliveryRisk} size="sm" showLabel={false} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <RiskGauge value={project.securityRisk} size="sm" showLabel={false} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <RiskGauge value={project.codeQualityRisk} size="sm" showLabel={false} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <RiskGauge value={project.ciCdReliabilityRisk} size="sm" showLabel={false} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <RiskGauge value={project.overallRisk} size="sm" showLabel={false} />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <TrendArrow trend={project.riskTrend} showBackground />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/project/${project.id}`)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}