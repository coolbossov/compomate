import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/supabase-admin', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('@/lib/server/session-cookie', () => ({
  getOrCreateSessionId: vi.fn().mockResolvedValue({ sessionId: 'owned-session', isNew: false }),
  applySessionCookie: vi.fn(),
}));
vi.mock('@/lib/server/r2', () => ({ getPresignedDownloadUrl: vi.fn() }));
vi.mock('@/lib/server/r2-ownership', () => ({ verifyR2ObjectOwnership: vi.fn() }));

import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrCreateSessionId, applySessionCookie } from '@/lib/server/session-cookie';
import { getPresignedDownloadUrl } from '@/lib/server/r2';
import { verifyR2ObjectOwnership } from '@/lib/server/r2-ownership';
import { ErrorCodes } from '@/lib/server/error-codes';
import { GET } from './route';

const jobId = '2de76c68-529c-4f5c-b1af-612c67e14bad';
const zipKey = `batch-zips/${jobId}.zip`;
const job = {
  id: jobId, status: 'done', total: 1, done_count: 1, failed_count: 0,
  download_url: 'https://storage.test/old-signature?expires=3600', error: null,
  items: [{ id: 'fixture-pair', status: 'done' }],
};
function mockQuery(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const sessionEq = vi.fn().mockReturnValue({ maybeSingle });
  const idEq = vi.fn().mockReturnValue({ eq: sessionEq });
  const select = vi.fn().mockReturnValue({ eq: idEq });
  const client = { from: vi.fn().mockReturnValue({ select }) };
  vi.mocked(getSupabaseAdminClient).mockReturnValue(client as never);
  return { client, idEq, sessionEq, maybeSingle };
}
const read = (id = jobId) => GET(
  new NextRequest(`http://localhost/api/batch-export/${id}/status`),
  { params: Promise.resolve({ jobId: id }) },
);

describe('GET existing batch status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getOrCreateSessionId).mockResolvedValue({ sessionId: 'owned-session', isNew: false });
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(true);
    vi.mocked(getPresignedDownloadUrl).mockResolvedValue('https://storage.test/fresh-signature');
    mockQuery({ data: job, error: null });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renews the canonical session-owned ZIP when first observed more than an hour later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T02:00:01Z'));
    const query = mockQuery({ data: job, error: null });
    vi.mocked(getPresignedDownloadUrl).mockImplementation(async (key) => `https://storage.test/${key}?signedAt=${Date.now()}`);
    const response = await read();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(query.idEq).toHaveBeenCalledWith('id', jobId);
    expect(query.sessionEq).toHaveBeenCalledWith('session_id', 'owned-session');
    expect(verifyR2ObjectOwnership).toHaveBeenCalledWith(zipKey, 'owned-session');
    expect(getPresignedDownloadUrl).toHaveBeenCalledExactlyOnceWith(zipKey, 3600);
    expect(body.download_url).toContain(`signedAt=${Date.now()}`);
    expect(body.download_url).not.toBe(job.download_url);
    expect(body).toMatchObject({ id: jobId, status: 'done', done_count: 1, items: job.items });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(query.client.from).toHaveBeenCalledExactlyOnceWith('compomate_batch_jobs');
  });

  it.each(['pending', 'running', 'failed'])('does not renew a %s job', async (status) => {
    mockQuery({ data: { ...job, status, download_url: null }, error: null });
    expect((await read()).status).toBe(200);
    expect(verifyR2ObjectOwnership).not.toHaveBeenCalled();
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('reports confirmed missing ownership as unavailable without signing or extending retention', async () => {
    vi.mocked(verifyR2ObjectOwnership).mockResolvedValue(false);
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: jobId, status: 'done', download_url: null, error: expect.stringContaining('no longer available') });
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it.each(['ownership', 'signing'])('keeps %s failures retryable', async (failure) => {
    if (failure === 'ownership') vi.mocked(verifyR2ObjectOwnership).mockRejectedValueOnce(new Error('private database detail'));
    else vi.mocked(getPresignedDownloadUrl).mockRejectedValueOnce(new Error('private storage credential detail'));
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: ErrorCodes.BATCH_STATUS_UNAVAILABLE });
  });

  it('returns retryable 503 for query errors, even when data is absent', async () => {
    mockQuery({ data: null, error: { code: 'XX000', message: 'private detail' } });
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: ErrorCodes.BATCH_STATUS_UNAVAILABLE });
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('uses 404 only for a successful query confirming no row in the current session', async () => {
    vi.mocked(getOrCreateSessionId).mockResolvedValue({ sessionId: 'different-session', isNew: true });
    const query = mockQuery({ data: null, error: null });
    const response = await read();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: ErrorCodes.BATCH_NOT_FOUND });
    expect(query.sessionEq).toHaveBeenCalledWith('session_id', 'different-session');
    expect(applySessionCookie).toHaveBeenCalledWith(response, 'different-session', true);
    expect(verifyR2ObjectOwnership).not.toHaveBeenCalled();
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns retryable 503 for thrown query/transport failures', async () => {
    const query = mockQuery({ data: null, error: null });
    query.maybeSingle.mockRejectedValueOnce(new Error('transport detail'));
    expect((await read()).status).toBe(503);
  });

  it('never signs an arbitrary persisted download URL or mismatched job identity', async () => {
    mockQuery({ data: { ...job, download_url: 'https://untrusted.invalid/private-key' }, error: null });
    expect((await read()).status).toBe(200);
    expect(getPresignedDownloadUrl).toHaveBeenCalledExactlyOnceWith(zipKey, 3600);
    vi.mocked(getPresignedDownloadUrl).mockClear();
    mockQuery({ data: { ...job, id: 'another-job' }, error: null });
    expect((await read()).status).toBe(503);
    expect(getPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});
