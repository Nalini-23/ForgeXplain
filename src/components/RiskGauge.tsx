import React from 'react';

interface RiskGaugeProps {
  percent: number;
  label: string;
  danger?: boolean;
  size?: number;
}

export const RiskGauge: React.FC<RiskGaugeProps> = ({
  percent,
  label,
  danger = false,
  size = 170,
}) => {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Semi-circle or 240 degree gauge
  const angleRange = 260;
  const strokeDasharray = `${(angleRange / 360) * circumference} ${circumference}`;
  const strokeDashoffset = ((100 - Math.min(100, Math.max(0, percent))) / 100) * ((angleRange / 360) * circumference);

  const strokeColor = danger ? '#EF4444' : '#10B981';

  return (
    <div className="flex flex-col items-center justify-center p-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-[130deg] overflow-visible"
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="rgba(139, 92, 246, 0.15)"
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
          />
          {/* Active Meter */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
              filter: `drop-shadow(0 0 8px ${strokeColor}66)`,
            }}
          />
        </svg>

        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold tracking-tight" style={{ color: strokeColor }}>
            {Math.round(percent)}%
          </span>
          <span className="text-xs font-semibold text-purple-300/80 uppercase tracking-wider mt-0.5">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
};
