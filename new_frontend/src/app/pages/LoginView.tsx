import { useState } from "react";
import { Activity, AlertCircle, Eye, ClipboardList, Star } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";

const ROLE_OPTIONS = [
  { level: 0, label: "Viewer", description: "View only", icon: Eye },
  { level: 1, label: "Manager", description: "Can log actions", icon: ClipboardList },
  { level: 2, label: "Executive", description: "Can rate actions", icon: Star },
] as const;

export function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [level, setLevel] = useState<number>(1);
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
      login(email, level);
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

          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Sign in as
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ROLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = level === opt.level;
                return (
                  <button
                    key={opt.level}
                    type="button"
                    onClick={() => setLevel(opt.level)}
                    className={`flex flex-col items-center gap-1.5 border px-2 py-3 transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-input-background text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-[13px] font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                      {opt.label}
                    </span>
                    <span className="text-[11px] leading-tight text-center opacity-70">{opt.description}</span>
                  </button>
                );
              })}
            </div>
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
