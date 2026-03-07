'use client';

import { useStore } from '@/lib/store';
import { CROP_ZONES } from '@/lib/constants';

type DangerZoneOverlayProps = {
  canvasWidth: number;
  canvasHeight: number;
};

export function DangerZoneOverlay({ canvasWidth, canvasHeight }: DangerZoneOverlayProps) {
  const showDangerZone = useStore((s) => s.showDangerZone);

  if (!showDangerZone) return null;

  const zone4x6W = canvasWidth * CROP_ZONES['4x6'].widthFrac;
  const zone4x6H = canvasHeight * CROP_ZONES['4x6'].heightFrac;
  const zone5x7W = canvasWidth * CROP_ZONES['5x7'].widthFrac;
  const zone5x7H = canvasHeight * CROP_ZONES['5x7'].heightFrac;

  const zone4x6Left = (canvasWidth - zone4x6W) / 2;
  const zone4x6Top = (canvasHeight - zone4x6H) / 2;
  const zone5x7Left = (canvasWidth - zone5x7W) / 2;
  const zone5x7Top = (canvasHeight - zone5x7H) / 2;

  // 4-panel dimming around the outermost (5×7) zone — percentage-based so it
  // scales with the container regardless of pixel dimensions.
  const outer = CROP_ZONES['5x7'];
  const dimCropX = ((1 - outer.widthFrac) / 2) * 100;
  const dimCropY = ((1 - outer.heightFrac) / 2) * 100;
  const dimCropW = outer.widthFrac * 100;
  const dimCropH = outer.heightFrac * 100;

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* 4-panel dimming: top, bottom, left, right around the 5×7 safe zone */}
      {/* Top */}
      <div
        className="absolute bg-black/40 left-0 right-0"
        style={{ top: 0, height: `${dimCropY}%` }}
      />
      {/* Bottom */}
      <div
        className="absolute bg-black/40 left-0 right-0"
        style={{ top: `${dimCropY + dimCropH}%`, bottom: 0 }}
      />
      {/* Left */}
      <div
        className="absolute bg-black/40"
        style={{ top: `${dimCropY}%`, height: `${dimCropH}%`, left: 0, width: `${dimCropX}%` }}
      />
      {/* Right */}
      <div
        className="absolute bg-black/40"
        style={{ top: `${dimCropY}%`, height: `${dimCropH}%`, left: `${dimCropX + dimCropW}%`, right: 0 }}
      />

      {/* 4x6 crop zone — red dashed */}
      <div
        className="absolute border-2 border-dashed border-red-500"
        style={{
          left: zone4x6Left,
          top: zone4x6Top,
          width: zone4x6W,
          height: zone4x6H,
        }}
      >
        <span className="absolute -top-5 left-0 rounded bg-red-600 px-1 text-[9px] text-white">
          4×6
        </span>
      </div>

      {/* 5x7 crop zone — orange dashed */}
      <div
        className="absolute border-2 border-dashed border-orange-400"
        style={{
          left: zone5x7Left,
          top: zone5x7Top,
          width: zone5x7W,
          height: zone5x7H,
        }}
      >
        <span className="absolute -top-5 right-0 rounded bg-orange-500 px-1 text-[9px] text-white">
          5×7
        </span>
      </div>
    </div>
  );
}
