import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import {
  FAL_FLUX_MODEL,
  FAL_DIRECTION_MODEL,
  FAL_MASTER_MODEL,
  FAL_IDEOGRAM_MODEL,
  FAL_BACKDROP_ASPECT,
  FAL_BACKDROP_WIDTH,
  FAL_BACKDROP_HEIGHT,
} from "@/lib/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

type GenerateBackdropBody = {
  prompt?: string;
  styleHint?: string;
  aspectMode?: "portrait" | "landscape" | "square";
  model?: "flux" | "ideogram";
  styleType?: string; // Ideogram: REALISTIC | DESIGN | RENDER_3D | ANIME
  mode?: "manual" | "directions" | "master";
  count?: number;
  sourceImageUrl?: string;
};

type JsonObject = Record<string, unknown>;

type PendingFalJob = {
  pending: true;
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  queuePosition: number | null;
  model: string;
};

type CompletedFalJob = {
  pending: false;
  sourceUrl: string;
  images: Array<{
    sourceUrl: string;
    width?: number;
    height?: number;
  }>;
  model: string;
};

const QUEUE_BASE = "https://queue.fal.run/";
const POLL_INTERVAL_MS = 1800;
const MAX_SYNC_POLLS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveImageSize(aspectMode: GenerateBackdropBody["aspectMode"]): string {
  if (aspectMode === "square") return "square_hd";
  if (aspectMode === "landscape") return "landscape_4_3";
  return "portrait_4_3";
}

type FalImage = { url: string; width?: number; height?: number };

