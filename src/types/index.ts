export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface PredictionRecord {
  id: string;
  user_id: string;
  user_email?: string;
  image_filename: string;
  label?: string;
  prediction: 'Genuine' | 'Forged' | string;
  confidence: number;
  model_used: string;
  prediction_time_ms: number;
  features: {
    stroke_smoothness?: number;
    stroke_consistency?: number;
    dominant_region?: string;
    pixel_density?: number;
    similarity?: number;
    threshold?: number;
    class_probabilities?: { Genuine: number; Forged: number };
    [key: string]: any;
  };
  explanation_summary: string;
  created_at: string;
}

export interface SignerRecord {
  id: string;
  name: string;
  feature_vector: number[];
  num_samples: number;
  sample_images?: string[];
  registered_by: string;
  created_at: string;
}

export interface ModelMetrics {
  svm: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    confusion_matrix: number[][];
    roc_curve: {
      auc: number;
      fpr: number[];
      tpr: number[];
    };
    train_time_sec?: number;
  };
  random_forest: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    confusion_matrix: number[][];
    roc_curve: {
      auc: number;
      fpr: number[];
      tpr: number[];
    };
    train_time_sec?: number;
  };
}

export interface StrokeMetrics {
  stroke_smoothness: number;
  stroke_consistency: number;
}

export interface PreprocessingStages {
  original: string; // data URL
  grayscale: string;
  threshold: string;
  contours: string;
  normalized: string;
}

export interface AnalysisResult {
  filename?: string;
  label?: string;
  was_cropped_from_document?: boolean;
  crop_box?: { x: number; y: number; width: number; height: number };
  document_data_url?: string;
  prediction: 'Genuine' | 'Forged';
  confidence: number;
  model_used: string;
  prediction_time_ms: number;
  class_probabilities: { Genuine: number; Forged: number };
  image_data_url: string;
  normalized_data_url: string;
  preprocessing_stages: PreprocessingStages;
  features_23?: Record<string, number>;
  explanation: {
    backend: string;
    plain_language: string;
    dominant_region: string;
    quadrant_scores: {
      'Top-Left': number;
      'Top-Right': number;
      'Bottom-Left': number;
      'Bottom-Right': number;
    };
    heatmap_data_url: string;
    overlay_data_url: string;
    stroke_metrics: StrokeMetrics;
    feature_importance?: { name: string; score: number }[];
  };
}
