import { useState } from "react";
import { Activity, AlertCircle } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";

export function RegisterView({
  onSuccess,
  onNavigateToLogin,
}: {
  onSuccess: () => void;
  onNavigateToLogin?: () => void;
}) {
  const { register } = useWorkspace();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const clearError = (field: string) =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Name is required";
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (!companyName.trim()) newErrors.companyName = "Company name is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      await register({ name, email, password, companyName });
      onSuccess();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Registration failed" });
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full bg-input-background border px-4 py-3 text-[15px] placeholder:text-muted-foreground outline-none focus:border-primary transition-colors ${
      errors[field] ? "border-red-500" : "border-border"
    }`;

  const fieldError = (field: string) =>
    errors[field] ? (
      <p className="text-sm text-red-500 flex items-center gap-1 mt-1.5">
        <AlertCircle size={13} />
        {errors[field]}
      </p>
    ) : null;

  const labelClass = "block text-sm font-semibold text-foreground mb-1.5";
  const labelStyle = { fontFamily: "var(--font-display)" };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground py-10">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <Activity size={20} className="text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-widest uppercase" style={labelStyle}>
            Pulse
          </span>
          <p className="text-sm text-muted-foreground text-center">Create your account and workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClass} style={labelStyle}>
              Full Name
            </label>
            <input
              id="name"
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
              className={inputClass("name")}
            />
            {fieldError("name")}
          </div>

          <div>
            <label htmlFor="email" className={labelClass} style={labelStyle}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError("email");
              }}
              className={inputClass("email")}
            />
            {fieldError("email")}
          </div>

          <div>
            <label htmlFor="companyName" className={labelClass} style={labelStyle}>
              Company Name
            </label>
            <input
              id="companyName"
              type="text"
              placeholder="Acme Inc."
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
                clearError("companyName");
              }}
              className={inputClass("companyName")}
            />
            {fieldError("companyName")}
          </div>

          <div>
            <label htmlFor="password" className={labelClass} style={labelStyle}>
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError("password");
              }}
              className={inputClass("password")}
            />
            {fieldError("password")}
          </div>

          {errors.form && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle size={13} />
              {errors.form}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-[15px] font-semibold py-3 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={labelStyle}
          >
            {isLoading ? "Creating Account…" : "Create Account"}
          </button>
        </form>

        {onNavigateToLogin && (
          <p className="text-sm text-muted-foreground text-center mt-6">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onNavigateToLogin}
              className="text-primary font-semibold hover:underline"
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
