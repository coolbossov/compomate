import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import {
  clamp,
  EXPORT_PROFILES,
  getExportProfile,
  INITIAL_COMPOSITION,
  wrapDegrees,
  type CompositionState,
  type ExportProfileId,
  type NameStyleId,
} from "@/lib/shared/composition";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { buildNameOverlaySvg } from "@/lib/shared/name-overlay";

export const runtime = "nodejs";

const MAX_DATA_URL_BYTES = 28_000_000;

type ExportRequestBody = {
  backdropDataUrl?: string;
  subjectDataUrl?: string;
  composition?: Partial<CompositionState> & { reflectionLengthPct?: number };
  firstName?: string;
  lastName?: string;
  exportProfile?: ExportProfileId;
  nameStyle?: NameStyleId;
};

type FittedOverlay = {
  input: Buffer;
  left: number;
  top: number;
};

type PoseMetrics = {
  footCenterPx: number;
  stanceRatio: number;
  leanRatio: number;
};

const NAME_STYLE_SET = new Set<NameStyleId>(["classic", "outline", "modern"]);
const PROFILE_ID_SET = new Set<ExportProfileId>(
  Object.keys(EXPORT_PROFILES) as ExportProfileId[],
);
const MAX_BINARY_BYTES = 14_000_000;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_INPUT_EDGE_PX = 9_000;

function estimateDataUrlBinaryBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    return 0;
  }
  const base64 = dataUrl.slice(commaIndex + 1).trim();
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL input.");
  }
  return Buffer.from(match[2], "base64");
}

function createUserImageSharp(input: Buffer): sharp.Sharp {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
}

async function readUserImageMetadata(
  input: Buffer,
  label: "Backdrop" | "Subject",
): Promise<{ width: number; height: number }> {
  const metadata = await createUserImageSharp(input).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error(`Unable to read ${label.toLowerCase()} dimensions.`);
  }

  if (
    width > MAX_INPUT_EDGE_PX ||
    height > MAX_INPUT_EDGE_PX ||
    width * height > MAX_INPUT_PIXELS
  ) {
    throw new Error(`${label} dimensions exceed server image limits.`);
  }

  return { width, height };
}

type ParsedExportInput = {
  backdropBuffer: Buffer;
  subjectBuffer: Buffer;
  compositionInput: Partial<CompositionState> & { reflectionLengthPct?: number };
  firstName: string | undefined;
  lastName: string | undefined;
  exportProfileId: ExportProfileId;
  nameStyle: NameStyleId;
};

function parseExportProfileId(value: unknown): ExportProfileId {
  if (typeof value === "string" && PROFILE_ID_SET.has(value as ExportProfileId)) {
    return value as ExportProfileId;
  }
  return "original";
}

function parseNameStyle(value: unknown): NameStyleId {
  if (typeof value === "string" && NAME_STYLE_SET.has(value as NameStyleId)) {
    return value as NameStyleId;
  }
  return "classic";
}

function parseCompositionFromUnknown(
  value: unknown,
): Partial<CompositionState> & { reflectionLengthPct?: number } {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Partial<CompositionState> & { reflectionLengthPct?: number };
}

async function parseExportInput(request: NextRequest): Promise<ParsedExportInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const backdrop = formData.get("backdrop");
    const subject = formData.get("subject");
    if (!(backdrop instanceof File) || !(subject instanceof File)) {
      throw new Error("Missing backdrop or subject upload.");
    }
    if (backdrop.size > MAX_BINARY_BYTES || subject.size > MAX_BINARY_BYTES) {
      throw new Error("Uploaded image exceeds server payload limits.");
    }

    let compositionInput: Partial<CompositionState> & { reflectionLengthPct?: number } = {};
    const compositionRaw = formData.get("composition");
    if (typeof compositionRaw === "string" && compositionRaw.trim()) {
      try {
        compositionInput = parseCompositionFromUnknown(JSON.parse(compositionRaw));
      } catch {
        throw new Error("Invalid composition payload.");
      }
    }

    return {
      backdropBuffer: Buffer.from(await backdrop.arrayBuffer()),
      subjectBuffer: Buffer.from(await subject.arrayBuffer()),
      compositionInput,
      firstName:
        typeof formData.get("firstName") === "string"
          ? (formData.get("firstName") as string)
          : undefined,
      lastName:
        typeof formData.get("lastName") === "string"
          ? (formData.get("lastName") as string)
          : undefined,
      exportProfileId: parseExportProfileId(formData.get("exportProfile")),
      nameStyle: parseNameStyle(formData.get("nameStyle")),
    };
  }

  const body = (await request.json()) as ExportRequestBody;
  if (!body.backdropDataUrl || !body.subjectDataUrl) {
    throw new Error("Missing backdropDataUrl or subjectDataUrl in request body.");
  }

  if (estimateDataUrlBinaryBytes(body.backdropDataUrl) > MAX_DATA_URL_BYTES) {
    throw new Error("Backdrop file is too large for export.");
  }
  if (estimateDataUrlBinaryBytes(body.subjectDataUrl) > MAX_DATA_URL_BYTES) {
    throw new Error("Subject file is too large for export.");
  }

  return {
    backdropBuffer: dataUrlToBuffer(body.backdropDataUrl),
    subjectBuffer: dataUrlToBuffer(body.subjectDataUrl),
    compositionInput: body.composition ?? {},
    firstName: body.firstName,
    lastName: body.lastName,
    exportProfileId: parseExportProfileId(body.exportProfile),
    nameStyle: parseNameStyle(body.nameStyle),
  };
}

