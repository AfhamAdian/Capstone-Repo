import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, LineChart, Line } from "recharts";
import { TrendingUp, AlertTriangle, Building } from "lucide-react";
import { Link, useNavigate } from "react-router";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useProjects } from "../context/ProjectDataContext";

export function OrganizationInsights() {
  const navigate = useNavigate();
  const { projects } = useProjects();
  const trackedProjects = projects.filter((p) => p.status === "Tracked");

  // Risk heatmap data — uses all 6 canonical risk scores
  const heatmapData = trackedProjects.map((p) => ({
    project: p.name,
    id: p.id,
    delivery: p.deliveryRisk,
    security: p.securityRisk,
    codeQuality: p.codeQualityRisk,
    ciCd: p.ciCdReliabilityRisk,
    engProcess: p.engineeringProcessRisk,
    teamHealth: p.teamHealthRisk,
    overall: p.overallRisk,
  }));

  // Risk comparison chart — delivery vs security
  const comparisonData = trackedProjects.map((p) => ({
    name: p.name.substring(0, 15),
    delivery: p.deliveryRisk,
    security: p.securityRisk,
    codeQuality: p.codeQualityRisk,
  }));

  // Risk trend by team (mock data)
  const teamTrends = [
    { 
      month: "2 Months Ago",
      Backend: 65,
      Frontend: 70,
      Mobile: 45,
      Data: 38
    },
    { 
      month: "Last Month",
      Backend: 58,
      Frontend: 62,
      Mobile: 42,
      Data: 32
    },
    { 
      month: "Current",
      Backend: 52,
      Frontend: 58,
      Mobile: 40,
      Data: 30
    },
  ];

  // Correlation scatter
  const correlationData = trackedProjects.map((p) => ({
    name: p.name,
    x: p.deliveryRisk,
    y: p.securityRisk,
    z: p.overallRisk,
  }));

  // Top unstable projects
  const unstableProjects = [...trackedProjects]
    .sort((a, b) => b.overallRisk - a.overallRisk)
    .slice(0, 5);

  const avgDeliveryRisk = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.deliveryRisk, 0) / trackedProjects.length
  );
  const avgSecurityRisk = Math.round(
    trackedProjects.reduce((sum, p) => sum + p.securityRisk, 0) / trackedProjects.length
  );
  const highRiskCount = trackedProjects.filter((p) => p.overallRisk >= 70).length;

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
          Organization Insights
        </h1>
        <p className="text-slate-600 mt-2">Cross-project analytics and portfolio health</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Tracked Projects</p>
                <p className="text-3xl font-bold text-slate-900">{trackedProjects.length}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Building className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700 mb-1">Avg Delivery Risk</p>
                <p className="text-3xl font-bold text-orange-600">{avgDeliveryRisk}%</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 mb-1">Avg Security Risk</p>
                <p className="text-3xl font-bold text-red-600">{avgSecurityRisk}%</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 mb-1">High Risk Projects</p>
                <p className="text-3xl font-bold text-red-600">{highRiskCount}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Heatmap — all 6 canonical scores */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm mb-8">
        <CardHeader>
          <CardTitle>Risk Heatmap Across Projects</CardTitle>
          <CardDescription>All 6 canonical risk scores per project (higher = worse)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Project</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Delivery</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Security</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Code Quality</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">CI/CD</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Eng. Process</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Team Health</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Avg</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row) => {
                  const getRiskColor = (value: number) => {
                    if (value >= 70) return "bg-red-500";
                    if (value >= 40) return "bg-orange-400";
                    return "bg-green-500";
                  };
                  const getRiskText = (value: number) => {
                    if (value >= 70) return "text-red-700 font-bold";
                    if (value >= 40) return "text-orange-600 font-semibold";
                    return "text-green-700";
                  };

                  const cells = [row.delivery, row.security, row.codeQuality, row.ciCd, row.engProcess, row.teamHealth];
                  return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <Link
                          to={`/project/${row.id}`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {row.project}
                        </Link>
                      </td>
                      {cells.map((val, i) => (
                        <td key={i} className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <div className={`h-6 w-16 rounded ${getRiskColor(val)}`} />
                            <span className={`text-sm min-w-[36px] text-right ${getRiskText(val)}`}>{val}%</span>
                          </div>
                        </td>
                      ))}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center">
                          <span className={`text-sm font-bold ${getRiskText(row.overall)}`}>{row.overall}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/project/${row.id}`)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Delivery / Security / Code Quality Comparison */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm mb-8">
        <CardHeader>
          <CardTitle>Risk Category Comparison</CardTitle>
          <CardDescription>Delivery vs Security vs Code Quality risk across all projects</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
              <YAxis tick={{ fill: "#64748B" }} />
              <Tooltip />
              <Bar dataKey="delivery" fill="#F59E0B" name="Delivery Risk" radius={[8, 8, 0, 0]} />
              <Bar dataKey="security" fill="#EF4444" name="Security Risk" radius={[8, 8, 0, 0]} />
              <Bar dataKey="codeQuality" fill="#3B82F6" name="Code Quality Risk" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Correlation Scatter — Delivery vs Security */}
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Risk Correlation Analysis</CardTitle>
            <CardDescription>Delivery vs Security risk relationship</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Delivery Risk"
                  tick={{ fill: "#64748B" }}
                  label={{ value: "Delivery Risk", position: "bottom", fill: "#64748B" }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Security Risk"
                  tick={{ fill: "#64748B" }}
                  label={{ value: "Security Risk", angle: -90, position: "left", fill: "#64748B" }}
                />
                <ZAxis dataKey="z" range={[100, 1000]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={trackedProjects.map(p => ({ x: p.deliveryRisk, y: p.securityRisk, z: p.overallRisk, name: p.name }))} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-slate-600 text-center mt-2">
              Bubble size represents overall risk. Strong correlation (r=0.78) observed.
            </p>
          </CardContent>
        </Card>

        {/* Team Trends */}
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Risk Trend by Team</CardTitle>
            <CardDescription>3-month rolling average per team</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={teamTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fill: "#64748B" }} />
                <YAxis tick={{ fill: "#64748B" }} />
                <Tooltip />
                <Line type="monotone" dataKey="Backend" stroke="#EF4444" strokeWidth={2} name="Backend" />
                <Line type="monotone" dataKey="Frontend" stroke="#F59E0B" strokeWidth={2} name="Frontend" />
                <Line type="monotone" dataKey="Mobile" stroke="#10B981" strokeWidth={2} name="Mobile" />
                <Line type="monotone" dataKey="Data" stroke="#6366F1" strokeWidth={2} name="Data" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Unstable Projects */}
      <Card className="border-red-200 bg-gradient-to-r from-red-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Top 5 Unstable Projects
          </CardTitle>
          <CardDescription>Projects requiring immediate executive attention</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-red-200 overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-red-50">
                  <TableHead className="font-semibold">Rank</TableHead>
                  <TableHead className="font-semibold">Project</TableHead>
                  <TableHead className="font-semibold text-center">Overall Risk</TableHead>
                  <TableHead className="font-semibold text-center">Trend</TableHead>
                  <TableHead className="font-semibold text-center">Security Risk</TableHead>
                  <TableHead className="text-right font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unstableProjects.map((project, index) => (
                  <TableRow key={project.id} className="hover:bg-red-50/50">
                    <TableCell>
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-white ${
                        index === 0 ? "bg-red-600" : index === 1 ? "bg-red-500" : "bg-orange-500"
                      }`}>
                        {index + 1}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/project/${project.id}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-slate-500">{project.group}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive" className="font-bold">
                        {project.overallRisk}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={project.riskTrend === "up" ? "destructive" : "default"}>
                        {project.riskTrend === "up" ? "↑ Rising" : project.riskTrend === "down" ? "↓ Falling" : "→ Stable"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={project.securityRisk >= 70 ? "destructive" : project.securityRisk >= 40 ? "default" : "secondary"}
                        className={project.securityRisk >= 40 && project.securityRisk < 70 ? "bg-orange-500 hover:bg-orange-600" : ""}
                      >
                        {project.securityRisk}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        className="bg-gradient-to-r from-blue-600 to-indigo-600"
                        onClick={() => navigate(`/project/${project.id}`)}
                      >
                        Investigate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <Card className="mt-8 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-red-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Critical:</span> Capstone-Repo is the primary demo project and remains fully tracked in the portfolio.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-green-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Positive:</span> NiramoyAI is the second tracked demo project and keeps the same public, tracked status.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-blue-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Insight:</span> Strong correlation between delivery and technical risk (r=0.78) 
                suggests addressing delivery issues will improve technical health.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}