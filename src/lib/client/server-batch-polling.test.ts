import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollServerBatchStatus } from './server-batch-polling';

class Visibility extends EventTarget {
  hidden = false;
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
const running = {
  status: 'running', total: 4, done_count: 1, failed_count: 0,
  download_url: null, error: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('existing server batch observation', () => {
  let visibility: Visibility;
  let request: ReturnType<typeof vi.fn<typeof fetch>>;
  let onStatus: ReturnType<typeof vi.fn>;
  let onUnavailable: ReturnType<typeof vi.fn>;
  let stop: (() => void) | undefined;
  const start = (jobId = 'existing-job') => pollServerBatchStatus({
    jobId, visibility, request, onStatus, onUnavailable,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    visibility = new Visibility();
    request = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(running));
    onStatus = vi.fn();
    onUnavailable = vi.fn();
  });
  afterEach(() => { stop?.(); vi.useRealTimers(); });

  it('observes only the same job every 3 seconds while visible', async () => {
    stop = start();
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe('/api/batch-export/existing-job/status');
    expect(request.mock.calls[0][1]?.method).toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith(running);
    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([url]) => url === '/api/batch-export/existing-job/status')).toBe(true);
  });

  it('never overlaps slow status requests', async () => {
    const slow = deferred<Response>();
    request.mockReturnValueOnce(slow.promise);
    stop = start();
    await vi.advanceTimersByTimeAsync(12000);
    expect(request).toHaveBeenCalledOnce();
    slow.resolve(Response.json(running));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2999);
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not poll initially hidden, and immediately resumes the original job', async () => {
    visibility.hidden = true;
    stop = start('original-id');
    await vi.advanceTimersByTimeAsync(30000);
    expect(request).not.toHaveBeenCalled();
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe('/api/batch-export/original-id/status');
    visibility.setHidden(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(request).toHaveBeenCalledOnce();
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('waits for an in-flight request before refreshing on visibility return', async () => {
    const slow = deferred<Response>();
    request.mockReturnValueOnce(slow.promise);
    stop = start();
    await vi.advanceTimersByTimeAsync(3000);
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledOnce();
    slow.resolve(Response.json(running));
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])('stops observation on HTTP %s without resubmitting', async (status) => {
    request.mockResolvedValueOnce(new Response(null, { status }));
    stop = start();
    await vi.advanceTimersByTimeAsync(30000);
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledOnce();
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith(status);
    expect(onStatus).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['done', 'failed'])('reports terminal %s once and removes its listener', async (status) => {
    request.mockResolvedValueOnce(Response.json({ ...running, status }));
    stop = start();
    await vi.advanceTimersByTimeAsync(30000);
    visibility.setHidden(true);
    visibility.setHidden(false);
    expect(request).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledOnce();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries network errors, throttling, server errors and invalid JSON without restarting export', async () => {
    request.mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('{'));
    stop = start();
    await vi.advanceTimersByTimeAsync(15000);
    expect(request).toHaveBeenCalledTimes(5);
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(running);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(request.mock.calls.every(([url]) => url === '/api/batch-export/existing-job/status')).toBe(true);
  });

  it('cancels scheduled work and ignores visibility events after cleanup', async () => {
    stop = start();
    stop();
    stop();
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors cleanup called by a nonterminal status callback without rescheduling', async () => {
    const removeListener = vi.spyOn(visibility, 'removeEventListener');
    onStatus.mockImplementationOnce(() => { stop?.(); });
    stop = start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(running);
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledExactlyOnceWith('visibilitychange', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    visibility.setHidden(true);
    visibility.setHidden(false);
    await vi.advanceTimersByTimeAsync(30000);
    expect(request).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledOnce();
  });

  it('does not let delayed JSON trigger completion after cleanup', async () => {
    const body = deferred<typeof running>();
    const response = Response.json(running);
    vi.spyOn(response, 'json').mockReturnValueOnce(body.promise);
    request.mockResolvedValueOnce(response);
    stop = start();
    await vi.advanceTimersByTimeAsync(3000);
    stop();
    body.resolve({ ...running, status: 'done' });
    await vi.advanceTimersByTimeAsync(30000);
    expect(onStatus).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an old job and rejects its late response after job replacement or unmount', async () => {
    const oldResponse = deferred<Response>();
    request.mockReturnValueOnce(oldResponse.promise);
    const oldStop = start('old-job');
    await vi.advanceTimersByTimeAsync(3000);
    const oldSignal = request.mock.calls[0][1]?.signal;
    oldStop();
    expect(oldSignal?.aborted).toBe(true);
    stop = start('new-job');
    oldResponse.resolve(Response.json({ ...running, status: 'done' }));
    await vi.advanceTimersByTimeAsync(3000);
    expect(onStatus).toHaveBeenCalledExactlyOnceWith(running);
    expect(request.mock.calls[1][0]).toBe('/api/batch-export/new-job/status');
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