function analyzeSubjectPose(raw: {
  data: Buffer;
  info: sharp.OutputInfo;
}): PoseMetrics {
  const { data, info } = raw;
  const alphaChannel = info.channels - 1;

  const bottomStart = Math.floor(info.height * 0.72);
  let footSumX = 0;
  let footCount = 0;
  let footMinX = info.width;
  let footMaxX = 0;

  for (let y = bottomStart; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + alphaChannel] ?? 0;
      if (alpha < 18) {
        continue;
      }
      footSumX += x;
      footCount += 1;
      footMinX = Math.min(footMinX, x);
      footMaxX = Math.max(footMaxX, x);
    }
  }

  const topEnd = Math.max(1, Math.floor(info.height * 0.35));
  const lowerStart = Math.floor(info.height * 0.65);
  let topX = 0;
  let topCount = 0;
  let bottomX = 0;
  let bottomCount = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + alphaChannel] ?? 0;
      if (alpha < 18) {
        continue;
      }
      if (y <= topEnd) {
        topX += x;
        topCount += 1;
      }
      if (y >= lowerStart) {
        bottomX += x;
        bottomCount += 1;
      }
    }
  }

  const footCenterPx = footCount > 0 ? footSumX / footCount : info.width / 2;
  const stanceSpan =
    footCount > 0 ? Math.max(1, footMaxX - footMinX) : Math.round(info.width * 0.38);
  const stanceRatio = clamp(stanceSpan / Math.max(1, info.width), 0.1, 0.95);

  const topCenter = topCount > 0 ? topX / topCount : info.width / 2;
  const bottomCenter = bottomCount > 0 ? bottomX / bottomCount : footCenterPx;
  const leanRatio = clamp((topCenter - bottomCenter) / Math.max(1, info.width), -0.5, 0.5);

  return { footCenterPx, stanceRatio, leanRatio };
}

async function buildDirectionalShadow(
  subjectPng: Buffer,
  settings: {
    lightDirectionDeg: number;
    lightElevationDeg: number;
    shadowStrengthPct: number;
    shadowStretchPct: number;
    shadowBlurPx: number;
  },
): Promise<{ input: Buffer; leftOffset: number; topOffset: number } | null> {
  const subjectRaw = await sharp(subjectPng).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const { data, info } = subjectRaw;
  if (!info.width || !info.height) {
    return null;
  }

  const pose = analyzeSubjectPose(subjectRaw);
  const strength = clamp(settings.shadowStrengthPct / 100, 0, 1);
  if (strength <= 0) {
    return null;
  }

  const alphaChannel = info.channels - 1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const baseIndex = (y * info.width + x) * info.channels;
      const alpha = data[baseIndex + alphaChannel] ?? 0;
      data[baseIndex] = 0;
      data[baseIndex + 1] = 0;
      data[baseIndex + 2] = 0;
      data[baseIndex + alphaChannel] = Math.round(alpha * strength * 0.72);
    }
  }

  const elevation = clamp(settings.lightElevationDeg, 5, 85);
  const elevationFactor = 1 - elevation / 90;
  const stretch = clamp(settings.shadowStretchPct / 100, 0.35, 2.5);

  const widthScale =
    (0.85 + pose.stanceRatio * 0.6 + elevationFactor * 1.05) * stretch;
  const heightScale = 0.16 + (1 - elevationFactor) * 0.24;

  const shadowWidth = Math.max(20, Math.round(info.width * widthScale));
  const shadowHeight = Math.max(14, Math.round(info.height * heightScale));

  const sourceShadow = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .resize({ width: shadowWidth, height: shadowHeight, fit: "fill" })
    .png()
    .toBuffer();

  const shadowAngleDeg = wrapDegrees(
    settings.lightDirectionDeg + 180 + pose.leanRatio * 12,
  );
  const shadowAngleRad = (shadowAngleDeg * Math.PI) / 180;

  const rotatedShadow = await sharp(sourceShadow)
    .rotate(shadowAngleDeg, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(clamp(settings.shadowBlurPx, 0, 36))
    .png()
    .toBuffer();

  const meta = await sharp(rotatedShadow).metadata();
  const rotatedWidth = meta.width;
  const rotatedHeight = meta.height;
  if (!rotatedWidth || !rotatedHeight) {
    return null;
  }

  const footCenterOffset = pose.footCenterPx - info.width / 2;
  const offsetDistanceX =
    Math.cos(shadowAngleRad) * info.width * (0.06 + elevationFactor * 0.2);
  const offsetDistanceY =
    Math.sin(shadowAngleRad) * info.height * (0.03 + elevationFactor * 0.1);

  return {
    input: rotatedShadow,
    leftOffset: Math.round(-rotatedWidth / 2 + offsetDistanceX + footCenterOffset * 0.28),
    topOffset: Math.round(-rotatedHeight * 0.28 + offsetDistanceY),
  };
}

