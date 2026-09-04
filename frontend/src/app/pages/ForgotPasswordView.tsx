import { useState } from "react";
import { Activity, AlertCircle, CheckCircle, ArrowLeft } from "lucide-react";
import { forgotPassword } from "../api";

export function ForgotPasswordView({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background text-foreground py-10">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <Activity size={20} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-[0.18em] uppercase" style={{ fontFamily: "var(--font-display)" }}>
            Pulse
          </span>
          <p className="text-sm text-muted-foreground text-center">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle size={40} className="text-link" />
            <p className="text-sm text-muted-foreground">
              If an account exists for that email, a reset link has been sent. It expires in 1 hour.
            </p>
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-link font-semibold hover:underline text-sm"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors({ ...errors, email: "" });
                  }}
                  className={`w-full bg-input-background border px-4 py-3 text-base placeholder:text-muted-foreground focus:border-primary transition-colors ${
                    errors.email ? "border-destructive/40" : "border-border"
                  }`}
                />
                {errors.email && (
                  <p className="text-sm text-destructive flex items-center gap-1 mt-1.5">
                    <AlertCircle size={13} />
                    {errors.email}
                  </p>
                )}
              </div>

              {errors.form && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle size={13} />
                  {errors.form}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-base font-semibold py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {isLoading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>

            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mt-6"
            >
              <ArrowLeft size={14} />
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
