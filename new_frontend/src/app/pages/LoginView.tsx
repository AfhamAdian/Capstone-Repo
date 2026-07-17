import { useState } from "react";
import { Activity, AlertCircle } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";

export function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";
    if (!password) newErrors.password = "Password is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      login(email);
      onSuccess();
    }, 1300);
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <Activity size={20} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-widest uppercase" style={{ fontFamily: "var(--font-display)" }}>
            Pulse
          </span>
          <p className="text-sm text-muted-foreground text-center">Sign in to access your dashboard and insights</p>
        </div>

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
              className={`w-full bg-input-background border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
                errors.email ? "border-red-500" : "border-border"
              }`}
            />
            {errors.email && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1.5">
                <AlertCircle size={13} />
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Password
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
              className={`w-full bg-input-background border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
                errors.password ? "border-red-500" : "border-border"
              }`}
            />
            {errors.password && (
              <p className="text-sm text-red-500 flex items-center gap-1 mt-1.5">
                <AlertCircle size={13} />
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {isLoading ? "Signing In…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
