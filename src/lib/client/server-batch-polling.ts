export type ServerBatchStatus = {
  status: string;
  total: number;
  done_count: number;
  failed_count: number;
  download_url: string | null;
  error: string | null;
};

type Visibility = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;

/** Observe one existing export; this function never submits or restarts a job. */
export function pollServerBatchStatus({
  jobId,
  onStatus,
  onUnavailable,
  visibility = document,
  request = fetch,
}: {
  jobId: string;
  onStatus: (status: ServerBatchStatus) => void;
  onUnavailable: (status: number) => void;
  visibility?: Visibility;
  request?: typeof fetch;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let resumeImmediately = false;

  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer();
    visibility.removeEventListener('visibilitychange', onVisibilityChange);
    controller?.abort();
  };
  const schedule = (delay: number) => {
    if (!stopped && !visibility.hidden) timer = setTimeout(() => { void poll(); }, delay);
  };
  const poll = async () => {
    timer = undefined;
    if (stopped || visibility.hidden || controller) return;
    controller = new AbortController();
    try {
      const response = await request(`/api/batch-export/${encodeURIComponent(jobId)}/status`, {
        signal: controller.signal,
      });
      if (stopped) return;
      if ([401, 403, 404].includes(response.status)) {
        stop();
        onUnavailable(response.status);
        return;
      }
      if (!response.ok) return;
      const data = await response.json() as ServerBatchStatus;
      if (stopped) return;
      if (data.status === 'done' || data.status === 'failed') stop();
      onStatus(data);
    } catch {
      // Network, throttling and server errors retry observation of this same job.
    } finally {
      controller = undefined;
      const delay = resumeImmediately ? 0 : 3000;
      resumeImmediately = false;
      schedule(delay);
    }
  };
  function onVisibilityChange() {
    clearTimer();
    if (visibility.hidden || stopped) return;
    if (controller) resumeImmediately = true;
    else void poll();
  }

  visibility.addEventListener('visibilitychange', onVisibilityChange);
  schedule(3000);
  return stop;
}
