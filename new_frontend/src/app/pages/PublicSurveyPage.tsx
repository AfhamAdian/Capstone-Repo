import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getPublicSurvey, type PublicSurveyForm } from "../api-survey";
import { SurveyFlow } from "../components/SurveyFlow";

/**
 * Standalone, unauthenticated page for `/survey/:token` - the link developers
 * receive by email/Slack/Telegram/Discord. Loads the real question set for
 * the bundle behind the token and renders the same SurveyFlow wizard used for
 * the in-app demo preview, just wired to the real public submit endpoint.
 */
export function PublicSurveyPage({ token }: { token: string }) {
  const [form, setForm] = useState<PublicSurveyForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getPublicSurvey(token)
      .then((f) => {
        if (!cancelled) setForm(f);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This survey link is invalid or has expired.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-base text-muted-foreground">Loading survey…</div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle size={28} className="text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Link not available</h2>
          <p className="text-base text-muted-foreground">{error ?? "This survey link is invalid or has expired."}</p>
        </div>
      </div>
    );
  }

  return <SurveyFlow standalone token={token} form={form} onClose={() => {}} />;
}
