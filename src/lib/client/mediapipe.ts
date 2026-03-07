'use client';
import type { PoseMetrics } from '@/lib/compositing/types';
import { MEDIAPIPE_MODEL_URL, MEDIAPIPE_CONFIDENCE_THRESHOLD } from '@/lib/constants';

// Lazy singleton — loads WASM model once
let landmarkerPromise: Promise<unknown> | null = null;
const MEDIAPIPE_WASM_PATH = '/vendor/mediapipe/wasm';

async function getLandmarker(): Promise<unknown> {
  if (landmarkerPromise) return landmarkerPromise;
  landmarkerPromise = (async () => {
    try {
      const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
    } catch {
      return null; // GPU failed, will fall back to centroid
    }
  })();
  return landmarkerPromise;
}

// Returns null if confidence low or model fails → caller uses pixel centroid fallback
export async function estimatePoseFromElement(
  img: HTMLImageElement,
): Promise<PoseMetrics | null> {
  const landmarker = await getLandmarker();
  if (!landmarker) return null;
  try {
    // TODO: remove these casts when @mediapipe/tasks-vision exposes stable TS types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (landmarker as any).detect(img);
    if (!result.poses?.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lm: any[] = result.poses[0]; // normalized landmarks [0..1]
    // Check confidence via worldLandmarks visibility
    const avgVisibility =
      lm
        .slice(11, 29)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((s: number, p: any) => s + (p.visibility ?? 0), 0) / 18;
    if (avgVisibility < MEDIAPIPE_CONFIDENCE_THRESHOLD) return null;
    const leftShoulder = lm[11];
    const rightShoulder = lm[12];
    const leftHip = lm[23];
    const rightHip = lm[24];
    const leftAnkle = lm[27];
    const rightAnkle = lm[28];
    return {
      feetYPct: Math.max(leftAnkle.y, rightAnkle.y),
      hipCenterXPct: (leftHip.x + rightHip.x) / 2,
      shoulderWidthPct: Math.abs(leftShoulder.x - rightShoulder.x),
      stanceWidthPct: Math.abs(leftAnkle.x - rightAnkle.x),
      leanPct:
        (leftShoulder.x + rightShoulder.x) / 2 - (leftHip.x + rightHip.x) / 2,
    };
  } catch {
    return null;
  }
}

export async function estimatePoseFromObjectUrl(
  objectUrl: string,
): Promise<PoseMetrics | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = async () => resolve(await estimatePoseFromElement(img));
    img.onerror = () => resolve(null);
    img.src = objectUrl;
  });
}
