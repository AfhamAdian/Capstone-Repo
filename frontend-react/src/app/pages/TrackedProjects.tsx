import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { mockProjects, type Project } from "../data/mockData";
import { Search, Plus, SlidersHorizontal, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { TrendArrow } from "../components/TrendArrow";

// ── Inline mini gauge that matches the design in the reference image ──
function MiniGauge({ value, prominent = false }: { value: number; prominent?: boolean }) {
  const getColor = (v: number) =>
    v >= 70 ? "#EF4444" : v >= 40 ? "#F97316" : "#10B981";

  const color = getColor(value);
  const textColor = value >= 70 ? "text-red-500" : value >= 40 ? "text-orange-500" : "text-green-500";

  const size = prominent ? 72 : 56;
  const r = prominent ? 28 : 22;
  const stroke = prominent ? 5 : 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative flex items-center justify-center rounded-full ${
          prominent
            ? "ring-2 ring-blue-200 ring-offset-2 bg-blue-50/60 shadow-sm shadow-blue-200"
            : ""
        }`}
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={stroke}
          />
          {/* Progress */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <span
          className={`relative z-10 font-bold tabular-nums ${textColor} ${
            prominent ? "text-base" : "text-sm"
          }`}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Column header ──
function ColHeader({ label, prominent = false }: { label: string; prominent?: boolean }) {
  return (
    <th
      className={`py-3 px-3 text-center whitespace-nowrap select-none ${
        prominent
          ? "text-blue-700 bg-blue-50/60"
          : "text-slate-600"
      }`}
    >
      <span className={`text-xs font-semibold uppercase tracking-wide ${prominent ? "text-blue-600" : ""}`}>
        {label}
      </span>
    </th>
  );
}

export function TrackedProjects() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("risk-desc");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>(() => mockProjects);
  const [syncBanner, setSyncBanner] = useState<{
    visible: boolean;
    variant: "info" | "success" | "warning" | "error";
    title: string;
    description: string;
  }>({
    visible: false,
    variant: "info",
    title: "",
    description: "",
  });
  const navigate = useNavigate();
  const env = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  const BACKEND_URL = env.env?.VITE_BACKEND_URL ?? "http://localhost:3000";
  const API_BASE_URL = env.env?.VITE_API_BASE_URL ?? `${BACKEND_URL}/api/v1`;
  const SYNC_TOOLS = ["jira", "github"] as const;
  const eventSourceRef = useRef<EventSource | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const activeSyncRef = useRef<{ projectId: string; sessionId: string } | null>(null);

  const mapRiskScoresToProject = (
    project: Project,
    riskScores?: Record<string, number | null>,
    riskScore?: number,
  ): Project => {
    const mapped = riskScores
      ? {
          deliveryRisk: typeof riskScores.DELIVERY === "number" ? riskScores.DELIVERY : project.deliveryRisk,
          codeQualityRisk: typeof riskScores.CODE_QUALITY === "number" ? riskScores.CODE_QUALITY : project.codeQualityRisk,
          engineeringProcessRisk:
            typeof riskScores.ENGINEERING_PROCESS === "number"
              ? riskScores.ENGINEERING_PROCESS
              : project.engineeringProcessRisk,
          ciCdReliabilityRisk:
            typeof riskScores.CICD_RELIABILITY === "number" ? riskScores.CICD_RELIABILITY : project.ciCdReliabilityRisk,
          teamHealthRisk: typeof riskScores.TEAM_HEALTH === "number" ? riskScores.TEAM_HEALTH : project.teamHealthRisk,
          securityRisk: typeof riskScores.SECURITY_RISK === "number" ? riskScores.SECURITY_RISK : project.securityRisk,
        }
      : null;

    const resolvedOverallRisk =
      typeof riskScore === "number"
        ? riskScore
        : mapped
          ? Math.round(
              (mapped.deliveryRisk + mapped.codeQualityRisk + mapped.engineeringProcessRisk + mapped.ciCdReliabilityRisk + mapped.teamHealthRisk + mapped.securityRisk) /
                6,
            )
          : project.overallRisk;

    return {
      ...project,
      ...(mapped ?? {}),
      overallRisk: resolvedOverallRisk,
      riskTrend: resolvedOverallRisk > project.overallRisk ? "up" : resolvedOverallRisk < project.overallRisk ? "down" : project.riskTrend,
      lastActivity: "just now",
    };
  };

  const trackedProjects = projects.filter((p) => p.status === "Tracked");

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
  }, []);

  const closeSyncStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const updateProjectRisk = (projectId: string, riskScore?: number, riskScores?: Record<string, number | null>) => {
    if (typeof riskScore !== "number" && !riskScores) {
      return;
    }

    setProjects((current) =>
      current.map((project) => (project.id === projectId ? mapRiskScoresToProject(project, riskScores, riskScore) : project)),
    );
  };

  const showBanner = (
    variant: "info" | "success" | "warning" | "error",
    title: string,
    description: string,
    autoHideMs?: number,
  ) => {
    setSyncBanner({ visible: true, variant, title, description });

    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }

    if (autoHideMs) {
      bannerTimerRef.current = window.setTimeout(() => {
        setSyncBanner((current) => ({ ...current, visible: false }));
        bannerTimerRef.current = null;
      }, autoHideMs);
    }
  };

  const finishSync = (projectId: string) => {
    setSyncingIds((prev) => {
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });

    activeSyncRef.current = null;
  };

  const filteredProjects = trackedProjects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.group.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    switch (sortBy) {
      case "risk-desc":  return b.overallRisk - a.overallRisk;
      case "risk-asc":   return a.overallRisk - b.overallRisk;
      case "name":       return a.name.localeCompare(b.name);
      case "delivery":   return b.deliveryRisk - a.deliveryRisk;
      case "security":   return b.securityRisk - a.securityRisk;
      default:           return 0;
    }
  });

  const handleSync = async (id: string) => {
    if (activeSyncRef.current) {
      showBanner("warning", "Sync already running", "Wait for the active sync to finish before starting another one.");
      return;
    }

    closeSyncStream();

    setSyncingIds((prev) => new Set(prev).add(id));

    const sessionId = `session_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    activeSyncRef.current = { projectId: id, sessionId };

    showBanner("info", "Syncing project…", "Sync job queued. Waiting for connector updates.");

    try {
      const response = await fetch(`${API_BASE_URL}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          projectId: id,
          tools: SYNC_TOOLS,
          sessionId,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to start sync");
      }

      await response.json().catch(() => null);

      const eventSource = new EventSource(`${API_BASE_URL}/progress/${sessionId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data) as {
            type?: string;
            jobId?: string;
            sessionId?: string;
            tool?: string;
            status?: string;
            riskScore?: number;
            riskScores?: Record<string, number | null>;
            toolsCompleted?: string[];
            toolsFailed?: string[];
            error?: string;
          };

          if (eventData.type === "connected") {
            return;
          }

          if (activeSyncRef.current?.sessionId !== sessionId) {
            return;
          }

          if (eventData.tool === "risk" && eventData.status === "calculating-risk") {
            showBanner("warning", "Calculating risk…", "Connector data fetched. Calculating the latest risk scores.");
            return;
          }

          if (eventData.tool && eventData.status === "syncing") {
            const label = eventData.tool === "github" ? "GitHub" : eventData.tool === "jira" ? "Jira" : eventData.tool;
            showBanner("info", "Syncing project…", `${label} connector is fetching data.`);
            return;
          }

          if (eventData.tool && eventData.status === "completed") {
            const label = eventData.tool === "github" ? "GitHub" : eventData.tool === "jira" ? "Jira" : eventData.tool;
            showBanner("info", "Connector complete", `${label} data fetched successfully.`);
            return;
          }

          if (eventData.tool && eventData.status === "failed") {
            const label = eventData.tool === "github" ? "GitHub" : eventData.tool === "jira" ? "Jira" : eventData.tool;
            showBanner("error", "Sync failed", `${label} connector failed: ${eventData.error ?? "Unknown error"}`);
            closeSyncStream();
            finishSync(id);
            return;
          }

          if (eventData.status === "success" || eventData.status === "partial" || eventData.status === "failed") {
            updateProjectRisk(id, eventData.riskScore, eventData.riskScores);

            if (eventData.status === "success") {
              showBanner(
                "success",
                "Sync completed",
                typeof eventData.riskScore === "number"
                  ? `Latest risk score: ${eventData.riskScore}`
                  : "Project sync finished successfully.",
                1500,
              );
            } else if (eventData.status === "partial") {
              showBanner(
                "warning",
                "Sync completed with warnings",
                `${eventData.toolsCompleted?.length ?? 0} connector(s) synced, ${eventData.toolsFailed?.length ?? 0} failed.`,
              );
            } else {
              showBanner("error", "Sync failed", eventData.error ?? "The sync job failed.");
            }

            closeSyncStream();
            finishSync(id);
          }
        } catch (error) {
          console.error("Failed to parse SSE event:", error);
        }
      };

      eventSource.onerror = () => {
        closeSyncStream();
        finishSync(id);

        if (!syncBanner.visible || syncBanner.variant !== "success") {
          showBanner("error", "Connection lost", "The live sync stream disconnected before completion.");
        }
      };
    } catch (error) {
      console.error("Sync request failed:", error);
      closeSyncStream();
      finishSync(id);
      showBanner(
        "error",
        "Failed to start sync",
        error instanceof Error ? error.message : "Unknown error",
      );
    } finally {
      if (activeSyncRef.current?.projectId === id && eventSourceRef.current === null) {
        finishSync(id);
      }
    }
  };

  const bannerStyles =
    syncBanner.variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : syncBanner.variant === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : syncBanner.variant === "error"
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-blue-200 bg-blue-50 text-blue-900";

  const bannerIcon =
    syncBanner.variant === "success"
      ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
      : syncBanner.variant === "warning"
        ? <Sparkles className="h-5 w-5 text-amber-600" />
        : syncBanner.variant === "error"
          ? <AlertTriangle className="h-5 w-5 text-rose-600" />
          : <Loader2 className="h-5 w-5 animate-spin text-blue-600" />;

  return (
    <div className="p-8 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 bg-clip-text text-transparent">
              Tracked Projects
            </h1>
            <p className="text-slate-600 mt-2">
              {trackedProjects.length} projects under active monitoring
            </p>
          </div>
          <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30">
            <Plus className="h-4 w-4 mr-2" />
            Add Project
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search projects or groups…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-slate-200"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[200px] border-slate-200">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="risk-desc">Highest Avg Risk First</SelectItem>
              <SelectItem value="risk-asc">Lowest Avg Risk First</SelectItem>
              <SelectItem value="delivery">Highest Delivery Risk</SelectItem>
              <SelectItem value="security">Highest Security Risk</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {syncBanner.visible && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm ${bannerStyles}`}
          role="status"
          aria-live="polite"
        >
          <div className="mt-0.5 flex-shrink-0">{bannerIcon}</div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-6">{syncBanner.title}</p>
            <p className="text-sm opacity-90">{syncBanner.description}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-0 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base text-slate-900">Project Risk Overview</CardTitle>
              <CardDescription>All 6 risk scores — higher score means greater risk</CardDescription>
            </div>
            <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
              {sortedProjects.length} projects
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {/* Project col */}
                  <th className="py-3 px-5 text-left">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Project</span>
                  </th>
                  {/* 6 risk cols */}
                  <ColHeader label="Delivery" />
                  <ColHeader label="Security" />
                  <ColHeader label="Code Quality" />
                  <ColHeader label="CI/CD" />
                  <ColHeader label="Eng. Process" />
                  <ColHeader label="Team Health" />
                  {/* Avg — prominent */}
                  <ColHeader label="Avg Risk" prominent />
                  {/* Trend + Actions */}
                  <th className="py-3 px-3 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Trend</span>
                  </th>
                  <th className="py-3 px-5 text-right">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProjects.map((project, idx) => {
                  const isSyncing = syncingIds.has(project.id);
                  const isLast = idx === sortedProjects.length - 1;

                  return (
                    <tr
                      key={project.id}
                      className={`group hover:bg-slate-50/70 transition-colors ${
                        !isLast ? "border-b border-slate-100" : ""
                      }`}
                    >
                      {/* Project name */}
                      <td className="py-4 px-5">
                        <div className="min-w-[160px]">
                          <Link
                            to={`/project/${project.id}`}
                            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline text-sm leading-tight"
                          >
                            {project.name}
                          </Link>
                          <p className="text-xs text-slate-500 mt-0.5">{project.group}</p>
                        </div>
                      </td>

                      {/* Delivery */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.deliveryRisk} />
                        </div>
                      </td>

                      {/* Security */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.securityRisk} />
                        </div>
                      </td>

                      {/* Code Quality */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.codeQualityRisk} />
                        </div>
                      </td>

                      {/* CI/CD */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.ciCdReliabilityRisk} />
                        </div>
                      </td>

                      {/* Eng. Process */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.engineeringProcessRisk} />
                        </div>
                      </td>

                      {/* Team Health */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.teamHealthRisk} />
                        </div>
                      </td>

                      {/* Avg Risk — prominent column */}
                      <td className="py-4 px-3 bg-blue-50/40 border-x border-blue-100/60 text-center">
                        <div className="flex justify-center">
                          <MiniGauge value={project.overallRisk} prominent />
                        </div>
                      </td>

                      {/* Trend */}
                      <td className="py-4 px-3 text-center">
                        <div className="flex justify-center">
                          <TrendArrow trend={project.riskTrend} showBackground size="sm" />
                        </div>
                      </td>

                      {/* Actions: Sync + View */}
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            disabled={isSyncing || Boolean(activeSyncRef.current)}
                            onClick={() => handleSync(project.id)}
                            title="Sync project data"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-blue-500" : ""}`}
                            />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 h-8 text-xs px-3 transition-colors"
                            onClick={() => navigate(`/project/${project.id}`)}
                          >
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {sortedProjects.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">No projects match your search.</p>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer avg row */}
              {sortedProjects.length > 0 && (() => {
                const avg = (fn: (p: typeof sortedProjects[0]) => number) =>
                  Math.round(sortedProjects.reduce((s, p) => s + fn(p), 0) / sortedProjects.length);
                return (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td className="py-3 px-5">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Portfolio Avg
                        </span>
                      </td>
                      {[
                        avg(p => p.deliveryRisk),
                        avg(p => p.securityRisk),
                        avg(p => p.codeQualityRisk),
                        avg(p => p.ciCdReliabilityRisk),
                        avg(p => p.engineeringProcessRisk),
                        avg(p => p.teamHealthRisk),
                      ].map((val, i) => {
                        const color = val >= 70 ? "text-red-500" : val >= 40 ? "text-orange-500" : "text-green-600";
                        return (
                          <td key={i} className="py-3 px-3 text-center">
                            <span className={`text-sm font-bold ${color}`}>{val}%</span>
                          </td>
                        );
                      })}
                      <td className="py-3 px-3 bg-blue-50/60 border-x border-blue-100/60 text-center">
                        {(() => {
                          const v = avg(p => p.overallRisk);
                          const color = v >= 70 ? "text-red-600" : v >= 40 ? "text-orange-500" : "text-green-600";
                          return <span className={`text-base font-black ${color}`}>{v}%</span>;
                        })()}
                      </td>
                      <td className="py-3 px-3" />
                      <td className="py-3 px-5" />
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
