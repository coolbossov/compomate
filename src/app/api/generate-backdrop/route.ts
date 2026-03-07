import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, requestIp } from "@/lib/server/rate-limit";
import { FAL_FLUX_MODEL, FAL_IDEOGRAM_MODEL, FAL_BACKDROP_ASPECT } from "@/lib/constants";

export const runtime = "nodejs";

type GenerateBackdropBody = {
  prompt?: string;
  styleHint?: string;
  aspectMode?: "portrait" | "landscape" | "square";
  model?: "flux" | "ideogram";
  styleType?: string; // Ideogram: REALISTIC | DESIGN | RENDER_3D | ANIME
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
  dataUrl: string;
  sourceUrl: string;
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

function extractImageUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as JsonObject;

  const candidateArrays = [value.images, value.output, value.results];
  for (const candidateArray of candidateArrays) {
    if (Array.isArray(candidateArray)) {
      for (const item of candidateArray) {
        if (item && typeof item === "object") {
          const url = (item as JsonObject).url;
          if (typeof url === "string" && url.startsWith("http")) return url;
        }
      }
    }
  }

  const candidateObjects = [value.image, value.data];
  for (const candidate of candidateObjects) {
    if (candidate && typeof candidate === "object") {
      const direct = (candidate as JsonObject).url;
      if (typeof direct === "string" && direct.startsWith("http")) return direct;
      const nested = extractImageUrl(candidate);
      if (nested) return nested;
    }
  }

  return null;
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

async function fetchToDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Generated image download failed (${response.status}).`);
  const mimeType = response.headers.get("content-type") ?? "image/png";
  const binary = Buffer.from(await response.arrayBuffer());
  return `data:${mimeType};base64,${binary.toString("base64")}`;
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

  const directImage = extractImageUrl(enqueue.data);
  if (directImage) {
    return { pending: false, dataUrl: await fetchToDataUrl(directImage), sourceUrl: directImage, model: FAL_FLUX_MODEL };
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

  const directImage = extractImageUrl(enqueue.data);
  if (directImage) {
    return { pending: false, dataUrl: await fetchToDataUrl(directImage), sourceUrl: directImage, model: FAL_IDEOGRAM_MODEL };
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

  const statusImage = extractImageUrl(statusData);
  if (statusImage) {
    return { pending: false, dataUrl: await fetchToDataUrl(statusImage), sourceUrl: statusImage, model };
  }

  if (state.includes("complete") || state.includes("succeed") || state === "done") {
    const resultData = await fetchJson(responseUrl, key);
    const imageUrl = extractImageUrl(resultData);
    if (!imageUrl) throw new Error("fal generation completed but no image URL was returned.");
    return { pending: false, dataUrl: await fetchToDataUrl(imageUrl), sourceUrl: imageUrl, model };
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
  if (!falKey) throw new Error("FAL_KEY is missing. Add it to .env.local.");
  return falKey;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip = requestIp(request.headers);
  const limit = checkRateLimit(`fal:poll:${ip}`, 180, 60_000);
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
  const limit = checkRateLimit(`fal:create:${ip}`, 10, 60_000);
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
    if (!prompt) return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    if (prompt.length > 700) {
      return NextResponse.json({ error: "Prompt is too long. Keep it under 700 characters." }, { status: 400 });
    }

    const modelChoice = body.model ?? "flux";

    let enqueue: PendingFalJob | CompletedFalJob;
    if (modelChoice === "ideogram") {
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
