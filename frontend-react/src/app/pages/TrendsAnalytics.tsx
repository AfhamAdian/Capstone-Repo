import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { sprintRiskData } from "../data/mockData";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts";
import { TrendingUp, Calendar } from "lucide-react";
import { useState } from "react";
import { useProjects } from "../context/ProjectDataContext";

export function TrendsAnalytics() {
  const [timeRange, setTimeRange] = useState("6-months");
  const { projects } = useProjects();

  const riskOverTime = [
    { month: "Sep 2023", avgRisk: 48, avgDelivery: 42, avgTechnical: 45 },
    { month: "Oct 2023", avgRisk: 45, avgDelivery: 40, avgTechnical: 43 },
    { month: "Nov 2023", avgRisk: 42, avgDelivery: 38, avgTechnical: 40 },
    { month: "Dec 2023", avgRisk: 38, avgDelivery: 35, avgTechnical: 38 },
    { month: "Jan 2024", avgRisk: 35, avgDelivery: 32, avgTechnical: 35 },
    { month: "Feb 2024", avgRisk: 32, avgDelivery: 30, avgTechnical: 32 },
  ];

  const correlationData = projects.map((p) => ({
    name: p.name,
    delivery: p.deliveryRisk,
    technical: p.technicalRisk,
    overall: p.overallRisk,
  }));

  const heatmapData = projects.map((p) => ({
    project: p.name.substring(0, 15),
    delivery: p.deliveryRisk,
    technical: p.technicalRisk,
    security: (p.securityHigh + p.securityBlocker) * 10,
  }));

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              Trends & Analytics
            </h1>
            <p className="text-slate-600 mt-2">Historical trends and cross-project analysis</p>
          </div>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px] border-slate-200">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3-months">Last 3 months</SelectItem>
              <SelectItem value="6-months">Last 6 months</SelectItem>
              <SelectItem value="12-months">Last 12 months</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Risk Trends Over Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm mb-8">
          <CardHeader>
            <CardTitle>Risk Trends Over Time</CardTitle>
            <CardDescription>Average risk scores across all tracked projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={riskOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fill: "#64748B" }} />
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
                  dataKey="avgRisk"
                  stroke="#EF4444"
                  strokeWidth={3}
                  name="Overall Risk"
                  dot={{ fill: "#EF4444", r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgDelivery"
                  stroke="#F59E0B"
                  strokeWidth={3}
                  name="Delivery Risk"
                  dot={{ fill: "#F59E0B", r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgTechnical"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  name="Technical Risk"
                  dot={{ fill: "#3B82F6", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Risk Heatmap */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Risk Heatmap Across Projects</CardTitle>
          <CardDescription>Visual comparison of different risk dimensions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">Project</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Delivery Risk</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Technical Risk</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">Security Risk</th>
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row, index) => {
                  const getRiskColor = (value: number) => {
                    if (value >= 70) return "bg-red-500";
                    if (value >= 40) return "bg-orange-500";
                    return "bg-green-500";
                  };

                  return (
                    <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-sm font-medium text-slate-900">{row.project}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`h-8 w-20 rounded ${getRiskColor(row.delivery)}`} />
                          <span className="text-sm font-semibold text-slate-900">{row.delivery}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`h-8 w-20 rounded ${getRiskColor(row.technical)}`} />
                          <span className="text-sm font-semibold text-slate-900">{row.technical}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <div className={`h-8 w-20 rounded ${getRiskColor(row.security)}`} />
                          <span className="text-sm font-semibold text-slate-900">{row.security}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card className="mt-8 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-green-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                Overall risk has decreased by <span className="font-semibold">33%</span> over the last 6 months
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-blue-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                Strong correlation (r=0.78) between delivery and technical risks suggests addressing one improves both
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-orange-600 mt-2"></div>
              <p className="text-sm text-slate-700">
                2 projects consistently show high risk across all dimensions - recommend prioritized intervention
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}