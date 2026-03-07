// ============================================================
// CompoMate — Client-side R2 Uploader
// ============================================================
// Pure utility functions — NOT a React component.
// Uses XMLHttpRequest for upload progress tracking (fetch lacks this).

const PRESIGN_ENDPOINT = "/api/r2/presign";

type PresignResponse = {
  uploadUrl: string;
  key: string;
  downloadUrl: string;
};

type UploadResult = {
  key: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function requestPresignedUrl(
  filename: string,
  contentType: string,
  purpose: "subject" | "backdrop" | "export",
): Promise<PresignResponse> {
  const res = await fetch(PRESIGN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, contentType, purpose }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error ?? `Presign request failed with status ${res.status}`,
    );
  }

  return res.json() as Promise<PresignResponse>;
}

function uploadViaPut(
  uploadUrl: string,
  data: File | Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
    }

    xhr.addEventListener("load", () => {
      // R2 returns 200 for presigned PUTs
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed: HTTP ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("R2 upload network error")));
    xhr.addEventListener("abort", () => reject(new Error("R2 upload aborted")));

    xhr.send(data);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload a `File` directly to R2 via presigned PUT URL.
 * Bypasses Vercel's function size limits — the upload goes straight to R2.
 *
 * @returns `{ key, url }` — key for server-side access, url is a presigned GET URL.
 */
export async function uploadFileToR2(
  file: File,
  purpose: "subject" | "backdrop",
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const contentType = file.type || "application/octet-stream";

  // Step 1: Get presigned PUT URL from our API
  const { uploadUrl, key, downloadUrl } = await requestPresignedUrl(
    file.name,
    contentType,
    purpose,
  );

  // Step 2: PUT directly to R2 (XHR for progress)
  await uploadViaPut(uploadUrl, file, contentType, onProgress);

  return { key, url: downloadUrl };
}

/**
 * Upload a `Blob` (e.g. AI-generated backdrop saved as data URL) directly to R2.
 *
 * @returns `{ key, url }` — key for server-side access, url is a presigned GET URL.
 */
export async function uploadBlobToR2(
  blob: Blob,
  filename: string,
  purpose: "backdrop",
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const contentType = blob.type || "image/png";

  const { uploadUrl, key, downloadUrl } = await requestPresignedUrl(
    filename,
    contentType,
    purpose,
  );

  await uploadViaPut(uploadUrl, blob, contentType, onProgress);

  return { key, url: downloadUrl };
}
