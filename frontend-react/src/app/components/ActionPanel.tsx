import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";

interface ActionPanelProps {
  title: string;
  description?: string;
  actions: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive";
    icon?: ReactNode;
  }[];
  severity?: "critical" | "warning" | "info";
}

export function ActionPanel({ title, description, actions, severity = "info" }: ActionPanelProps) {
  const severityClasses = {
    critical: "border-l-4 border-l-red-600 bg-red-50/50",
    warning: "border-l-4 border-l-orange-600 bg-orange-50/50",
    info: "border-l-4 border-l-blue-600 bg-blue-50/50",
  };

  return (
    <Card className={`${severityClasses[severity]} border-slate-200`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertCircle className="h-5 w-5" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || "outline"}
              onClick={action.onClick}
              className="gap-2"
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
