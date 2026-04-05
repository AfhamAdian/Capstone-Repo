import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface TrendArrowProps {
  trend: "up" | "down" | "stable";
  size?: "sm" | "md" | "lg";
  showBackground?: boolean;
}

export function TrendArrow({ trend, size = "md", showBackground = false }: TrendArrowProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const bgSizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const getIcon = () => {
    switch (trend) {
      case "up":
        return <ArrowUp className={sizeClasses[size]} />;
      case "down":
        return <ArrowDown className={sizeClasses[size]} />;
      default:
        return <Minus className={sizeClasses[size]} />;
    }
  };

  const getColorClasses = () => {
    switch (trend) {
      case "up":
        return showBackground
          ? "text-red-600 bg-red-100"
          : "text-red-600";
      case "down":
        return showBackground
          ? "text-green-600 bg-green-100"
          : "text-green-600";
      default:
        return showBackground
          ? "text-slate-600 bg-slate-100"
          : "text-slate-600";
    }
  };

  if (showBackground) {
    return (
      <div className={`${bgSizeClasses[size]} rounded-lg flex items-center justify-center ${getColorClasses()}`}>
        {getIcon()}
      </div>
    );
  }

  return <div className={getColorClasses()}>{getIcon()}</div>;
}