function extractImages(payload: unknown): FalImage[] {
  if (!payload || typeof payload !== "object") return [];
  const value = payload as JsonObject;

  const candidateArrays = [value.images, value.output, value.results];
  for (const candidateArray of candidateArrays) {
    if (Array.isArray(candidateArray)) {
      const images: FalImage[] = [];
      for (const item of candidateArray) {
        if (item && typeof item === "object") {
          const image = item as JsonObject;
          const url = image.url;
          if (typeof url === "string" && url.startsWith("http")) {
            images.push({
              url,
              width: typeof image.width === 'number' ? image.width : undefined,
              height: typeof image.height === 'number' ? image.height : undefined,
            });
          }
        }
      }
      if (images.length > 0) return images;
    }
  }

  const candidateObjects = [value.image, value.data];
  for (const candidate of candidateObjects) {
    if (candidate && typeof candidate === "object") {
      const direct = (candidate as JsonObject).url;
      if (typeof direct === "string" && direct.startsWith("http")) {
        return [{ url: direct }];
      }
      const nested = extractImages(candidate);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function completeImages(images: FalImage[], model: string): CompletedFalJob {
  const completedImages = images.map((image) => ({
    sourceUrl: image.url,
    width: image.width,
    height: image.height,
  }));
  const first = completedImages[0];
  if (!first) throw new Error('fal completed but no image URL was returned.');
  return { pending: false, sourceUrl: first.sourceUrl, images: completedImages, model };
}

function normalizeQueueUrl(value: string | undefined, fallback: string): string {
  const resolved = (value ?? fallback).trim();
  if (!resolved.startsWith(QUEUE_BASE)) throw new Error("Invalid fal queue URL.");
  return resolved;
}

async function falRequest(
  url: string,
  key: string,
  payload: JsonObject,
): Promise<{ ok: boolean; data: JsonObject; status: number }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as JsonObject;
  return { ok: response.ok, data, status: response.status };
}

async function fetchJson(url: string, key: string): Promise<JsonObject> {
  const response = await fetch(url, {
    headers: { Authorization: `Key ${key}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`fal polling failed (${response.status}).`);
  return (await response.json()) as JsonObject;
}

function extractStatusState(payload: JsonObject): string {
  return String(payload.status ?? payload.state ?? payload.request_status ?? "").toLowerCase();
}

function extractQueuePosition(payload: JsonObject): number | null {
  const value = payload.queue_position;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function submitFluxJob(
  prompt: string,
  styleHint: string | undefined,
  aspectMode: GenerateBackdropBody["aspectMode"],
  key: string,
): Promise<PendingFalJob | CompletedFalJob> {
  const endpoint = `${QUEUE_BASE}${FAL_FLUX_MODEL}`;
  const finalPrompt = styleHint ? `${prompt}\nStyle: ${styleHint}` : prompt;

  const primaryPayload: JsonObject = {
    prompt: finalPrompt,
    num_images: 1,
    image_size: resolveImageSize(aspectMode),
  };

  let enqueue = await falRequest(endpoint, key, primaryPayload);
  if (!enqueue.ok) enqueue = await falRequest(endpoint, key, { prompt: finalPrompt });
  if (!enqueue.ok) {
    const message =
      typeof enqueue.data.detail === "string"
        ? enqueue.data.detail
        : `fal request failed (${enqueue.status}).`;
    throw new Error(message);
  }

  const directImages = extractImages(enqueue.data);
  if (directImages.length > 0) {
    return completeImages(directImages, FAL_FLUX_MODEL);
  }

  const requestId =
    (enqueue.data.request_id as string | undefined) ??
    (enqueue.data.id as string | undefined);
  if (!requestId) throw new Error("fal response did not include a request id.");

  const statusUrl = normalizeQueueUrl(
    enqueue.data.status_url as string | undefined,
    `${endpoint}/requests/${requestId}/status`,
  );
  const responseUrl = normalizeQueueUrl(
    enqueue.data.response_url as string | undefined,
    `${endpoint}/requests/${requestId}`,
  );

  return { pending: true, requestId, statusUrl, responseUrl, queuePosition: extractQueuePosition(enqueue.data), model: FAL_FLUX_MODEL };
}

async function submitDirectionJob(
  prompt: string,
  count: number,
  key: string,
): Promise<PendingFalJob | CompletedFalJob> {
  const endpoint = `${QUEUE_BASE}${FAL_DIRECTION_MODEL}`;
  const enqueue = await falRequest(endpoint, key, {
    prompt,
    num_images: count,
    image_size: { width: FAL_BACKDROP_WIDTH, height: FAL_BACKDROP_HEIGHT },
    output_format: 'jpeg',
    enable_safety_checker: true,
  });
  if (!enqueue.ok) {
    const message = typeof enqueue.data.detail === 'string'
      ? enqueue.data.detail
      : `fal direction request failed (${enqueue.status}).`;
    throw new Error(message);
  }
  const directImages = extractImages(enqueue.data);
  if (directImages.length > 0) return completeImages(directImages, FAL_DIRECTION_MODEL);
  return pendingFromEnqueue(enqueue.data, endpoint, FAL_DIRECTION_MODEL);
}

async function submitMasterJob(
  sourceImageUrl: string,
  key: string,
): Promise<PendingFalJob | CompletedFalJob> {
  const endpoint = `${QUEUE_BASE}${FAL_MASTER_MODEL}`;
  const enqueue = await falRequest(endpoint, key, {
    image_url: sourceImageUrl,
    model: 'High Fidelity V3',
    upscale_factor: 4,
    output_format: 'jpeg',
    subject_detection: 'Background',
    face_enhancement: false,
  });
  if (!enqueue.ok) {
    const message = typeof enqueue.data.detail === 'string'
      ? enqueue.data.detail
      : `fal production-master request failed (${enqueue.status}).`;
    throw new Error(message);
  }
  const directImages = extractImages(enqueue.data);
  if (directImages.length > 0) return completeImages(directImages, FAL_MASTER_MODEL);
  return pendingFromEnqueue(enqueue.data, endpoint, FAL_MASTER_MODEL);
}

function pendingFromEnqueue(data: JsonObject, endpoint: string, model: string): PendingFalJob {
  const requestId = (data.request_id as string | undefined) ?? (data.id as string | undefined);
  if (!requestId) throw new Error('fal response did not include a request id.');
  return {
    pending: true,
    requestId,
    statusUrl: normalizeQueueUrl(data.status_url as string | undefined, `${endpoint}/requests/${requestId}/status`),
    responseUrl: normalizeQueueUrl(data.response_url as string | undefined, `${endpoint}/requests/${requestId}`),
    queuePosition: extractQueuePosition(data),
    model,
  };
}

async function submitIdeogramJob(
  prompt: string,
  styleType: string | undefined,
  key: string,
): Promise<PendingFalJob | CompletedFalJob> {
  const endpoint = `${QUEUE_BASE}${FAL_IDEOGRAM_MODEL}`;

  const payload: JsonObject = {
    prompt,
    style_type: styleType ?? "REALISTIC",
    aspect_ratio: FAL_BACKDROP_ASPECT,
    rendering_speed: "BALANCED",
  };

  const enqueue = await falRequest(endpoint, key, payload);
  if (!enqueue.ok) {
    const message =
      typeof enqueue.data.detail === "string"
        ? enqueue.data.detail
        : `fal Ideogram request failed (${enqueue.status}).`;
    throw new Error(message);
  }

  const directImages = extractImages(enqueue.data);
  if (directImages.length > 0) {
    return completeImages(directImages, FAL_IDEOGRAM_MODEL);
  }

  const requestId =
    (enqueue.data.request_id as string | undefined) ??
    (enqueue.data.id as string | undefined);
  if (!requestId) throw new Error("fal Ideogram response did not include a request id.");

  const statusUrl = normalizeQueueUrl(
    enqueue.data.status_url as string | undefined,
    `${endpoint}/requests/${requestId}/status`,
  );
  const responseUrl = normalizeQueueUrl(
    enqueue.data.response_url as string | undefined,
    `${endpoint}/requests/${requestId}`,
  );

  return { pending: true, requestId, statusUrl, responseUrl, queuePosition: extractQueuePosition(enqueue.data), model: FAL_IDEOGRAM_MODEL };
}

async function pollFalJob(
  key: string,
  statusUrl: string,
  responseUrl: string,
  model: string,
): Promise<PendingFalJob | CompletedFalJob> {
  const statusData = await fetchJson(statusUrl, key);
  const state = extractStatusState(statusData);

  if (state.includes("fail") || state.includes("error")) {
    throw new Error("fal generation failed.");
  }

  const statusImages = extractImages(statusData);
  if (statusImages.length > 0) {
    return completeImages(statusImages, model);
  }

  if (state.includes("complete") || state.includes("succeed") || state === "done") {
    const resultData = await fetchJson(responseUrl, key);
    const images = extractImages(resultData);
    if (images.length === 0) throw new Error("fal generation completed but no image URL was returned.");
    return completeImages(images, model);
  }

  return {
    pending: true,
    requestId: (statusData.request_id as string | undefined) ?? statusUrl.split("/").at(-2) ?? "unknown",
    statusUrl,
    responseUrl,
    queuePosition: extractQueuePosition(statusData),
    model,
  };
}

function getFalKey(): string {
  const falKey = process.env.FAL_KEY;
  if (!falKey) throw new Error("AI image generation service is not configured.");
  return falKey;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`fal:poll:${ip}`, 180, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached for polling. Please slow down and retry." },
      { status: 429 },
    );
  }

  try {
    const falKey = getFalKey();
    const statusUrlRaw = request.nextUrl.searchParams.get("statusUrl") ?? undefined;
    const responseUrlRaw = request.nextUrl.searchParams.get("responseUrl") ?? undefined;
    const modelParam = request.nextUrl.searchParams.get("model") ?? FAL_FLUX_MODEL;

    if (!statusUrlRaw) {
      return NextResponse.json({ error: "Missing statusUrl query parameter." }, { status: 400 });
    }

    const statusUrl = normalizeQueueUrl(statusUrlRaw, statusUrlRaw);
    const responseUrl = normalizeQueueUrl(responseUrlRaw, statusUrl.replace(/\/status$/, ""));

    const result = await pollFalJob(falKey, statusUrl, responseUrl, modelParam);
    return NextResponse.json(result, { status: result.pending ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backdrop polling failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`fal:create:${ip}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit reached for generation. Wait a minute and retry." },
      { status: 429 },
    );
  }

  try {
    const falKey = getFalKey();
    const body = (await request.json()) as GenerateBackdropBody;
    const prompt = (body.prompt ?? "").trim();
    const mode = body.mode ?? 'manual';
    if (mode !== 'master' && !prompt) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    if (prompt.length > 700) {
      return NextResponse.json({ error: "Prompt is too long. Keep it under 700 characters." }, { status: 400 });
    }

    let enqueue: PendingFalJob | CompletedFalJob;
    if (mode === 'directions') {
      const count = body.count ?? 3;
      if (!Number.isInteger(count) || count < 1 || count > 4) {
        return NextResponse.json({ error: 'Direction count must be between 1 and 4.' }, { status: 400 });
      }
      enqueue = await submitDirectionJob(prompt, count, falKey);
    } else if (mode === 'master') {
      const sourceImageUrl = (body.sourceImageUrl ?? '').trim();
      if (!sourceImageUrl.startsWith('https://')) {
        return NextResponse.json({ error: 'A secure source image URL is required.' }, { status: 400 });
      }
      enqueue = await submitMasterJob(sourceImageUrl, falKey);
    } else if ((body.model ?? 'flux') === "ideogram") {
      enqueue = await submitIdeogramJob(prompt, body.styleType, falKey);
    } else {
      enqueue = await submitFluxJob(prompt, body.styleHint?.trim(), body.aspectMode ?? "portrait", falKey);
    }

    if (!enqueue.pending) return NextResponse.json(enqueue, { status: 200 });

    let latest = enqueue;
    for (let attempt = 0; attempt < MAX_SYNC_POLLS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      const polled = await pollFalJob(falKey, latest.statusUrl, latest.responseUrl, latest.model);
      if (!polled.pending) return NextResponse.json(polled, { status: 200 });
      latest = polled;
    }

    return NextResponse.json(latest, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backdrop generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
