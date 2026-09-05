import { useState } from "react";
import { Activity, AlertCircle, CheckCircle } from "lucide-react";
import { resetPassword } from "../api";

export function ResetPasswordView({
  token,
  onSuccess,
  onBackToLogin,
}: {
  token: string | null;
  onSuccess: () => void;
  onBackToLogin: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (confirm !== password) newErrors.confirm = "Passwords do not match";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      await resetPassword(token ?? "", password);
      setDone(true);
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Reset failed" });
    } finally {
      setIsLoading(false);
    }
  };

  // Missing token means the user reached this screen without a valid reset link.
  if (!token) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-foreground py-10">
        <div className="w-full max-w-sm px-6 flex flex-col items-center gap-4 text-center">
          <AlertCircle size={40} className="text-destructive" />
          <p className="text-sm text-muted-foreground">
            This reset link is missing or invalid. Please request a new one.
          </p>
          <button type="button" onClick={onBackToLogin} className="text-link font-semibold hover:underline text-sm">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-muted-foreground text-center">Choose a new password for your account</p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle size={40} className="text-link" />
            <p className="text-sm text-muted-foreground">
              Your password has been reset. Please sign in with your new password.
            </p>
            <button type="button" onClick={onSuccess} className="text-link font-semibold hover:underline text-sm">
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
                New Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: "" });
                }}
                className={`w-full bg-input-background border px-4 py-3 text-base placeholder:text-muted-foreground focus:border-primary transition-colors ${
                  errors.password ? "border-destructive/40" : "border-border"
                }`}
              />
              {errors.password && (
                <p className="text-sm text-destructive flex items-center gap-1 mt-1.5">
                  <AlertCircle size={13} />
                  {errors.password}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (errors.confirm) setErrors({ ...errors, confirm: "" });
                }}
                className={`w-full bg-input-background border px-4 py-3 text-base placeholder:text-muted-foreground focus:border-primary transition-colors ${
                  errors.confirm ? "border-destructive/40" : "border-border"
                }`}
              />
              {errors.confirm && (
                <p className="text-sm text-destructive flex items-center gap-1 mt-1.5">
                  <AlertCircle size={13} />
                  {errors.confirm}
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
              {isLoading ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