async function buildReflection(
  subjectPng: Buffer,
  reflectionSizePct: number,
  reflectionOpacityPct: number,
  reflectionBlurPx: number,
  maxHeight: number,
): Promise<Buffer> {
  const flipped = sharp(subjectPng).flip().ensureAlpha();
  const metadata = await flipped.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    throw new Error("Unable to determine subject dimensions for reflection.");
  }

  const scaledHeight = clamp(
    Math.round(height * (reflectionSizePct / 100)),
    1,
    maxHeight,
  );
  const scaledWidth = clamp(
    Math.round(width * (reflectionSizePct / 100)),
    1,
    Math.max(1, width * 3),
  );

  const raw = await flipped.raw().toBuffer({ resolveWithObject: true });
  const opacity = clamp(reflectionOpacityPct / 100, 0, 1);
  for (let y = 0; y < raw.info.height; y += 1) {
    const fade = 1 - y / Math.max(1, raw.info.height - 1);
    for (let x = 0; x < raw.info.width; x += 1) {
      const alphaIndex = (y * raw.info.width + x) * raw.info.channels + 3;
      const originalAlpha = raw.data[alphaIndex] ?? 0;
      raw.data[alphaIndex] = Math.round(originalAlpha * opacity * fade);
    }
  }

  return sharp(raw.data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels: raw.info.channels,
    },
  })
    .resize({ width: scaledWidth, height: scaledHeight, fit: "fill" })
    .blur(clamp(reflectionBlurPx, 0, 20))
    .png()
    .toBuffer();
}

async function applyLegFade(subjectPng: Buffer, fadeStartPct: number): Promise<Buffer> {
  const raw = await sharp(subjectPng).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const fadeStart = clamp(
    Math.round(raw.info.height * (fadeStartPct / 100)),
    0,
    raw.info.height,
  );

  for (let y = 0; y < raw.info.height; y += 1) {
    const alphaMultiplier =
      y < fadeStart ? 1 : 1 - (y - fadeStart) / Math.max(1, raw.info.height - fadeStart);
    for (let x = 0; x < raw.info.width; x += 1) {
      const alphaIndex = (y * raw.info.width + x) * raw.info.channels + 3;
      const originalAlpha = raw.data[alphaIndex] ?? 0;
      raw.data[alphaIndex] = Math.round(originalAlpha * clamp(alphaMultiplier, 0, 1));
    }
  }

  return sharp(raw.data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels: raw.info.channels,
    },
  })
    .png()
    .toBuffer();
}

