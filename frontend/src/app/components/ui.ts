/**
 * Button treatments. Two weights, one size each — the app previously mixed px-7/py-3,
 * px-6/py-2.5 and px-4/py-2.5 primaries on a single screen.
 *
 * Kept out of PageShell.tsx so that file exports only components (fast refresh).
 */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed";

export const btnSecondary =
  "inline-flex items-center justify-center gap-2 border border-border bg-card text-foreground text-sm font-semibold px-5 py-2.5 hover:border-primary hover:text-link transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
