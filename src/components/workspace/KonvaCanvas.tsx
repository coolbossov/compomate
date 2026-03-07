'use client';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import {
  useActiveSubject,
  useActiveBackdrop,
  useComposition,
  useCanvasZoom,
  useShowDangerZone,
  useShowSideBySide,
} from '@/lib/store/selectors';
import {
  EXPORT_WIDTH_PX,
  EXPORT_HEIGHT_PX,
  CANVAS_MIN_ZOOM,
  CANVAS_MAX_ZOOM,
  CANVAS_ZOOM_STEP,
  NUDGE_PX,
  NUDGE_SHIFT_PX,
  CROP_ZONES,
} from '@/lib/constants';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';

type LoadedImage = {
  src: string;
  image: HTMLImageElement;
};

interface CompositeStageProps {
  width: number;
  height: number;
  stageScale: number;
  handleWheel: (e: KonvaEventObject<WheelEvent>) => void;
  backdropImg: HTMLImageElement | null;
  subjectImg: HTMLImageElement | null;
  subjectNodeRef: React.RefObject<Konva.Image | null>;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  subjectX: number;
  subjectY: number;
  subjectW: number;
  subjectH: number;
  subjectFeetY: number;
  reflectionEnabled: boolean;
  reflectionOpacity: number;
  handleDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  dangerZoneRects: Array<{
    label: string;
    zoneX: number;
    zoneY: number;
    zoneW: number;
    zoneH: number;
  }>;
  scale: number;
}