function buildFogOverlay(
  canvasWidth: number,
  canvasHeight: number,
  fogOpacityPct: number,
  fogHeightPct: number,
): Buffer {
  const opacity = clamp(fogOpacityPct / 100, 0, 1);
  const fogHeight = clamp(Math.round(canvasHeight * (fogHeightPct / 100)), 1, canvasHeight);
  const fogStartY = canvasHeight - fogHeight;
  const ellipseY = fogStartY + Math.round(fogHeight * 0.38);

  const svg = `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fog-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(238,242,255,0)" />
          <stop offset="58%" stop-color="rgba(238,242,255,0)" />
          <stop offset="100%" stop-color="rgba(238,242,255,${opacity.toFixed(3)})" />
        </linearGradient>
        <filter id="fog-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect x="0" y="${fogStartY}" width="${canvasWidth}" height="${fogHeight}" fill="url(#fog-grad)" />
      <ellipse cx="${Math.round(canvasWidth / 2)}" cy="${ellipseY}" rx="${Math.round(canvasWidth * 0.42)}" ry="${Math.round(fogHeight * 0.22)}"
        fill="rgba(247,249,255,${(opacity * 0.72).toFixed(3)})" filter="url(#fog-blur)" />
    </svg>
  `;

  return Buffer.from(svg);
}

