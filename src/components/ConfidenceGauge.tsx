import React, { useState, useEffect } from 'react';
import { Gauge, Thermometer, ShieldAlert, ShieldCheck, Sparkles, HelpCircle } from 'lucide-react';

interface ConfidenceGaugeProps {
  score: number; // 0 to 100
  verdict: 'Genuine' | 'Forged' | string;
  initialMode?: 'circle' | 'thermometer';
  showToggle?: boolean;
}

export const ConfidenceGauge: React.FC<ConfidenceGaugeProps> = ({
  score,
  verdict,
  initialMode = 'circle',
  showToggle = true,
}) => {
  const [mode, setMode] = useState<'circle' | 'thermometer'>(initialMode);
  const [animatedScore, setAnimatedScore] = useState(0);

  const isForged = verdict.toLowerCase().includes('forged') || verdict.toLowerCase().includes('not match');

  // Certainty level classification
  const getCertaintyTier = (val: number) => {
    if (val >= 92) return { label: 'Decisive Certainty', desc: 'Conclusive biometric indicators with minimal variance', color: isForged ? '#EF4444' : '#10B981', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    if (val >= 80) return { label: 'High Certainty', desc: 'Strong classification margin across decision trees', color: isForged ? '#F87171' : '#34D399', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30' };
    if (val >= 65) return { label: 'Moderate Certainty', desc: 'Noticeable signature traits with partial ambiguity', color: '#FBBF24', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    return { label: 'Borderline', desc: 'Indeterminate stroke markers; human audit advised', color: '#F97316', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' };
  };

  const tier = getCertaintyTier(score);

  // Smooth animation on score change
  useEffect(() => {
    let start = 0;
    const duration = 900;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * score));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [score]);

  // Circle calculations
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcSweep = 240; // 240 degree gauge
  const strokeDasharray = `${(arcSweep / 360) * circumference} ${circumference}`;
  const strokeDashoffset = ((100 - animatedScore) / 100) * ((arcSweep / 360) * circumference);

  const mainColor = isForged ? '#EF4444' : '#10B981';
  const glowColor = isForged ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)';

  return (
    <div className="flex flex-col items-center justify-between h-full w-full">
      {/* Top Header & View Toggle */}
      <div className="w-full flex items-center justify-between pb-2 border-b border-purple-900/20 mb-3">
        <div className="flex items-center gap-2">
          {isForged ? (
            <ShieldAlert size={16} className="text-rose-400" />
          ) : (
            <ShieldCheck size={16} className="text-emerald-400" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
            Model Certainty Gauge
          </span>
        </div>

        {showToggle && (
          <div className="flex rounded-lg bg-purple-950/70 p-0.5 border border-purple-800/40 text-[11px]">
            <button
              onClick={() => setMode('circle')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                mode === 'circle' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-300/60 hover:text-white'
              }`}
              title="Circular Radial Gauge"
            >
              <Gauge size={12} />
              <span>Circle</span>
            </button>
            <button
              onClick={() => setMode('thermometer')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                mode === 'thermometer' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-300/60 hover:text-white'
              }`}
              title="Thermometer Style Bar"
            >
              <Thermometer size={12} />
              <span>Thermometer</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Gauge Visual */}
      <div className="my-auto py-2 flex items-center justify-center w-full">
        {mode === 'circle' ? (
          /* ========================================================================= */
          /* PROGRESS CIRCLE / RADIAL SPEEDOMETER GAUGE                                */
          /* ========================================================================= */
          <div className="relative flex flex-col items-center justify-center">
            <svg
              width={size}
              height={size}
              className="transform -rotate-[120deg] overflow-visible"
            >
              {/* Background Track with tick marks */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke="rgba(139, 92, 246, 0.18)"
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
              />
              {/* Active Meter with Neon Glow */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={mainColor}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{
                  transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  filter: `drop-shadow(0 0 10px ${glowColor})`,
                }}
              />
            </svg>

            {/* Gauge Dial Tick Markers */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <div className="flex items-baseline justify-center">
                <span
                  className="text-4xl font-black tracking-tight"
                  style={{ color: mainColor, textShadow: `0 0 14px ${glowColor}` }}
                >
                  {animatedScore}
                </span>
                <span className="text-xl font-bold ml-0.5" style={{ color: mainColor }}>
                  %
                </span>
              </div>
              <span className="text-[11px] font-bold text-purple-300/80 uppercase tracking-widest mt-0.5">
                Certainty
              </span>
              <div className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border bg-purple-950/60 border-purple-700/40 text-purple-200">
                {tier.label}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* THERMOMETER STYLE BAR GAUGE                                               */
          /* ========================================================================= */
          <div className="w-full px-2 py-1 space-y-4">
            {/* Thermometer Tube Container */}
            <div className="relative flex items-center gap-4">
              {/* Thermometer Stem & Bulb */}
              <div className="relative flex flex-col items-center">
                {/* Glass Stem */}
                <div className="w-6 h-36 bg-purple-950/60 border-2 border-purple-700/40 rounded-t-full p-1 relative flex flex-col justify-end overflow-hidden shadow-inner">
                  {/* Graduation Tick marks */}
                  <div className="absolute inset-x-0 inset-y-2 flex flex-col justify-between pointer-events-none opacity-40">
                    <div className="w-full border-t border-purple-300 text-[8px]" />
                    <div className="w-full border-t border-purple-300 text-[8px]" />
                    <div className="w-full border-t border-purple-300 text-[8px]" />
                    <div className="w-full border-t border-purple-300 text-[8px]" />
                  </div>

                  {/* Rising Liquid Column */}
                  <div
                    className="w-full rounded-t-full transition-all duration-700"
                    style={{
                      height: `${animatedScore}%`,
                      background: `linear-gradient(to top, ${mainColor}88, ${mainColor})`,
                      boxShadow: `0 0 12px ${glowColor}`,
                    }}
                  />
                </div>

                {/* Glass Bulb at bottom */}
                <div
                  className="w-10 h-10 -mt-2 rounded-full border-2 border-purple-700/40 flex items-center justify-center relative shadow-lg"
                  style={{
                    backgroundColor: mainColor,
                    boxShadow: `0 0 16px ${glowColor}`,
                  }}
                >
                  <div className="w-4 h-4 rounded-full bg-white/30 blur-xs" />
                </div>
              </div>

              {/* Thermometer Graduated Scale & Reading */}
              <div className="flex-1 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-black"
                    style={{ color: mainColor, textShadow: `0 0 12px ${glowColor}` }}
                  >
                    {animatedScore}%
                  </span>
                  <span className="text-xs font-semibold text-purple-300/70 uppercase">
                    Certainty Index
                  </span>
                </div>

                {/* Horizontal progress representation */}
                <div className="space-y-1">
                  <div className="h-3 w-full bg-purple-950/60 rounded-full overflow-hidden p-0.5 border border-purple-800/40">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${animatedScore}%`,
                        background: `linear-gradient(to right, ${mainColor}88, ${mainColor})`,
                        boxShadow: `0 0 10px ${glowColor}`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-purple-400/60 font-mono">
                    <span>0% (Uncertain)</span>
                    <span>50%</span>
                    <span>100% (Decisive)</span>
                  </div>
                </div>

                <div className="pt-1">
                  <span className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${tier.badge}`}>
                    {tier.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Forensic Interpretation Footer */}
      <div className="w-full pt-2 mt-1 border-t border-purple-900/20 text-center">
        <p className="text-[11px] text-purple-300/80 leading-tight">
          {tier.desc}
        </p>
      </div>
    </div>
  );
};
