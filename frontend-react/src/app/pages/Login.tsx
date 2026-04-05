import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { AlertCircle } from "lucide-react";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Clear previous user data when login page is accessed
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("pminsight.projects.v1");
      window.localStorage.removeItem("pminsight.trackedProjects.v1");
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Record<string, string> = {};
    
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Email is invalid";
    if (!password) newErrors.password = "Password is required";
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Mock login - in real app would validate credentials
    setIsLoading(true);
    setTimeout(() => {
      navigate("/workspaces");
    }, 1300);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Info */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-12 items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 h-72 w-72 bg-blue-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 h-72 w-72 bg-indigo-500 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 text-white max-w-md">
          <h2 className="text-4xl font-bold mb-6">Project Intelligence Platform</h2>
          <p className="text-lg text-blue-100 mb-8">
            Monitor project health, track risks, and make data-driven decisions with confidence.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-3xl font-bold mb-1">99.9%</p>
              <p className="text-sm text-blue-200">Uptime</p>
            </div>
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-3xl font-bold mb-1">500+</p>
              <p className="text-sm text-blue-200">Projects</p>
            </div>
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-3xl font-bold mb-1">50+</p>
              <p className="text-sm text-blue-200">Teams</p>
            </div>
            <div className="p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <p className="text-3xl font-bold mb-1">24/7</p>
              <p className="text-sm text-blue-200">Monitoring</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <Card className="w-full max-w-md border-0 shadow-none">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center mb-2">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/50">
                <span className="text-3xl font-bold text-white">PM</span>
              </div>
            </div>
            <CardTitle className="text-3xl text-center font-bold">Welcome Back</CardTitle>
            <CardDescription className="text-center text-base">
              Sign in to access your dashboard and insights
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors({ ...errors, email: "" });
                  }}
                  className={`h-11 ${errors.email ? "border-red-500" : "border-slate-200"}`}
                />
                {errors.email && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-700 font-medium">
                    Password
                  </Label>
                  <Link to="#" className="text-sm text-blue-600 hover:text-blue-700 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: "" });
                  }}
                  className={`h-11 ${errors.password ? "border-red-500" : "border-slate-200"}`}
                />
                {errors.password && (
                  <p className="text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-base font-medium shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? "Signing In..." : "Sign In"}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm">
              <span className="text-slate-600">Don't have an account? </span>
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}