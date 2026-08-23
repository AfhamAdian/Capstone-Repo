import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { motion } from "motion/react";
import {
  getProjectHealthProvenance,
  type HealthCategoryKey,
  type HealthProvenance,
} from "../api-project";

function scoreLabel(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ScoreProvenancePanel({
  projectId,
  focus,
  onClose,
}: {
  projectId: string;
  focus: "overall" | HealthCategoryKey;
  onClose: () => void;
}) {
  const [data, setData] = useState<HealthProvenance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getProjectHealthProvenance(projectId)
      .then((provenance) => {
        if (!cancelled) setData(provenance);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load provenance");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const focused = focus === "overall" ? null : data?.categories.find((category) => category.key === focus);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="provenance-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-card border border-border shadow-2xl"
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 id="provenance-title" className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
              <Info size={18} />
              Why this score
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {focused ? focused.label : "Overall health"} · {data?.computedAt ? fmtWhen(data.computedAt) : "latest snapshot"}
            </p>
          </div>
          <button aria-label="Close provenance" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {loading && <p className="text-sm text-muted-foreground">Loading the blend recipe…</p>}
          {error && <div className="border border-red-400/50 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600">{error}</div>}
          {data && (
            <>
              <div className="border border-border p-4">
                <div className="text-sm font-bold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  {focused ? focused.label : "Overall"} = {scoreLabel(focused ? focused.blended : data.overall)}
                </div>
                <p className="text-sm text-muted-foreground font-mono">
                  {focused ? focused.formula : data.overallFormula}
                </p>
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div className="border border-border px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Tool metrics ({Math.round(data.metricsWeight * 100)}%)</div>
                    <div className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                      {scoreLabel(focused ? focused.metricsScore : null) === "—" && !focused
                        ? data.metrics.used ? "used" : "none"
                        : scoreLabel(focused ? focused.metricsScore : null)}
                    </div>
                  </div>
                  <div className="border border-border px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Survey sentiment ({Math.round(data.surveyWeight * 100)}%)</div>
                    <div className="text-lg font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                      {focused ? scoreLabel(focused.surveyScore) : data.survey.used ? "used" : "none"}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-sm font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>Category mix</div>
                <div className="border border-border divide-y divide-border">
                  {data.categories.map((category) => {
                    const active = focus === "overall" || category.key === focus;
                    return (
                      <div key={category.key} className={`px-4 py-3 ${active ? "bg-muted/40" : "opacity-60"}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-semibold">{category.label}</span>
                          <span className="text-sm font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>{scoreLabel(category.blended)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">{category.formula}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>Metrics side</div>
                {!data.metrics.used && <p className="text-sm text-muted-foreground">No tool snapshot contributed to this score.</p>}
                {data.metrics.used && data.metrics.signals.length === 0 && (
                  <p className="text-sm text-muted-foreground">Synced {fmtWhen(data.metrics.snapshotTime)} — no notable incidents in this snapshot.</p>
                )}
                {data.metrics.signals.length > 0 && (
                  <ul className="space-y-2">
                    {(focus === "overall" ? data.metrics.signals : data.metrics.signals.filter((signal) => signal.category === focus))
                      .map((signal) => (
                        <li key={signal.label} className="text-sm border border-border px-3 py-2">{signal.label}</li>
                      ))}
                  </ul>
                )}
                {data.metrics.signals.length > 0 && focus !== "overall" && data.metrics.signals.every((signal) => signal.category !== focus) && (
                  <p className="text-sm text-muted-foreground mt-2">No incidents tagged to {focused?.label ?? "this category"} in the last snapshot.</p>
                )}
              </div>

              <div>
                <div className="text-sm font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>Survey side</div>
                {!data.survey.used && <p className="text-sm text-muted-foreground">No completed pulse contributed to this score yet.</p>}
                {data.survey.used && (
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      {data.survey.responseCount ?? 0} anonymous response{(data.survey.responseCount ?? 0) === 1 ? "" : "s"}
                      {data.survey.completedAt ? ` · closed ${fmtWhen(data.survey.completedAt)}` : ""}
                      {` · threshold ${data.survey.anonymityThreshold}`}
                    </p>
                    {data.survey.withheldReason && (
                      <p className="border border-amber-400/50 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-amber-800 dark:text-amber-300">
                        {data.survey.withheldReason}
                      </p>
                    )}
                    {data.survey.insight && <p>{data.survey.insight}</p>}
                    {data.survey.themes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {data.survey.themes.map((theme) => (
                          <span key={theme} className="border border-border px-2 py-1 text-xs">{theme}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
