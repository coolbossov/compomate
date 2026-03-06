/* eslint-disable @next/next/no-img-element */
'use client';

import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { useActiveBackdrop, useActiveSubject, useComposition, useShowSafeArea } from '@/lib/store/selectors';
import { clamp, estimateShadowPreviewMetrics, EXPORT_PROFILES } from '@/lib/shared/composition';
import { buildNameOverlaySvg } from '@/lib/shared/name-overlay';
import { svgToDataUrl, analyzeSubjectPose } from '@/lib/client/utils';
import { EmptyState } from './EmptyState';
import { DangerZoneOverlay } from './DangerZoneOverlay';
import type { PoseAnalysis, PreviewRect } from '@/types/files';

export default function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingPointerRef = useRef<number | null>(null);

  const activeBackdrop = useActiveBackdrop();
  const activeSubject = useActiveSubject();
  const composition = useComposition();
  const showSafeArea = useShowSafeArea();
  const exportProfileId = useStore((s) => s.exportProfileId);
  const firstName = useStore((s) => s.firstName);
  const lastName = useStore((s) => s.lastName);
  const nameStyleId = useStore((s) => s.nameStyleId);
  const nameOverlayEnabled = useStore((s) => s.nameOverlayEnabled);
  const updateComposition = useStore((s) => s.updateComposition);

  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const [poseAnalysis, setPoseAnalysis] = useState<PoseAnalysis | null>(null);

  // Track canvas container size
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setCanvasSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Analyze subject pose when subject changes
  useEffect(() => {
    if (!activeSubject) { setPoseAnalysis(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const analysis = await analyzeSubjectPose(activeSubject.objectUrl);
        if (!cancelled) setPoseAnalysis(analysis);
      } catch {
        if (!cancelled) setPoseAnalysis({ stanceWidthPct: 34, leanPct: 0, subjectAspect: 0.52 });
      }
    })();
    return () => { cancelled = true; };
  }, [activeSubject]);

  // Derived values
  const activeProfile = EXPORT_PROFILES[exportProfileId];

  const reflectionHeight = Math.max(
    0.5,
    composition.subjectHeightPct * (composition.reflectionSizePct / 100),
  );
  const reflectionTop = clamp(
    composition.yPct +
      ((composition.reflectionPositionPct - 100) / 100) * (composition.subjectHeightPct * 0.25),
    0,
    100,
  );

  const subjectFadeMask = composition.legFadeEnabled
    ? `linear-gradient(to bottom, rgba(0,0,0,1) ${composition.legFadeStartPct}%, transparent 100%)`
    : undefined;

  const fogOpacity = clamp(composition.fogOpacityPct / 100, 0, 1);

  const shadowMetrics = estimateShadowPreviewMetrics(
    composition,
    poseAnalysis?.stanceWidthPct ?? 34,
    (poseAnalysis?.leanPct ?? 0) / 100,
  );

  // Backdrop layout box (letterbox/pillarbox to fit canvas)
  const backdropBox = useMemo<PreviewRect | null>(() => {
    if (!activeBackdrop) return null;
    const iw = Math.max(1, activeBackdrop.width || 1);
    const ih = Math.max(1, activeBackdrop.height || 1);
    const imageRatio = iw / ih;
    const containerRatio = canvasSize.width / Math.max(1, canvasSize.height);

    if (containerRatio >= imageRatio) {
      const h = canvasSize.height;
      const w = h * imageRatio;
      return { leftPx: (canvasSize.width - w) / 2, topPx: 0, widthPx: w, heightPx: h };
    }
    return {
      leftPx: 0,
      topPx: (canvasSize.height - canvasSize.width / imageRatio) / 2,
      widthPx: canvasSize.width,
      heightPx: canvasSize.width / imageRatio,
    };
  }, [activeBackdrop, canvasSize]);

  // Safe area box (crop zone overlay)
  const safeAreaBox = useMemo<PreviewRect | null>(() => {
    if (!backdropBox || !activeProfile.aspectRatio) return null;
    const bdRatio = backdropBox.widthPx / Math.max(1, backdropBox.heightPx);
    if (bdRatio >= activeProfile.aspectRatio) {
      const w = backdropBox.heightPx * activeProfile.aspectRatio;
      return {
        leftPx: backdropBox.leftPx + (backdropBox.widthPx - w) / 2,
        topPx: backdropBox.topPx,
        widthPx: w,
        heightPx: backdropBox.heightPx,
      };
    }
    const h = backdropBox.widthPx / activeProfile.aspectRatio;
    return {
      leftPx: backdropBox.leftPx,
      topPx: backdropBox.topPx + (backdropBox.heightPx - h) / 2,
      widthPx: backdropBox.widthPx,
      heightPx: h,
    };
  }, [activeProfile.aspectRatio, backdropBox]);

  // Name overlay SVG → data URL
  const nameOverlayPreviewUrl = useMemo(() => {
    if (!activeBackdrop || !nameOverlayEnabled) return null;
    const svg = buildNameOverlaySvg(
      Math.max(1, activeBackdrop.width || 1),
      Math.max(1, activeBackdrop.height || 1),
      firstName,
      lastName,
      nameStyleId,
    );
    return svg ? svgToDataUrl(svg) : null;
  }, [activeBackdrop, firstName, lastName, nameStyleId, nameOverlayEnabled]);

  // Drag handlers
  function updateDragPosition(clientX: number, clientY: number): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const targetLeft = rect.left + (backdropBox?.leftPx ?? 0);
    const targetTop = rect.top + (backdropBox?.topPx ?? 0);
    const targetWidth = Math.max(1, backdropBox?.widthPx ?? rect.width);
    const targetHeight = Math.max(1, backdropBox?.heightPx ?? rect.height);
    const xPct = clamp(((clientX - targetLeft) / targetWidth) * 100, 5, 95);
    const yPct = clamp(((clientY - targetTop) / targetHeight) * 100, 25, 96);
    updateComposition({ xPct, yPct });
  }

  function onSubjectPointerDown(event: PointerEvent<HTMLImageElement>): void {
    draggingPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDragPosition(event.clientX, event.clientY);
  }

  function onSubjectPointerMove(event: PointerEvent<HTMLImageElement>): void {
    if (draggingPointerRef.current !== event.pointerId) return;
    updateDragPosition(event.clientX, event.clientY);
  }

  function onSubjectPointerUp(event: PointerEvent<HTMLImageElement>): void {
    if (draggingPointerRef.current !== event.pointerId) return;
    draggingPointerRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      ref={canvasRef}
      className="relative flex-1 overflow-hidden rounded-lg border border-[color:var(--panel-border)] bg-[radial-gradient(circle_at_top,_#2a2a39_0%,_#12121a_58%,_#0d0d12_100%)]"
    >
      {!activeBackdrop ? (
        <EmptyState type="no-backdrop" />
      ) : (
        <div
          className="absolute overflow-hidden"
          style={{
            left: backdropBox?.leftPx ?? 0,
            top: backdropBox?.topPx ?? 0,
            width: backdropBox?.widthPx ?? canvasSize.width,
            height: backdropBox?.heightPx ?? canvasSize.height,
          }}
        >
          {/* Backdrop image */}
          <img
            className="h-full w-full select-none object-contain"
            src={activeBackdrop.objectUrl}
            alt={activeBackdrop.name}
            draggable={false}
          />

          {/* Safe area overlay */}
          {showSafeArea && safeAreaBox ? (
            <div
              className="pointer-events-none absolute border border-dashed border-white/40"
              style={{
                left: safeAreaBox.leftPx - (backdropBox?.leftPx ?? 0),
                top: safeAreaBox.topPx - (backdropBox?.topPx ?? 0),
                width: safeAreaBox.widthPx,
                height: safeAreaBox.heightPx,
              }}
            />
          ) : null}

          {/* Subject + effects */}
          {activeSubject ? (
            <>
              {/* Shadow ellipse */}
              {composition.shadowEnabled ? (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: `${composition.xPct + shadowMetrics.shadowOffsetXPct}%`,
                    top: `${composition.yPct + shadowMetrics.shadowOffsetYPct}%`,
                    width: `${shadowMetrics.shadowWidthPct}%`,
                    height: `${shadowMetrics.shadowHeightPct}%`,
                    opacity: shadowMetrics.shadowOpacity,
                    transform: `translate(-50%, -50%) rotate(${shadowMetrics.shadowAngleDeg}deg)`,
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.48) 48%, rgba(0,0,0,0) 100%)',
                    filter: `blur(${shadowMetrics.shadowBlurPx}px)`,
                  }}
                />
              ) : null}

              {/* Reflection */}
              {composition.reflectionEnabled && composition.reflectionSizePct > 0 ? (
                <img
                  className="pointer-events-none absolute select-none"
                  src={activeSubject.objectUrl}
                  alt={`${activeSubject.name} reflection`}
                  draggable={false}
                  style={{
                    left: `${composition.xPct}%`,
                    top: `${reflectionTop}%`,
                    height: `${reflectionHeight}%`,
                    opacity: composition.reflectionOpacityPct / 100,
                    filter: `blur(${composition.reflectionBlurPx}px)`,
                    transform: 'translate(-50%, 0) scaleY(-1)',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
                  }}
                />
              ) : null}

              {/* Subject (draggable) */}
              <img
                className="absolute cursor-grab select-none active:cursor-grabbing"
                src={activeSubject.objectUrl}
                alt={activeSubject.name}
                draggable={false}
                onPointerDown={onSubjectPointerDown}
                onPointerMove={onSubjectPointerMove}
                onPointerUp={onSubjectPointerUp}
                onPointerCancel={onSubjectPointerUp}
                style={{
                  left: `${composition.xPct}%`,
                  top: `${composition.yPct}%`,
                  height: `${composition.subjectHeightPct}%`,
                  transform: 'translate(-50%, -100%)',
                  maskImage: subjectFadeMask,
                  WebkitMaskImage: subjectFadeMask,
                }}
              />

              {/* Floor fog */}
              {composition.fogEnabled ? (
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0"
                  style={{
                    height: `${composition.fogHeightPct}%`,
                    background: `linear-gradient(to top, rgba(234,238,255,${fogOpacity.toFixed(3)}), rgba(234,238,255,0))`,
                    filter: 'blur(8px)',
                  }}
                />
              ) : null}
            </>
          ) : null}

          {/* Name overlay SVG */}
          {nameOverlayPreviewUrl ? (
            <img
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
              src={nameOverlayPreviewUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}

          {/* Crop zone danger overlays */}
          <DangerZoneOverlay
            canvasWidth={backdropBox?.widthPx ?? canvasSize.width}
            canvasHeight={backdropBox?.heightPx ?? canvasSize.height}
          />
        </div>
      )}
    </div>
  );
}
