import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Sparkles, TrendingUp, AlertTriangle, Target, Zap } from "lucide-react";

export function ProjectInsights() {
  const insights = [
    {
      id: "1",
      type: "success",
      title: "Strong CI/CD Pipeline Performance",
      description:
        "85% of tracked projects maintain healthy CI pipeline with minimal failures. Best practices are being followed across teams.",
      impact: "High",
      projects: ["data-pipeline", "afhamadian.03-project"],
    },
    {
      id: "2",
      type: "warning",
      title: "Code Coverage Below Target",
      description:
        "Test coverage at 65% - below the organization's target of 80%. Consider prioritizing writing tests for uncovered modules.",
      impact: "Medium",
      projects: ["legacy-api", "old-frontend"],
    },
    {
      id: "3",
      type: "info",
      title: "Documentation Completeness Improving",
      description:
        "Documentation score increased by 15% this quarter. Active maintenance with regular updates noted across projects.",
      impact: "Medium",
      projects: ["data-pipeline", "mobile-app"],
    },
    {
      id: "4",
      type: "critical",
      title: "Technical Debt Accumulation",
      description:
        "Legacy-api project shows significant technical debt with 40+ maintainability issues. Recommend scheduling refactoring sprint.",
      impact: "Critical",
      projects: ["legacy-api"],
    },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
            Project Insights
          </h1>
          <p className="text-slate-600 mt-2">
            AI-driven analysis and actionable recommendations for your projects
          </p>
        </div>
        <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30">
          <Sparkles className="h-4 w-4 mr-2" />
          Generate New Insights
        </Button>
      </div>

      <div className="grid gap-6">
        {insights.map((insight) => {
          const getIcon = () => {
            switch (insight.type) {
              case "success":
                return <TrendingUp className="h-6 w-6 text-green-600" />;
              case "warning":
                return <AlertTriangle className="h-6 w-6 text-orange-600" />;
              case "critical":
                return <Zap className="h-6 w-6 text-red-600" />;
              default:
                return <Sparkles className="h-6 w-6 text-blue-600" />;
            }
          };

          const getBadgeVariant = () => {
            switch (insight.impact) {
              case "Critical":
                return "destructive";
              case "High":
                return "default";
              default:
                return "secondary";
            }
          };

          const getCardStyle = () => {
            switch (insight.type) {
              case "success":
                return "border-l-4 border-l-green-600 bg-gradient-to-r from-green-50/50 to-white hover:from-green-50 hover:to-white";
              case "warning":
                return "border-l-4 border-l-orange-600 bg-gradient-to-r from-orange-50/50 to-white hover:from-orange-50 hover:to-white";
              case "critical":
                return "border-l-4 border-l-red-600 bg-gradient-to-r from-red-50/50 to-white hover:from-red-50 hover:to-white";
              default:
                return "border-l-4 border-l-blue-600 bg-gradient-to-r from-blue-50/50 to-white hover:from-blue-50 hover:to-white";
            }
          };

          return (
            <Card key={insight.id} className={`${getCardStyle()} transition-all hover:shadow-lg`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 h-12 w-12 rounded-xl bg-white shadow-sm flex items-center justify-center border border-slate-200">
                      {getIcon()}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-2">{insight.title}</CardTitle>
                      <CardDescription className="text-base">{insight.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={getBadgeVariant()} className="font-semibold text-xs">
                    {insight.impact} Impact
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Affected Projects:</p>
                    <div className="flex flex-wrap gap-2">
                      {insight.projects.map((project) => (
                        <Badge key={project} variant="outline" className="font-medium">
                          {project}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" className="border-slate-200 hover:bg-white">
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Card */}
      <Card className="mt-8 border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Target className="h-5 w-5 text-blue-600" />
            Insight Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-2">Total Insights Generated</p>
              <p className="text-4xl font-bold text-slate-900">{insights.length}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-2">Critical Actions Required</p>
              <p className="text-4xl font-bold text-red-600">
                {insights.filter((i) => i.impact === "Critical").length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-2">Projects Analyzed</p>
              <p className="text-4xl font-bold text-slate-900">5</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}