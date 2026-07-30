import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  iconBgColor?: string;
  iconColor?: string;
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  iconBgColor = "bg-blue-100",
  iconColor = "text-blue-600",
}: MetricCardProps) {
  return (
    <Card className="border-slate-200 bg-white/80 backdrop-blur-sm hover:shadow-lg transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            {trend && (
              <p
                className={`text-xs font-medium mt-1 ${
                  trend.isPositive ? "text-green-600" : "text-red-600"
                }`}
              >
                {trend.value}
              </p>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl ${iconBgColor} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
