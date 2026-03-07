export interface BackdropAsset {
  id: string;
  name: string;
  objectUrl: string;       // local object URL
  r2Key?: string;          // R2 storage key after upload
  width: number;
  height: number;
  source: 'upload' | 'ai-flux' | 'ai-ideogram' | 'reference';
  prompt?: string;         // AI generation prompt if applicable
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
