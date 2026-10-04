import { AnalysisResult } from '../types';
import { generatePdfReport } from './pdfGenerator';

/**
 * Downloads the forensic analysis result as a structured JSON report file
 */
export function downloadJsonReport(
  result: AnalysisResult,
  specimenFilename: string = 'signature_specimen.png',
  userEmail: string = 'examiner@forgexplain.ai'
) {
  const reportData = {
    report_id: `FX-REP-${Date.now().toString(36).toUpperCase()}`,
    generated_at: new Date().toISOString(),
    auditor: userEmail,
    specimen: {
      filename: specimenFilename,
      label: result.label || '',
      engine: result.model_used,
      processing_latency_ms: result.prediction_time_ms,
    },
    verification_outcome: {
      verdict: result.prediction,
      is_forged: result.prediction === 'Forged',
      confidence_percentage: result.confidence,
      posterior_probabilities: {
        genuine: result.class_probabilities.Genuine,
        forged: result.class_probabilities.Forged,
      },
    },
    biometric_forensic_metrics: {
      stroke_smoothness: {
        value: result.explanation.stroke_metrics.stroke_smoothness,
        scale: '0-100',
        reference_genuine_range: '~78.0',
        reference_forged_range: '~42.0',
      },
      stroke_consistency: {
        value: result.explanation.stroke_metrics.stroke_consistency,
        scale: '0-100',
        reference_genuine_range: '~75.0',
        reference_forged_range: '~40.0',
      },
      dominant_influence_region: result.explanation.dominant_region,
      spatial_quadrant_weights: result.explanation.quadrant_scores,
    },
    explainability: {
      method: result.explanation.backend,
      diagnostic_synthesis: result.explanation.plain_language,
      dominant_region: result.explanation.dominant_region,
      feature_attributions: result.explanation.feature_importance || [],
    },
    compliance: {
      standard: 'ISO/IEC 19794-7 Biometric Data Interchange Formats - Signature/Sign Time Series',
      system_name: 'ForgeXplain AI Signature Forensics',
      version: '1.0.0',
    },
  };

  const jsonStr = JSON.stringify(reportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const baseName = specimenFilename.replace(/\.[^/.]+$/, '');
  a.download = `forgexplain_report_${baseName}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(linkRef(url));
}

function linkRef(url: string) {
  const dummy = document.createElement('div');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return dummy;
}

export { generatePdfReport };