async function fitOverlayWithinCanvas(
  input: Buffer,
  left: number,
  top: number,
  canvasWidth: number,
  canvasHeight: number,
): Promise<FittedOverlay | null> {
  const meta = await sharp(input).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    return null;
  }

  let dstLeft = Math.round(left);
  let dstTop = Math.round(top);
  let srcLeft = 0;
  let srcTop = 0;
  let cropWidth = width;
  let cropHeight = height;

  if (dstLeft < 0) {
    srcLeft = -dstLeft;
    cropWidth -= srcLeft;
    dstLeft = 0;
  }
  if (dstTop < 0) {
    srcTop = -dstTop;
    cropHeight -= srcTop;
    dstTop = 0;
  }
  if (dstLeft + cropWidth > canvasWidth) {
    cropWidth = canvasWidth - dstLeft;
  }
  if (dstTop + cropHeight > canvasHeight) {
    cropHeight = canvasHeight - dstTop;
  }

  cropWidth = Math.floor(cropWidth);
  cropHeight = Math.floor(cropHeight);
  srcLeft = Math.floor(srcLeft);
  srcTop = Math.floor(srcTop);

  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const needsCrop =
    srcLeft !== 0 || srcTop !== 0 || cropWidth !== width || cropHeight !== height;

  const fittedInput = needsCrop
    ? await sharp(input)
        .extract({
          left: srcLeft,
          top: srcTop,
          width: cropWidth,
          height: cropHeight,
        })
        .png()
        .toBuffer()
    : input;

  return { input: fittedInput, left: dstLeft, top: dstTop };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`export:${ip}`, 45, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Export rate limit reached. Please wait and retry." },
      { status: 429 },
    );
  }

  try {
    const parsed = await parseExportInput(request);
    const backdropBuffer = parsed.backdropBuffer;
    const subjectBuffer = parsed.subjectBuffer;

    const { width: backdropWidth, height: backdropHeight } = await readUserImageMetadata(
      backdropBuffer,
      "Backdrop",
    );
    await readUserImageMetadata(subjectBuffer, "Subject");

    const compositionInput = parsed.compositionInput;
    const composition: CompositionState = {
      ...INITIAL_COMPOSITION,
      ...compositionInput,
      reflectionSizePct: clamp(
        compositionInput.reflectionSizePct ??
          compositionInput.reflectionLengthPct ??
          INITIAL_COMPOSITION.reflectionSizePct,
        0,
        220,
      ),
    };

    composition.xPct = clamp(composition.xPct, 5, 95);
    composition.yPct = clamp(composition.yPct, 25, 96);
    composition.subjectHeightPct = clamp(composition.subjectHeightPct, 20, 95);
    composition.reflectionPositionPct = clamp(composition.reflectionPositionPct, 65, 140);
    composition.reflectionOpacityPct = clamp(composition.reflectionOpacityPct, 0, 100);
    composition.reflectionBlurPx = clamp(composition.reflectionBlurPx, 0, 20);
    composition.legFadeStartPct = clamp(composition.legFadeStartPct, 35, 98);
    composition.fogOpacityPct = clamp(composition.fogOpacityPct, 0, 100);
    composition.fogHeightPct = clamp(composition.fogHeightPct, 6, 80);
    composition.shadowStrengthPct = clamp(composition.shadowStrengthPct, 0, 100);
    composition.lightDirectionDeg = wrapDegrees(composition.lightDirectionDeg);
    composition.lightElevationDeg = clamp(composition.lightElevationDeg, 5, 85);
    composition.shadowStretchPct = clamp(composition.shadowStretchPct, 35, 250);
    composition.shadowBlurPx = clamp(composition.shadowBlurPx, 0, 40);

    const exportProfile = getExportProfile(parsed.exportProfileId);
    const nameStyle = parsed.nameStyle;

    const targetSubjectHeight = clamp(
      Math.round(backdropHeight * (composition.subjectHeightPct / 100)),
      64,
      backdropHeight,
    );

    const resizedSubjectPng = await createUserImageSharp(subjectBuffer)
      .rotate()
      .ensureAlpha()
      .resize({ width: backdropWidth, height: targetSubjectHeight, fit: "inside" })
      .png()
      .toBuffer();

    const subjectPng = composition.legFadeEnabled
      ? await applyLegFade(resizedSubjectPng, composition.legFadeStartPct)
      : resizedSubjectPng;

    const subjectMeta = await sharp(subjectPng).metadata();
    const subjectWidth = subjectMeta.width;
    const subjectHeight = subjectMeta.height;
    if (!subjectWidth || !subjectHeight) {
      throw new Error("Unable to process subject image.");
    }

    const footX = Math.round(backdropWidth * (composition.xPct / 100));
    const footY = Math.round(backdropHeight * (composition.yPct / 100));
    const subjectLeft = Math.round(footX - subjectWidth / 2);
    const subjectTop = Math.round(footY - subjectHeight);

    const compositeInputs: sharp.OverlayOptions[] = [];
    const pushOverlay = async (
      input: Buffer,
      left: number,
      top: number,
      blend: sharp.Blend = "over",
    ): Promise<void> => {
      const fitted = await fitOverlayWithinCanvas(
        input,
        left,
        top,
        backdropWidth,
        backdropHeight,
      );
      if (fitted) {
        compositeInputs.push({ ...fitted, blend });
      }
    };

    if (composition.shadowEnabled && composition.shadowStrengthPct > 0) {
      const shadowOverlay = await buildDirectionalShadow(subjectPng, {
        lightDirectionDeg: composition.lightDirectionDeg,
        lightElevationDeg: composition.lightElevationDeg,
        shadowStrengthPct: composition.shadowStrengthPct,
        shadowStretchPct: composition.shadowStretchPct,
        shadowBlurPx: composition.shadowBlurPx,
      });
      if (shadowOverlay) {
        await pushOverlay(
          shadowOverlay.input,
          footX + shadowOverlay.leftOffset,
          footY + shadowOverlay.topOffset,
          "multiply",
        );
      }
    }

    if (composition.reflectionEnabled && composition.reflectionSizePct > 0) {
      const reflectionPng = await buildReflection(
        subjectPng,
        composition.reflectionSizePct,
        composition.reflectionOpacityPct,
        composition.reflectionBlurPx,
        backdropHeight,
      );

      const reflectionMeta = await sharp(reflectionPng).metadata();
      const reflectionWidth = reflectionMeta.width;
      const reflectionHeight = reflectionMeta.height;
      if (!reflectionWidth || !reflectionHeight) {
        throw new Error("Unable to process reflection image.");
      }

      const reflectionLeft = Math.round(footX - reflectionWidth / 2);
      const reflectionTop = Math.round(
        footY + ((composition.reflectionPositionPct - 100) / 100) * (subjectHeight * 0.25),
      );
      await pushOverlay(reflectionPng, reflectionLeft, reflectionTop);
    }

    await pushOverlay(subjectPng, subjectLeft, subjectTop);

    if (composition.fogEnabled) {
      compositeInputs.push({
        input: buildFogOverlay(
          backdropWidth,
          backdropHeight,
          composition.fogOpacityPct,
          composition.fogHeightPct,
        ),
        left: 0,
        top: 0,
      });
    }

    const nameOverlaySvg = buildNameOverlaySvg(
      backdropWidth,
      backdropHeight,
      parsed.firstName,
      parsed.lastName,
      nameStyle,
    );
    if (nameOverlaySvg) {
      compositeInputs.push({ input: Buffer.from(nameOverlaySvg), left: 0, top: 0 });
    }

    let output = await createUserImageSharp(backdropBuffer)
      .ensureAlpha()
      .composite(compositeInputs)
      .png({ compressionLevel: 9 })
      .withMetadata({ density: 300 })
      .toBuffer();

    if (exportProfile.widthPx && exportProfile.heightPx) {
      output = await sharp(output)
        .resize({
          width: exportProfile.widthPx,
          height: exportProfile.heightPx,
          fit: "cover",
          position: "centre",
        })
        .png({ compressionLevel: 9 })
        .withMetadata({ density: 300 })
        .toBuffer();
    }

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "attachment; filename=compomate_export.png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status =
      message.includes("Missing ")
        ? 400
        : message.includes("too large")
          ? 413
          : message.includes("image limits")
            ? 413
          : message.includes("Invalid composition")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
