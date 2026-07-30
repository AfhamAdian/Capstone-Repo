import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Target, Filter, CheckCircle, Clock, User, TrendingUp, AlertTriangle, ChevronDown, ThumbsUp, History } from "lucide-react";
import { Link } from "react-router";

interface Action {
  id: string;
  title: string;
  project: string;
  projectId: string;
  impact: "High" | "Medium" | "Low";
  effort: "High" | "Medium" | "Low";
  owner: string;
  status: "Pending" | "In Progress" | "Completed" | "Blocked";
  severity: "Critical" | "High" | "Medium";
  dueDate: string;
  relatedMetrics: {
    metric: string;
    current: number;
    target: number;
  }[];
  description: string;
}

interface HistoricalAction {
  id: string;
  actionTitle: string;
  resolution: string;
  resolvedBy: string;
  resolvedDate: string;
  upvotes: number;
  project: string;
}

export function ActionCenter() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [historicalActionsOpen, setHistoricalActionsOpen] = useState(false);
  const [resolutionLog, setResolutionLog] = useState("");
  const [expandPastActions, setExpandPastActions] = useState(false);
  const [selectedPastAction, setSelectedPastAction] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([
    {
      id: "1",
      title: "Reduce Sprint Spillover Rate",
      project: "legacy-api",
      projectId: "2",
      impact: "High",
      effort: "Medium",
      owner: "Sarah Johnson",
      status: "In Progress",
      severity: "Critical",
      dueDate: "2024-02-20",
      relatedMetrics: [
        { metric: "Spillover Rate", current: 45, target: 20 },
        { metric: "Delivery Risk", current: 78, target: 40 },
      ],
      description: "High spillover rate is the primary driver of delivery risk. Implement stricter sprint commitment rules and mid-sprint checkpoints.",
    },
    {
      id: "2",
      title: "Increase Code Coverage to 80%",
      project: "old-frontend",
      projectId: "3",
      impact: "High",
      effort: "High",
      owner: "Alex Kumar",
      status: "Pending",
      severity: "High",
      dueDate: "2024-03-01",
      relatedMetrics: [
        { metric: "Code Coverage", current: 55, target: 80 },
        { metric: "Technical Risk", current: 58, target: 35 },
      ],
      description: "Low test coverage is exposing the project to quality risks. Allocate 30% of next sprint to writing tests for critical modules.",
    },
    {
      id: "3",
      title: "Resolve Security Blocker Issues",
      project: "legacy-api",
      projectId: "2",
      impact: "High",
      effort: "Low",
      owner: "Michael Chen",
      status: "Blocked",
      severity: "Critical",
      dueDate: "2024-02-18",
      relatedMetrics: [
        { metric: "Security Blockers", current: 1, target: 0 },
        { metric: "Security Risk", current: 85, target: 10 },
      ],
      description: "Critical security vulnerability in authentication module. Blocked pending security team review.",
    },
    {
      id: "4",
      title: "Refactor High-Complexity Modules",
      project: "data-pipeline",
      projectId: "4",
      impact: "Medium",
      effort: "High",
      owner: "Emily Rodriguez",
      status: "Pending",
      severity: "Medium",
      dueDate: "2024-03-10",
      relatedMetrics: [
        { metric: "Code Complexity", current: 8.5, target: 5.0 },
        { metric: "Maintainability", current: 65, target: 85 },
      ],
      description: "Several modules exceed complexity threshold. Schedule dedicated refactoring sprint.",
    },
    {
      id: "5",
      title: "Address Review Bottleneck",
      project: "old-frontend",
      projectId: "3",
      impact: "Medium",
      effort: "Low",
      owner: "David Park",
      status: "Completed",
      severity: "Medium",
      dueDate: "2024-02-15",
      relatedMetrics: [
        { metric: "PR Cycle Time", current: 24, target: 12 },
        { metric: "Review Wait Time", current: 16, target: 6 },
      ],
      description: "Bob Smith is reviewing 60% of all PRs. Distribute review responsibilities across team.",
    },
  ]);
  const [historicalActions, setHistoricalActions] = useState<HistoricalAction[]>([
    {
      id: "h1",
      actionTitle: "Reduce Sprint Spillover Rate",
      resolution: "Implemented daily standups with specific focus on sprint commitment tracking. Created a mid-sprint checkpoint on Wednesday to identify at-risk items early. Reduced story points per sprint by 15% to account for unplanned work.",
      resolvedBy: "Sarah Johnson",
      resolvedDate: "2024-01-15",
      upvotes: 12,
      project: "legacy-api",
    },
    {
      id: "h2",
      actionTitle: "Reduce Sprint Spillover Rate",
      resolution: "Introduced a 'no new features in last 3 days of sprint' policy. This allowed the team to focus on completing in-progress work rather than starting new items. Spillover dropped from 45% to 28%.",
      resolvedBy: "Michael Chen",
      resolvedDate: "2023-11-20",
      upvotes: 8,
      project: "old-frontend",
    },
    {
      id: "h3",
      actionTitle: "Increase Code Coverage",
      resolution: "Allocated 2 hours per day for each developer to write tests. Started with critical path modules first. Set up automated coverage reports in CI/CD. Went from 55% to 82% coverage in 6 weeks.",
      resolvedBy: "Alex Kumar",
      resolvedDate: "2024-01-05",
      upvotes: 15,
      project: "old-frontend",
    },
    {
      id: "h4",
      actionTitle: "Resolve Security Issues",
      resolution: "Conducted security audit with external team. Upgraded authentication library to latest version. Implemented automated security scanning in pre-commit hooks. Zero critical vulnerabilities detected in follow-up scan.",
      resolvedBy: "Emily Rodriguez",
      resolvedDate: "2023-12-10",
      upvotes: 20,
      project: "legacy-api",
    },
    {
      id: "h5",
      actionTitle: "Address Review Bottleneck",
      resolution: "Created rotating review schedule. Set up CODEOWNERS file to distribute reviews automatically. Implemented 'review within 4 hours' SLA. Reduced average review time from 24h to 8h.",
      resolvedBy: "David Park",
      resolvedDate: "2024-02-10",
      upvotes: 10,
      project: "old-frontend",
    },
  ]);

  // Helper function to find relevant past actions for current action
  const getRelevantPastActions = (action: Action) => {
    return historicalActions.filter(
      (ha) => 
        ha.actionTitle.toLowerCase().includes(action.title.toLowerCase().split(" ").slice(0, 3).join(" ").toLowerCase()) ||
        action.title.toLowerCase().includes(ha.actionTitle.toLowerCase().split(" ").slice(0, 3).join(" ").toLowerCase())
    );
  };

  const handleResolveAction = (action: Action) => {
    setSelectedAction(action);
    setResolveModalOpen(true);
    setResolutionLog("");
    setExpandPastActions(false);
    setSelectedPastAction(null);
  };

  const handleConfirmResolve = () => {
    if (!selectedAction) return;
    
    if (selectedPastAction) {
      // Upvote the selected past action
      setHistoricalActions(prev => 
        prev.map(ha => 
          ha.id === selectedPastAction 
            ? { ...ha, upvotes: ha.upvotes + 1 }
            : ha
        )
      );
    }
    
    // Mark action as completed
    setActions(prev =>
      prev.map(action =>
        action.id === selectedAction.id
          ? { ...action, status: "Completed" as const }
          : action
      )
    );
    
    // If resolution log provided, add to historical actions
    if (resolutionLog.trim()) {
      const newHistoricalAction: HistoricalAction = {
        id: `h${Date.now()}`,
        actionTitle: selectedAction.title,
        resolution: resolutionLog,
        resolvedBy: selectedAction.owner, // In a real app, this would be the current user
        resolvedDate: new Date().toISOString().split('T')[0],
        upvotes: 0,
        project: selectedAction.project,
      };
      setHistoricalActions(prev => [newHistoricalAction, ...prev]);
    }
    
    setResolveModalOpen(false);
    setSelectedAction(null);
    setResolutionLog("");
    setSelectedPastAction(null);
  };

  const handleUpvoteHistoricalAction = (actionId: string) => {
    setHistoricalActions(prev =>
      prev.map(ha =>
        ha.id === actionId ? { ...ha, upvotes: ha.upvotes + 1 } : ha
      )
    );
  };

  const filteredActions = actions.filter((action) => {
    if (projectFilter !== "all" && action.project !== projectFilter) return false;
    if (severityFilter !== "all" && action.severity !== severityFilter) return false;
    return true;
  });

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case "High":
        return <Badge className="bg-red-600">High Impact</Badge>;
      case "Medium":
        return <Badge className="bg-orange-600">Medium Impact</Badge>;
      default:
        return <Badge variant="secondary">Low Impact</Badge>;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case "High":
        return <Badge variant="outline" className="border-red-300 text-red-700">High Effort</Badge>;
      case "Medium":
        return <Badge variant="outline" className="border-orange-300 text-orange-700">Medium Effort</Badge>;
      default:
        return <Badge variant="outline" className="border-green-300 text-green-700">Low Effort</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Completed":
        return <Badge className="bg-green-600">Completed</Badge>;
      case "In Progress":
        return <Badge className="bg-blue-600">In Progress</Badge>;
      case "Blocked":
        return <Badge variant="destructive">Blocked</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const stats = {
    total: actions.length,
    critical: actions.filter(a => a.severity === "Critical").length,
    inProgress: actions.filter(a => a.status === "In Progress").length,
    completed: actions.filter(a => a.status === "Completed").length,
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              Action Center
            </h1>
            <p className="text-slate-600 mt-2">Prioritized actions to improve project health</p>
          </div>
          <div className="flex gap-3">
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[200px] border-slate-200">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="legacy-api">legacy-api</SelectItem>
                <SelectItem value="old-frontend">old-frontend</SelectItem>
                <SelectItem value="data-pipeline">data-pipeline</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[180px] border-slate-200">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
              </SelectContent>
            </Select>

            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Target className="h-4 w-4 mr-2" />
              Create Action
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Actions</p>
                <p className="text-3xl font-bold text-slate-900">{stats.total}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Target className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-700 mb-1">Critical</p>
                <p className="text-3xl font-bold text-red-600">{stats.critical}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 mb-1">In Progress</p>
                <p className="text-3xl font-bold text-blue-600">{stats.inProgress}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 mb-1">Completed</p>
                <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Table */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Prioritized Actions</CardTitle>
          <CardDescription>
            {filteredActions.length} action{filteredActions.length !== 1 ? "s" : ""} - sorted by impact and severity
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Action</TableHead>
                  <TableHead className="font-semibold">Project</TableHead>
                  <TableHead className="font-semibold text-center">Impact</TableHead>
                  <TableHead className="font-semibold text-center">Effort</TableHead>
                  <TableHead className="font-semibold">Owner</TableHead>
                  <TableHead className="font-semibold text-center">Status</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActions.map((action) => (
                  <TableRow key={action.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-1">{action.title}</h4>
                        <Badge
                          variant={action.severity === "Critical" ? "destructive" : "secondary"}
                          className={action.severity === "High" ? "bg-orange-600" : ""}
                        >
                          {action.severity}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/project/${action.projectId}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {action.project}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {getImpactBadge(action.impact)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getEffortBadge(action.effort)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                          {action.owner.split(" ").map(n => n[0]).join("")}
                        </div>
                        <span className="text-sm text-slate-700">{action.owner}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(action.status)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {action.dueDate}
                    </TableCell>
                    <TableCell className="text-right">
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedAction(action)}
                          >
                            View Details
                          </Button>
                        </SheetTrigger>
                        <SheetContent className="w-[600px] sm:max-w-[600px] p-0 flex flex-col overflow-hidden">
                          <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-200">
                            <SheetTitle>{action.title}</SheetTitle>
                            <SheetDescription>
                              Action details and related metrics
                            </SheetDescription>
                          </SheetHeader>
                          
                          {/* Scrollable Body */}
                          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Overview</h4>
                              <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
                                <div className="flex items-center justify-between px-4 py-3 bg-white">
                                  <span className="text-sm text-slate-500">Project</span>
                                  <Link to={`/project/${action.projectId}`} className="text-sm text-blue-600 hover:underline font-medium">
                                    {action.project}
                                  </Link>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-white">
                                  <span className="text-sm text-slate-500">Severity</span>
                                  <Badge variant={action.severity === "Critical" ? "destructive" : "secondary"}>
                                    {action.severity}
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-white">
                                  <span className="text-sm text-slate-500">Impact / Effort</span>
                                  <div className="flex gap-2">
                                    {getImpactBadge(action.impact)}
                                    {getEffortBadge(action.effort)}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-white">
                                  <span className="text-sm text-slate-500">Owner</span>
                                  <span className="text-sm font-medium text-slate-900">{action.owner}</span>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3 bg-white">
                                  <span className="text-sm text-slate-500">Due Date</span>
                                  <span className="text-sm font-medium text-slate-900">{action.dueDate}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Description</h4>
                              <p className="text-sm text-slate-700 leading-relaxed p-4 bg-slate-50 rounded-xl border border-slate-100">
                                {action.description}
                              </p>
                            </div>

                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Related Metrics</h4>
                              <div className="space-y-3">
                                {action.relatedMetrics.map((metric, index) => (
                                  <div key={index} className="p-4 border border-slate-200 rounded-xl">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm font-medium text-slate-700">{metric.metric}</span>
                                      <TrendingUp className="h-4 w-4 text-slate-400" />
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <div>
                                        <p className="text-xs text-slate-500">Current</p>
                                        <p className="text-xl font-bold text-red-600">{metric.current}{typeof metric.current === 'number' && metric.current < 100 ? '%' : ''}</p>
                                      </div>
                                      <div className="flex-1 flex items-center gap-2">
                                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-gradient-to-r from-red-500 to-green-500"
                                            style={{ width: `${(metric.current / Math.max(metric.current, metric.target)) * 100}%` }}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-xs text-slate-500">Target</p>
                                        <p className="text-xl font-bold text-green-600">{metric.target}{typeof metric.target === 'number' && metric.target < 100 ? '%' : ''}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Sticky Footer Actions */}
                          <div className="border-t border-slate-200 bg-white px-6 py-4 flex gap-3">
                            {action.status !== "Completed" && (
                              <>
                                <Button 
                                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                                  onClick={() => handleResolveAction(action)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Resolve
                                </Button>
                                <Button 
                                  variant="outline" 
                                  className="flex-1"
                                  onClick={() => setHistoricalActionsOpen(true)}
                                >
                                  <History className="h-4 w-4 mr-2" />
                                  Historical Actions
                                </Button>
                              </>
                            )}
                            {action.status === "Completed" && (
                              <div className="w-full p-3 bg-green-50 rounded-lg border border-green-200 text-center">
                                <CheckCircle className="h-6 w-6 text-green-600 mx-auto mb-1" />
                                <p className="text-sm font-semibold text-green-900">Action Completed</p>
                              </div>
                            )}
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Resolve Action Modal */}
      <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh] overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 flex-shrink-0">
            <DialogTitle className="text-xl">Resolve Action</DialogTitle>
            <DialogDescription>
              Log your resolution or select a past successful solution
            </DialogDescription>
          </DialogHeader>
          {selectedAction && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Resolution Log */}
              <div className="space-y-2">
                <Label htmlFor="resolutionLog">Resolution Log (Optional)</Label>
                <Textarea
                  id="resolutionLog"
                  value={resolutionLog}
                  onChange={(e) => setResolutionLog(e.target.value)}
                  placeholder="Enter resolution details..."
                  className="h-20 resize-none"
                />
              </div>

              {/* Past Successful Resolutions */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Past Successful Resolutions
                </h4>
                {getRelevantPastActions(selectedAction).length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-xl text-center border border-slate-100">
                    <p className="text-sm text-slate-500">No similar past actions found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                    {getRelevantPastActions(selectedAction).map((ha) => (
                      <div
                        key={ha.id}
                        onClick={() => {
                          if (selectedPastAction === ha.id) {
                            setSelectedPastAction(null);
                            setResolutionLog("");
                          } else {
                            setSelectedPastAction(ha.id);
                            setResolutionLog(ha.resolution);
                          }
                        }}
                        className={`p-3.5 border rounded-lg cursor-pointer transition-all ${
                          selectedPastAction === ha.id
                            ? "border-green-500 bg-green-50 ring-1 ring-green-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {ha.resolvedBy}
                            </span>
                            <span>{ha.resolvedDate}</span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              {ha.upvotes}
                            </span>
                          </div>
                          {selectedPastAction === ha.id && (
                            <Badge className="bg-green-600 text-xs px-1.5 py-0">Selected</Badge>
                          )}
                        </div>
                        <h5 className="text-sm font-medium text-slate-900 mb-1">{ha.actionTitle}</h5>
                        <p className="text-sm text-slate-700">{ha.resolution}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedPastAction && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-800">
                    The selected solution will be automatically upvoted when you confirm.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-3 flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResolveModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              onClick={handleConfirmResolve}
            >
              Confirm Resolve
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historical Actions Modal */}
      <Dialog open={historicalActionsOpen} onOpenChange={setHistoricalActionsOpen}>
        <DialogContent className="w-[700px] sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical Actions</DialogTitle>
            <DialogDescription>
              View past actions and their resolutions with upvote counts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {historicalActions
              .sort((a, b) => b.upvotes - a.upvotes)
              .map((ha) => (
                <div 
                  key={ha.id} 
                  className="p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-slate-900 mb-1">{ha.actionTitle}</h4>
                      <div className="flex items-center gap-4 text-xs text-slate-600 mb-2">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {ha.resolvedBy}
                        </span>
                        <span>{ha.resolvedDate}</span>
                        <Badge variant="secondary" className="text-xs">
                          {ha.project}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpvoteHistoricalAction(ha.id)}
                        className="flex items-center gap-1"
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {ha.upvotes}
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{ha.resolution}</p>
                </div>
              ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoricalActionsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}