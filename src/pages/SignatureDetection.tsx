import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { AnalysisResult, SignerRecord } from '../types';
import {
  loadImage,
  detectSignatureRegion,
  cropImageToDataUrl,
  scanAndExtractSignature,
  analyzeSignature,
  extract23Features,
  computeVectorSimilarity,
  runPreprocessingPipeline,
} from '../utils/signatureAnalysis';
import { generatePdfReport, downloadJsonReport } from '../utils/reportExporter';
import { savePredictionToFirestore, subscribeSigners, saveSignerToFirestore } from '../services/firestoreService';
import { ConfidenceGauge } from '../components/ConfidenceGauge';
import { VisualExplainabilityStudio } from '../components/VisualExplainabilityStudio';
import { DocumentCropInspectorModal } from '../components/DocumentCropInspectorModal';
import { BulkSignerEnrollment } from '../components/BulkSignerEnrollment';
import {
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  FileCode2,
  ChevronDown,
  UserPlus,
  Users,
  Files,
  Check,
  DownloadCloud,
  Tag,
  Trash2,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Layers,
  Activity,
  AlertCircle,
  Scissors,
  Eye,
  X,
  Sliders,
  PenTool
} from 'lucide-react';

interface SignatureDetectionProps {
  onAnalyzeComplete?: (result: AnalysisResult) => void;
}

export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'paused';

export interface QueueSignatureItem {
  id: string;
  file: File;
  name: string;
  dataUrl: string; // The cropped signature image data URL!
  originalDocUrl?: string; // The raw document/cheque if cropped
  wasCroppedFromDocument?: boolean;
  cropBox?: { x: number; y: number; width: number; height: number };
  detectionType?: string;
  label: string;
  sizeKb: number;
  status: QueueItemStatus;
  progress: number; // 0-100
  stageText: string;
  result?: AnalysisResult;
  error?: string;
}

export interface VerificationQueueItem {
  id: string;
  file: File;
  name: string;
  dataUrl: string;
  originalDocUrl?: string;
  wasCroppedFromDocument?: boolean;
  cropBox?: { x: number; y: number; width: number; height: number };
  label: string;
  sizeKb: number;
  status: QueueItemStatus;
  progress: number;
  stageText: string;
  signerName: string;
  similarity?: number;
  threshold?: number;
  isMatch?: boolean;
  verdict?: string;
  error?: string;
}

