import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { SignerRecord } from '../types';
import { saveSignerToFirestore } from '../services/firestoreService';
import { loadImage, runPreprocessingPipeline, extract23Features } from '../utils/signatureAnalysis';
import {
  UserPlus,
  Check,
  X,
  Upload,
  Files,
  Trash2,
  Plus,
  Sparkles,
  ShieldCheck,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Activity
} from 'lucide-react';

interface BulkSignerEnrollmentProps {
  onSignerEnrolled?: (signer: SignerRecord) => void;
  onCancel?: () => void;
  className?: string;
  defaultName?: string;
}

interface StagedSignatureFile {
  id: string;
  file: File;
  name: string;
  sizeKb: number;
  dataUrl: string;
}

export const BulkSignerEnrollment: React.FC<BulkSignerEnrollmentProps> = ({
  onSignerEnrolled,
  onCancel,
  className = '',
  defaultName = '',
}) => {
  const { user } = useAuth();
  const [signerName, setSignerName] = useState(defaultName);
  const [signerTitle, setSignerTitle] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedSignatureFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [stageText, setStageText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successSigner, setSuccessSigner] = useState<SignerRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Helper to read a file as a data URL
   */
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /**
   * Handles multi-file selection & drops
   */
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessage(null);

    const newItems: StagedSignatureFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const dataUrl = await readFileAsDataUrl(file);
        newItems.push({
          id: `sample-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 7)}`,
          file,
          name: file.name,
          sizeKb: Math.round(file.size / 1024),
          dataUrl,
        });
      } catch (err) {
        console.error('Failed reading file:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearAll = () => {
    setStagedFiles([]);
    setErrorMessage(null);
  };

  /**
   * Confirms bulk registration:
   * 1. Iterates over all samples, extracting 23 invariant biometric features.
   * 2. Averages all sample feature vectors into a single unified biometric template.
   * 3. Saves to Firestore & local backend API.
   */
  const handleConfirmRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanName = signerName.trim();
    if (!cleanName) {
      setErrorMessage("Please enter the person's full name.");
      return;
    }

    if (stagedFiles.length === 0) {
      setErrorMessage('Please upload at least 1 genuine reference signature specimen.');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(5);
    setStageText(`Initializing bulk enrollment for ${stagedFiles.length} signatures...`);

    try {
      const numSamples = stagedFiles.length;
      const sampleVectors: number[][] = [];

      // Process each file with progress tracking
      for (let i = 0; i < numSamples; i++) {
        const sample = stagedFiles[i];
        const stepProgress = Math.round(10 + (i / numSamples) * 75);
        setProgressPercent(stepProgress);
        setStageText(`Extracting 23 biometric feature invariants for specimen ${i + 1} of ${numSamples} ("${sample.name}")...`);

        const img = await loadImage(sample.dataUrl);
        const pre = runPreprocessingPipeline(img);
        const feats = extract23Features(pre.binaryData, pre.width, pre.height);
        sampleVectors.push(feats.vector);

        // Small yield to allow UI repaint
        await new Promise((r) => setTimeout(r, 40));
      }

      // Average all feature samples into a single master feature template
      setProgressPercent(88);
      setStageText(`Averaging all ${numSamples} biometric specimens into a unified master feature centroid...`);
      await new Promise((r) => setTimeout(r, 100));

      const avgVector: number[] = new Array(23).fill(0);
      for (const vec of sampleVectors) {
        for (let j = 0; j < 23; j++) {
          avgVector[j] += (vec[j] || 0) / numSamples;
        }
      }

      // Gather preview thumbnails for the record gallery
      const sampleThumbnails = stagedFiles.slice(0, 8).map((s) => s.dataUrl);

      // Save to Firestore
      setProgressPercent(95);
      setStageText('Storing registered signer master template in Firestore...');

      const fullName = signerTitle.trim() ? `${cleanName} (${signerTitle.trim()})` : cleanName;

      const newRecord = await saveSignerToFirestore({
        name: fullName,
        num_samples: numSamples,
        feature_vector: avgVector,
        sample_images: sampleThumbnails,
        registered_by: user?.email || 'admin',
        created_at: new Date().toISOString(),
      });

      // Also sync to local backend API
      try {
        await fetch('/api/signers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fullName,
            num_samples: numSamples,
            feature_vector: avgVector,
            sample_images: sampleThumbnails,
            registered_by: user?.email,
          }),
        });
      } catch {}

      setProgressPercent(100);
      setStageText(`Enrollment complete! ${numSamples} signatures averaged into master template.`);

      const finalRecord: SignerRecord = newRecord || {
        id: `signer-${Date.now()}`,
        name: fullName,
        num_samples: numSamples,
        feature_vector: avgVector,
        sample_images: sampleThumbnails,
        registered_by: user?.email || 'admin',
        created_at: new Date().toISOString(),
      };

      setSuccessSigner(finalRecord);
      if (onSignerEnrolled) {
        onSignerEnrolled(finalRecord);
      }
    } catch (err: any) {
      console.error('Bulk signer registration error:', err);
      setErrorMessage(err?.message || 'Failed to complete bulk signer registration.');
      setIsProcessing(false);
    }
  };

  return (
    <div className={`p-5 rounded-2xl bg-purple-950/40 border border-purple-600/40 shadow-xl space-y-5 animate-in fade-in duration-300 ${className}`}>
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-900/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-900/50 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-inner">
            <UserPlus size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Bulk Signer Registration</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-600/40">
                Bank & Enterprise Mode
              </span>
            </h3>
            <p className="text-xs text-purple-300/70">
              Register a person by uploading multiple genuine signature reference specimens at once. All samples are averaged into a single master template.
            </p>
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="p-1.5 text-purple-400 hover:text-white hover:bg-purple-900/40 rounded-lg transition-colors self-end sm:self-center"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Success Notification View */}
      {successSigner ? (
        <div className="p-5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-4 animate-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Signer Registered Successfully!
              </h4>
              <p className="text-xs text-emerald-300/90 mt-0.5">
                <strong>{successSigner.name}</strong> has been enrolled with <strong>{successSigner.num_samples} reference signatures</strong> averaged into a single master biometric template.
              </p>
            </div>
          </div>

          {/* Sample Thumbnails Gallery */}
          <div className="space-y-1.5 pt-2 border-t border-emerald-900/30">
            <span className="text-[11px] font-semibold text-emerald-200 block">
              Enrolled Specimen Gallery ({successSigner.sample_images.length} displayed):
            </span>
            <div className="flex flex-wrap gap-2.5">
              {successSigner.sample_images.map((url, idx) => (
                <div key={idx} className="p-1.5 rounded-lg bg-black/50 border border-emerald-700/40 text-center">
                  <img src={url} alt={`Sample ${idx + 1}`} className="h-12 w-20 object-contain mx-auto" />
                  <span className="text-[9px] text-emerald-300/80 font-mono block mt-1">Specimen #{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setSuccessSigner(null);
                setSignerName('');
                setSignerTitle('');
                setStagedFiles([]);
                setProgressPercent(0);
                setIsProcessing(false);
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700/40 transition-colors"
            >
              Enroll Another Signer
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Enrollment Form */
        <form onSubmit={handleConfirmRegistration} className="space-y-4">
          {/* Signer Identity Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-purple-200 block mb-1">
                Person's Full Name: *
              </label>
              <input
                type="text"
                required
                disabled={isProcessing}
                placeholder="e.g. John Hancock"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                className="w-full bg-[#1A142E] border border-purple-700/50 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-400/50 focus:outline-hidden focus:border-purple-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-purple-200 block mb-1">
                Account / Role Tag (Optional):
              </label>
              <input
                type="text"
                disabled={isProcessing}
                placeholder="e.g. Primary Account Holder #8921"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                className="w-full bg-[#1A142E] border border-purple-700/50 rounded-xl px-3.5 py-2 text-xs text-white placeholder-purple-400/50 focus:outline-hidden focus:border-purple-400"
              />
            </div>
          </div>

          {/* Bulk Dropzone for Reference Signatures */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-purple-200 flex items-center gap-1.5">
                <Upload size={13} className="text-purple-400" />
                <span>Upload Reference Specimen Signatures (Multiple Files Allowed): *</span>
              </label>
              {stagedFiles.length > 0 && (
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Paperclip size={13} />
                  <span>📎 {stagedFiles.length} signature{stagedFiles.length > 1 ? 's' : ''} selected</span>
                </span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={isProcessing}
              accept="image/png,image/jpeg,image/jpg,image/bmp,image/tiff"
              onChange={(e) => {
                handleFilesSelected(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFilesSelected(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-purple-400 bg-purple-900/30 ring-2 ring-purple-400/20'
                  : 'border-purple-700/40 hover:border-purple-500/60 bg-purple-950/20'
              }`}
            >
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-purple-900/30 border border-purple-600/30 flex items-center justify-center text-purple-300">
                  <Files size={22} />
                </div>
                <div>
                  <span className="text-xs font-bold text-white hover:underline">
                    Click to browse or drop multiple reference signature files
                  </span>
                  <p className="text-[11px] text-purple-300/70 mt-0.5">
                    Select 3, 5, 7 or more specimens. All samples will be extracted and averaged into one single profile template.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Live Preview Grid with Running Count */}
          {stagedFiles.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-purple-900/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1">
                    <Paperclip size={14} className="text-emerald-400" />
                    <span>📎 {stagedFiles.length} signatures selected</span>
                  </span>
                  <span className="text-[11px] text-purple-400/70">
                    (Ready for centroid template averaging)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-purple-300 hover:text-white flex items-center gap-1 font-semibold"
                  >
                    <Plus size={13} /> Add More
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleClearAll}
                    className="text-xs text-rose-400/80 hover:text-rose-300 font-semibold"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Responsive Thumbnails Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[260px] overflow-y-auto p-1">
                {stagedFiles.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative group p-2 rounded-xl bg-black/60 border border-purple-800/40 flex flex-col justify-between hover:border-purple-500/60 transition-all shadow-xs"
                  >
                    {/* Index Badge */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold font-mono px-1.5 py-0.2 rounded bg-purple-900/80 text-purple-200 border border-purple-700/50">
                        #{idx + 1}
                      </span>
                      <span className="text-[9px] text-purple-400/60 font-mono">
                        {item.sizeKb} KB
                      </span>
                    </div>

                    {/* Image Specimen */}
                    <div className="h-16 flex items-center justify-center p-1 bg-black/40 rounded-lg overflow-hidden">
                      <img
                        src={item.dataUrl}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>

                    {/* Filename & Remove Button */}
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-purple-300/80 truncate block" title={item.name}>
                        {item.name}
                      </span>
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStagedFile(item.id)}
                          className="text-purple-400 hover:text-rose-400 p-0.5 transition-colors"
                          title="Remove signature"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Batch Progress Bar */}
          {isProcessing && (
            <div className="p-4 rounded-xl bg-purple-950/60 border border-purple-500/50 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-purple-200 font-semibold flex items-center gap-1.5 truncate max-w-[80%]">
                  <Activity size={14} className="text-purple-400 animate-spin" />
                  <span className="truncate">{stageText}</span>
                </span>
                <span className="font-mono font-bold text-purple-300 text-xs">
                  {progressPercent}%
                </span>
              </div>

              {/* Visual Progress Track */}
              <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden border border-purple-700/40 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-emerald-400 rounded-full transition-all duration-300 shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-600/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-purple-900/30">
            <span className="text-[11px] text-purple-400/70 hidden sm:block">
              {stagedFiles.length > 0
                ? `Will average ${stagedFiles.length} specimen${stagedFiles.length > 1 ? 's' : ''} into 1 unified feature template.`
                : 'Upload multiple reference signatures to enable enrollment.'}
            </span>

            <div className="flex items-center gap-2.5 ml-auto">
              {onCancel && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/50 border border-purple-800/40 transition-colors"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={isProcessing || stagedFiles.length === 0 || !signerName.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 hover:from-purple-500 text-white shadow-lg shadow-purple-900/40 flex items-center gap-2 transition-all disabled:opacity-40"
              >
                <Check size={14} />
                <span>
                  {isProcessing
                    ? `Processing Batch (${progressPercent}%)...`
                    : `Confirm Bulk Enrollment (${stagedFiles.length} Sample${stagedFiles.length === 1 ? '' : 's'})`}
                </span>
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
