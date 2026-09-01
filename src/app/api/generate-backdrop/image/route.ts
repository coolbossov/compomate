import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, requestIp } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const ip = requestIp(request.headers);
  const limit = await checkRateLimit(`fal:image:${ip}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Image download rate limit reached. Wait a minute and retry.' }, { status: 429 });
  }

  const sourceUrl = request.nextUrl.searchParams.get('url') ?? '';
  if (!isAllowedImageUrl(sourceUrl)) {
    return NextResponse.json({ error: 'Generated image URL is not allowed.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(sourceUrl, {
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'image/*' },
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: `Generated image download failed (${upstream.status}).` }, { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Generated image provider returned an invalid file type.' }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Generated image download failed.' }, { status: 502 });
  }
}
