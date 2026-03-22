import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { applySessionCookie, getOrCreateSessionId } from "@/lib/server/session-cookie";
import { ErrorCodes, HTTP_STATUS } from "@/lib/server/error-codes";
import { DB_TABLES } from "@/lib/constants";

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
      .single();

    if (error || !data) {
      return withSessionCookie(
        NextResponse.json(
          { error: ErrorCodes.BATCH_NOT_FOUND },
          { status: HTTP_STATUS[ErrorCodes.BATCH_NOT_FOUND] },
        ),
      );
    }

    return withSessionCookie(
      NextResponse.json({
        id: data.id as string,
        status: data.status as string,
        total: data.total as number,
        done_count: data.done_count as number,
        failed_count: data.failed_count as number,
        download_url: data.download_url as string | null,
        error: data.error as string | null,
        items: data.items,
      }),
    );
  } catch {
    return withSessionCookie(
      NextResponse.json(
        { error: ErrorCodes.BATCH_NOT_FOUND },
        { status: HTTP_STATUS[ErrorCodes.BATCH_NOT_FOUND] },
      ),
    );
  }
}
