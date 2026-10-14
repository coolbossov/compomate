import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { applySessionCookie, getOrCreateSessionId } from "@/lib/server/session-cookie";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { DB_TABLES } from "@/lib/constants";
import { getPresignedDownloadUrl } from "@/lib/server/r2";
import { verifyR2ObjectOwnership } from "@/lib/server/r2-ownership";

export const runtime = "nodejs";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// GET /api/batch-export/[jobId]/status
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  let sessionState: { sessionId: string; isNew: boolean } | null = null;
  const withSessionCookie = (response: NextResponse): NextResponse => {
    response.headers.set("Cache-Control", "private, no-store");
    if (sessionState) {
      applySessionCookie(response, sessionState.sessionId, sessionState.isNew);
    }
    return response;
  };

  try {
    const { jobId } = await params;
    sessionState = await getOrCreateSessionId();

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.ENV_MISSING },
          { status: HTTP_STATUS[ErrorCodes.ENV_MISSING] },
        ),
      );
    }

    const { data, error } = await supabase
      .from(DB_TABLES.BATCH_JOBS)
      .select("id, status, total, done_count, failed_count, download_url, error, items")
      .eq("id", jobId)
      .eq("session_id", sessionState.sessionId)
      .maybeSingle();

    if (error) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.BATCH_STATUS_UNAVAILABLE },
          { status: HTTP_STATUS[ErrorCodes.BATCH_STATUS_UNAVAILABLE] },
        ),
      );
    }

    if (!data) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.BATCH_NOT_FOUND },
          { status: HTTP_STATUS[ErrorCodes.BATCH_NOT_FOUND] },
        ),
      );
    }

    let downloadUrl = data.download_url as string | null;
    let downloadError = data.error as string | null;
    if (data.status === "done" && downloadUrl) {
      // The start handler writes only this UUID-derived ZIP key. Never sign a
      // persisted URL or caller-supplied storage path; retain session ownership.
      if (data.id !== jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
        throw new Error("Invalid completed batch identity.");
      }
      const zipKey = `batch-zips/${jobId}.zip`;
      if (await verifyR2ObjectOwnership(zipKey, sessionState.sessionId)) {
        // Refresh an expired signature without extending temporary retention.
        // Signing does not prove physical existence or restore deleted objects.
        downloadUrl = await getPresignedDownloadUrl(zipKey, 3600);
      } else {
        downloadUrl = null;
        downloadError = "This export's temporary download is no longer available.";
      }
    }

    return withSessionCookie(
      NextResponse.json({
        id: data.id as string,
        status: data.status as string,
        total: data.total as number,
        done_count: data.done_count as number,
        failed_count: data.failed_count as number,
        download_url: downloadUrl,
        error: downloadError,
        items: data.items,
      }),
    );
  } catch {
    return withSessionCookie(
      NextResponse.json(
        { error: ErrorCodes.BATCH_STATUS_UNAVAILABLE },
        { status: HTTP_STATUS[ErrorCodes.BATCH_STATUS_UNAVAILABLE] },
      ),
    );
  }
}
