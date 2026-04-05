import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Lightbulb } from "lucide-react";

interface InsightPanelProps {
  title: string;
  description?: string;
  children: ReactNode;
  variant?: "default" | "warning" | "success" | "info";
}

export function InsightPanel({ title, description, children, variant = "default" }: InsightPanelProps) {
  const variantClasses = {
    default: "border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50",
    warning: "border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50",
    success: "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50",
    info: "border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50",
  };

  const iconColors = {
    default: "text-blue-600",
    warning: "text-orange-600",
    success: "text-green-600",
    info: "text-slate-600",
  };

  return (
    <Card className={`${variantClasses[variant]} border`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className={`h-5 w-5 ${iconColors[variant]}`} />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
