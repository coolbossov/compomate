'use client';

import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Transformer,
  Ellipse,
} from 'react-konva';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Konva from 'konva';
import { useStore } from '@/lib/store';
import {
  useActiveSubject,
  useActiveBackdrop,
  useComposition,
  useCanvasZoom,
  useShowDangerZone,
  useShowSideBySide,
  useFirstName,
  useLastName,
  useFontPair,
  useNameOverlayEnabled,
  useNameSizePct,
  useNameStyle,
  useNameYFromBottomPct,
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
  FOG_BLUR_PX,
  SHADOW_GRADIENT_CENTER_ALPHA,
  SHADOW_GRADIENT_MID_ALPHA,
  SHADOW_GRADIENT_MID_STOP,
} from '@/lib/constants';
import {
  clamp,
  estimateShadowPreviewMetrics,
} from '@/lib/shared/composition';
import {
  buildNameOverlaySvg,
  measureNameOverlayTextMetrics,
  resolveNameOverlayFontFaces,
  type NameOverlayFontFaces,
  type NameOverlayFontMeasurementSource,
} from '@/lib/shared/name-overlay';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { FontPairId } from '@/types/composition';

type DrawableImage = CanvasImageSource | null;

type LoadedImage = {
  src: string;
  image: HTMLImageElement;
};

