import React, { useState, useEffect, useRef } from 'react';
import { cropImageToDataUrl, loadImage, scanAndExtractSignature, fitBoxToStrokes } from '../utils/signatureAnalysis';
import {
  Scissors,
  Check,
  RotateCcw,
  X,
  Eye,
  Crosshair,
  Sliders,
  Sparkles,
  PenTool,
  Move,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  HelpCircle
} from 'lucide-react';

interface DocumentCropInspectorModalProps {
  docUrl: string;
  initialBox?: { x: number; y: number; width: number; height: number };
  label: string;
  onApplyCrop: (newBox: { x: number; y: number; width: number; height: number }) => void;
  onRevertToFull: () => void;
  onClose: () => void;
}

type DragMode = 'none' | 'draw' | 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';

export const DocumentCropInspectorModal: React.FC<DocumentCropInspectorModalProps> = ({
  docUrl,
  initialBox,
  label,
  onApplyCrop,
  onRevertToFull,
  onClose,
}) => {
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [docDimensions, setDocDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [box, setBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 200,
    height: 80,
  });
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string>('');
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showHelperTip, setShowHelperTip] = useState(true);

  // Dragging state
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialDragBox, setInitialDragBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load document image and calculate initial crop box
  useEffect(() => {
    let isMounted = true;
    loadImage(docUrl)
      .then((img) => {
        if (!isMounted) return;
        setImgElement(img);
        setDocDimensions({ width: img.width, height: img.height });

        if (initialBox && initialBox.width > 0 && initialBox.height > 0) {
          setBox(initialBox);
          setCroppedPreviewUrl(cropImageToDataUrl(img, initialBox));
        } else {
          // Auto scan signature area
          const scan = scanAndExtractSignature(img, label, 'document_cheque');
          if (scan.wasCropped) {
            setBox(scan.box);
            setCroppedPreviewUrl(scan.croppedDataUrl);
          } else {
            // Default to lower-right cheque/doc signature area
            const defaultBox = {
              x: Math.round(img.width * 0.52),
              y: Math.round(img.height * 0.55),
              width: Math.round(img.width * 0.40),
              height: Math.round(img.height * 0.28),
            };
            setBox(defaultBox);
            setCroppedPreviewUrl(cropImageToDataUrl(img, defaultBox));
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load image in crop inspector:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [docUrl, initialBox, label]);

  // Update live cropped preview whenever box changes
  useEffect(() => {
    if (!imgElement || box.width <= 5 || box.height <= 5) return;
    try {
      const cropped = cropImageToDataUrl(imgElement, box);
      setCroppedPreviewUrl(cropped);
    } catch {}
  }, [box, imgElement]);

  /**
   * Translates client pointer coordinates (mouse/touch) into original natural image coordinates
   */
  const getImageCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if (!imgRef.current || !docDimensions.width || !docDimensions.height) return null;

    const rect = imgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const scaleX = docDimensions.width / rect.width;
    const scaleY = docDimensions.height / rect.height;

    const x = Math.max(0, Math.min(docDimensions.width, Math.round(relX * scaleX)));
    const y = Math.max(0, Math.min(docDimensions.height, Math.round(relY * scaleY)));

    return { x, y };
  };

  /**
   * Pointer Down - Initiate Draw, Move, or Handle Resize
   */
  const handlePointerDown = (mode: DragMode, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const coords = getImageCoordinates(e);
    if (!coords) return;

    setDragMode(mode);
    setDragStart(coords);
    setInitialDragBox({ ...box });

    if (mode === 'draw') {
      setBox({ x: coords.x, y: coords.y, width: 1, height: 1 });
    }
  };

  /**
   * Global pointer move & up handlers during active dragging
   */
  useEffect(() => {
    if (dragMode === 'none') return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const coords = getImageCoordinates(e);
      if (!coords || !docDimensions.width || !docDimensions.height) return;

      const dx = coords.x - dragStart.x;
      const dy = coords.y - dragStart.y;

      if (dragMode === 'draw') {
        const left = Math.min(dragStart.x, coords.x);
        const top = Math.min(dragStart.y, coords.y);
        const width = Math.abs(coords.x - dragStart.x);
        const height = Math.abs(coords.y - dragStart.y);
        setBox({
          x: Math.max(0, left),
          y: Math.max(0, top),
          width: Math.min(docDimensions.width - left, Math.max(10, width)),
          height: Math.min(docDimensions.height - top, Math.max(10, height)),
        });
      } else if (dragMode === 'move') {
        const newX = Math.max(0, Math.min(docDimensions.width - initialDragBox.width, initialDragBox.x + dx));
        const newY = Math.max(0, Math.min(docDimensions.height - initialDragBox.height, initialDragBox.y + dy));
        setBox((prev) => ({ ...prev, x: Math.round(newX), y: Math.round(newY) }));
      } else if (dragMode === 'se') {
        const newW = Math.max(20, Math.min(docDimensions.width - initialDragBox.x, initialDragBox.width + dx));
        const newH = Math.max(15, Math.min(docDimensions.height - initialDragBox.y, initialDragBox.height + dy));
        setBox((prev) => ({ ...prev, width: Math.round(newW), height: Math.round(newH) }));
      } else if (dragMode === 'sw') {
        const newX = Math.max(0, Math.min(initialDragBox.x + initialDragBox.width - 20, initialDragBox.x + dx));
        const newW = initialDragBox.width + (initialDragBox.x - newX);
        const newH = Math.max(15, Math.min(docDimensions.height - initialDragBox.y, initialDragBox.height + dy));
        setBox((prev) => ({ ...prev, x: Math.round(newX), width: Math.round(newW), height: Math.round(newH) }));
      } else if (dragMode === 'ne') {
        const newY = Math.max(0, Math.min(initialDragBox.y + initialDragBox.height - 15, initialDragBox.y + dy));
        const newH = initialDragBox.height + (initialDragBox.y - newY);
        const newW = Math.max(20, Math.min(docDimensions.width - initialDragBox.x, initialDragBox.width + dx));
        setBox((prev) => ({ ...prev, y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }));
      } else if (dragMode === 'nw') {
        const newX = Math.max(0, Math.min(initialDragBox.x + initialDragBox.width - 20, initialDragBox.x + dx));
        const newY = Math.max(0, Math.min(initialDragBox.y + initialDragBox.height - 15, initialDragBox.y + dy));
        const newW = initialDragBox.width + (initialDragBox.x - newX);
        const newH = initialDragBox.height + (initialDragBox.y - newY);
        setBox({ x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) });
      } else if (dragMode === 'e') {
        const newW = Math.max(20, Math.min(docDimensions.width - initialDragBox.x, initialDragBox.width + dx));
        setBox((prev) => ({ ...prev, width: Math.round(newW) }));
      } else if (dragMode === 'w') {
        const newX = Math.max(0, Math.min(initialDragBox.x + initialDragBox.width - 20, initialDragBox.x + dx));
        const newW = initialDragBox.width + (initialDragBox.x - newX);
        setBox((prev) => ({ ...prev, x: Math.round(newX), width: Math.round(newW) }));
      } else if (dragMode === 's') {
        const newH = Math.max(15, Math.min(docDimensions.height - initialDragBox.y, initialDragBox.height + dy));
        setBox((prev) => ({ ...prev, height: Math.round(newH) }));
      } else if (dragMode === 'n') {
        const newY = Math.max(0, Math.min(initialDragBox.y + initialDragBox.height - 15, initialDragBox.y + dy));
        const newH = initialDragBox.height + (initialDragBox.y - newY);
        setBox((prev) => ({ ...prev, y: Math.round(newY), height: Math.round(newH) }));
      }
    };

    const handlePointerUp = () => {
      setDragMode('none');
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [dragMode, dragStart, initialDragBox, docDimensions]);

  /**
   * "Fit to Signature Strokes" feature:
   * Inspects ink pixels inside current box and tightens the box to hug actual strokes!
   */
  const handleFitToStrokes = () => {
    if (!imgElement) return;
    const fitted = fitBoxToStrokes(imgElement, box, 12);
    setBox(fitted);
  };

  /**
   * "Extract Blue Pen Signature" feature
   */
  const handleExtractBluePen = () => {
    if (!imgElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgElement, 0, 0);

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    let blueInks = 0;

    // Search lower 70% of document for colored/blue ink
    for (let y = Math.floor(canvas.height * 0.30); y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const idx = (y * canvas.width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const isColored = (b > 115 && b > r + 20 && b > g + 18) || (r > 120 && r > g + 25 && r > b + 25);

        if (isColored) {
          blueInks++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (blueInks >= 20 && minX < maxX && minY < maxY) {
      const raw = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      const fitted = fitBoxToStrokes(imgElement, raw, 14);
      setBox(fitted);
    } else {
      // If no blue ink detected, run normal stroke fit
      handleFitToStrokes();
    }
  };

  /**
   * Apply presets
   */
  const handleApplyPreset = (type: 'cheque' | 'doc_right' | 'doc_left' | 'doc_center') => {
    if (!imgElement) return;
    const w = imgElement.width;
    const h = imgElement.height;

    let newBox = { x: 0, y: 0, width: 200, height: 80 };
    if (type === 'cheque') {
      // Cheque lower-right (above MICR band)
      newBox = {
        x: Math.round(w * 0.52),
        y: Math.round(h * 0.52),
        width: Math.round(w * 0.42),
        height: Math.round(h * 0.32),
      };
    } else if (type === 'doc_right') {
      // Contract bottom-right
      newBox = {
        x: Math.round(w * 0.52),
        y: Math.round(h * 0.68),
        width: Math.round(w * 0.42),
        height: Math.round(h * 0.22),
      };
    } else if (type === 'doc_left') {
      // Contract bottom-left
      newBox = {
        x: Math.round(w * 0.08),
        y: Math.round(h * 0.68),
        width: Math.round(w * 0.42),
        height: Math.round(h * 0.22),
      };
    } else if (type === 'doc_center') {
      // Form bottom-center
      newBox = {
        x: Math.round(w * 0.28),
        y: Math.round(h * 0.68),
        width: Math.round(w * 0.44),
        height: Math.round(h * 0.22),
      };
    }

    // Automatically fit to strokes in that preset area
    const fitted = fitBoxToStrokes(imgElement, newBox, 12);
    setBox(fitted);
  };

  /**
   * Auto re-scan
   */
  const handleAutoReScan = () => {
    if (!imgElement) return;
    setIsAutoScanning(true);
    setTimeout(() => {
      const scan = scanAndExtractSignature(imgElement, label, 'document_cheque');
      if (scan.wasCropped) {
        setBox(scan.box);
      }
      setIsAutoScanning(false);
    }, 150);
  };

  const updateCoord = (prop: 'x' | 'y' | 'width' | 'height', val: number) => {
    if (!imgElement) return;
    const maxVal = prop === 'x' || prop === 'width' ? imgElement.width : imgElement.height;
    const clamped = Math.max(0, Math.min(maxVal, val));
    setBox((prev) => ({ ...prev, [prop]: clamped }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-2xl bg-[#140F24] border border-purple-600/50 shadow-2xl shadow-purple-950/70 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-900/40 bg-purple-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-900/50 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
              <Scissors size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Advanced Signature Cropping & Localization Studio</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-900/70 text-purple-200 border border-purple-600/40">
                  {label}
                </span>
              </h3>
              <p className="text-[11px] text-purple-300/70">
                Click & drag to draw or move the crop box. Only the signature strokes will be analyzed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelperTip(!showHelperTip)}
              className="p-1.5 rounded-lg text-purple-400 hover:text-white hover:bg-purple-900/40 transition-colors"
              title="Toggle instructions"
            >
              <HelpCircle size={17} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-purple-400 hover:text-white hover:bg-purple-900/40 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Optional Quick Tips Banner */}
        {showHelperTip && (
          <div className="px-6 py-2 bg-purple-950/20 border-b border-purple-900/30 flex items-center justify-between text-[11px] text-purple-300/80">
            <div className="flex items-center gap-2">
              <span className="font-bold text-purple-200">💡 Interactive Cropping:</span>
              <span>Click & drag anywhere on the document to draw a new box &bull; Drag inside box to move &bull; Grab handles to resize &bull; Click "⚡ Fit to Strokes" to automatically trim borders!</span>
            </div>
            <button onClick={() => setShowHelperTip(false)} className="text-purple-400 hover:text-white text-xs ml-2">
              &times;
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Interactive Document Canvas */}
          <div className="lg:col-span-2 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-200 flex items-center gap-1.5">
                <Eye size={14} className="text-purple-400" />
                <span>Interactive Document Canvas (Cheque / Form)</span>
              </span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-purple-400/70 font-mono">
                  {docDimensions.width} × {docDimensions.height} px
                </span>
                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-[#1A142E] rounded-lg p-0.5 border border-purple-800/40">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.2))}
                    className="p-1 hover:text-white text-purple-400"
                    title="Zoom Out"
                  >
                    <ZoomOut size={13} />
                  </button>
                  <span className="text-[10px] font-mono text-purple-200 px-1">{Math.round(zoomLevel * 100)}%</span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
                    className="p-1 hover:text-white text-purple-400"
                    title="Zoom In"
                  >
                    <ZoomIn size={13} />
                  </button>
                  {zoomLevel !== 1 && (
                    <button
                      onClick={() => setZoomLevel(1)}
                      className="text-[9px] px-1 text-purple-300 hover:text-white"
                      title="Reset Zoom"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Document Image & Interactive Crop Overlay Container */}
            <div
              ref={imageContainerRef}
              className="relative rounded-xl border border-purple-800/40 bg-black/70 overflow-auto flex items-center justify-center min-h-[340px] max-h-[420px] p-3 select-none"
            >
              <div
                className="relative inline-block cursor-crosshair transition-transform origin-center"
                style={{ transform: `scale(${zoomLevel})` }}
                onMouseDown={(e) => handlePointerDown('draw', e)}
                onTouchStart={(e) => handlePointerDown('draw', e)}
              >
                <img
                  ref={imgRef}
                  src={docUrl}
                  alt="Full Document"
                  className="max-h-[380px] max-w-full object-contain rounded-md block pointer-events-none"
                  draggable={false}
                />

                {/* Bounding Box with Handles */}
                {docDimensions.width > 0 && docDimensions.height > 0 && (
                  <div
                    className="absolute border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(52,211,153,0.35)] rounded-sm cursor-move"
                    style={{
                      left: `${(box.x / docDimensions.width) * 100}%`,
                      top: `${(box.y / docDimensions.height) * 100}%`,
                      width: `${(box.width / docDimensions.width) * 100}%`,
                      height: `${(box.height / docDimensions.height) * 100}%`,
                    }}
                    onMouseDown={(e) => handlePointerDown('move', e)}
                    onTouchStart={(e) => handlePointerDown('move', e)}
                  >
                    {/* Top Tag */}
                    <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-emerald-500 text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md pointer-events-none whitespace-nowrap">
                      <Crosshair size={9} /> Signature Crop ({box.width}×{box.height})
                    </div>

                    {/* Corner Handles */}
                    <div
                      className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-400 border border-black rounded-xs cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                      onMouseDown={(e) => handlePointerDown('nw', e)}
                      onTouchStart={(e) => handlePointerDown('nw', e)}
                    />
                    <div
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-400 border border-black rounded-xs cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                      onMouseDown={(e) => handlePointerDown('ne', e)}
                      onTouchStart={(e) => handlePointerDown('ne', e)}
                    />
                    <div
                      className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-emerald-400 border border-black rounded-xs cursor-nwse-resize shadow-md hover:scale-125 transition-transform"
                      onMouseDown={(e) => handlePointerDown('se', e)}
                      onTouchStart={(e) => handlePointerDown('se', e)}
                    />
                    <div
                      className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-emerald-400 border border-black rounded-xs cursor-nesw-resize shadow-md hover:scale-125 transition-transform"
                      onMouseDown={(e) => handlePointerDown('sw', e)}
                      onTouchStart={(e) => handlePointerDown('sw', e)}
                    />

                    {/* Edge Handles */}
                    <div
                      className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-emerald-400 border border-black rounded-xs cursor-ns-resize shadow-xs"
                      onMouseDown={(e) => handlePointerDown('n', e)}
                      onTouchStart={(e) => handlePointerDown('n', e)}
                    />
                    <div
                      className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-2 bg-emerald-400 border border-black rounded-xs cursor-ns-resize shadow-xs"
                      onMouseDown={(e) => handlePointerDown('s', e)}
                      onTouchStart={(e) => handlePointerDown('s', e)}
                    />
                    <div
                      className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-4 bg-emerald-400 border border-black rounded-xs cursor-ew-resize shadow-xs"
                      onMouseDown={(e) => handlePointerDown('w', e)}
                      onTouchStart={(e) => handlePointerDown('w', e)}
                    />
                    <div
                      className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-4 bg-emerald-400 border border-black rounded-xs cursor-ew-resize shadow-xs"
                      onMouseDown={(e) => handlePointerDown('e', e)}
                      onTouchStart={(e) => handlePointerDown('e', e)}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Smart Crop Enhancement Tools & Presets */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-900/30">
              <div className="flex flex-wrap items-center gap-2">
                {/* Fit to Strokes */}
                <button
                  type="button"
                  onClick={handleFitToStrokes}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/50 shadow-sm flex items-center gap-1.5 transition-all"
                  title="Automatically shrinks bounding box tightly around signature ink strokes"
                >
                  <Sparkles size={13} className="text-emerald-400" />
                  <span>⚡ Fit to Strokes</span>
                </button>

                {/* Extract Blue Pen */}
                <button
                  type="button"
                  onClick={handleExtractBluePen}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-600/50 shadow-sm flex items-center gap-1.5 transition-all"
                  title="Detect and isolate colored or blue ballpoint signature"
                >
                  <PenTool size={13} className="text-blue-400" />
                  <span>🖊️ Blue Pen Extractor</span>
                </button>

                {/* Presets */}
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('cheque')}
                    className="px-2.5 py-1 rounded-lg font-semibold bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800/40 transition-colors"
                  >
                    🏦 Cheque
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('doc_right')}
                    className="px-2.5 py-1 rounded-lg font-semibold bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800/40 transition-colors"
                  >
                    📑 Contract (Right)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('doc_center')}
                    className="px-2.5 py-1 rounded-lg font-semibold bg-purple-950/60 hover:bg-purple-900 text-purple-200 border border-purple-800/40 transition-colors"
                  >
                    📝 Form (Center)
                  </button>
                </div>
              </div>

              {/* Auto Scan */}
              <button
                type="button"
                onClick={handleAutoReScan}
                disabled={isAutoScanning}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-fuchsia-950/60 hover:bg-fuchsia-900 text-fuchsia-200 border border-fuchsia-700/50 flex items-center gap-1.5 shadow-sm transition-all"
              >
                <RefreshCw size={13} className={isAutoScanning ? 'animate-spin' : ''} />
                <span>Auto Re-Detect</span>
              </button>
            </div>
          </div>

          {/* Side Panel: Isolated Signature Live Preview & Coordinate Inputs */}
          <div className="space-y-4 flex flex-col justify-between bg-purple-950/20 p-4 rounded-xl border border-purple-800/30">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Scissors size={14} className="text-purple-400" />
                  <span>Cropped Signature Part</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Live Preview
                </span>
              </div>

              {/* High-Contrast Signature Viewport */}
              <div className="p-3.5 rounded-xl bg-black/80 border border-emerald-500/40 text-center flex flex-col items-center justify-center min-h-[140px] max-h-[160px] overflow-hidden shadow-inner">
                {croppedPreviewUrl ? (
                  <img
                    src={croppedPreviewUrl}
                    alt="Cropped Signature Part"
                    className="max-h-[130px] max-w-full object-contain filter drop-shadow-md"
                  />
                ) : (
                  <span className="text-xs text-purple-400/60">No crop selected</span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-purple-300/80 px-1">
                <span>Crop Dimensions:</span>
                <span className="font-mono text-white font-bold">{box.width} × {box.height} px</span>
              </div>

              {/* Coordinate Adjustments with Nudge Buttons */}
              <div className="space-y-2 pt-2 border-t border-purple-900/40">
                <span className="text-[11px] font-semibold text-purple-300 block">Fine-Tune Bounding Box:</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-purple-400/70 block">X (Left)</label>
                    <input
                      type="number"
                      value={box.x}
                      onChange={(e) => updateCoord('x', Number(e.target.value))}
                      className="w-full bg-[#1A142E] border border-purple-800/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-purple-400/70 block">Y (Top)</label>
                    <input
                      type="number"
                      value={box.y}
                      onChange={(e) => updateCoord('y', Number(e.target.value))}
                      className="w-full bg-[#1A142E] border border-purple-800/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-purple-400/70 block">Width</label>
                    <input
                      type="number"
                      value={box.width}
                      onChange={(e) => updateCoord('width', Number(e.target.value))}
                      className="w-full bg-[#1A142E] border border-purple-800/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-purple-400/70 block">Height</label>
                    <input
                      type="number"
                      value={box.height}
                      onChange={(e) => updateCoord('height', Number(e.target.value))}
                      className="w-full bg-[#1A142E] border border-purple-800/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-3 border-t border-purple-900/40">
              <button
                type="button"
                onClick={() => onApplyCrop(box)}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5 transition-all"
              >
                <Check size={14} />
                <span>Apply Cropped Signature Part</span>
              </button>

              <button
                type="button"
                onClick={onRevertToFull}
                className="w-full py-2 rounded-xl text-xs font-semibold bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 hover:text-white border border-purple-800/40 flex items-center justify-center gap-1.5 transition-all"
              >
                <RotateCcw size={13} />
                <span>Take Full Image (Never Crop)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
