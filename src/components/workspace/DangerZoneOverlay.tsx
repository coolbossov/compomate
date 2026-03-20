'use client';

import { useStore } from '@/lib/store';
import { useExportProfile } from '@/lib/store/selectors';
import { CROP_ZONES } from '@/lib/constants';
import { EXPORT_PROFILES } from '@/lib/shared/composition';

type DangerZoneOverlayProps = {
  canvasWidth: number;
  canvasHeight: number;
};

/**
 * DangerZoneOverlay
 *
 * Two modes:
 *
 * 1. Active export profile (always shown when profile ≠ "original"):
 *    A 4-panel dimmed mask darkens everything outside the selected profile's
 *    crop region. A label badge identifies the active profile. This makes
 *    the effective crop zone immediately obvious without requiring the user
 *    to toggle "Crop Guides".
 *
 * 2. Crop guides (toggled via the "Crop Guides" button):
 *    Shows dashed outlines for all standard crop zones (4×6, 5×7) so the
 *    operator can manually verify safe margins.
 *
 * Both modes can be active simultaneously.
 */
export function DangerZoneOverlay({ canvasWidth, canvasHeight }: DangerZoneOverlayProps) {
  const showDangerZone = useStore((s) => s.showDangerZone);
  const exportProfileId = useExportProfile();

  const activeProfile = EXPORT_PROFILES[exportProfileId];
  const hasActiveCrop = exportProfileId !== 'original' && activeProfile.aspectRatio !== null;

  // ── Active profile crop mask ──────────────────────────────────────────────
  // Compute the safe area for the selected profile.
  // The canvas is always the master 4:5 aspect. Each profile crops a
  // centre-anchored rectangle with the profile's aspect ratio.
  const masterAspect = 4 / 5; // canvas always 4:5
  let cropWidthFrac = 1;
  let cropHeightFrac = 1;

  if (hasActiveCrop && activeProfile.aspectRatio !== null) {
    const profileAspect = activeProfile.aspectRatio;
    if (profileAspect < masterAspect) {
      // Profile is taller relative to width — constrain width
      cropWidthFrac = profileAspect / masterAspect;
      cropHeightFrac = 1;
    } else if (profileAspect > masterAspect) {
      // Profile is wider relative to height — constrain height
      cropWidthFrac = 1;
      cropHeightFrac = masterAspect / profileAspect;
    }
    // profileAspect === masterAspect: no crop (covers full canvas)
  }

  const dimCropX = ((1 - cropWidthFrac) / 2) * 100;
  const dimCropY = ((1 - cropHeightFrac) / 2) * 100;
  const dimCropW = cropWidthFrac * 100;
  const dimCropH = cropHeightFrac * 100;

  // ── Existing danger-zone guide positions ─────────────────────────────────
  const zone4x6W = canvasWidth * CROP_ZONES['4x6'].widthFrac;
  const zone4x6H = canvasHeight * CROP_ZONES['4x6'].heightFrac;
  const zone5x7W = canvasWidth * CROP_ZONES['5x7'].widthFrac;
  const zone5x7H = canvasHeight * CROP_ZONES['5x7'].heightFrac;

  const zone4x6Left = (canvasWidth - zone4x6W) / 2;
  const zone4x6Top = (canvasHeight - zone4x6H) / 2;
  const zone5x7Left = (canvasWidth - zone5x7W) / 2;
  const zone5x7Top = (canvasHeight - zone5x7H) / 2;

  const hasContent = hasActiveCrop || showDangerZone;
  if (!hasContent) return null;

  return (
    <div className="pointer-events-none absolute inset-0">

      {/* ── Active profile crop mask ─────────────────────────────────────── */}
      {hasActiveCrop && (
        <>
          {/* 4-panel dimming around the active crop zone */}
          {/* Top */}
          <div
            className="absolute bg-black/50 left-0 right-0"
            style={{ top: 0, height: `${dimCropY}%` }}
          />
          {/* Bottom */}
          <div
            className="absolute bg-black/50 left-0 right-0"
            style={{ top: `${dimCropY + dimCropH}%`, bottom: 0 }}
          />
          {/* Left */}
          <div
            className="absolute bg-black/50"
            style={{
              top: `${dimCropY}%`,
              height: `${dimCropH}%`,
              left: 0,
              width: `${dimCropX}%`,
            }}
          />
          {/* Right */}
          <div
            className="absolute bg-black/50"
            style={{
              top: `${dimCropY}%`,
              height: `${dimCropH}%`,
              left: `${dimCropX + dimCropW}%`,
              right: 0,
            }}
          />

          {/* Crop zone border */}
          <div
            className="absolute border border-white/40"
            style={{
              left: `${dimCropX}%`,
              top: `${dimCropY}%`,
              width: `${dimCropW}%`,
              height: `${dimCropH}%`,
            }}
          />

          {/* Profile label badge */}
          <div
            className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90 border border-white/20"
          >
            Export: {activeProfile.label}
          </div>
        </>
      )}

      {/* ── Crop guide dashed outlines (toggled) ─────────────────────────── */}
      {showDangerZone && (
        <>
          {/* 4-panel dimming outside 5×7 zone (only when crop mask not already shown) */}
          {!hasActiveCrop && (() => {
            const outer = CROP_ZONES['5x7'];
            const gX = ((1 - outer.widthFrac) / 2) * 100;
            const gY = ((1 - outer.heightFrac) / 2) * 100;
            const gW = outer.widthFrac * 100;
            const gH = outer.heightFrac * 100;
            return (
              <>
                <div className="absolute bg-black/40 left-0 right-0" style={{ top: 0, height: `${gY}%` }} />
                <div className="absolute bg-black/40 left-0 right-0" style={{ top: `${gY + gH}%`, bottom: 0 }} />
                <div className="absolute bg-black/40" style={{ top: `${gY}%`, height: `${gH}%`, left: 0, width: `${gX}%` }} />
                <div className="absolute bg-black/40" style={{ top: `${gY}%`, height: `${gH}%`, left: `${gX + gW}%`, right: 0 }} />
              </>
            );
          })()}

          {/* 4×6 crop zone — red dashed */}
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

          {/* 5×7 crop zone — orange dashed */}
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
        </>
      )}
    </div>
  );
}