interface CompositeStageProps {
  width: number;
  height: number;
  stageScale: number;
  stageOffsetX: number;
  stageOffsetY: number;
  handleWheel: (e: KonvaEventObject<WheelEvent>) => void;
  backdropImg: DrawableImage;
  subjectImg: DrawableImage;
  reflectionImg: DrawableImage;
  nameOverlayImg: DrawableImage;
  subjectNodeRef: React.RefObject<Konva.Image | null>;
  transformerRef: React.RefObject<Konva.Transformer | null>;
  reflectionNodeRef: React.RefObject<Konva.Image | null>;
  shadowNodeRef: React.RefObject<Konva.Ellipse | null>;
  fogNodeRef: React.RefObject<Konva.Rect | null>;
  subjectX: number;
  subjectY: number;
  subjectW: number;
  subjectH: number;
  reflectionTop: number;
  reflectionHeight: number;
  shadowX: number;
  shadowY: number;
  shadowW: number;
  shadowH: number;
  shadowAngleDeg: number;
  shadowOpacity: number;
  reflectionEnabled: boolean;
  reflectionOpacity: number;
  shadowEnabled: boolean;
  fogEnabled: boolean;
  fogOpacity: number;
  fogHeight: number;
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

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

type LoadedFontAsset = {
  dataUrl: string;
  measurementSource: NameOverlayFontMeasurementSource;
};

const fontAssetPromiseCache = new Map<string, Promise<LoadedFontAsset>>();

async function fetchFontAsset(url: string): Promise<LoadedFontAsset> {
  const cached = fontAssetPromiseCache.get(url);
  if (cached) {
    return cached;
  }

  const pending = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load font ${url} (${response.status}).`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      const mimeType = url.toLowerCase().endsWith('.otf') ? 'font/otf' : 'font/ttf';
      return {
        dataUrl: `data:${mimeType};base64,${btoa(binary)}`,
        measurementSource: {
          key: url,
          data: bytes,
        },
      };
    });

  fontAssetPromiseCache.set(url, pending);
  return pending;
}

function useNameOverlayFontAssets(fontPairId: FontPairId): {
  fontFaces: NameOverlayFontFaces;
  measurementSources?: {
    firstName?: NameOverlayFontMeasurementSource;
    lastName?: NameOverlayFontMeasurementSource;
  };
} {
  const [fontAssets, setFontAssets] = useState<{
    fontFaces: NameOverlayFontFaces;
    measurementSources?: {
      firstName?: NameOverlayFontMeasurementSource;
      lastName?: NameOverlayFontMeasurementSource;
    };
  }>(() => ({
    fontFaces: resolveNameOverlayFontFaces(fontPairId),
  }));

  useEffect(() => {
    let cancelled = false;
    const baseFaces = resolveNameOverlayFontFaces(fontPairId);
    const pairWithUrls = resolveNameOverlayFontFaces(fontPairId, (filename) =>
      `/fonts/${filename}`,
    );

    Promise.all([
      fetchFontAsset(pairWithUrls.firstNameSrc ?? ''),
      fetchFontAsset(pairWithUrls.lastNameSrc ?? ''),
    ])
      .then(([firstNameAsset, lastNameAsset]) => {
        if (!cancelled) {
          setFontAssets({
            fontFaces: {
              ...baseFaces,
              firstNameSrc: firstNameAsset.dataUrl,
              lastNameSrc: lastNameAsset.dataUrl,
            },
            measurementSources: {
              firstName: firstNameAsset.measurementSource,
              lastName: lastNameAsset.measurementSource,
            },
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFontAssets({
            fontFaces: baseFaces,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fontPairId]);

  return fontAssets;
}

function useNameOverlayTextMetrics(
  firstName: string,
  lastName: string,
  nameStyle: 'classic' | 'outline' | 'modern',
  nameSizePct: number,
  measurementSources?: {
    firstName?: NameOverlayFontMeasurementSource;
    lastName?: NameOverlayFontMeasurementSource;
  },
) {
  return useMemo(
    () =>
      measureNameOverlayTextMetrics(
        EXPORT_HEIGHT_PX,
        {
          firstName,
          lastName,
          style: nameStyle,
          sizePct: nameSizePct,
        },
        measurementSources,
      ),
    [firstName, lastName, measurementSources, nameSizePct, nameStyle],
  );
}

function useKonvaImg(src?: string): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);

  useEffect(() => {
    if (!src) {
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!cancelled) {
        setLoaded({ src, image });
      }
    };
    image.src = src;

    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [src]);

  if (loaded && loaded.src === src) {
    return loaded.image;
  }

  return null;
}

function getImageSize(image: CanvasImageSource): { width: number; height: number } {
  if (image instanceof HTMLImageElement) {
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  }

  if (image instanceof HTMLCanvasElement) {
    return { width: image.width, height: image.height };
  }

  return {
    width: (image as ImageBitmap).width,
    height: (image as ImageBitmap).height,
  };
}

function buildSubjectPreviewImage(
  image: HTMLImageElement,
  legFadeEnabled: boolean,
  legFadeStartPct: number,
): CanvasImageSource {
  if (!legFadeEnabled) {
    return image;
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return image;
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const fadeStart = clamp(legFadeStartPct / 100, 0, 1);
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(fadeStart, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}

function buildReflectionPreviewImage(image: CanvasImageSource): HTMLCanvasElement | null {
  const { width, height } = getImageSize(image);
  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.save();
  ctx.translate(0, height);
  ctx.scale(1, -1);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

function CompositeStage({
  width,
  height,
  stageScale,
  stageOffsetX,
  stageOffsetY,
  handleWheel,
  backdropImg,
  subjectImg,
  reflectionImg,
  nameOverlayImg,
  subjectNodeRef,
  transformerRef,
  reflectionNodeRef,
  shadowNodeRef,
  fogNodeRef,
  subjectX,
  subjectY,
  subjectW,
  subjectH,
  reflectionTop,
  reflectionHeight,
  shadowX,
  shadowY,
  shadowW,
  shadowH,
  shadowAngleDeg,
  shadowOpacity,
  reflectionEnabled,
  reflectionOpacity,
  shadowEnabled,
  fogEnabled,
  fogOpacity,
  fogHeight,
  handleDragEnd,
  dangerZoneRects,
  scale,
}: CompositeStageProps) {
  return (
    <Stage
      width={width}
      height={height}
      x={stageOffsetX}
      y={stageOffsetY}
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

        {shadowEnabled && shadowW > 0 && shadowH > 0 && (
          <Ellipse
            ref={shadowNodeRef}
            x={shadowX}
            y={shadowY}
            radiusX={shadowW / 2}
            radiusY={shadowH / 2}
            rotation={shadowAngleDeg}
            opacity={shadowOpacity}
            fillRadialGradientStartPoint={{ x: 0, y: 0 }}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndPoint={{ x: 0, y: 0 }}
            fillRadialGradientEndRadius={Math.max(shadowW, shadowH) / 2}
            fillRadialGradientColorStops={[
              0,
              `rgba(0, 0, 0, ${SHADOW_GRADIENT_CENTER_ALPHA})`,
              SHADOW_GRADIENT_MID_STOP,
              `rgba(0, 0, 0, ${SHADOW_GRADIENT_MID_ALPHA})`,
              1,
              'rgba(0, 0, 0, 0)',
            ]}
            listening={false}
          />
        )}

        {reflectionImg && reflectionEnabled && reflectionHeight > 0 && (
          <KonvaImage
            ref={reflectionNodeRef}
            image={reflectionImg}
            x={subjectX}
            y={reflectionTop}
            width={subjectW}
            height={reflectionHeight}
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

        {fogEnabled && fogHeight > 0 && (
          <Rect
            ref={fogNodeRef}
            x={0}
            y={EXPORT_HEIGHT_PX - fogHeight}
            width={EXPORT_WIDTH_PX}
            height={fogHeight}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: fogHeight }}
            fillLinearGradientColorStops={[
              0,
              'rgba(234, 238, 255, 0)',
              1,
              `rgba(234, 238, 255, ${fogOpacity.toFixed(3)})`,
            ]}
            listening={false}
          />
        )}

        {nameOverlayImg && (
          <KonvaImage
            image={nameOverlayImg}
            x={0}
            y={0}
            width={EXPORT_WIDTH_PX}
            height={EXPORT_HEIGHT_PX}
            listening={false}
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

interface KonvaCanvasProps {
  containerWidth: number;
  containerHeight: number;
}

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
  const firstName = useFirstName();
  const lastName = useLastName();
  const fontPairId = useFontPair();
  const nameOverlayEnabled = useNameOverlayEnabled();
  const nameSizePct = useNameSizePct();
  const nameStyle = useNameStyle();
  const nameYFromBottomPct = useNameYFromBottomPct();
  const { fontFaces: nameOverlayFontFaces, measurementSources } =
    useNameOverlayFontAssets(fontPairId);
  const nameOverlayTextMetrics = useNameOverlayTextMetrics(
    firstName,
    lastName,
    nameStyle,
    nameSizePct,
    measurementSources,
  );

  const setCanvasZoom = useStore((s) => s.setCanvasZoom);
  const updateComposition = useStore((s) => s.updateComposition);

  const backdropImg = useKonvaImg(backdrop?.objectUrl);
  const subjectImg = useKonvaImg(subject?.objectUrl);
  const previewSubjectImg = useMemo(
    () =>
      subjectImg
        ? buildSubjectPreviewImage(
            subjectImg,
            composition.legFadeEnabled,
            composition.legFadeStartPct,
          )
        : null,
    [subjectImg, composition.legFadeEnabled, composition.legFadeStartPct],
  );
  const reflectionPreviewImg = useMemo(
    () =>
      previewSubjectImg ? buildReflectionPreviewImage(previewSubjectImg) : null,
    [previewSubjectImg],
  );
  const nameOverlaySrc = useMemo(() => {
    if (!nameOverlayEnabled) {
      return undefined;
    }

    const svg = buildNameOverlaySvg(
      EXPORT_WIDTH_PX,
      EXPORT_HEIGHT_PX,
      {
        firstName,
        lastName,
        style: nameStyle,
        fontPairId,
        sizePct: nameSizePct,
        yFromBottomPct: nameYFromBottomPct,
        fontFaces: nameOverlayFontFaces,
        textMetrics: nameOverlayTextMetrics,
      },
    );

    return svg ? svgToDataUrl(svg) : undefined;
  }, [
    firstName,
    lastName,
    fontPairId,
    nameOverlayEnabled,
    nameSizePct,
    nameStyle,
    nameOverlayTextMetrics,
    nameYFromBottomPct,
    nameOverlayFontFaces,
  ]);
  const nameOverlayImg = useKonvaImg(nameOverlaySrc);

  const subjectNodeRef = useRef<Konva.Image | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const reflectionNodeRef = useRef<Konva.Image | null>(null);
  const shadowNodeRef = useRef<Konva.Ellipse | null>(null);
  const fogNodeRef = useRef<Konva.Rect | null>(null);

  const baseScale = Math.min(
    containerWidth / EXPORT_WIDTH_PX,
    containerHeight / EXPORT_HEIGHT_PX,
  );
  const scale = baseScale;

  const subjectH = subject
    ? (composition.subjectHeightPct / 100) * EXPORT_HEIGHT_PX
    : 0;
  const subjectW =
    subject && subject.height > 0
      ? subjectH * (subject.width / subject.height)
      : 0;
  const subjectX = subject
    ? (composition.xPct / 100) * EXPORT_WIDTH_PX - subjectW / 2
    : 0;
  const subjectY = subject
    ? (composition.yPct / 100) * EXPORT_HEIGHT_PX - subjectH
    : 0;
  const subjectFeetY = subjectY + subjectH;

  const reflectionHeight = Math.max(
    0,
    subjectH * (composition.reflectionSizePct / 100),
  );
  const reflectionTop = clamp(
    subjectFeetY +
      ((composition.reflectionPositionPct - 100) / 100) * (subjectH * 0.25),
    0,
    EXPORT_HEIGHT_PX,
  );

  const shadowMetrics = estimateShadowPreviewMetrics(composition);
  const shadowX =
    ((composition.xPct + shadowMetrics.shadowOffsetXPct) / 100) * EXPORT_WIDTH_PX;
  const shadowY =
    ((composition.yPct + shadowMetrics.shadowOffsetYPct) / 100) * EXPORT_HEIGHT_PX;
  const shadowW = (shadowMetrics.shadowWidthPct / 100) * EXPORT_WIDTH_PX;
  const shadowH = (shadowMetrics.shadowHeightPct / 100) * EXPORT_HEIGHT_PX;
  const fogHeight = (composition.fogHeightPct / 100) * EXPORT_HEIGHT_PX;
  const fogOpacity = clamp(composition.fogOpacityPct / 100, 0, 1);

  useEffect(() => {
    if (transformerRef.current && subjectNodeRef.current) {
      transformerRef.current.nodes([subjectNodeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [previewSubjectImg]);

  useEffect(() => {
    const node = reflectionNodeRef.current;
    if (!node) {
      return;
    }

    if (composition.reflectionBlurPx > 0) {
      if (node.isCached()) {
        node.clearCache();
      }
      node.cache();
      node.filters([Konva.Filters.Blur]);
      node.blurRadius(composition.reflectionBlurPx);
    } else {
      node.filters([]);
      if (node.isCached()) {
        node.clearCache();
      }
    }

    node.getLayer()?.batchDraw();
  }, [
    reflectionPreviewImg,
    composition.reflectionBlurPx,
    reflectionHeight,
    reflectionTop,
    subjectW,
  ]);

  useEffect(() => {
    const node = shadowNodeRef.current;
    if (!node) {
      return;
    }

    if (composition.shadowEnabled && composition.shadowBlurPx > 0) {
      if (node.isCached()) {
        node.clearCache();
      }
      node.cache();
      node.filters([Konva.Filters.Blur]);
      node.blurRadius(composition.shadowBlurPx);
    } else {
      node.filters([]);
      if (node.isCached()) {
        node.clearCache();
      }
    }

    node.getLayer()?.batchDraw();
  }, [
    composition.shadowEnabled,
    composition.shadowBlurPx,
    shadowW,
    shadowH,
    shadowX,
    shadowY,
  ]);

  useEffect(() => {
    const node = fogNodeRef.current;
    if (!node) {
      return;
    }

    if (composition.fogEnabled && composition.fogOpacityPct > 0) {
      if (node.isCached()) {
        node.clearCache();
      }
      node.cache();
      node.filters([Konva.Filters.Blur]);
      node.blurRadius(FOG_BLUR_PX);
    } else {
      node.filters([]);
      if (node.isCached()) {
        node.clearCache();
      }
    }

    node.getLayer()?.batchDraw();
  }, [composition.fogEnabled, composition.fogOpacityPct, fogHeight]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }
      if (document.activeElement?.tagName === 'INPUT') {
        return;
      }

      e.preventDefault();
      const px = e.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX;
      const dx =
        e.key === 'ArrowLeft' ? -px : e.key === 'ArrowRight' ? px : 0;
      const dy = e.key === 'ArrowUp' ? -px : e.key === 'ArrowDown' ? px : 0;
      const { composition: currentComposition } = useStore.getState();

      updateComposition({
        xPct: Math.max(5, Math.min(95, currentComposition.xPct + dx * 0.1)),
        yPct: Math.max(25, Math.min(96, currentComposition.yPct + dy * 0.1)),
      });
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [updateComposition]);

  const handleDragEnd = useCallback(
    (e: KonvaEventObject<DragEvent>) => {
      if (!subject) {
        return;
      }

      const newXPct = ((e.target.x() + subjectW / 2) / EXPORT_WIDTH_PX) * 100;
      const newYPct = ((e.target.y() + subjectH) / EXPORT_HEIGHT_PX) * 100;

      updateComposition({
        xPct: Math.max(5, Math.min(95, newXPct)),
        yPct: Math.max(25, Math.min(96, newYPct)),
      });
    },
    [subject, subjectW, subjectH, updateComposition],
  );

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

  const dangerZoneRects = showDangerZone
    ? Object.entries(CROP_ZONES).map(([label, zone]) => {
        const zoneW = zone.widthFrac * EXPORT_WIDTH_PX;
        const zoneH = zone.heightFrac * EXPORT_HEIGHT_PX;
        const zoneX = (EXPORT_WIDTH_PX - zoneW) / 2;
        const zoneY = (EXPORT_HEIGHT_PX - zoneH) / 2;
        return { label, zoneX, zoneY, zoneW, zoneH };
      })
    : [];

  if (showSideBySide && subject && backdrop) {
    const halfW = Math.floor(containerWidth / 2);
    const sideBaseScale = Math.min(
      halfW / EXPORT_WIDTH_PX,
      containerHeight / EXPORT_HEIGHT_PX,
    );
    const sideScale = sideBaseScale * canvasZoom;
    const sideOffsetX = (halfW - EXPORT_WIDTH_PX * sideScale) / 2;
    const sideOffsetY = (containerHeight - EXPORT_HEIGHT_PX * sideScale) / 2;

    return (
      <div className="flex h-full w-full">
        <div
          className="relative overflow-hidden"
          style={{ width: halfW, height: containerHeight }}
        >
          <Stage
            width={halfW}
            height={containerHeight}
            x={sideOffsetX}
            y={sideOffsetY}
            scaleX={sideScale}
            scaleY={sideScale}
          >
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

        <div
          className="relative overflow-hidden"
          style={{ width: halfW, height: containerHeight }}
        >
          <CompositeStage
            width={halfW}
            height={containerHeight}
            stageScale={sideScale}
            stageOffsetX={sideOffsetX}
            stageOffsetY={sideOffsetY}
            handleWheel={handleWheel}
            backdropImg={backdropImg}
            subjectImg={previewSubjectImg}
            reflectionImg={reflectionPreviewImg}
            nameOverlayImg={nameOverlayImg}
            subjectNodeRef={subjectNodeRef}
            transformerRef={transformerRef}
            reflectionNodeRef={reflectionNodeRef}
            shadowNodeRef={shadowNodeRef}
            fogNodeRef={fogNodeRef}
            subjectX={subjectX}
            subjectY={subjectY}
            subjectW={subjectW}
            subjectH={subjectH}
            reflectionTop={reflectionTop}
            reflectionHeight={reflectionHeight}
            shadowX={shadowX}
            shadowY={shadowY}
            shadowW={shadowW}
            shadowH={shadowH}
            shadowAngleDeg={shadowMetrics.shadowAngleDeg}
            shadowOpacity={shadowMetrics.shadowOpacity}
            reflectionEnabled={composition.reflectionEnabled}
            reflectionOpacity={composition.reflectionOpacityPct / 100}
            shadowEnabled={composition.shadowEnabled}
            fogEnabled={composition.fogEnabled}
            fogOpacity={fogOpacity}
            fogHeight={fogHeight}
            handleDragEnd={handleDragEnd}
            dangerZoneRects={dangerZoneRects}
            scale={scale}
          />
        </div>
      </div>
    );
  }

  return (
    <CompositeStage
      width={containerWidth}
      height={containerHeight}
      stageScale={scale * canvasZoom}
      stageOffsetX={(containerWidth - EXPORT_WIDTH_PX * scale * canvasZoom) / 2}
      stageOffsetY={(containerHeight - EXPORT_HEIGHT_PX * scale * canvasZoom) / 2}
      handleWheel={handleWheel}
      backdropImg={backdropImg}
      subjectImg={previewSubjectImg}
      reflectionImg={reflectionPreviewImg}
      nameOverlayImg={nameOverlayImg}
      subjectNodeRef={subjectNodeRef}
      transformerRef={transformerRef}
      reflectionNodeRef={reflectionNodeRef}
      shadowNodeRef={shadowNodeRef}
      fogNodeRef={fogNodeRef}
      subjectX={subjectX}
      subjectY={subjectY}
      subjectW={subjectW}
      subjectH={subjectH}
      reflectionTop={reflectionTop}
      reflectionHeight={reflectionHeight}
      shadowX={shadowX}
      shadowY={shadowY}
      shadowW={shadowW}
      shadowH={shadowH}
      shadowAngleDeg={shadowMetrics.shadowAngleDeg}
      shadowOpacity={shadowMetrics.shadowOpacity}
      reflectionEnabled={composition.reflectionEnabled}
      reflectionOpacity={composition.reflectionOpacityPct / 100}
      shadowEnabled={composition.shadowEnabled}
      fogEnabled={composition.fogEnabled}
      fogOpacity={fogOpacity}
      fogHeight={fogHeight}
      handleDragEnd={handleDragEnd}
      dangerZoneRects={dangerZoneRects}
      scale={scale}
    />
  );
}
