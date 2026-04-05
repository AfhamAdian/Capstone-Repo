interface RiskGaugeProps {
  value: number; // 0-100
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
}

export function RiskGauge({ value, size = "md", showLabel = true, label }: RiskGaugeProps) {
  const getRiskLevel = (val: number) => {
    if (val >= 70) return { label: "High", color: "text-red-600", bgColor: "bg-red-600" };
    if (val >= 40) return { label: "Medium", color: "text-orange-600", bgColor: "bg-orange-600" };
    return { label: "Low", color: "text-green-600", bgColor: "bg-green-600" };
  };

  const risk = getRiskLevel(value);

  const sizeClasses = {
    sm: { container: "h-16 w-16", text: "text-lg", label: "text-xs" },
    md: { container: "h-20 w-20", text: "text-2xl", label: "text-sm" },
    lg: { container: "h-28 w-28", text: "text-3xl", label: "text-base" },
  };

  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${sizeClasses[size].container}`}>
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            cx="50%"
            cy="50%"
            r="36"
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            className="text-slate-200"
          />
          <circle
            cx="50%"
            cy="50%"
            r="36"
            stroke="currentColor"
            strokeWidth="6"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={risk.bgColor}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold ${risk.color} ${sizeClasses[size].text}`}>
            {value}
          </span>
        </div>
      </div>
      {showLabel && (
        <div className="text-center">
          <p className={`font-semibold ${risk.color} ${sizeClasses[size].label}`}>
            {label || risk.label}
          </p>
        </div>
      )}
    </div>
  );
}
