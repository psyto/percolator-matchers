/**
 * Exponential backoff with jitter for transient network failures.
 *
 * delay = min(baseDelay * 2^attempt, maxDelay) + random jitter
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "onRetry">> = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 15_000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_OPTIONS.maxAttempts;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts - 1) break;

      const exponentialDelay = baseDelayMs * 2 ** attempt;
      const jitter = Math.random() * baseDelayMs;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      opts.onRetry?.(err, attempt + 1, delay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
