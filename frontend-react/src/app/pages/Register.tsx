import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { UserRole } from "../data/mockData";
import { AlertCircle, CheckCircle } from "lucide-react";

export function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    role: "" as UserRole | "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [bannerOpacity, setBannerOpacity] = useState(1);

  useEffect(() => {
    if (!showSuccess) return;

    // Show banner for 3 seconds, then fade out over 0.5 seconds
    const timer1 = setTimeout(() => {
      setBannerOpacity(0);
    }, 3000);

    // Redirect after fade completes
    const timer2 = setTimeout(() => {
      navigate("/login");
    }, 3500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [showSuccess, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Record<string, string> = {};
    
    if (!formData.name) newErrors.name = "Full name is required";
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";
    if (!formData.company) newErrors.company = "Company name is required";
    if (!formData.role) newErrors.role = "Please select a role";
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // Mock registration - in real app would create account
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setShowSuccess(true);
    }, 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
    // Clear error when user starts typing
    if (errors[e.target.id]) {
      setErrors({ ...errors, [e.target.id]: "" });
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-white">
        {/* Success Banner */}
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pt-6 transition-opacity duration-500"
          style={{ opacity: bannerOpacity }}
        >
          <div className="flex items-center gap-3 px-6 py-4 bg-green-50 border border-green-200 rounded-xl shadow-lg max-w-md mx-auto">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Account Successfully Created!</p>
              <p className="text-sm text-green-700">Redirecting to sign in...</p>
            </div>
          </div>
        </div>

        {/* Blurred form in background */}
        <Card className="w-full max-w-md border-0 shadow-none blur-sm opacity-50 pointer-events-none">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-center mb-2">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <span className="text-3xl font-bold text-white">PM</span>
              </div>
            </div>
            <CardTitle className="text-3xl text-center font-bold">Create Account</CardTitle>
            <CardDescription className="text-center text-base">
              Join your team's Project Management Intelligence Platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-11 bg-slate-200 rounded" />
              <div className="h-11 bg-slate-200 rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-white">
      <Card className="w-full max-w-md border-0 shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center mb-2">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/50">
              <span className="text-3xl font-bold text-white">PM</span>
            </div>
          </div>
          <CardTitle className="text-3xl text-center font-bold">Create Account</CardTitle>
          <CardDescription className="text-center text-base">
            Join your team's Project Management Intelligence Platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-700 font-medium">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Afham Adian"
                value={formData.name}
                onChange={handleChange}
                className={`h-11 ${errors.name ? "border-red-500" : "border-slate-200"}`}
              />
              {errors.name && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-medium">
                Email Address <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={formData.email}
                onChange={handleChange}
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
              <Label htmlFor="company" className="text-slate-700 font-medium">
                Company <span className="text-red-500">*</span>
              </Label>
              <Input
                id="company"
                type="text"
                placeholder="Your Company"
                value={formData.company}
                onChange={handleChange}
                className={`h-11 ${errors.company ? "border-red-500" : "border-slate-200"}`}
              />
              {errors.company && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.company}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-slate-700 font-medium">
                Role <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.role}
                onValueChange={(value) => {
                  setFormData({ ...formData, role: value as UserRole });
                  if (errors.role) setErrors({ ...errors, role: "" });
                }}
              >
                <SelectTrigger className={`h-11 ${errors.role ? "border-red-500" : "border-slate-200"}`}>
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CEO">CEO - Executive overview</SelectItem>
                  <SelectItem value="CTO">CTO - Technical leadership</SelectItem>
                  <SelectItem value="PM">Project Manager - Delivery focus</SelectItem>
                  <SelectItem value="Developer">Developer - Code & metrics</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.role}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-medium">
                Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                value={formData.password}
                onChange={handleChange}
                className={`h-11 ${errors.password ? "border-red-500" : "border-slate-200"}`}
              />
              {errors.password && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.password}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">
                Confirm Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`h-11 ${errors.confirmPassword ? "border-red-500" : "border-slate-200"}`}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-base font-medium shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <span className="text-slate-600">Already have an account? </span>
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}