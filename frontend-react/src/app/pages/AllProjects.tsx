import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Search, Users, ExternalLink, RefreshCw, Filter, Target, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "../context/UserContext";

const allProjects = [
  { id: "1", name: "Capstone-Repo", lastActivity: "5 hours ago", visibility: "Public", members: 5, status: "Untracked", repoUrl: "https://github.com/AfhamAdian/Capstone-Repo" },
  { id: "2", name: "NiramoyAI", lastActivity: "yesterday", visibility: "Public", members: 2, status: "Untracked" },
  { id: "3", name: "CSE-208-Data-Structure-and-Algorithms-2", lastActivity: "2 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "4", name: "CSE-214-Software-Engineering", lastActivity: "4 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "5", name: "CSE-310-Compiler", lastActivity: "6 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "6", name: "CSE-314-Operating-System", lastActivity: "1 week ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "7", name: "CSE_208_Online", lastActivity: "8 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "8", name: "CustomGEMINI", lastActivity: "10 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "9", name: "Gmail_Service", lastActivity: "12 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "10", name: "Google-Auth-Passport-Login", lastActivity: "2 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "11", name: "Graph-Rag-Langchain-Tryout", lastActivity: "15 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "12", name: "JavaFX-Term-Project-1-2-FoodMart", lastActivity: "18 days ago", visibility: "Public", members: 2, status: "Untracked" },
  { id: "13", name: "KnowledgeGraph-based-LLM-query-demo", lastActivity: "3 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "14", name: "LangChain_Practice_Gemini", lastActivity: "24 days ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "15", name: "Notification_Service", lastActivity: "1 month ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "16", name: "README-Template", lastActivity: "5 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "17", name: "Reddit_Full_Nested_Comment_System", lastActivity: "6 weeks ago", visibility: "Public", members: 3, status: "Untracked" },
  { id: "18", name: "RunMate_Beta", lastActivity: "7 weeks ago", visibility: "Public", members: 2, status: "Untracked" },
  { id: "19", name: "Spring-Boot-Postgre-Demo", lastActivity: "2 months ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "20", name: "TicTocToe-React-App", lastActivity: "9 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "21", name: "weather-ai-agent", lastActivity: "10 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "22", name: "Web-Analytics-Agent", lastActivity: "11 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "23", name: "Web-Analytics-and-Lead-Generating-Agent", lastActivity: "12 weeks ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "24", name: "Web-Session-Record-and-Playback", lastActivity: "2 months ago", visibility: "Public", members: 4, status: "Untracked" },
  { id: "25", name: "Websocket_Tryout", lastActivity: "2 months ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "26", name: "WheelBazaar", lastActivity: "3 months ago", visibility: "Public", members: 2, status: "Untracked" },
  { id: "27", name: "Youtube-Assistant", lastActivity: "2 months ago", visibility: "Public", members: 1, status: "Untracked" },
  { id: "28", name: "YoutubeAssistant", lastActivity: "3 months ago", visibility: "Public", members: 1, status: "Untracked" },
] as const;

export function AllProjects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState([...allProjects]);
  const [trackingProjectId, setTrackingProjectId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { isProjectTracked, trackProject, untrackProject } = useUser();

  useEffect(() => {
    setProjects([...allProjects]);
  }, []);

  const filteredProjects = useMemo(
    () => projects.filter((project) => project.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  );

  const handleTrack = (projectId: string) => {
    setTrackingProjectId(projectId);

    window.setTimeout(() => {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, status: "Tracked" as const } : project
        )
      );
      trackProject(projectId);
      setTrackingProjectId((current) => (current === projectId ? null : current));
    }, 1000);
  };

  const handleUntrack = (projectId: string) => {
    setProjects((current) =>
      current.map((project) => (project.id === projectId ? { ...project, status: "Untracked" as const } : project))
    );
    untrackProject(projectId);
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
            All Projects
          </h1>
          <p className="text-slate-600 mt-2">Comprehensive view and management of all projects across groups</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="border-slate-200">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync from GitLab
          </Button>
        </div>
      </div>

      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Projects Overview</CardTitle>
              <CardDescription>
                Showing {filteredProjects.length} of {allProjects.length} projects
              </CardDescription>
            </div>
            <div className="relative w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search projects or groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-slate-200"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 hover:bg-slate-50">
                  <TableHead className="font-semibold">Project Name</TableHead>
                  <TableHead className="font-semibold">Last Activity</TableHead>
                  <TableHead className="font-semibold">Visibility</TableHead>
                  <TableHead className="font-semibold">Members</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell>
                      <Link
                        to={`/project/${project.id}`}
                        className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-600">{project.lastActivity}</TableCell>
                    <TableCell>
                      <Badge variant={project.visibility === "Private" ? "secondary" : "outline"} className="font-medium">
                        {project.visibility}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Users className="h-4 w-4" />
                        <span className="font-medium">{project.members}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={project.status === "Tracked" ? "default" : "secondary"}
                        className={project.status === "Tracked" ? "bg-gradient-to-r from-blue-600 to-indigo-600 font-medium" : ""}
                      >
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {project.status === "Tracked" || isProjectTracked(project.id) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-blue-200 text-blue-600 hover:bg-blue-50"
                            onClick={() => handleUntrack(project.id)}
                          >
                            <Target className="h-4 w-4 mr-2" />
                            Tracked
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 hover:bg-slate-50"
                            onClick={() => handleTrack(project.id)}
                            disabled={trackingProjectId === project.id}
                          >
                            {trackingProjectId === project.id ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <EyeOff className="h-4 w-4 mr-2" />
                            )}
                            {trackingProjectId === project.id ? "Tracking" : "Track"}
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="border-slate-200 hover:bg-slate-50"
                          onClick={() => navigate(`/project/${project.id}`)}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => project.repoUrl && window.open(project.repoUrl, "_blank", "noopener,noreferrer")}
                          disabled={!project.repoUrl}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
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