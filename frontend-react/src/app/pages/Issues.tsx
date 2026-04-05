import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../components/ui/collapsible";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { mockIssues } from "../data/mockData";
import { AlertCircle, TrendingDown, XCircle, CheckCircle, Lightbulb, Clock, User, CheckCheck, ChevronDown, Filter, ThumbsUp, History } from "lucide-react";
import { Link, useNavigate } from "react-router";

// Define historical action type with upvotes
interface HistoricalActionWithUpvotes {
  date: string;
  action: string;
  outcome: string;
  takenBy: string;
  upvotes: number;
}

export function Issues() {
  const [severityFilter, setSeverityFilter] = useState("all");
  const [riskTypeFilter, setRiskTypeFilter] = useState("all");
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedIssueForResolve, setSelectedIssueForResolve] = useState<any | null>(null);
  const [resolutionLog, setResolutionLog] = useState("");
  const [expandPastActions, setExpandPastActions] = useState(false);
  const [selectedPastAction, setSelectedPastAction] = useState<number | null>(null);
  const [resolvedToday, setResolvedToday] = useState(7);
  const [historicalActionsOpen, setHistoricalActionsOpen] = useState(false);
  const [historicalIssueType, setHistoricalIssueType] = useState<string>("");
  const [selectedSheetIssue, setSelectedSheetIssue] = useState<any | null>(null);
  const [historicalActionsState, setHistoricalActionsState] = useState<Record<string, HistoricalActionWithUpvotes[]>>({
    "Delivery Risk": [
      {
        date: "Jan 15, 2024",
        action: "Scheduled code review session with senior developers",
        outcome: "Quality score improved by 12 points within 2 weeks",
        takenBy: "Sarah Johnson",
        upvotes: 5,
      },
      {
        date: "Dec 3, 2023",
        action: "Implemented automated code quality checks in CI pipeline",
        outcome: "Prevented 8 quality drops over 3 months",
        takenBy: "Michael Chen",
        upvotes: 3,
      },
    ],
    "Technical Debt": [
      {
        date: "Feb 1, 2024",
        action: "Allocated 20% of sprint capacity to technical debt reduction",
        outcome: "Reduced code complexity by 25% in one month",
        takenBy: "Alex Kumar",
        upvotes: 4,
      },
    ],
    "Security Vulnerability": [
      {
        date: "Jan 20, 2024",
        action: "Emergency hotfix deployed and dependencies updated",
        outcome: "Vulnerability patched within 4 hours, no incidents reported",
        takenBy: "Security Team",
        upvotes: 6,
      },
    ],
  });
  const navigate = useNavigate();

  const getIcon = (type: string) => {
    switch (type) {
      case "Delivery Risk":
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case "CI Failure":
      case "Security Vulnerability":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "Issues Increase":
      case "Technical Debt":
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-600" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "Critical":
        return <Badge variant="destructive" className="font-semibold">Critical</Badge>;
      case "High":
        return <Badge className="bg-orange-600 hover:bg-orange-700 font-semibold">High</Badge>;
      case "Medium":
        return <Badge className="bg-yellow-500 hover:bg-yellow-600 font-semibold">Medium</Badge>;
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  const getRiskTypeBadge = (riskType: string) => {
    const colors: Record<string, string> = {
      delivery: "bg-orange-100 text-orange-700 border-orange-300",
      technical: "bg-blue-100 text-blue-700 border-blue-300",
      security: "bg-red-100 text-red-700 border-red-300",
      quality: "bg-purple-100 text-purple-700 border-purple-300",
    };
    return <Badge variant="outline" className={colors[riskType] || ""}>{riskType}</Badge>;
  };

  const filteredIssues = mockIssues.filter((issue) => {
    if (severityFilter !== "all" && issue.severity !== severityFilter) return false;
    if (riskTypeFilter !== "all" && issue.riskType !== riskTypeFilter) return false;
    return true;
  });

  const handleUpvote = (issueType: string, actionIndex: number) => {
    setHistoricalActionsState(prev => ({
      ...prev,
      [issueType]: prev[issueType].map((action, index) =>
        index === actionIndex ? { ...action, upvotes: action.upvotes + 1 } : action
      )
    }));
  };

  const handleConfirmResolve = () => {
    if (selectedPastAction !== null && selectedIssueForResolve) {
      handleUpvote(selectedIssueForResolve.type, selectedPastAction);
    }

    if (resolutionLog.trim() && selectedIssueForResolve) {
      const newAction: HistoricalActionWithUpvotes = {
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        action: resolutionLog,
        outcome: "Resolution pending verification",
        takenBy: "Current User",
        upvotes: 0,
      };
      
      setHistoricalActionsState(prev => ({
        ...prev,
        [selectedIssueForResolve.type]: [newAction, ...(prev[selectedIssueForResolve.type] || [])]
      }));
    }

    setResolveModalOpen(false);
    setResolutionLog("");
    setSelectedPastAction(null);
    setSelectedIssueForResolve(null);
    setResolvedToday(resolvedToday + 1);
    setExpandPastActions(false);
  };

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              Issues & Notifications
            </h1>
            <p className="text-slate-600 mt-2">Monitor and respond to critical events across tracked projects</p>
          </div>
          <div className="flex gap-3">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-[160px] border-slate-200">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severity</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select value={riskTypeFilter} onValueChange={setRiskTypeFilter}>
              <SelectTrigger className="w-[160px] border-slate-200">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-slate-200 bg-white/80 backdrop-blur-sm hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Total Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-900">{filteredIssues.length}</p>
            <p className="text-xs text-slate-500 mt-1">Active notifications</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">
              {filteredIssues.filter((a) => a.severity === "Critical").length}
            </p>
            <p className="text-xs text-red-600 mt-1">Immediate action required</p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-white hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              High Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {filteredIssues.filter((a) => a.severity === "High").length}
            </p>
            <p className="text-xs text-orange-600 mt-1">Review recommended</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-white hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-700 flex items-center gap-2">
              <CheckCheck className="h-4 w-4" />
              Resolved Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{resolvedToday}</p>
            <p className="text-xs text-green-600 mt-1">Successfully addressed</p>
          </CardContent>
        </Card>
      </div>

      {/* Issues Table */}
      <Card className="border-slate-200 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Active Issues</CardTitle>
          <CardDescription>
            {filteredIssues.length} issue{filteredIssues.length !== 1 ? "s" : ""} requiring attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">Issue</TableHead>
                  <TableHead className="font-semibold">Project</TableHead>
                  <TableHead className="font-semibold text-center">Severity</TableHead>
                  <TableHead className="font-semibold text-center">Risk Type</TableHead>
                  <TableHead className="font-semibold">Detected</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIssues.map((issue) => (
                  <TableRow key={issue.id} className="hover:bg-slate-50">
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-8 w-8 rounded-lg bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                          {getIcon(issue.type)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-slate-900 mb-1">{issue.type}</h4>
                          <p className="text-sm text-slate-600 line-clamp-2">{issue.message}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/project/${issue.projectId}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {issue.projectName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-center">
                      {getSeverityBadge(issue.severity)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getRiskTypeBadge(issue.riskType)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{issue.timestamp}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedSheetIssue(issue)}
                            >
                              View Details
                            </Button>
                          </SheetTrigger>
                          <SheetContent className="w-[560px] sm:max-w-[560px] p-0 flex flex-col overflow-hidden">
                            {/* Accessible title & description (visually hidden) */}
                            <SheetTitle className="sr-only">{issue.type}</SheetTitle>
                            <SheetDescription className="sr-only">Issue details, root cause analysis, and suggested actions</SheetDescription>
                            {/* Header */}
                            <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 pt-6 pb-5">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-100 to-orange-100 flex items-center justify-center flex-shrink-0">
                                  {getIcon(issue.type)}
                                </div>
                                <div>
                                  <h3 className="font-semibold text-slate-900 text-lg">{issue.type}</h3>
                                  <p className="text-sm text-slate-500">Issue details and recommended actions</p>
                                </div>
                              </div>
                            </div>

                            {/* Scrollable Body */}
                            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                              {/* Overview Grid */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Overview</h4>
                                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-200">
                                  <div className="flex items-center justify-between px-4 py-3 bg-white">
                                    <span className="text-sm text-slate-500">Project</span>
                                    <Link to={`/project/${issue.projectId}`} className="text-sm text-blue-600 hover:underline font-medium">
                                      {issue.projectName}
                                    </Link>
                                  </div>
                                  <div className="flex items-center justify-between px-4 py-3 bg-white">
                                    <span className="text-sm text-slate-500">Severity</span>
                                    {getSeverityBadge(issue.severity)}
                                  </div>
                                  <div className="flex items-center justify-between px-4 py-3 bg-white">
                                    <span className="text-sm text-slate-500">Risk Type</span>
                                    {getRiskTypeBadge(issue.riskType)}
                                  </div>
                                  <div className="flex items-center justify-between px-4 py-3 bg-white">
                                    <span className="text-sm text-slate-500">Detected</span>
                                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                                      {issue.timestamp}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Description */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Description</h4>
                                <p className="text-sm text-slate-700 leading-relaxed p-4 bg-slate-50 rounded-xl border border-slate-100">
                                  {issue.message}
                                </p>
                              </div>

                              {/* Root Cause Analysis */}
                              {issue.rootCause && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                                    Root Cause Analysis
                                  </h4>
                                  <p className="text-sm text-slate-700 leading-relaxed p-4 bg-orange-50 rounded-xl border border-orange-200">
                                    {issue.rootCause}
                                  </p>
                                </div>
                              )}

                              {/* Suggested Action */}
                              {issue.suggestedAction && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
                                    Suggested Action
                                  </h4>
                                  <p className="text-sm text-slate-700 leading-relaxed p-4 bg-blue-50 rounded-xl border border-blue-200">
                                    {issue.suggestedAction}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Sticky Footer Actions */}
                            <div className="border-t border-slate-200 bg-white px-6 py-4 flex gap-3">
                              <Button
                                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                                onClick={() => navigate(`/project/${issue.projectId}`)}
                              >
                                View Project
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1"
                                onClick={() => {
                                  setHistoricalIssueType(issue.type);
                                  setHistoricalActionsOpen(true);
                                }}
                              >
                                <History className="h-4 w-4 mr-2" />
                                Past Actions
                              </Button>
                              <Button
                                variant="outline"
                                className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => {
                                  setResolveModalOpen(true);
                                  setSelectedIssueForResolve(issue);
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Resolve
                              </Button>
                            </div>
                          </SheetContent>
                        </Sheet>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => {
                            setResolveModalOpen(true);
                            setSelectedIssueForResolve(issue);
                          }}
                        >
                          <CheckCircle className="h-4 w-4" />
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

      {/* Historical Actions Dialog */}
      <Dialog open={historicalActionsOpen} onOpenChange={setHistoricalActionsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Historical Actions for {historicalIssueType}</DialogTitle>
            <DialogDescription>
              Review past successful strategies taken by your team for similar issues
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 space-y-4">
            {historicalActionsState[historicalIssueType]?.map((action, index) => (
              <div
                key={index}
                className="p-5 border border-slate-200 rounded-xl bg-slate-50/50 hover:bg-slate-100/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="text-sm font-medium text-slate-600">{action.date}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <User className="h-3 w-3" />
                      <span>{action.takenBy}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleUpvote(historicalIssueType, index)}
                    >
                      <ThumbsUp className="h-3 w-3" />
                      {action.upvotes}
                    </Button>
                  </div>
                </div>
                <div className="ml-10">
                  <h4 className="font-semibold text-slate-900 mb-2">Action Taken:</h4>
                  <p className="text-slate-700 mb-3">{action.action}</p>
                  <h4 className="font-semibold text-slate-900 mb-2">Outcome:</h4>
                  <p className="text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                    {action.outcome}
                  </p>
                </div>
              </div>
            ))}
            {(!historicalActionsState[historicalIssueType] || historicalActionsState[historicalIssueType].length === 0) && (
              <div className="p-8 text-center text-slate-500">
                No historical actions found for this issue type.
              </div>
            )}
          </div>
          <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-blue-700">Pro Tip:</span> Consider adapting these
              strategies to your current situation. Document your actions to help future team members.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resolve Issue Modal */}
      <Dialog open={resolveModalOpen} onOpenChange={setResolveModalOpen}>
        <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[85vh] overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 flex-shrink-0">
            <DialogTitle className="text-xl">Resolve Issue</DialogTitle>
            <DialogDescription>
              Log your resolution or select a past successful solution
            </DialogDescription>
          </DialogHeader>

          {selectedIssueForResolve && (
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Resolution Log */}
              <div className="space-y-2">
                <Label htmlFor="resolutionLog">Resolution Log (Optional)</Label>
                <Textarea
                  id="resolutionLog"
                  value={resolutionLog}
                  onChange={(e) => setResolutionLog(e.target.value)}
                  placeholder="Describe how you resolved this issue..."
                  className="h-20 resize-none"
                />
              </div>

              {/* Past Successful Resolutions */}
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  Past Successful Resolutions
                </h4>
                {(!historicalActionsState[selectedIssueForResolve.type] || historicalActionsState[selectedIssueForResolve.type].length === 0) ? (
                  <div className="p-6 bg-slate-50 rounded-xl text-center border border-slate-100">
                    <p className="text-sm text-slate-500">No similar past actions found</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                    {historicalActionsState[selectedIssueForResolve.type]?.map((ha, index) => (
                      <div
                        key={index}
                        onClick={() => {
                          if (selectedPastAction === index) {
                            setSelectedPastAction(null);
                            setResolutionLog("");
                          } else {
                            setSelectedPastAction(index);
                            setResolutionLog(ha.action);
                          }
                        }}
                        className={`p-3.5 border rounded-lg cursor-pointer transition-all ${
                          selectedPastAction === index
                            ? "border-green-500 bg-green-50 ring-1 ring-green-500/20"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {ha.takenBy}
                            </span>
                            <span>{ha.date}</span>
                            <span className="flex items-center gap-1">
                              <ThumbsUp className="h-3 w-3" />
                              {ha.upvotes}
                            </span>
                          </div>
                          {selectedPastAction === index && (
                            <Badge className="bg-green-600 text-xs px-1.5 py-0">Selected</Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-800 mb-1.5">{ha.action}</p>
                        <p className="text-xs text-green-700">{ha.outcome}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedPastAction !== null && (
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
              onClick={() => {
                setResolveModalOpen(false);
                setResolutionLog("");
                setSelectedPastAction(null);
                setSelectedIssueForResolve(null);
                setExpandPastActions(false);
              }}
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
    </div>
  );
}