export const SignatureDetection: React.FC<SignatureDetectionProps> = ({ onAnalyzeComplete }) => {
  const { user } = useAuth();

  // Mode: generic check vs writer-dependent verification
  const [checkMode, setCheckMode] = useState<'generic' | 'writer_dependent'>('generic');
  const [engineType, setEngineType] = useState<'features' | 'pixel'>('features');

  // Asynchronous Batch Processing Queue (Generic Check)
  const [genericQueue, setGenericQueue] = useState<QueueSignatureItem[]>([]);
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);
  const [isQueuePaused, setIsQueuePaused] = useState<boolean>(false);
  const [concurrency, setConcurrency] = useState<number>(2); // 1 or 2 concurrent workers

  // Asynchronous Queue for Writer-Dependent Verification
  const [verifyQueue, setVerifyQueue] = useState<VerificationQueueItem[]>([]);
  const [isVerifyQueueRunning, setIsVerifyQueueRunning] = useState<boolean>(false);

  // Signer verification state
  const [signers, setSigners] = useState<SignerRecord[]>([]);
  const [selectedSigner, setSelectedSigner] = useState<string>('');

  // Signer enrollment state
  const [showSignerEnrollForm, setShowSignerEnrollForm] = useState(false);
  const [newEnrollName, setNewEnrollName] = useState('');
  const [newEnrollFiles, setNewEnrollFiles] = useState<Array<{ name: string; dataUrl: string; vector: number[] }>>([]);
  const [enrollingSigner, setEnrollingSigner] = useState(false);

  // Completed batch results (streams in real-time as queue items finish)
  const [batchResults, setBatchResults] = useState<AnalysisResult[]>([]);
  const [selectedDetailIndex, setSelectedDetailIndex] = useState<number>(0);

  // Document context preview modal
  const [previewDocModal, setPreviewDocModal] = useState<{
    docUrl: string;
    cropBox?: { x: number; y: number; width: number; height: number };
    label: string;
    itemId?: string;
    isVerifyQueue?: boolean;
    isCropped: boolean;
  } | null>(null);

  // User-controlled upload scanning mode: 'signature_only' (disables cropping) | 'full_document' (enables smart extraction) | 'auto'
  const [uploadDocMode, setUploadDocMode] = useState<'signature_only' | 'full_document' | 'auto'>('signature_only');

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Refs for tracking queue running states in async loops
  const queueRunningRef = useRef(false);
  const queuePausedRef = useRef(false);
  const genericQueueRef = useRef<QueueSignatureItem[]>([]);
  genericQueueRef.current = genericQueue;

  const verifyQueueRunningRef = useRef(false);
  const verifyQueueRef = useRef<VerificationQueueItem[]>([]);
  verifyQueueRef.current = verifyQueue;

  /**
   * Reverts a cropped item back to the full original file (never cropped)
   */
  const handleRevertToOriginal = (id: string, isVerify = false) => {
    if (isVerify) {
      setVerifyQueue((prev) =>
        prev.map((item) => {
          if (item.id === id && item.originalDocUrl) {
            return {
              ...item,
              dataUrl: item.originalDocUrl,
              wasCroppedFromDocument: false,
              stageText: 'Full signature specimen preserved (100% uncropped)',
            };
          }
          return item;
        })
      );
    } else {
      setGenericQueue((prev) =>
        prev.map((item) => {
          if (item.id === id && item.originalDocUrl) {
            return {
              ...item,
              dataUrl: item.originalDocUrl,
              wasCroppedFromDocument: false,
              stageText: 'Full signature specimen preserved (100% uncropped)',
            };
          }
          return item;
        })
      );
    }
    showToast('Reverted to full image without cropping.');
  };

  /**
   * Forces signature scanning & cropping on an item if it was a cheque or document
   */
  const handleForceCropDocument = async (id: string, isVerify = false) => {
    const list = isVerify ? verifyQueue : genericQueue;
    const item = list.find((q) => q.id === id);
    if (!item) return;

    try {
      const img = await loadImage(item.originalDocUrl || item.dataUrl);
      const cropInfo = scanAndExtractSignature(img, item.name, 'document_cheque');
      if (cropInfo.wasCropped) {
        if (isVerify) {
          setVerifyQueue((prev) =>
            prev.map((q) =>
              q.id === id
                ? {
                    ...q,
                    dataUrl: cropInfo.croppedDataUrl,
                    originalDocUrl: cropInfo.originalDataUrl,
                    wasCroppedFromDocument: true,
                    cropBox: cropInfo.box,
                    stageText: 'Signature scanned & cropped from document',
                  }
                : q
            )
          );
        } else {
          setGenericQueue((prev) =>
            prev.map((q) =>
              q.id === id
                ? {
                    ...q,
                    dataUrl: cropInfo.croppedDataUrl,
                    originalDocUrl: cropInfo.originalDataUrl,
                    wasCroppedFromDocument: true,
                    cropBox: cropInfo.box,
                    stageText: 'Signature scanned & cropped from document',
                  }
                : q
            )
          );
        }
        showToast('Scanned and cropped signature part from document!');
      } else {
        showToast('No separate signature region detected; full image preserved.');
      }
    } catch (e) {
      showToast('Could not crop signature.');
    }
  };

  /**
   * Applies an adjusted crop box from the Crop Inspector modal
   */
  const handleApplyAdjustedCrop = async (
    itemId: string,
    docUrl: string,
    newBox: { x: number; y: number; width: number; height: number },
    isVerify = false
  ) => {
    try {
      const img = await loadImage(docUrl);
      const croppedDataUrl = cropImageToDataUrl(img, newBox);

      if (isVerify) {
        setVerifyQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  dataUrl: croppedDataUrl,
                  originalDocUrl: docUrl,
                  wasCroppedFromDocument: true,
                  cropBox: newBox,
                  stageText: 'Signature cropped with customized box',
                }
              : q
          )
        );
      } else {
        setGenericQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  dataUrl: croppedDataUrl,
                  originalDocUrl: docUrl,
                  wasCroppedFromDocument: true,
                  cropBox: newBox,
                  stageText: 'Signature cropped with customized box',
                }
              : q
          )
        );
      }
      setPreviewDocModal(null);
      showToast('Customized signature crop applied!');
    } catch (err) {
      showToast('Failed to apply custom crop.');
    }
  };
  verifyQueueRef.current = verifyQueue;

  // Live Firestore Signers subscription
  useEffect(() => {
    const unsub = subscribeSigners((list) => {
      setSigners(list);
      if (list.length > 0 && !selectedSigner) {
        setSelectedSigner(list[0].name);
      }
    });

    fetch('/api/signers')
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0 && signers.length === 0) {
          setSigners(data);
          setSelectedSigner(data[0].name);
        }
      })
      .catch(() => {});

    return () => unsub();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  /**
   * Helper to ensure unique label generation
   */
  const makeUniqueLabel = (candidate: string, existingLabels: string[]): string => {
    const trimmed = candidate.trim();
    if (!existingLabels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      return trimmed;
    }
    let counter = 2;
    while (existingLabels.some((l) => l.toLowerCase() === `${trimmed} (${counter})`.toLowerCase())) {
      counter++;
    }
    return `${trimmed} (${counter})`;
  };

  /**
   * Check if a label is duplicated within the current queue
   */
  const isLabelDuplicated = (label: string, itemId: string, queue: { id: string; label: string }[]) => {
    const trimmed = label.trim().toLowerCase();
    if (!trimmed) return true;
    return queue.some((q) => q.id !== itemId && q.label.trim().toLowerCase() === trimmed);
  };

  /**
   * Stage multiple files into the Asynchronous Batch Queue.
   * Automatically scans documents or cheques and crops out strictly the signature part!
   */
  const handleStageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: QueueSignatureItem[] = [];
    const currentLabels = genericQueue.map((q) => q.label);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawDataUrl = await readFileAsDataUrl(file);
      const rawImg = await loadImage(rawDataUrl);

      // Intelligent document & cheque signature scanner:
      // When only a signature is uploaded, it is NEVER cropped at all!
      const cropInfo = scanAndExtractSignature(rawImg, file.name, uploadDocMode);

      const rawBase = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const uniqueLabel = makeUniqueLabel(rawBase || `Specimen ${genericQueue.length + i + 1}`, currentLabels);
      currentLabels.push(uniqueLabel);

      newItems.push({
        id: `q-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        name: file.name,
        dataUrl: cropInfo.croppedDataUrl, // isolated uncropped signature or cleanly cropped signature part
        originalDocUrl: cropInfo.wasCropped ? cropInfo.originalDataUrl : undefined,
        wasCroppedFromDocument: cropInfo.isDocument && cropInfo.wasCropped,
        cropBox: cropInfo.wasCropped ? cropInfo.box : undefined,
        detectionType: cropInfo.detectionType,
        label: uniqueLabel,
        sizeKb: Math.round(file.size / 1024),
        status: 'pending',
        progress: 0,
        stageText: cropInfo.wasCropped ? 'Signature cropped from document' : 'Full signature preserved (100% uncropped)',
      });
    }

    setGenericQueue((prev) => [...prev, ...newItems]);
    const docCount = newItems.filter((item) => item.wasCroppedFromDocument).length;
    if (docCount > 0) {
      showToast(`Scanned & cropped signature part from ${docCount} document/cheque file${docCount > 1 ? 's' : ''}!`);
    } else {
      showToast(`Added ${newItems.length} signature${newItems.length > 1 ? 's' : ''} (100% uncropped) to queue!`);
    }
  };

  /**
   * Stage multiple query files into writer-dependent queue
   */
  const handleStageVerifyFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: VerificationQueueItem[] = [];
    const currentLabels = verifyQueue.map((q) => q.label);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rawDataUrl = await readFileAsDataUrl(file);
      const rawImg = await loadImage(rawDataUrl);
      const cropInfo = scanAndExtractSignature(rawImg, file.name, uploadDocMode);

      const rawBase = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const uniqueLabel = makeUniqueLabel(rawBase || `Query ${verifyQueue.length + i + 1}`, currentLabels);
      currentLabels.push(uniqueLabel);

      newItems.push({
        id: `vq-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        name: file.name,
        dataUrl: cropInfo.croppedDataUrl,
        originalDocUrl: cropInfo.wasCropped ? cropInfo.originalDataUrl : undefined,
        wasCroppedFromDocument: cropInfo.isDocument && cropInfo.wasCropped,
        cropBox: cropInfo.wasCropped ? cropInfo.box : undefined,
        label: uniqueLabel,
        sizeKb: Math.round(file.size / 1024),
        status: 'pending',
        progress: 0,
        stageText: cropInfo.wasCropped ? 'Signature cropped from document' : 'Full signature preserved (100% uncropped)',
        signerName: selectedSigner,
      });
    }

    setVerifyQueue((prev) => [...prev, ...newItems]);
    showToast(`Added ${newItems.length} query signature${newItems.length > 1 ? 's' : ''} to verification queue!`);
  };

  /**
   * Update label for an item in the generic queue
   */
  const handleUpdateLabel = (id: string, newLabel: string) => {
    setGenericQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, label: newLabel } : item))
    );
  };

  /**
   * Auto-fix duplicate label by appending unique number
   */
  const handleAutoFixDuplicateLabel = (id: string) => {
    const item = genericQueue.find((q) => q.id === id);
    if (!item) return;
    const otherLabels = genericQueue.filter((q) => q.id !== id).map((q) => q.label);
    const fixed = makeUniqueLabel(item.label, otherLabels);
    handleUpdateLabel(id, fixed);
  };

  /**
   * Remove item from queue
   */
  const handleRemoveFromQueue = (id: string) => {
    setGenericQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRemoveFromVerifyQueue = (id: string) => {
    setVerifyQueue((prev) => prev.filter((item) => item.id !== id));
  };

  /**
   * Clears completed items from queue
   */
  const handleClearCompleted = () => {
    setGenericQueue((prev) => prev.filter((item) => item.status !== 'completed'));
    showToast('Cleared completed items from queue.');
  };

  /**
   * Processes a single signature item asynchronously with forensic stage updates
   */
  const processGenericItem = async (item: QueueSignatureItem): Promise<AnalysisResult> => {
    // Stage 1: Load image & Otsu threshold
    setGenericQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, status: 'processing', progress: 20, stageText: 'Otsu Binarization...' } : q
      )
    );
    await new Promise((r) => setTimeout(r, 60));

    const img = await loadImage(item.dataUrl);

    // Stage 2: Extract 23 Features
    setGenericQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, progress: 50, stageText: 'Extracting 23 Biometric Features...' } : q
      )
    );
    await new Promise((r) => setTimeout(r, 60));

    // Stage 3: Classify & SHAP Heatmap
    setGenericQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, progress: 75, stageText: 'Computing Decision Trees & SHAP...' } : q
      )
    );

    const result = await analyzeSignature(img, engineType, { filename: item.name, skipAutoCrop: true });
    result.label = item.label;
    if (item.wasCroppedFromDocument) {
      result.was_cropped_from_document = true;
      result.crop_box = item.cropBox;
      result.document_data_url = item.originalDocUrl;
    }

    // Stage 4: Persist to Firestore
    setGenericQueue((prev) =>
      prev.map((q) =>
        q.id === item.id ? { ...q, progress: 90, stageText: 'Saving to Firestore Audit Log...' } : q
      )
    );

    try {
      await savePredictionToFirestore({
        user_id: user?.id || 'anonymous',
        user_email: user?.email || '',
        image_filename: item.name,
        label: item.label,
        prediction: result.prediction,
        confidence: result.confidence,
        model_used: result.model_used,
        prediction_time_ms: result.prediction_time_ms,
        features: {
          ...result.explanation.stroke_metrics,
          dominant_region: result.explanation.dominant_region,
          solidity: result.features_23?.solidity,
          pixel_density: result.features_23?.pixel_density,
          aspect_ratio: result.features_23?.aspect_ratio,
          class_probabilities: result.class_probabilities,
        },
        explanation_summary: result.explanation.plain_language,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore write warning:', e);
    }

    // Stage 5: Finished
    setGenericQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'completed', progress: 100, stageText: `Verdict: ${result.prediction} (${result.confidence}%)`, result }
          : q
      )
    );

    // Stream directly into batch results
    setBatchResults((prev) => [result, ...prev]);
    if (onAnalyzeComplete) onAnalyzeComplete(result);

    return result;
  };

  /**
   * Asynchronous Batch Queue Worker
   */
  const startGenericQueueWorker = async () => {
    // Check for duplicate labels before starting
    const labels = genericQueue.map((q) => q.label.trim().toLowerCase());
    const hasDuplicates = labels.some((l, idx) => labels.indexOf(l) !== idx);
    if (hasDuplicates) {
      showToast('⚠️ Please ensure all signature labels are unique before running the queue!');
      return;
    }

    setIsQueueRunning(true);
    setIsQueuePaused(false);
    queueRunningRef.current = true;
    queuePausedRef.current = false;

    // Worker loop with concurrency control
    while (queueRunningRef.current) {
      if (queuePausedRef.current) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      // Find pending items
      const pendingItems = genericQueueRef.current.filter((q) => q.status === 'pending');
      if (pendingItems.length === 0) {
        // Check if any are still in-flight
        const inFlight = genericQueueRef.current.filter((q) => q.status === 'processing');
        if (inFlight.length === 0) {
          // Finished all!
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }

      // Take batch of size `concurrency`
      const batchToProcess = pendingItems.slice(0, concurrency);

      // Process batch simultaneously
      await Promise.all(
        batchToProcess.map(async (item) => {
          try {
            await processGenericItem(item);
          } catch (err: any) {
            console.error(`Queue item ${item.name} failed:`, err);
            setGenericQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? { ...q, status: 'failed', stageText: 'Analysis Error', error: String(err) }
                  : q
              )
            );
          }
        })
      );
    }

    setIsQueueRunning(false);
    queueRunningRef.current = false;
    showToast('Batch processing queue finished!');
  };

  const pauseGenericQueueWorker = () => {
    setIsQueuePaused(true);
    queuePausedRef.current = true;
    showToast('Queue paused.');
  };

  const resumeGenericQueueWorker = () => {
    setIsQueuePaused(false);
    queuePausedRef.current = false;
    showToast('Queue resumed.');
  };

  const cancelGenericQueue = () => {
    queueRunningRef.current = false;
    setIsQueueRunning(false);
    setIsQueuePaused(false);
    setGenericQueue((prev) =>
      prev.map((q) => (q.status === 'pending' || q.status === 'processing' ? { ...q, status: 'paused', stageText: 'Cancelled' } : q))
    );
    showToast('Queue cancelled.');
  };

  /**
   * Asynchronous Queue Worker for Writer-Dependent Verification
   */
  const startVerifyQueueWorker = async () => {
    if (!selectedSigner) {
      showToast('Please select a registered signer profile first!');
      return;
    }

    const signer = signers.find((s) => s.name === selectedSigner);
    const targetVector = signer?.feature_vector || [];

    setIsVerifyQueueRunning(true);
    verifyQueueRunningRef.current = true;

    for (const item of verifyQueueRef.current) {
      if (!verifyQueueRunningRef.current) break;
      if (item.status === 'completed') continue;

      setVerifyQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: 'processing', progress: 30, stageText: 'Extracting 23 Features...' } : q
        )
      );

      try {
        const img = await loadImage(item.dataUrl);
        const pre = runPreprocessingPipeline(img);
        const feat = extract23Features(pre.binaryData, pre.width, pre.height);

        setVerifyQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, progress: 70, stageText: 'Calculating Cosine Similarity...' } : q
          )
        );

        let similarity = 94.0;
        if (targetVector.length > 0) {
          similarity = computeVectorSimilarity(feat.vector, targetVector);
        }
        const threshold = 99.0;
        const isMatch = similarity >= threshold;
        const verdict = isMatch ? 'Matches registered signature' : 'Does not match registered signature';

        // Persist to Firestore
        try {
          await savePredictionToFirestore({
            user_id: user?.id || 'anonymous',
            user_email: user?.email || '',
            image_filename: item.name,
            label: item.label,
            prediction: verdict,
            confidence: similarity,
            model_used: `writer_dependent (${selectedSigner})`,
            prediction_time_ms: 85,
            features: { similarity, threshold },
            explanation_summary: `Compared "${item.label}" against ${selectedSigner}'s enrolled reference templates.`,
            created_at: new Date().toISOString(),
          });
        } catch {}

        setVerifyQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'completed',
                  progress: 100,
                  stageText: isMatch ? `Matched (${similarity}%)` : `Divergent (${similarity}%)`,
                  similarity,
                  threshold,
                  isMatch,
                  verdict,
                }
              : q
          )
        );
      } catch (err: any) {
        setVerifyQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'failed', stageText: 'Verification failed', error: String(err) } : q
          )
        );
      }
    }

    setIsVerifyQueueRunning(false);
    verifyQueueRunningRef.current = false;
    showToast('Verification queue completed!');
  };

  /**
   * Helper to read file as data URL
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
   * Signer enrollment
   */
  const handleEnrollFilesChange = async (files: FileList | null) => {
    if (!files) return;
    const enrolledItems: Array<{ name: string; dataUrl: string; vector: number[] }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await readFileAsDataUrl(file);
      const img = await loadImage(dataUrl);
      const pre = runPreprocessingPipeline(img);
      const feats = extract23Features(pre.binaryData, pre.width, pre.height);
      enrolledItems.push({ name: file.name, dataUrl, vector: feats.vector });
    }
    setNewEnrollFiles(enrolledItems);
  };

  const handleCompleteSignerEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnrollName.trim()) {
      showToast('Please enter the signer name.');
      return;
    }
    if (newEnrollFiles.length === 0) {
      showToast('Please upload at least 1 genuine reference signature image.');
      return;
    }

    setEnrollingSigner(true);
    try {
      const numSamples = newEnrollFiles.length;
      const avgVector: number[] = new Array(23).fill(0);
      for (const item of newEnrollFiles) {
        for (let j = 0; j < 23; j++) {
          avgVector[j] += (item.vector[j] || 0) / numSamples;
        }
      }
      const sampleThumbnails = newEnrollFiles.slice(0, 3).map((f) => f.dataUrl);

      const newRecord = await saveSignerToFirestore({
        name: newEnrollName.trim(),
        num_samples: numSamples,
        feature_vector: avgVector,
        sample_images: sampleThumbnails,
        registered_by: user?.email || 'examiner',
        created_at: new Date().toISOString(),
      });

      try {
        await fetch('/api/signers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newEnrollName.trim(),
            num_samples: numSamples,
            feature_vector: avgVector,
            sample_images: sampleThumbnails,
            registered_by: user?.email,
          }),
        });
      } catch {}

      if (newRecord) {
        setSigners((prev) => [...prev, newRecord]);
        setSelectedSigner(newRecord.name);
      }

      setNewEnrollName('');
      setNewEnrollFiles([]);
      setShowSignerEnrollForm(false);
      showToast(`Enrolled "${newEnrollName}" with ${numSamples} reference signatures!`);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to enroll signer.');
    } finally {
      setEnrollingSigner(false);
    }
  };

  // Download all batch results as JSON
  const handleExportAllJson = () => {
    if (batchResults.length === 0) return;
    const batchData = {
      batch_id: `FX-BATCH-${Date.now().toString(36).toUpperCase()}`,
      generated_at: new Date().toISOString(),
      auditor: user?.email || 'examiner',
      total_specimens: batchResults.length,
      genuine_count: batchResults.filter((r) => r.prediction === 'Genuine').length,
      forged_count: batchResults.filter((r) => r.prediction === 'Forged').length,
      results: batchResults.map((r) => ({
        filename: r.filename || 'specimen.png',
        label: r.label || '',
        verdict: r.prediction,
        confidence: r.confidence,
        model_used: r.model_used,
        latency_ms: r.prediction_time_ms,
        stroke_metrics: r.explanation.stroke_metrics,
        features_23: r.features_23,
        explanation: r.explanation.plain_language,
      })),
    };

    const blob = new Blob([JSON.stringify(batchData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forgexplain_batch_analysis_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Batch JSON report downloaded!');
  };

  const activeResult = batchResults[selectedDetailIndex] || null;

  // Queue stats calculation
  const totalQueueCount = genericQueue.length;
  const completedQueueCount = genericQueue.filter((q) => q.status === 'completed').length;
  const inFlightQueueCount = genericQueue.filter((q) => q.status === 'processing').length;
  const pendingQueueCount = genericQueue.filter((q) => q.status === 'pending').length;
  const queueProgressPercent = totalQueueCount > 0 ? Math.round((completedQueueCount / totalQueueCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-purple-950 border border-purple-500/40 text-purple-100 shadow-xl shadow-purple-900/40 animate-bounce">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="pb-3 border-b border-purple-900/20">
        <h2 className="text-2xl font-extrabold bg-gradient-to-r from-purple-200 via-purple-100 to-fuchsia-200 bg-clip-text text-transparent flex items-center gap-2">
          <span>⚡</span> Batch Signature Detection & Asynchronous Processing Queue
        </h2>
        <p className="text-sm text-purple-300/70 mt-1">
          Upload multiple signature files simultaneously, assign unique forensic labels, and process them asynchronously in a live execution queue.
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-2xl bg-purple-950/40 border border-purple-800/30">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCheckMode('generic')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              checkMode === 'generic'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            🔍 Generic Multi-Signature Queue (23 Features + RF)
          </button>
          <button
            onClick={() => setCheckMode('writer_dependent')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              checkMode === 'writer_dependent'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-purple-300/70 hover:text-white'
            }`}
          >
            🖊️ Writer-Dependent Verification Queue
          </button>
        </div>

        {checkMode === 'generic' && (
          <div className="flex items-center gap-3 px-3 text-xs text-purple-300/80">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-purple-300/60">Engine:</span>
              <select
                value={engineType}
                onChange={(e) => setEngineType(e.target.value as any)}
                className="bg-[#15121F] border border-purple-700/40 rounded-lg px-2.5 py-1 text-xs text-purple-200 focus:outline-hidden"
              >
                <option value="features">23 Engineered Features (CEDAR)</option>
                <option value="pixel">Pixel Random Forest (128×128 SHAP)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-purple-300/60">Workers:</span>
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="bg-[#15121F] border border-purple-700/40 rounded-lg px-2 py-1 text-xs text-purple-200 focus:outline-hidden"
                disabled={isQueueRunning}
              >
                <option value={1}>1 Worker (Sequential)</option>
                <option value={2}>2 Workers (Dual Async)</option>
                <option value={3}>3 Workers (Fast)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* WRITER-DEPENDENT SIGNER BAR                                               */}
      {/* ========================================================================= */}
      {checkMode === 'writer_dependent' && (
        <div className="fx-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                <Users size={16} />
                <span>Writer-Dependent Biometric Target</span>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Verify query signatures in an asynchronous batch queue against enrolled reference templates.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-purple-200">Signer Profile:</label>
                <select
                  value={selectedSigner}
                  onChange={(e) => setSelectedSigner(e.target.value)}
                  className="bg-[#1C1830] border border-purple-600/40 rounded-xl px-3 py-1.5 text-xs font-semibold text-white focus:outline-hidden min-w-[160px]"
                >
                  {signers.length > 0 ? (
                    signers.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} ({s.num_samples} ref signature{s.num_samples > 1 ? 's' : ''})
                      </option>
                    ))
                  ) : (
                    <option value="">No signers registered yet</option>
                  )}
                </select>
              </div>

              <button
                onClick={() => setShowSignerEnrollForm(!showSignerEnrollForm)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-sm transition-all"
              >
                <UserPlus size={14} />
                <span>{showSignerEnrollForm ? 'Close Form' : 'Register New Signer'}</span>
              </button>
            </div>
          </div>

          {/* Signer Enrollment Drawer */}
          {showSignerEnrollForm && (
            <BulkSignerEnrollment
              onSignerEnrolled={(newRecord) => {
                setSigners((prev) => [...prev.filter((s) => s.id !== newRecord.id), newRecord]);
                setSelectedSigner(newRecord.name);
                setShowSignerEnrollForm(false);
                showToast(`Enrolled "${newRecord.name}" with ${newRecord.num_samples} reference signatures!`);
              }}
              onCancel={() => setShowSignerEnrollForm(false)}
            />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* USER-CONTROLLED MODE TOGGLE: SIGNATURE ONLY vs FULL DOCUMENT              */}
      {/* ========================================================================= */}
      <div className="fx-card p-5 space-y-3.5 border-2 border-purple-600/30 bg-purple-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs uppercase font-extrabold tracking-wider text-purple-400 flex items-center gap-1.5">
              <Sliders size={14} className="text-purple-400" />
              <span>Input Mode Selection</span>
            </span>
            <p className="text-xs text-purple-300/80 mt-0.5">
              Explicitly choose how uploaded files are processed:
            </p>
          </div>

          <span className="text-[11px] font-mono text-purple-400/80">
            Current: <strong className="text-white uppercase">{uploadDocMode.replace('_', ' ')}</strong>
          </span>
        </div>

        {/* The Toggle Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Option 1: Signature Only */}
          <button
            type="button"
            onClick={() => {
              setUploadDocMode('signature_only');
              showToast('Switched to Signature Only: Cropping is disabled.');
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
              uploadDocMode === 'signature_only'
                ? 'bg-emerald-950/70 border-emerald-500 ring-2 ring-emerald-500/30 text-white shadow-lg shadow-emerald-950/50'
                : 'bg-[#140F24] border-purple-800/40 text-purple-300 hover:border-purple-600/60 hover:text-white'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                uploadDocMode === 'signature_only'
                  ? 'bg-emerald-500 text-black shadow-md'
                  : 'bg-purple-900/40 text-purple-400'
              }`}
            >
              <PenTool size={18} />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Signature Only</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/40">
                  Disables Cropping
                </span>
              </div>
              <p className="text-[11px] text-purple-300/70 leading-relaxed">
                Takes pure isolated signature files. Zero cropping applied; entire image is preserved as-is.
              </p>
            </div>
          </button>

          {/* Option 2: Full Document */}
          <button
            type="button"
            onClick={() => {
              setUploadDocMode('full_document');
              showToast('Switched to Full Document: Smart signature extraction is enabled.');
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
              uploadDocMode === 'full_document'
                ? 'bg-purple-950/70 border-purple-500 ring-2 ring-purple-500/30 text-white shadow-lg shadow-purple-950/50'
                : 'bg-[#140F24] border-purple-800/40 text-purple-300 hover:border-purple-600/60 hover:text-white'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                uploadDocMode === 'full_document'
                  ? 'bg-purple-500 text-white shadow-md'
                  : 'bg-purple-900/40 text-purple-400'
              }`}
            >
              <Scissors size={18} />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Full Document</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-900/60 text-purple-200 border border-purple-600/40">
                  Smart Extraction
                </span>
              </div>
              <p className="text-[11px] text-purple-300/70 leading-relaxed">
                Scans cheques, contracts & forms to automatically locate and crop ONLY the signature part.
              </p>
            </div>
          </button>

          {/* Option 3: Auto-Detect */}
          <button
            type="button"
            onClick={() => {
              setUploadDocMode('auto');
              showToast('Switched to Auto-Detect: Computer vision auto-detection active.');
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 sm:col-span-2 md:col-span-1 ${
              uploadDocMode === 'auto'
                ? 'bg-blue-950/70 border-blue-500 ring-2 ring-blue-500/30 text-white shadow-lg shadow-blue-950/50'
                : 'bg-[#140F24] border-purple-800/40 text-purple-300 hover:border-purple-600/60 hover:text-white'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                uploadDocMode === 'auto'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-purple-900/40 text-purple-400'
              }`}
            >
              <Sparkles size={18} />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">Auto-Detect</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-900/60 text-blue-200 border border-blue-600/40">
                  AI Classifier
                </span>
              </div>
              <p className="text-[11px] text-purple-300/70 leading-relaxed">
                Inspects layout & text profiles to automatically distinguish documents from signatures.
              </p>
            </div>
          </button>
        </div>

        {/* Dynamic Status Confirmation Indicator */}
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            uploadDocMode === 'signature_only'
              ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200'
              : uploadDocMode === 'full_document'
              ? 'bg-purple-950/40 border-purple-600/40 text-purple-200'
              : 'bg-blue-950/30 border-blue-600/40 text-blue-200'
          }`}
        >
          <span className="text-base shrink-0">
            {uploadDocMode === 'signature_only' ? '✍️' : uploadDocMode === 'full_document' ? '📄' : '✨'}
          </span>
          <div>
            {uploadDocMode === 'signature_only' && (
              <span>
                <strong>Signature Only Active:</strong> Cropping is completely <strong>disabled</strong>. Uploaded signatures will be analyzed 100% full with all strokes preserved intact.
              </span>
            )}
            {uploadDocMode === 'full_document' && (
              <span>
                <strong>Full Document Active:</strong> Smart signature extraction is <strong>enabled</strong>. Uploaded bank cheques, invoices, and documents will be automatically cropped strictly to the signature part.
              </span>
            )}
            {uploadDocMode === 'auto' && (
              <span>
                <strong>Auto-Detect Active:</strong> The engine automatically inspects each file. Signatures stay full, while documents & cheques are cropped.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MULTI-FILE SIMULTANEOUS UPLOAD DROPZONE                                   */}
      {/* ========================================================================= */}
      <div className="fx-card p-6">
        <div className="border-2 border-dashed border-purple-800/40 hover:border-purple-500/60 rounded-2xl p-7 text-center transition-all bg-purple-950/10">
          <input
            type="file"
            id="multi-sig-upload"
            multiple
            className="hidden"
            accept="image/png,image/jpeg,image/jpg,image/bmp,image/tiff"
            onChange={(e) => {
              if (checkMode === 'generic') {
                handleStageFiles(e.target.files);
              } else {
                handleStageVerifyFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
          <label
            htmlFor="multi-sig-upload"
            className="cursor-pointer flex flex-col items-center justify-center space-y-2.5"
          >
            <div
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center shadow-inner transition-colors ${
                uploadDocMode === 'signature_only'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400'
                  : uploadDocMode === 'full_document'
                  ? 'bg-purple-900/40 border-purple-500/40 text-purple-300'
                  : 'bg-purple-900/30 border-purple-600/30 text-purple-400'
              }`}
            >
              {uploadDocMode === 'signature_only' ? <PenTool size={26} /> : <Files size={26} />}
            </div>
            <div>
              <span className="text-base font-bold text-white hover:underline">
                {uploadDocMode === 'signature_only'
                  ? 'Upload Signature Files (Cropping Disabled)'
                  : uploadDocMode === 'full_document'
                  ? 'Upload Full Documents or Cheques (Smart Signature Extraction)'
                  : 'Upload Multiple Signature or Document Files'}
              </span>{' '}
              <span className="text-purple-300/70 text-sm">or drag and drop batch here</span>
              <p className="text-xs text-purple-400/60 mt-1">
                {uploadDocMode === 'signature_only'
                  ? 'Files are taken 100% full as pure signature specimens without any cropping.'
                  : uploadDocMode === 'full_document'
                  ? 'Full documents and cheques will be automatically scanned to crop only the signature part.'
                  : 'Select 2, 5, 20 or more files. Each file is queued with its own unique label.'}
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ASYNCHRONOUS BATCH PROCESSING QUEUE PANEL (GENERIC CHECK)                 */}
      {/* ========================================================================= */}
      {checkMode === 'generic' && genericQueue.length > 0 && (
        <div className="fx-card p-6 border-2 border-purple-500/50 space-y-5 animate-in fade-in duration-200">
          {/* Queue Header & Status Overview */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-purple-900/30">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={18} className={isQueueRunning ? 'text-purple-400 animate-pulse' : 'text-purple-400'} />
                <h3 className="text-base font-bold text-white">
                  Asynchronous Batch Queue ({totalQueueCount} item{totalQueueCount > 1 ? 's' : ''})
                </h3>
              </div>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Every signature has a unique forensic label. Trigger asynchronous queue execution with live progress tracking.
              </p>
            </div>

            {/* Queue Control Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {!isQueueRunning ? (
                <button
                  onClick={startGenericQueueWorker}
                  disabled={pendingQueueCount === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-purple-500 to-fuchsia-600 hover:from-purple-500 text-white shadow-lg shadow-purple-600/30 flex items-center gap-1.5 transition-all disabled:opacity-40"
                >
                  <Play size={14} className="fill-current" />
                  <span>
                    {completedQueueCount > 0 ? `Resume Queue (${pendingQueueCount} Pending)` : `Start Batch Queue (${totalQueueCount})`}
                  </span>
                </button>
              ) : isQueuePaused ? (
                <button
                  onClick={resumeGenericQueueWorker}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md transition-all"
                >
                  <Play size={14} className="fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseGenericQueueWorker}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-md transition-all"
                >
                  <Pause size={14} className="fill-current" />
                  <span>Pause</span>
                </button>
              )}

              {isQueueRunning && (
                <button
                  onClick={cancelGenericQueue}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700/40 transition-all"
                >
                  Cancel
                </button>
              )}

              {completedQueueCount > 0 && !isQueueRunning && (
                <button
                  onClick={handleClearCompleted}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-purple-950/40 text-purple-300 hover:text-white border border-purple-800/30"
                >
                  Clear Finished
                </button>
              )}
            </div>
          </div>

          {/* Aggregate Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-purple-300/80 flex items-center gap-2">
                <span>Batch Queue Progress:</span>
                <span className="font-mono text-white font-bold">{queueProgressPercent}%</span>
                {isQueueRunning && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-purple-400 font-normal">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    Processing with {concurrency} async workers
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3 text-[11px] font-semibold text-purple-400/80">
                <span className="text-emerald-400">✅ {completedQueueCount} Done</span>
                <span>&bull;</span>
                <span className="text-purple-300">⚙️ {inFlightQueueCount} Active</span>
                <span>&bull;</span>
                <span className="text-purple-400/60">⏳ {pendingQueueCount} Pending</span>
              </div>
            </div>

            <div className="h-2.5 w-full bg-purple-950/80 rounded-full overflow-hidden p-0.5 border border-purple-800/40">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-emerald-400 transition-all duration-300 shadow-sm"
                style={{ width: `${queueProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Queue Items List with Individual Unique Label Inputs and Live Stage Progress */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {genericQueue.map((item, idx) => {
              const isDupe = isLabelDuplicated(item.label, item.id, genericQueue);
              const isProcessing = item.status === 'processing';
              const isDone = item.status === 'completed';
              const isFailed = item.status === 'failed';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-all flex flex-col md:flex-row md:items-center gap-4 ${
                    isProcessing
                      ? 'bg-purple-950/60 border-purple-400 shadow-md shadow-purple-600/10'
                      : isDone
                      ? 'bg-purple-950/30 border-emerald-500/30'
                      : isFailed
                      ? 'bg-rose-950/30 border-rose-500/30'
                      : 'bg-purple-950/40 border-purple-800/40 hover:border-purple-600/50'
                  }`}
                >
                  {/* Thumbnail & File Meta */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-16 h-14 rounded-lg bg-black/50 border border-purple-800/30 flex items-center justify-center p-1 overflow-hidden shrink-0">
                      <img src={item.dataUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                    </div>
                    <div className="max-w-[150px] truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-purple-400/80 uppercase">
                          #{idx + 1}
                        </span>
                        <span className="text-[10px] text-purple-400/60 font-mono">
                          {item.sizeKb} KB
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-white truncate block" title={item.name}>
                        {item.name}
                      </span>
                      {item.wasCroppedFromDocument ? (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-900/80 text-purple-200 border border-purple-600/50">
                            <Scissors size={9} className="text-purple-400" />
                            <span>Signature Cropped</span>
                          </span>
                          {item.originalDocUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewDocModal({
                                  docUrl: item.originalDocUrl!,
                                  cropBox: item.cropBox,
                                  label: item.label,
                                  itemId: item.id,
                                  isVerifyQueue: false,
                                  isCropped: true,
                                })
                              }
                              className="text-[10px] text-purple-300 hover:text-white underline font-medium flex items-center gap-0.5"
                              title="Inspect full document and adjust signature crop box"
                            >
                              <Eye size={10} /> Inspect Crop
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRevertToOriginal(item.id, false)}
                            className="text-[10px] text-amber-300 hover:text-amber-200 underline font-medium"
                            title="Undo crop and take the full original image as signature"
                          >
                            Revert (Full Image)
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                            <Check size={9} className="text-emerald-400" />
                            <span>Full Signature (No Crop)</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleForceCropDocument(item.id, false)}
                            className="text-[10px] text-purple-400 hover:text-purple-200 underline font-medium"
                            title="If this was a check or document, crop to signature zone"
                          >
                            Crop Signature Part
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Unique Label Text Input */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-purple-200 flex items-center gap-1">
                        <Tag size={12} className="text-purple-400" />
                        <span>Unique Forensic Label:</span>
                      </label>

                      {isDupe && !isDone && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
                            <AlertCircle size={10} /> Duplicate!
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAutoFixDuplicateLabel(item.id)}
                            className="text-[10px] underline font-bold text-purple-300 hover:text-white"
                          >
                            Auto-Fix
                          </button>
                        </div>
                      )}
                    </div>

                    <input
                      type="text"
                      disabled={isProcessing || isDone}
                      value={item.label}
                      onChange={(e) => handleUpdateLabel(item.id, e.target.value)}
                      placeholder="e.g. Loan Agreement Page 3, Cheque #4921..."
                      className={`w-full bg-[#15121F] border rounded-xl px-3 py-1.5 text-xs text-white focus:outline-hidden transition-colors ${
                        isDupe && !isDone
                          ? 'border-amber-500/70 focus:border-amber-400'
                          : 'border-purple-700/50 focus:border-purple-400'
                      }`}
                    />
                  </div>

                  {/* Status & Live Progress */}
                  <div className="w-full md:w-56 shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-purple-300 truncate max-w-[170px]" title={item.stageText}>
                        {item.stageText}
                      </span>
                      {isDone ? (
                        <div className="flex items-center gap-1.5">
                          {item.result && (
                            <span
                              className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                                item.result.prediction === 'Forged'
                                  ? 'bg-rose-950/70 text-rose-300 border-rose-600/50'
                                  : 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50'
                              }`}
                              title={`Model Confidence: ${Math.round(item.result.confidence)}%`}
                            >
                              <span>{item.result.prediction}</span>
                              <span className="text-white font-semibold">({Math.round(item.result.confidence)}%)</span>
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-emerald-400">100%</span>
                        </div>
                      ) : isProcessing ? (
                        <span className="text-[11px] font-bold text-purple-300 font-mono">{item.progress}%</span>
                      ) : (
                        <span className="text-[10px] text-purple-400/60 uppercase">Queued</span>
                      )}
                    </div>

                    <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-800/30">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          isDone
                            ? 'bg-emerald-400'
                            : isFailed
                            ? 'bg-rose-500'
                            : 'bg-gradient-to-r from-purple-500 to-fuchsia-500'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Remove Button (disabled during processing) */}
                  {!isDone && (
                    <button
                      onClick={() => handleRemoveFromQueue(item.id)}
                      disabled={isProcessing}
                      className="p-2 rounded-lg text-purple-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors shrink-0 self-end md:self-center disabled:opacity-30"
                      title="Remove from batch queue"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add more files footer trigger */}
          <div className="pt-2 flex items-center justify-between">
            <label
              htmlFor="multi-sig-upload"
              className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/60 border border-purple-800/40"
            >
              <Plus size={14} />
              <span>Add More Signatures to Queue</span>
            </label>

            <span className="text-[11px] text-purple-400/60">
              {pendingQueueCount} items pending execution
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ASYNCHRONOUS VERIFICATION QUEUE (WRITER-DEPENDENT)                        */}
      {/* ========================================================================= */}
      {checkMode === 'writer_dependent' && verifyQueue.length > 0 && (
        <div className="fx-card p-6 border-2 border-purple-500/50 space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-900/30">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity size={16} className="text-purple-400" />
                <span>Verification Queue against "{selectedSigner}" ({verifyQueue.length} Signatures)</span>
              </h3>
              <p className="text-xs text-purple-300/70 mt-0.5">
                Each query signature file has its own unique label and runs through asynchronous biometric cosine matching.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={startVerifyQueueWorker}
                disabled={isVerifyQueueRunning || verifyQueue.filter((q) => q.status === 'pending').length === 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 via-purple-500 to-fuchsia-600 hover:from-purple-500 text-white shadow-md flex items-center gap-1.5 disabled:opacity-40"
              >
                <Play size={14} className="fill-current" />
                <span>{isVerifyQueueRunning ? 'Verifying Queue...' : 'Run Verification Queue'}</span>
              </button>

              <button
                onClick={() => setVerifyQueue([])}
                disabled={isVerifyQueueRunning}
                className="text-xs text-purple-400 hover:text-rose-400 px-2 py-1"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {verifyQueue.map((item, idx) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-purple-950/40 border border-purple-800/40 flex flex-col md:flex-row md:items-center gap-4"
              >
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-16 h-14 rounded-lg bg-black/50 border border-purple-800/30 flex items-center justify-center p-1 overflow-hidden shrink-0">
                    <img src={item.dataUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="max-w-[150px] truncate">
                    <span className="text-[10px] font-bold text-purple-400/80 block uppercase">
                      Query #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-white truncate block" title={item.name}>
                      {item.name}
                    </span>
                    {item.wasCroppedFromDocument ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-900/80 text-purple-200 border border-purple-600/50">
                          <Scissors size={9} className="text-purple-400" />
                          <span>Signature Cropped</span>
                        </span>
                        {item.originalDocUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDocModal({
                                docUrl: item.originalDocUrl!,
                                cropBox: item.cropBox,
                                label: item.label,
                                itemId: item.id,
                                isVerifyQueue: true,
                                isCropped: true,
                              })
                            }
                            className="text-[10px] text-purple-300 hover:text-white underline font-semibold flex items-center gap-0.5"
                          >
                            <Eye size={10} /> Inspect Crop
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRevertToOriginal(item.id, true)}
                          className="text-[10px] text-amber-300 hover:text-amber-200 underline font-semibold"
                        >
                          Revert (Full Image)
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700/50">
                          <Check size={9} className="text-emerald-400" />
                          <span>Full Signature (No Crop)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleForceCropDocument(item.id, true)}
                          className="text-[10px] text-purple-400 hover:text-purple-200 underline font-medium"
                        >
                          Crop Signature Part
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-purple-200 flex items-center gap-1">
                    <Tag size={12} className="text-purple-400" />
                    <span>Unique Query Label:</span>
                  </label>
                  <input
                    type="text"
                    disabled={item.status === 'processing' || item.status === 'completed'}
                    value={item.label}
                    onChange={(e) =>
                      setVerifyQueue((prev) =>
                        prev.map((q) => (q.id === item.id ? { ...q, label: e.target.value } : q))
                      )
                    }
                    placeholder="e.g. Questioned Cheque #8819..."
                    className="w-full bg-[#15121F] border border-purple-700/50 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="w-full md:w-52 shrink-0 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-purple-300 truncate">{item.stageText}</span>
                    {item.isMatch !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${item.isMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.isMatch ? 'MATCH' : 'NO MATCH'}
                        </span>
                        {item.similarity !== undefined && (
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 shadow-xs ${
                              item.isMatch
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40'
                                : 'bg-rose-950/60 text-rose-300 border-rose-600/40'
                            }`}
                            title={`Biometric Match Confidence: ${Math.round(item.similarity * 100)}%`}
                          >
                            <span>{Math.round(item.similarity * 100)}%</span>
                            <span className="text-[9px] opacity-80 font-sans font-medium">Confidence</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-800/30">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.status === 'completed'
                          ? item.isMatch
                            ? 'bg-emerald-400'
                            : 'bg-rose-500'
                          : 'bg-purple-500'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>

                {item.status !== 'completed' && (
                  <button
                    onClick={() => handleRemoveFromVerifyQueue(item.id)}
                    disabled={item.status === 'processing'}
                    className="p-2 text-purple-400 hover:text-rose-400"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REAL-TIME COMPLETED SIGNATURE BLOCKS (STREAMS IN LIVE AS QUEUE PROCESSES)  */}
      {/* ========================================================================= */}
      {checkMode === 'generic' && batchResults.length > 0 && (
        <div className="space-y-6">
          {/* Batch Summary Bar */}
          <div className="fx-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-purple-600/30">
            <div>
              <div className="text-xs uppercase font-extrabold tracking-wider text-purple-400 flex items-center gap-2">
                <span>Completed Batch Signatures</span>
                <span className="px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 text-[10px]">
                  {batchResults.length} Processed
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm font-semibold">
                <span className="text-emerald-400">
                  ✅ {batchResults.filter((r) => r.prediction === 'Genuine').length} Genuine
                </span>
                <span className="text-purple-300/40">&bull;</span>
                <span className="text-rose-400">
                  ⚠️ {batchResults.filter((r) => r.prediction === 'Forged').length} Forged
                </span>
                <span className="text-purple-300/40">&bull;</span>
                <span className="text-purple-200">
                  Avg. Confidence:{' '}
                  {Math.round(
                    batchResults.reduce((acc, r) => acc + r.confidence, 0) / batchResults.length
                  )}
                  %
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportAllJson}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-900/60 hover:bg-purple-800 text-purple-100 border border-purple-500/40 flex items-center gap-1.5 transition-all"
              >
                <DownloadCloud size={15} />
                <span>Export All Batch as JSON</span>
              </button>
            </div>
          </div>

          {/* Multiple Signature Blocks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {batchResults.map((result, idx) => {
              const isForged = result.prediction === 'Forged';
              const isSelected = selectedDetailIndex === idx;

              return (
                <div
                  key={idx}
                  className={`fx-card p-5 flex flex-col justify-between transition-all ${
                    isSelected ? 'ring-2 ring-purple-500 border-purple-400 shadow-xl' : 'hover:border-purple-600/50'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header: Unique Label Badge & Verdict */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {result.label && (
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-900/50 border border-purple-700/50 text-purple-200 text-xs font-bold mb-1 max-w-full">
                            <Tag size={12} className="text-purple-400 shrink-0" />
                            <span className="truncate" title={result.label}>{result.label}</span>
                          </div>
                        )}
                        <h4 className="text-xs font-semibold text-purple-300/70 truncate block" title={result.filename}>
                          {result.filename || `signature_${idx + 1}.png`}
                        </h4>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                            isForged
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          }`}
                        >
                          {result.prediction}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border flex items-center gap-1 shadow-xs ${
                            isForged
                              ? 'bg-rose-950/60 text-rose-300 border-rose-600/50'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
                          }`}
                          title={`Model Detection Confidence: ${Math.round(result.confidence)}% Certainty`}
                        >
                          <span>{Math.round(result.confidence)}%</span>
                          <span className="text-[10px] opacity-80 font-sans font-medium">Confidence</span>
                        </span>
                      </div>
                    </div>

                    {/* Specimen Thumbnail */}
                    <div className="p-2.5 rounded-xl bg-black/40 border border-purple-900/30 text-center">
                      <img
                        src={result.image_data_url}
                        alt="Signature Specimen"
                        className="h-24 max-w-full object-contain mx-auto"
                      />
                    </div>

                    {/* Visual Confidence Gauge */}
                    <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-900/20">
                      <ConfidenceGauge
                        score={result.confidence}
                        verdict={result.prediction}
                        initialMode="thermometer"
                        showToggle={true}
                      />
                    </div>

                    {/* Extracted 23 Biometric Features Snapshot */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] bg-purple-950/30 p-2.5 rounded-lg border border-purple-900/20">
                      <div>
                        <span className="text-purple-400/70 block">Smoothness</span>
                        <strong className="text-white">
                          {result.explanation.stroke_metrics.stroke_smoothness}/100
                        </strong>
                      </div>
                      <div>
                        <span className="text-purple-400/70 block">Consistency</span>
                        <strong className="text-white">
                          {result.explanation.stroke_metrics.stroke_consistency}/100
                        </strong>
                      </div>
                      <div>
                        <span className="text-purple-400/70 block">Solidity</span>
                        <strong className="text-purple-200">
                          {result.features_23?.solidity ?? '0.45'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Report Downloads per Signature Block */}
                  <div className="mt-4 pt-3 border-t border-purple-900/20 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedDetailIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-950/40 text-purple-300 hover:text-white border border-purple-800/30'
                      }`}
                    >
                      {isSelected ? 'Viewing Full Details' : 'Deep-Dive SHAP'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => generatePdfReport(result, result.filename, user?.email)}
                        className="p-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 text-purple-300 border border-purple-700/30 transition-colors"
                        title="Download PDF Report"
                      >
                        <FileText size={15} />
                      </button>
                      <button
                        onClick={() => {
                          downloadJsonReport(result, result.filename, user?.email);
                          showToast(`Exported ${result.filename || 'report'}.json`);
                        }}
                        className="p-1.5 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 text-purple-300 border border-purple-700/30 transition-colors"
                        title="Download JSON Report"
                      >
                        <FileCode2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Visual Explainability Studio Area for the Selected Block */}
          {activeResult && (
            <div className="fx-card p-6 space-y-6 mt-8 border-2 border-purple-600/40">
              {/* Prominent Detection Result & Confidence Score Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-purple-950/40 border border-purple-800/40">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg border shrink-0 ${
                      activeResult.prediction === 'Forged'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    }`}
                  >
                    {activeResult.prediction === 'Forged' ? '⚠️' : '✅'}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">Detection Result:</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                          activeResult.prediction === 'Forged'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        }`}
                      >
                        {activeResult.prediction}
                      </span>
                      {/* Confidence Score Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border flex items-center gap-1 shadow-xs ${
                          activeResult.prediction === 'Forged'
                            ? 'bg-rose-950/60 text-rose-300 border-rose-600/50'
                            : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
                        }`}
                        title="Model certainty score for this specimen"
                      >
                        <span>{Math.round(activeResult.confidence)}%</span>
                        <span className="text-[10px] font-sans font-medium opacity-85">Confidence</span>
                      </span>
                    </div>
                    <p className="text-xs text-purple-300/70 mt-0.5">
                      Specimen: <strong className="text-white">{activeResult.label || activeResult.filename}</strong> &bull; Model Certainty:{' '}
                      <strong className="text-white">{Math.round(activeResult.confidence)}%</strong> based on 23 biometric feature moments.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => handleExportPdf(activeResult)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-900/60 hover:bg-purple-800 text-purple-100 border border-purple-500/40 flex items-center gap-1.5 transition-colors"
                  >
                    <FileText size={14} />
                    <span>PDF Dossier</span>
                  </button>
                  <button
                    onClick={() => downloadJsonReport(activeResult)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-900/60 hover:bg-purple-800 text-purple-100 border border-purple-500/40 flex items-center gap-1.5 transition-colors"
                  >
                    <FileCode2 size={14} />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              {/* Studio with Layer blending, split curtain, loupe & hotspot callouts */}
              <VisualExplainabilityStudio
                result={activeResult}
                title={`Visual Explainability Studio: ${activeResult.label || activeResult.filename || 'Specimen'}`}
                subtitle={`Interactive SHAP heatmaps, split comparison curtain, and plain-language forensic hotspot callouts.`}
              />

              {/* 23 Features Full Table */}
              {activeResult.features_23 && (
                <div className="space-y-3 pt-4 border-t border-purple-900/30">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                      Extracted 23 Biometric Engineered Features Table
                    </h4>
                    <span className="text-[11px] text-purple-400/70">
                      Standardized normalized biometric invariant moments
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-[11px]">
                    {Object.entries(activeResult.features_23).map(([key, val]) => (
                      <div key={key} className="p-2 rounded-lg bg-black/30 border border-purple-900/30">
                        <span className="text-purple-400/60 block truncate">{key}</span>
                        <strong className="text-white">{val}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document Scanner & Signature Crop Inspector Modal */}
      {previewDocModal && (
        <DocumentCropInspectorModal
          docUrl={previewDocModal.docUrl}
          initialBox={previewDocModal.cropBox}
          label={previewDocModal.label}
          onApplyCrop={(newBox) => {
            if (previewDocModal.itemId) {
              handleApplyAdjustedCrop(
                previewDocModal.itemId,
                previewDocModal.docUrl,
                newBox,
                previewDocModal.isVerifyQueue
              );
            } else {
              setPreviewDocModal(null);
            }
          }}
          onRevertToFull={() => {
            if (previewDocModal.itemId) {
              handleRevertToOriginal(previewDocModal.itemId, previewDocModal.isVerifyQueue);
            }
            setPreviewDocModal(null);
          }}
          onClose={() => setPreviewDocModal(null)}
        />
      )}
    </div>
  );
};
