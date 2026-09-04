/**
 * Yields to the event loop for one macrotask turn. Needed because a Worker only
 * processes incoming postMessage calls (including Comlink's `cancel()` RPC) between
 * synchronous stretches of JS — a tight loop that never awaits anything can run to
 * completion even after the caller aborts it, because the abort message itself never
 * gets a chance to be delivered. Callers doing bounded chunks of synchronous work
 * (per-frame render/encode loops) should await this periodically so cancellation is
 * actually observable mid-operation, not just before it starts or after it finishes.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
