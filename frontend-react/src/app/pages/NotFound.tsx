import { useEffect } from "react";
import { useNavigate, useRouteError, isRouteErrorResponse } from "react-router";

export function NotFound() {
  const navigate = useNavigate();
  const error = useRouteError();

  useEffect(() => {
    // Redirect to dashboard after component mounts
    const timer = setTimeout(() => {
      navigate("/", { replace: true });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [navigate]);

  // Handle route errors
  let errorMessage = "Page not found";
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || "Page not found";
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Redirecting...</h1>
        <p className="text-slate-600">Taking you back to the dashboard</p>
      </div>
    </div>
  );
}