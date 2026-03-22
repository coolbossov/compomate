/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { parseErrorText } from '@/lib/client/utils';
import { uploadFileToR2 } from '@/lib/client/uploader';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BackdropReferencePhotoTabProps {
  onGenerate: (body: Record<string, unknown>, filenamePrefix: string, setGenerating: (v: boolean) => void) => Promise<void>;
  isAnyGenerating: boolean;
  showToast: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BackdropReferencePhotoTab({
  onGenerate,
  isAnyGenerating,
  showToast,
}: BackdropReferencePhotoTabProps) {
  const [refPhotoPreviewUrl, setRefPhotoPreviewUrl] = useState<string | null>(null);
  const [refPhotoName, setRefPhotoName] = useState<string>('');
  const [refPhotoR2Key, setRefPhotoR2Key] = useState<string | null>(null);
  const [isUploadingRefPhoto, setIsUploadingRefPhoto] = useState(false);
  const [isAnalyzingRef, setIsAnalyzingRef] = useState(false);
  const [refGeneratedPrompt, setRefGeneratedPrompt] = useState('');
  const [isGeneratingFromRef, setIsGeneratingFromRef] = useState(false);
  const refPhotoPreviewUrlRef = useRef<string | null>(null);

  // Revoke the preview object URL on unmount
  useEffect(() => {
    return () => {
      if (refPhotoPreviewUrlRef.current) {
        URL.revokeObjectURL(refPhotoPreviewUrlRef.current);
        refPhotoPreviewUrlRef.current = null;
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Reference photo handling
  // ---------------------------------------------------------------------------

  function handleRefPhotoSelect(): void {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.style.cssText = 'position:fixed;left:-9999px;top:0';
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;

      const previewUrl = URL.createObjectURL(file);
      if (refPhotoPreviewUrlRef.current) {
        URL.revokeObjectURL(refPhotoPreviewUrlRef.current);
      }
      refPhotoPreviewUrlRef.current = previewUrl;
      setRefPhotoPreviewUrl(previewUrl);
      setRefPhotoName(file.name);
      setRefPhotoR2Key(null);
      setRefGeneratedPrompt('');
      setIsUploadingRefPhoto(true);

      try {
        const { key } = await uploadFileToR2(file, 'backdrop');
        setRefPhotoR2Key(key);
        showToast('Reference photo uploaded. Ready to analyze.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to upload reference photo.';
        showToast(message);
      } finally {
        setIsUploadingRefPhoto(false);
      }
    };
    document.body.append(input); input.click();
  }

  async function analyzeReferencePhoto(): Promise<void> {
    if (!refPhotoR2Key) {
      showToast(isUploadingRefPhoto ? 'Reference photo is still uploading.' : 'Upload a reference photo first.');
      return;
    }

    setIsAnalyzingRef(true);
    try {
      const res = await fetch('/api/analyze-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2Key: refPhotoR2Key }),
      });
      if (!res.ok) { const text = await res.text(); throw new Error(parseErrorText(text)); }
      const { prompt } = (await res.json()) as { prompt: string };
      setRefGeneratedPrompt(prompt);
      showToast('Backdrop prompt generated from reference photo.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Reference analysis failed.');
    } finally {
      setIsAnalyzingRef(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-soft)]">
        Upload a photo that captures the vibe or lighting you want. Gemini Vision will analyze it and write a backdrop generation prompt.
      </p>

      {/* Reference photo picker / preview */}
      <div
        className="rounded-lg border-2 border-dashed border-[color:var(--panel-border)] hover:border-[#6367FF]/50 transition-colors p-3 text-center cursor-pointer"
        onClick={handleRefPhotoSelect}
        role="button"
        aria-label="Upload reference photo"
      >
        {refPhotoPreviewUrl ? (
          <div className="space-y-1">
            <img
              src={refPhotoPreviewUrl}
              alt="Reference"
              className="mx-auto max-h-32 rounded object-contain"
            />
            <p className="text-[10px] text-[var(--text-soft)] truncate">{refPhotoName}</p>
            <p className="text-[10px] text-[#6367FF]">
              {isUploadingRefPhoto ? 'Uploading…' : refPhotoR2Key ? 'Ready to analyze' : 'Click to change'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-[var(--text-soft)]">Click to upload reference photo</p>
        )}
      </div>

      <button
        className="btn-secondary w-full"
        type="button"
        disabled={!refPhotoR2Key || isUploadingRefPhoto || isAnalyzingRef}
        onClick={() => { void analyzeReferencePhoto(); }}
      >
        {isUploadingRefPhoto ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading reference photo…
          </span>
        ) : isAnalyzingRef ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing with Gemini…
          </span>
        ) : 'Analyze Reference Photo'}
      </button>

      {/* Generated prompt (editable) */}
      {refGeneratedPrompt && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-soft)] font-medium">Generated prompt (editable):</p>
          <textarea
            className="input min-h-24 resize-y"
            value={refGeneratedPrompt}
            onChange={(e) => setRefGeneratedPrompt(e.target.value)}
          />
          <button
            className="btn-secondary w-full"
            type="button"
            disabled={isAnyGenerating}
            onClick={() =>
              void onGenerate(
                { prompt: refGeneratedPrompt, model: 'flux' },
                'ref-flux',
                setIsGeneratingFromRef,
              )
            }
          >
            {isGeneratingFromRef ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
              </span>
            ) : 'Generate Backdrop from This Prompt'}
          </button>
        </div>
      )}
    </div>
  );
}
