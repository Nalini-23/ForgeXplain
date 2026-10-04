import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { PredictionRecord, SignerRecord, User } from '../types';

/**
 * Saves a prediction to Firestore collection `predictions`
 */
export async function savePredictionToFirestore(record: Omit<PredictionRecord, 'id'> & { id?: string }): Promise<PredictionRecord> {
  const predictionId = record.id || `pred-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const path = `predictions/${predictionId}`;

  const payload: any = {
    id: predictionId,
    userId: record.user_id || auth.currentUser?.uid || 'anonymous',
    userEmail: record.user_email || auth.currentUser?.email || '',
    imageFilename: record.image_filename,
    label: record.label || '',
    prediction: record.prediction,
    confidence: Number(record.confidence),
    modelUsed: record.model_used,
    predictionTimeMs: Number(record.prediction_time_ms || 120),
    features: record.features || {},
    explanationSummary: record.explanation_summary || '',
    createdAt: record.created_at || new Date().toISOString(),
  };

  try {
    const docRef = doc(db, 'predictions', predictionId);
    await setDoc(docRef, payload);
    return {
      id: predictionId,
      user_id: payload.userId,
      user_email: payload.userEmail,
      image_filename: payload.imageFilename,
      label: payload.label,
      prediction: payload.prediction,
      confidence: payload.confidence,
      model_used: payload.modelUsed,
      prediction_time_ms: payload.predictionTimeMs,
      features: payload.features,
      explanation_summary: payload.explanationSummary,
      created_at: payload.createdAt,
    };
  } catch (error) {
    console.warn('Firestore write failed, falling back to local API:', error);
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      // Return payload if client wants to proceed
      return {
        id: predictionId,
        user_id: payload.userId,
        user_email: payload.userEmail,
        image_filename: payload.imageFilename,
        label: payload.label,
        prediction: payload.prediction,
        confidence: payload.confidence,
        model_used: payload.modelUsed,
        prediction_time_ms: payload.predictionTimeMs,
        features: payload.features,
        explanation_summary: payload.explanationSummary,
        created_at: payload.createdAt,
      };
    }
  }
}

/**
 * Subscribes to predictions for the current user (or all if admin)
 */
export function subscribePredictions(
  userId: string | undefined,
  isAdmin: boolean,
  callback: (predictions: PredictionRecord[]) => void
): () => void {
  const path = 'predictions';
  try {
    const colRef = collection(db, path);
    let q = query(colRef, orderBy('createdAt', 'desc'));
    if (!isAdmin && userId) {
      q = query(colRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: PredictionRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            user_id: data.userId || '',
            user_email: data.userEmail || '',
            image_filename: data.imageFilename || '',
            label: data.label || '',
            prediction: data.prediction || '',
            confidence: Number(data.confidence || 0),
            model_used: data.modelUsed || '',
            prediction_time_ms: Number(data.predictionTimeMs || 0),
            features: data.features || {},
            explanation_summary: data.explanationSummary || '',
            created_at: data.createdAt || new Date().toISOString(),
          };
        });
        callback(list);
      },
      (error) => {
        console.warn('Predictions snapshot warning:', error);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.warn('Firestore query error:', error);
    return () => {};
  }
}

/**
 * Deletes a prediction from Firestore
 */
export async function deletePredictionFromFirestore(predictionId: string): Promise<void> {
  const path = `predictions/${predictionId}`;
  try {
    await deleteDoc(doc(db, 'predictions', predictionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Subscribes to enrolled signers from Firestore
 */
export function subscribeSigners(callback: (signers: SignerRecord[]) => void): () => void {
  const path = 'signers';
  try {
    const colRef = collection(db, path);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: SignerRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            num_samples: Number(data.numSamples || 1),
            feature_vector: data.featureVector || [],
            sample_images: data.sampleImages || [],
            registered_by: data.registeredBy || '',
            created_at: data.createdAt || new Date().toISOString(),
          };
        });
        callback(list);
      },
      (error) => {
        console.warn('Signers snapshot warning:', error);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return unsubscribe;
  } catch (error) {
    console.warn('Firestore signers subscription error:', error);
    return () => {};
  }
}

/**
 * Saves a new signer reference card to Firestore
 */
export async function saveSignerToFirestore(signer: Omit<SignerRecord, 'id'>): Promise<SignerRecord> {
  const signerId = `signer-${Date.now()}`;
  const path = `signers/${signerId}`;
  const payload: any = {
    id: signerId,
    name: signer.name,
    numSamples: signer.num_samples,
    featureVector: signer.feature_vector,
    sampleImages: signer.sample_images || [],
    registeredBy: signer.registered_by,
    createdAt: signer.created_at || new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'signers', signerId), payload);
    return {
      id: signerId,
      name: payload.name,
      num_samples: payload.numSamples,
      feature_vector: payload.featureVector,
      sample_images: payload.sampleImages,
      registered_by: payload.registeredBy,
      created_at: payload.createdAt,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Deletes a signer from Firestore
 */
export async function deleteSignerFromFirestore(signerId: string): Promise<void> {
  const path = `signers/${signerId}`;
  try {
    await deleteDoc(doc(db, 'signers', signerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