// ---------------------------------------------------------------------------
// Image loading hook — manual HTMLImageElement, no SSR issues
// ---------------------------------------------------------------------------
function useKonvaImg(src?: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const i = new window.Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => {
      if (!cancelled) {
        setLoaded({ src, image: i });
      }
    };
    i.src = src;
    return () => {
      cancelled = true;
      i.onload = null;
    };
  }, [src]);

  if (loaded && loaded.src === src) {
    return loaded.image;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface KonvaCanvasProps {
  containerWidth: number;
  containerHeight: number;
}

function CompositeStage({
  width,
  height,
  stageScale,
  handleWheel,
  backdropImg,
  subjectImg,
  subjectNodeRef,
  transformerRef,
  subjectX,
  subjectY,
  subjectW,
  subjectH,
  subjectFeetY,
  reflectionEnabled,
  reflectionOpacity,
  handleDragEnd,
  dangerZoneRects,
  scale,
}: CompositeStageProps) {
  return (
    <Stage
      width={width}
      height={height}
      scaleX={stageScale}
      scaleY={stageScale}
      onWheel={handleWheel}
    >
      <Layer>
        {backdropImg && (
          <KonvaImage
            image={backdropImg}
            x={0}
            y={0}
            width={EXPORT_WIDTH_PX}
            height={EXPORT_HEIGHT_PX}
          />
        )}

        {subjectImg && reflectionEnabled && (
          <KonvaImage
            image={subjectImg}
            x={subjectX}
            y={subjectFeetY + subjectH}
            width={subjectW}
            height={subjectH}
            scaleY={-1}
            opacity={reflectionOpacity}
            listening={false}
          />
        )}

        {subjectImg && (
          <KonvaImage
            ref={subjectNodeRef}
            image={subjectImg}
            x={subjectX}
            y={subjectY}
            width={subjectW}
            height={subjectH}
            draggable
            onDragEnd={handleDragEnd}
          />
        )}

        {subjectImg && (
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            boundBoxFunc={(_oldBox, newBox) => newBox}
          />
        )}

        {dangerZoneRects.map(({ label, zoneX, zoneY, zoneW, zoneH }) => (
          <Rect
            key={label}
            x={zoneX}
            y={zoneY}
            width={zoneW}
            height={zoneH}
            stroke={label === '4x6' ? '#FF4444' : '#FF8800'}
            strokeWidth={4 / scale}
            dash={[20 / scale, 10 / scale]}
            listening={false}
          />
        ))}
      </Layer>
    </Stage>
  );
}

// ---------------------------------------------------------------------------
// KonvaCanvas
// ---------------------------------------------------------------------------
export default function KonvaCanvas({
  containerWidth,
  containerHeight,
}: KonvaCanvasProps) {
  const subject = useActiveSubject();
  const backdrop = useActiveBackdrop();
  const composition = useComposition();
  const canvasZoom = useCanvasZoom();
  const showDangerZone = useShowDangerZone();
  const showSideBySide = useShowSideBySide();

  const setCanvasZoom = useStore((s) => s.setCanvasZoom);
  const updateComposition = useStore((s) => s.updateComposition);

  const backdropImg = useKonvaImg(backdrop?.objectUrl);
  const subjectImg = useKonvaImg(subject?.objectUrl);

  // Konva node refs
  const subjectNodeRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  // ---------------------------------------------------------------------------
  // Scale: map logical EXPORT_HEIGHT_PX → screen pixels
  // ---------------------------------------------------------------------------
  const scale = containerHeight / EXPORT_HEIGHT_PX;

  // ---------------------------------------------------------------------------
  // Subject logical dimensions (in 4000×5000 space)
  // ---------------------------------------------------------------------------
  const subjectH = subject
    ? (composition.subjectHeightPct / 100) * EXPORT_HEIGHT_PX
    : 0;
  const subjectW =
    subject && subject.height > 0
      ? subjectH * (subject.width / subject.height)
      : 0;
  // Center X → left edge; feet Y → top edge
  const subjectX = subject
    ? (composition.xPct / 100) * EXPORT_WIDTH_PX - subjectW / 2
    : 0;
  const subjectY = subject
    ? (composition.yPct / 100) * EXPORT_HEIGHT_PX - subjectH
    : 0;
  // Feet = bottom of the subject image
  const subjectFeetY = subjectY + subjectH;

  // ---------------------------------------------------------------------------
  // Transformer — attach to subject node once image renders
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (transformerRef.current && subjectNodeRef.current) {
      transformerRef.current.nodes([subjectNodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [subjectImg]);

  // ---------------------------------------------------------------------------
  // Arrow key nudge (% per keypress — NUDGE_PX * 0.1 = 0.1%, SHIFT = 1%)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;
      if (document.activeElement?.tagName === 'INPUT') return;
      e.preventDefault();
      const px = e.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
      const dx =
        e.key === 'ArrowLeft' ? -px : e.key === 'ArrowRight' ? px : 0;
      const dy = e.key === 'ArrowUp' ? -px : e.key === 'ArrowDown' ? px : 0;
      const { composition: comp } = useStore.getState();
      updateComposition({
        xPct: Math.max(5, Math.min(95, comp.xPct + dx * 0.1)),
        yPct: Math.max(25, Math.min(96, comp.yPct + dy * 0.1)),
      });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [updateComposition]);

  // ---------------------------------------------------------------------------
  // Drag end — convert Konva logical coords back to %
  // ---------------------------------------------------------------------------
  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!subject) return;
      const newXPct = ((e.target.x() + subjectW / 2) / EXPORT_WIDTH_PX) * 100;
      const newYPct = ((e.target.y() + subjectH) / EXPORT_HEIGHT_PX) * 100;
      updateComposition({
        xPct: Math.max(5, Math.min(95, newXPct)),
        yPct: Math.max(25, Math.min(96, newYPct)),
      });
    },
    [subject, subjectW, subjectH, updateComposition],
  );

  // ---------------------------------------------------------------------------
  // Wheel — Cmd/Ctrl + scroll = zoom
  // ---------------------------------------------------------------------------
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      if (e.evt.metaKey || e.evt.ctrlKey) {
        e.evt.preventDefault();
        const dir = e.evt.deltaY > 0 ? -1 : 1;
        setCanvasZoom(
          Math.max(
            CANVAS_MIN_ZOOM,
            Math.min(CANVAS_MAX_ZOOM, canvasZoom + dir * CANVAS_ZOOM_STEP),
          ),
        );
      }
    },
    [canvasZoom, setCanvasZoom],
  );

  // ---------------------------------------------------------------------------
  // Danger zone Rects in logical coords
  // ---------------------------------------------------------------------------
  const dangerZoneRects = showDangerZone
    ? Object.entries(CROP_ZONES).map(([label, zone]) => {
        const zoneW = zone.widthFrac * EXPORT_WIDTH_PX;
        const zoneH = zone.heightFrac * EXPORT_HEIGHT_PX;
        const zoneX = (EXPORT_WIDTH_PX - zoneW) / 2;
        const zoneY = (EXPORT_HEIGHT_PX - zoneH) / 2;
        return { label, zoneX, zoneY, zoneW, zoneH };
      })
    : [];

  // ---------------------------------------------------------------------------
  // Side-by-side mode
  // ---------------------------------------------------------------------------
  if (showSideBySide && subject && backdrop) {
    const halfW = Math.floor(containerWidth / 2);
    const sideScale = scale * canvasZoom;

    return (
      <div className="flex w-full h-full">
        {/* Left — subject only on white */}
        <div
          className="relative overflow-hidden"
          style={{ width: halfW, height: containerHeight }}
        >
          <Stage width={halfW} height={containerHeight} scaleX={sideScale} scaleY={sideScale}>
            <Layer>
              <Rect
                x={0}
                y={0}
                width={EXPORT_WIDTH_PX}
                height={EXPORT_HEIGHT_PX}
                fill="white"
              />
              {subjectImg && (
                <KonvaImage
                  image={subjectImg}
                  x={subjectX}
                  y={subjectY}
                  width={subjectW}
                  height={subjectH}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Right — full composite */}
        <div
          className="relative overflow-hidden"
          style={{ width: halfW, height: containerHeight }}
        >
          <CompositeStage
            width={halfW}
            height={containerHeight}
            stageScale={sideScale}
            handleWheel={handleWheel}
            backdropImg={backdropImg}
            subjectImg={subjectImg}
            subjectNodeRef={subjectNodeRef}
            transformerRef={transformerRef}
            subjectX={subjectX}
            subjectY={subjectY}
            subjectW={subjectW}
            subjectH={subjectH}
            subjectFeetY={subjectFeetY}
            reflectionEnabled={composition.reflectionEnabled}
            reflectionOpacity={composition.reflectionOpacityPct / 100}
            handleDragEnd={handleDragEnd}
            dangerZoneRects={dangerZoneRects}
            scale={scale}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Normal single-view
  // ---------------------------------------------------------------------------
  return (
    <CompositeStage
      width={containerWidth}
      height={containerHeight}
      stageScale={scale * canvasZoom}
      handleWheel={handleWheel}
      backdropImg={backdropImg}
      subjectImg={subjectImg}
      subjectNodeRef={subjectNodeRef}
      transformerRef={transformerRef}
      subjectX={subjectX}
      subjectY={subjectY}
      subjectW={subjectW}
      subjectH={subjectH}
      subjectFeetY={subjectFeetY}
      reflectionEnabled={composition.reflectionEnabled}
      reflectionOpacity={composition.reflectionOpacityPct / 100}
      handleDragEnd={handleDragEnd}
      dangerZoneRects={dangerZoneRects}
      scale={scale}
    />
  );
}
