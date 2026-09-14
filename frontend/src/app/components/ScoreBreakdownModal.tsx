import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { getScoreBreakdown, type ScoreBreakdown } from "../api-project";
import { hColor } from "../format";

export interface ScoreBreakdownType {
  type: string;
  label: string;
}

/** Which raw score type(s) a dashboard display category maps to - Code Quality is a
 *  frontend-only merge of 3 raw scores, the other 4 categories map 1:1. */
export const SCORE_BREAKDOWN_TYPES: Record<string, ScoreBreakdownType[]> = {
  codeQuality: [
    { type: "SECURITY", label: "Security" },
    { type: "RELIABILITY", label: "Reliability" },
    { type: "MAINTAINABILITY", label: "Maintainability" },
  ],
  cicdDeploymentHealth: [{ type: "CICD_DEPLOYMENT_HEALTH", label: "CI/CD" }],
  teamHealth: [{ type: "TEAM_HEALTH", label: "Team Health" }],
  engineeringProcess: [{ type: "ENGINEERING_PROCESS", label: "Engineering Process" }],
  planningExecution: [{ type: "PLANNING_EXECUTION", label: "Planning & Execution" }],
};

function formatMetricValue(value: number | string | boolean | null | undefined): string {
  if (value === null || value === undefined) return "not synced";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export function ScoreBreakdownModal({
  cardLabel, projectId, snapshotId, scoreTypes, onClose,
}: {
  cardLabel: string;
  projectId: string;
  snapshotId: number;
  scoreTypes: ScoreBreakdownType[];
  onClose: () => void;
}) {
  const [breakdowns, setBreakdowns] = useState<Record<string, ScoreBreakdown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const typeKey = scoreTypes.map((t) => t.type).join(",");

  useEffect(() => {
    let cancelled = false;
    setBreakdowns(null);
    setError(null);
    Promise.all(scoreTypes.map((t) => getScoreBreakdown(projectId, snapshotId, t.type)))
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, ScoreBreakdown> = {};
        results.forEach((r, i) => { map[scoreTypes[i]!.type] = r; });
        setBreakdowns(map);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load score breakdown");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, snapshotId, typeKey]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 8 }} transition={{ duration: 0.16 }}
        onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-card border border-border shadow-overlay">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-card">
          <div>
            <div className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{cardLabel}</div>
            <div className="text-xs text-muted-foreground mt-0.5">What this score was calculated from</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-6">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !breakdowns && <p className="text-sm text-muted-foreground">Loading...</p>}
          {breakdowns && scoreTypes.map((t) => {
            const b = breakdowns[t.type];
            if (!b) return null;
            return (
              <section key={t.type}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                    {scoreTypes.length > 1 ? t.label : "Score"}
                  </h3>
                  <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: hColor(b.score) }}>
                    {b.score}
                  </span>
                </div>
                {b.signals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No metrics were available for this snapshot.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {b.signals.map((s) => (
                      <div key={s.key} className="flex items-center justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{s.label}</div>
                          {s.metricFields.length > 0 && (
                            <div className="text-xs text-muted-foreground truncate">
                              {s.metricFields.map((f, i) => `${f}: ${formatMetricValue(s.metricValues[i])}`).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: s.score !== null ? hColor(s.score) : "var(--muted-foreground)" }}>
                            {s.score ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{Math.round(s.weight * 100)}% weight</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
