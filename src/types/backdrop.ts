export interface BackdropAsset {
  id: string;
  name: string;
  objectUrl: string;       // local object URL
  r2Key?: string;          // R2 storage key after upload
  width: number;
  height: number;
  source: 'upload' | 'ai-flux' | 'ai-ideogram' | 'ai-direction' | 'ai-master' | 'reference';
  prompt?: string;         // AI generation prompt if applicable
  /** Workflow purpose for guided Background Studio generation. */
  stage?: 'direction' | 'master';
  /** Original fal URL, retained so a selected direction can be finished. */
  providerSourceUrl?: string;
  /** Whether this asset can be restored from a saved project. */
  persistenceStatus?: 'pending' | 'ready' | 'error';
  createdAt: number;       // timestamp
}

export type BackdropGenerationStatus = 'idle' | 'generating' | 'polling' | 'done' | 'error';

export interface BackdropGenerationState {
  status: BackdropGenerationStatus;
  prompt: string;
  model: 'flux' | 'ideogram';
  requestId?: string;
  statusUrl?: string;
  responseUrl?: string;
  queuePosition?: number;
  error?: string;
}
