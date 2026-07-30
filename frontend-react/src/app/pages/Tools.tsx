import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { CheckCircle, XCircle, Clock, GitBranch, Github, Shield, AlertCircle, RefreshCw } from "lucide-react";

export function Tools() {
  const integrations = [
    {
      id: "jira",
      name: "Jira",
      description: "Issue tracking and project management",
      icon: <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">J</div>,
      status: "connected",
      lastSync: "2 hours ago",
      mappedProjects: 12,
    },
    {
      id: "github",
      name: "GitHub",
      description: "Source code repository",
      icon: <Github className="h-10 w-10" />,
      status: "connected",
      lastSync: "15 minutes ago",
      mappedProjects: 15,
    },
    {
      id: "sonarcloud",
      name: "SonarCloud",
      description: "Code quality and security analysis",
      icon: <Shield className="h-10 w-10 text-orange-600" />,
      status: "connected",
      lastSync: "30 minutes ago",
      mappedProjects: 10,
    },
    {
      id: "gitlab",
      name: "GitLab",
      description: "DevOps platform",
      icon: <GitBranch className="h-10 w-10 text-orange-500" />,
      status: "not-connected",
      lastSync: null,
      mappedProjects: 0,
    },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Not Connected
          </Badge>
        );
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
          Integrations & Tools
        </h1>
        <p className="text-slate-600 mt-2">Connect and manage your SDLC tool integrations</p>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {integrations.map((integration) => (
          <Card
            key={integration.id}
            className="border-slate-200 bg-white/80 backdrop-blur-sm hover:shadow-lg transition-shadow"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="mt-1">{integration.icon}</div>
                  <div>
                    <CardTitle>{integration.name}</CardTitle>
                    <CardDescription className="mt-1">{integration.description}</CardDescription>
                  </div>
                </div>
                {getStatusBadge(integration.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {integration.status === "connected" && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Last Sync:</span>
                      <span className="font-medium text-slate-900">{integration.lastSync}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Mapped Projects:</span>
                      <span className="font-medium text-slate-900">{integration.mappedProjects}</span>
                    </div>
                  </>
                )}
                <div className="flex gap-2 pt-2">
                  {integration.status === "connected" ? (
                    <>
                      <Button variant="outline" className="flex-1">
                        Configure
                      </Button>
                      <Button variant="outline" className="flex-1">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync Now
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Project Mapping */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm mb-8">
        <CardHeader>
          <CardTitle>Project Mapping</CardTitle>
          <CardDescription>Map Jira projects to GitHub repositories and SonarCloud projects</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jira-project">Jira Project</Label>
                <Select>
                  <SelectTrigger id="jira-project">
                    <SelectValue placeholder="Select Jira project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proj-1">Project Alpha (PROJ)</SelectItem>
                    <SelectItem value="proj-2">Backend Services (BACK)</SelectItem>
                    <SelectItem value="proj-3">Frontend App (FRONT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="github-repo">GitHub Repository</Label>
                <Select>
                  <SelectTrigger id="github-repo">
                    <SelectValue placeholder="Select repository" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repo-1">company/legacy-api</SelectItem>
                    <SelectItem value="repo-2">company/old-frontend</SelectItem>
                    <SelectItem value="repo-3">company/data-pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sonar-project">SonarCloud Project</Label>
                <Select>
                  <SelectTrigger id="sonar-project">
                    <SelectValue placeholder="Select Sonar project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sonar-1">legacy-api-analysis</SelectItem>
                    <SelectItem value="sonar-2">frontend-quality</SelectItem>
                    <SelectItem value="sonar-3">pipeline-scan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              Create Mapping
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Mappings */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Active Mappings</CardTitle>
          <CardDescription>Currently configured project integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">Legacy API Project</h4>
                <Badge className="bg-green-600">Active</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-600 mb-1">Jira</p>
                  <p className="font-medium">Backend Services (BACK)</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">GitHub</p>
                  <p className="font-medium">company/legacy-api</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">SonarCloud</p>
                  <p className="font-medium">legacy-api-analysis</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600">
                  Remove
                </Button>
              </div>
            </div>

            <div className="p-4 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">Frontend Application</h4>
                <Badge className="bg-green-600">Active</Badge>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-600 mb-1">Jira</p>
                  <p className="font-medium">Frontend App (FRONT)</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">GitHub</p>
                  <p className="font-medium">company/old-frontend</p>
                </div>
                <div>
                  <p className="text-slate-600 mb-1">SonarCloud</p>
                  <p className="font-medium">frontend-quality</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600">
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync Status */}
      <Card className="mt-8 border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-slate-600 mb-1">Last Full Sync</p>
              <p className="text-xl font-bold text-slate-900">2 hours ago</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Next Scheduled Sync</p>
              <p className="text-xl font-bold text-slate-900">In 4 hours</p>
            </div>
            <div>
              <p className="text-sm text-slate-600 mb-1">Sync Frequency</p>
              <p className="text-xl font-bold text-slate-900">Every 6 hours</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
