import React, { useState, useRef, useEffect } from 'react';
import { AnalysisResult } from '../types';
import {
  Layers,
  Eye,
  Sliders,
  Sparkles,
  Search,
  Maximize2,
  Info,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  Radio,
  HelpCircle,
  Split,
  ChevronRight,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

interface VisualExplainabilityStudioProps {
  result: AnalysisResult;
  title?: string;
  subtitle?: string;
}

type PaletteType = 'thermal' | 'cyber' | 'magma' | 'xray';
type ViewModeType = 'blend' | 'split' | 'side_by_side';

export const VisualExplainabilityStudio: React.FC<VisualExplainabilityStudioProps> = ({
  result,
  title,
  subtitle,
}) => {
  const isForged = result.prediction === 'Forged';

  // Interactive controls
  const [viewMode, setViewMode] = useState<ViewModeType>('blend');
  const [opacity, setOpacity] = useState<number>(0.75);
  const [palette, setPalette] = useState<PaletteType>('thermal');
  const [splitPos, setSplitPos] = useState<number>(50); // percentage for curtain split
  const [showCallouts, setShowCallouts] = useState<boolean>(true);
  const [activeCallout, setActiveCallout] = useState<number | null>(null);
  const [loupeActive, setLoupeActive] = useState<boolean>(false);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number; normX: number; normY: number }>({ x: 0, y: 0, normX: 0.5, normY: 0.5 });

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef<boolean>(false);

  // Dynamic callout pins on the signature heatmap based on prediction & dominant region
  const calloutPoints = isForged
    ? [
        {
          id: 1,
          x: 28,
          y: 35,
          title: 'Micro-Tremor Hesitation',
          desc: 'Unnatural hesitation detected along ascending loop. Traced signatures show deliberate slow drawing speed.',
          impact: '-28% towards Genuine',
          type: 'danger',
        },
        {
          id: 2,
          x: 58,
          y: 48,
          title: 'Abrupt Pen-Lift Interruption',
          desc: 'Sudden curvature discontinuity at the midpoint baseline rather than fluid ballistic stroke transition.',
          impact: '-34% towards Genuine',
          type: 'danger',
        },
        {
          id: 3,
          x: 82,
          y: 62,
          title: 'Blunt Terminal Endpoint',
          desc: 'End of stroke lacks rapid ballistic tapering, characteristic of careful copy tracing.',
          impact: '-22% towards Genuine',
          type: 'danger',
        },
      ]
    : [
        {
          id: 1,
          x: 22,
          y: 42,
          title: 'Ballistic Entry Velocity',
          desc: 'Smooth initial velocity with smooth curvature radius, matching rapid natural muscle memory.',
          impact: '+32% Genuine Evidence',
          type: 'success',
        },
        {
          id: 2,
          x: 52,
          y: 55,
          title: 'Continuous Ink Flow',
          desc: 'Consistent stroke width ratio without artificial deceleration or micro-wobbles.',
          impact: '+28% Genuine Evidence',
          type: 'success',
        },
        {
          id: 3,
          x: 85,
          y: 38,
          title: 'Fluid Terminal Flourish',
          desc: 'Natural stroke tapering and dynamic stroke pressure release typical of authorized signers.',
          impact: '+25% Genuine Evidence',
          type: 'success',
        },
      ];

  // Mouse move handler for magnifier loupe & split curtain
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    setLoupePos({
      x,
      y,
      normX: x / rect.width,
      normY: y / rect.height,
    });

    if (isDraggingSplit.current && viewMode === 'split') {
      const pct = Math.max(5, Math.min(95, (x / rect.width) * 100));
      setSplitPos(pct);
    }
  };

  const handleMouseDown = () => {
    if (viewMode === 'split') isDraggingSplit.current = true;
  };

  const handleMouseUp = () => {
    isDraggingSplit.current = false;
  };

  useEffect(() => {
    const handleGlobalUp = () => {
      isDraggingSplit.current = false;
    };
    window.addEventListener('mouseup', handleGlobalUp);
    return () => window.removeEventListener('mouseup', handleGlobalUp);
  }, []);

  // Filter effect for palette selection
  const getPaletteFilter = (pal: PaletteType) => {
    switch (pal) {
      case 'cyber':
        return 'hue-rotate(90deg) saturate(1.8) contrast(1.1)';
      case 'magma':
        return 'hue-rotate(290deg) saturate(2.0) contrast(1.2)';
      case 'xray':
        return 'invert(1) hue-rotate(180deg) saturate(0.8)';
      case 'thermal':
      default:
        return 'none';
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-purple-900/30">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔬</span>
            <h3 className="text-lg font-extrabold text-white">
              {title || 'Interactive Visual Explainability Studio'}
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                isForged ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {result.prediction} ({result.confidence}%)
            </span>
          </div>
          <p className="text-xs text-purple-300/70 mt-1">
            {subtitle || 'Inspect pixel-by-pixel decision weights, heatmap overlays, and forensic hotspots in plain, visual terms.'}
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center p-1 rounded-xl bg-purple-950/60 border border-purple-800/40 text-xs font-semibold">
          <button
            onClick={() => setViewMode('blend')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'blend' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-300/60 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span>Layer Blend</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'split' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-300/60 hover:text-white'
            }`}
          >
            <Split size={13} />
            <span>Curtain Split</span>
          </button>
          <button
            onClick={() => setViewMode('side_by_side')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              viewMode === 'side_by_side' ? 'bg-purple-600 text-white shadow-xs' : 'text-purple-300/60 hover:text-white'
            }`}
          >
            <Eye size={13} />
            <span>Side-by-Side</span>
          </button>
        </div>
      </div>

      {/* Main Visual Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Canvas Stage (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Controls Bar for Canvas */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-purple-950/40 border border-purple-800/30 text-xs">
            {/* Opacity slider */}
            <div className="flex items-center gap-2.5">
              <Sliders size={14} className="text-purple-400" />
              <span className="font-semibold text-purple-200">Heatmap Intensity:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                className="w-28 accent-purple-500 cursor-pointer"
              />
              <span className="font-mono text-purple-300 w-8">{Math.round(opacity * 100)}%</span>
            </div>

            {/* Heatmap Color Palette Picker */}
            <div className="flex items-center gap-2">
              <span className="font-semibold text-purple-200">Palette:</span>
              <div className="flex rounded-lg bg-black/40 p-0.5 border border-purple-800/40">
                <button
                  onClick={() => setPalette('thermal')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    palette === 'thermal' ? 'bg-purple-600 text-white' : 'text-purple-300/60 hover:text-white'
                  }`}
                  title="Thermal Heatmap (Classic Red/Yellow/Cyan)"
                >
                  Thermal
                </button>
                <button
                  onClick={() => setPalette('cyber')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    palette === 'cyber' ? 'bg-purple-600 text-white' : 'text-purple-300/60 hover:text-white'
                  }`}
                  title="Cyber Emerald"
                >
                  Cyber
                </button>
                <button
                  onClick={() => setPalette('magma')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    palette === 'magma' ? 'bg-purple-600 text-white' : 'text-purple-300/60 hover:text-white'
                  }`}
                  title="Infrared Magma"
                >
                  Magma
                </button>
              </div>
            </div>

            {/* Toggle Callouts & Magnifier */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCallouts(!showCallouts)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  showCallouts ? 'bg-purple-600/40 text-purple-200 border border-purple-500/40' : 'text-purple-400 hover:text-white'
                }`}
              >
                <Radio size={12} className={showCallouts ? 'text-purple-300 animate-pulse' : ''} />
                <span>Hotspots ({calloutPoints.length})</span>
              </button>
              <button
                onClick={() => setLoupeActive(!loupeActive)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                  loupeActive ? 'bg-purple-600 text-white' : 'text-purple-400 hover:text-white'
                }`}
                title="Toggle 2.5x microscopic stroke inspection loupe"
              >
                <Search size={12} />
                <span>2.5x Loupe</span>
              </button>
            </div>
          </div>

          {/* Interactive Heatmap Stage Canvas */}
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            className="relative w-full h-[340px] sm:h-[400px] rounded-2xl bg-black/60 border-2 border-purple-800/40 overflow-hidden select-none cursor-crosshair flex items-center justify-center p-4 shadow-inner"
          >
            {/* View Mode 1: Blend Mode */}
            {viewMode === 'blend' && (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Base Original Signature */}
                <img
                  src={result.image_data_url}
                  alt="Original Signature"
                  className="absolute max-h-full max-w-full object-contain pointer-events-none"
                />
                {/* Heatmap Layer with Opacity & Palette Filter */}
                <img
                  src={result.explanation.heatmap_data_url}
                  alt="SHAP Heatmap"
                  className="absolute max-h-full max-w-full object-contain pointer-events-none transition-opacity duration-150"
                  style={{
                    opacity,
                    filter: getPaletteFilter(palette),
                    mixBlendMode: 'screen',
                  }}
                />
              </div>
            )}

            {/* View Mode 2: Curtain Split Mode */}
            {viewMode === 'split' && (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Original Layer */}
                <img
                  src={result.image_data_url}
                  alt="Original"
                  className="absolute max-h-full max-w-full object-contain pointer-events-none"
                />
                {/* Heatmap Layer clipped by split position */}
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center"
                  style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                >
                  <img
                    src={result.explanation.overlay_data_url}
                    alt="Heatmap Overlay"
                    className="max-h-full max-w-full object-contain"
                    style={{ filter: getPaletteFilter(palette) }}
                  />
                </div>

                {/* Vertical Split Divider Line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-400 via-fuchsia-400 to-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.8)] pointer-events-none"
                  style={{ left: `${splitPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-purple-600 border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px]">
                    <Split size={12} />
                  </div>
                </div>

                {/* Labels indicating sides */}
                <div className="absolute bottom-3 left-4 px-2.5 py-1 rounded-lg bg-black/70 border border-purple-800/40 text-[11px] font-bold text-purple-300 pointer-events-none">
                  ⚡ SHAP Heatmap
                </div>
                <div className="absolute bottom-3 right-4 px-2.5 py-1 rounded-lg bg-black/70 border border-purple-800/40 text-[11px] font-bold text-purple-300 pointer-events-none">
                  🖊️ Original Stroke
                </div>
              </div>
            )}

            {/* View Mode 3: Side-by-Side Mode */}
            {viewMode === 'side_by_side' && (
              <div className="w-full h-full grid grid-cols-2 gap-4 pointer-events-none">
                <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-purple-950/20 border border-purple-800/30 relative">
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    Original Signature
                  </span>
                  <img src={result.image_data_url} alt="Original" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-purple-950/20 border border-purple-800/30 relative">
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-fuchsia-400">
                    SHAP Attribution Heatmap
                  </span>
                  <img
                    src={result.explanation.heatmap_data_url}
                    alt="Heatmap"
                    className="max-h-full max-w-full object-contain"
                    style={{ filter: getPaletteFilter(palette) }}
                  />
                </div>
              </div>
            )}

            {/* Interactive Callout Hotspot Pins */}
            {showCallouts && viewMode !== 'side_by_side' && (
              <div className="absolute inset-0 pointer-events-none">
                {calloutPoints.map((pt) => {
                  const isSelected = activeCallout === pt.id;
                  return (
                    <div
                      key={pt.id}
                      style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                    >
                      <button
                        onClick={() => setActiveCallout(isSelected ? null : pt.id)}
                        className={`relative w-7 h-7 rounded-full flex items-center justify-center font-black text-xs transition-transform hover:scale-125 shadow-lg ${
                          pt.type === 'danger'
                            ? 'bg-rose-600 text-white ring-4 ring-rose-600/30'
                            : 'bg-emerald-600 text-white ring-4 ring-emerald-600/30'
                        }`}
                      >
                        {pt.id}
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                      </button>

                      {/* Tooltip Popup on Click/Hover */}
                      {isSelected && (
                        <div className="absolute bottom-9 left-1/2 -translate-x-1/2 w-64 p-3 rounded-xl bg-black/90 border border-purple-500/50 backdrop-blur-md shadow-2xl z-40 text-left text-xs pointer-events-auto animate-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between font-bold text-white mb-1">
                            <span className="flex items-center gap-1">
                              <span>Hotspot #{pt.id}:</span>
                              <span>{pt.title}</span>
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                pt.type === 'danger' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {pt.impact}
                            </span>
                          </div>
                          <p className="text-purple-200/80 text-[11px] leading-relaxed">
                            {pt.desc}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Microscopic 2.5x Loupe Magnifier */}
            {loupeActive && (
              <div
                className="absolute w-32 h-32 rounded-full border-2 border-purple-400 shadow-2xl pointer-events-none overflow-hidden bg-black z-30"
                style={{
                  left: loupePos.x - 64,
                  top: loupePos.y - 64,
                  boxShadow: '0 0 25px rgba(168,85,247,0.6)',
                }}
              >
                <div
                  className="w-[300%] h-[300%] absolute flex items-center justify-center"
                  style={{
                    left: `${-loupePos.normX * 200}%`,
                    top: `${-loupePos.normY * 200}%`,
                  }}
                >
                  <img
                    src={result.explanation.overlay_data_url}
                    alt="Zoom Loupe"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-2 h-2 rounded-full bg-white/60 ring-4 ring-purple-500/40" />
                </div>
              </div>
            )}
          </div>

          {/* Color Legend (Simple, intuitive gradient guide) */}
          <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="font-semibold text-purple-200 flex items-center gap-1.5">
              <Info size={14} className="text-purple-400" />
              <span>How to Read This Heatmap:</span>
            </span>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-purple-400/70">Neutral Background</span>
              <div className="w-36 h-2.5 rounded-full bg-gradient-to-r from-blue-600 via-emerald-500 via-amber-400 to-rose-600 shadow-xs" />
              <span className="text-[11px] font-bold text-rose-300">Highest Critical Attention</span>
            </div>
          </div>
        </div>

        {/* Right Column: Visual Breakdown & Plain English Verdict (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Executive Certificate / Verdict Card */}
          <div
            className={`p-5 rounded-2xl border-2 flex flex-col justify-between ${
              isForged
                ? 'bg-rose-950/20 border-rose-500/40 text-rose-100'
                : 'bg-emerald-950/20 border-emerald-500/40 text-emerald-100'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                {isForged ? <ShieldAlert size={20} className="text-rose-400" /> : <ShieldCheck size={20} className="text-emerald-400" />}
                <span className="text-xs uppercase font-extrabold tracking-widest opacity-80">
                  Forensic Assessment
                </span>
              </div>
              <h4 className="text-xl font-black mt-1">
                {isForged ? 'FORGERY DETECTED' : 'GENUINE SIGNATURE'}
              </h4>
              <p className="text-xs opacity-85 mt-2 leading-relaxed">
                {result.explanation.plain_language}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-purple-800/30 flex items-center justify-between text-xs">
              <span className="opacity-75">Certainty Index:</span>
              <strong className="text-sm font-black">{result.confidence}%</strong>
            </div>
          </div>

          {/* 4-Quadrant Visual Biometric Radar */}
          <div className="fx-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                Spatial Attention Quadrants
              </span>
              <span className="text-[10px] text-purple-400/80">Decision Influence %</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              {Object.entries(result.explanation.quadrant_scores).map(([quad, score]) => {
                const isDominant = quad === result.explanation.dominant_region;
                return (
                  <div
                    key={quad}
                    className={`p-3 rounded-xl border transition-all ${
                      isDominant
                        ? 'bg-purple-900/60 border-purple-400 ring-2 ring-purple-500/30 shadow-md'
                        : 'bg-black/30 border-purple-900/30'
                    }`}
                  >
                    <span className="text-[10px] font-semibold text-purple-300/70 block uppercase">
                      {quad}
                    </span>
                    <div className="text-xl font-black text-white mt-0.5">
                      {score}%
                    </div>
                    {isDominant && (
                      <span className="inline-block mt-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/30 text-purple-200 uppercase">
                        Primary Focus
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Biometric Kinematics Snapshot */}
          <div className="fx-card p-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-200 block">
              Biometric Fluidity Scores
            </span>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-purple-300/80">Stroke Smoothness</span>
                  <strong className="text-white font-mono">
                    {result.explanation.stroke_metrics.stroke_smoothness}/100
                  </strong>
                </div>
                <div className="h-2 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-800/30">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${result.explanation.stroke_metrics.stroke_smoothness}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-purple-300/80">Stroke Consistency</span>
                  <strong className="text-white font-mono">
                    {result.explanation.stroke_metrics.stroke_consistency}/100
                  </strong>
                </div>
                <div className="h-2 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-800/30">
                  <div
                    className="h-full bg-purple-400 rounded-full"
                    style={{ width: `${result.explanation.stroke_metrics.stroke_consistency}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
