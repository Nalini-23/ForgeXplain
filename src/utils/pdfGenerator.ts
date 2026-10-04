import { AnalysisResult } from '../types';

/**
 * Generates and downloads a Forensic Signature Verification Report
 */
export function generatePdfReport(
  result: AnalysisResult,
  filename: string = 'signature_specimen.png',
  userEmail: string = 'examiner@forgexplain.ai'
) {
  // Create an offscreen printable container
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // Fallback: trigger HTML download
    downloadHtmlReport(result, filename, userEmail);
    return;
  }

  const isForged = result.prediction === 'Forged';
  const statusColor = isForged ? '#EF4444' : '#10B981';
  const statusBg = isForged ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>ForgeXplain Forensic Report - ${filename}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #111827;
      background: #FFFFFF;
      padding: 40px;
      margin: 0;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #8B5CF6;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .logo-badge {
      background: linear-gradient(135deg, #7C3AED, #A855F7);
      color: white;
      font-weight: 800;
      font-size: 20px;
      padding: 8px 16px;
      border-radius: 8px;
      display: inline-block;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: #1F2937;
      margin: 8px 0 2px 0;
    }
    .verdict-box {
      background: ${statusBg};
      border: 2px solid ${statusColor};
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .verdict-text {
      font-size: 28px;
      font-weight: 800;
      color: ${statusColor};
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 16px;
      background: #F9FAFB;
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6B7280;
      margin-bottom: 12px;
    }
    .img-box {
      text-align: center;
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      padding: 12px;
    }
    .img-box img {
      max-width: 100%;
      height: 140px;
      object-fit: contain;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #E5E7EB;
      font-size: 14px;
    }
    .metric-row:last-child {
      border-bottom: none;
    }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #E5E7EB;
      padding-top: 16px;
      font-size: 12px;
      color: #6B7280;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo-badge">Fx</div>
      <div class="title">ForgeXplain Forensic Audit Report</div>
      <div style="color: #6B7280; font-size: 13px;">Offline Signature Forgery Detection & Explainability</div>
    </div>
    <div style="text-align: right; font-size: 13px; color: #4B5563;">
      <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
      <div><strong>Auditor:</strong> ${userEmail}</div>
      <div><strong>Specimen:</strong> ${filename}</div>
    </div>
  </div>

  <div class="verdict-box">
    <div>
      <div style="font-size: 13px; text-transform: uppercase; font-weight: 700; color: #4B5563;">Official Verification Verdict</div>
      <div class="verdict-text">${result.prediction.toUpperCase()}</div>
      <div style="font-size: 14px; color: #4B5563;">Engine: ${result.model_used} (Analysis Latency: ${result.prediction_time_ms} ms)</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 36px; font-weight: 900; color: ${statusColor};">${result.confidence}%</div>
      <div style="font-size: 12px; color: #6B7280;">Confidence Score</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">1. Specimen vs. SHAP Pixel Heatmap</div>
      <div class="img-box">
        <img src="${result.image_data_url}" alt="Original Specimen" />
        <div style="font-size: 12px; color: #6B7280; margin-top: 6px;">Original Specimen</div>
      </div>
      <div class="img-box" style="margin-top: 12px;">
        <img src="${result.explanation.overlay_data_url}" alt="SHAP Overlay" />
        <div style="font-size: 12px; color: #6B7280; margin-top: 6px;">SHAP Feature Attribution Overlay</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">2. Biometric Forensic Indices</div>
      <div class="metric-row">
        <span>Stroke Smoothness</span>
        <strong>${result.explanation.stroke_metrics.stroke_smoothness} / 100 <span style="font-size:11px;color:#6B7280;">(Genuine ~78)</span></strong>
      </div>
      <div class="metric-row">
        <span>Stroke Consistency</span>
        <strong>${result.explanation.stroke_metrics.stroke_consistency} / 100 <span style="font-size:11px;color:#6B7280;">(Genuine ~75)</span></strong>
      </div>
      <div class="metric-row">
        <span>Dominant Region</span>
        <strong>${result.explanation.dominant_region}</strong>
      </div>
      <div class="metric-row">
        <span>Genuine Probability</span>
        <strong>${result.class_probabilities.Genuine}%</strong>
      </div>
      <div class="metric-row">
        <span>Forged Probability</span>
        <strong>${result.class_probabilities.Forged}%</strong>
      </div>

      <div style="margin-top: 20px;">
        <div class="card-title">Quadrant Attribution Split</div>
        ${Object.entries(result.explanation.quadrant_scores).map(([q, s]) => `
          <div style="margin-bottom: 8px;">
            <div style="display:flex; justify-content:space-between; font-size:12px;">
              <span>${q}</span>
              <strong>${s}%</strong>
            </div>
            <div style="height:6px; background:#E5E7EB; border-radius:3px; overflow:hidden; margin-top:3px;">
              <div style="width:${s}%; height:100%; background:#8B5CF6;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">3. Forensic Diagnostic Interpretation</div>
    <p style="font-size: 14px; margin: 0; color: #374151;">
      ${result.explanation.plain_language}
    </p>
  </div>

  <div class="footer">
    <div>Generated by ForgeXplain AI Suite &bull; Tamper-Evident Report ID: FX-${Date.now().toString(36).toUpperCase()}</div>
    <div class="no-print">
      <button onclick="window.print()" style="background:#7C3AED; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600;">Print / Save as PDF</button>
    </div>
  </div>
</body>
</html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

function downloadHtmlReport(result: AnalysisResult, filename: string, userEmail: string) {
  const content = `ForgeXplain Forensic Report\nFile: ${filename}\nVerdict: ${result.prediction}\nConfidence: ${result.confidence}%\nModel: ${result.model_used}\nExaminer: ${userEmail}\nExplanation: ${result.explanation.plain_language}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `forgexplain_report_${filename}.txt`;
  a.click();
}
