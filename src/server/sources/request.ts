import { SourceError, type FetchLike } from "./types";
import type { SourceName } from "../../shared/contracts";

type RequestOptions = {
  source: SourceName;
  fetcher: FetchLike;
  input: RequestInfo | URL;
  init?: RequestInit;
  attempts?: number;
  timeoutMs?: number;
};

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const fetchWithRetry = async ({
  source,
  fetcher,
  input,
  init,
  attempts = 2,
  timeoutMs = 15_000,
}: RequestOptions): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts - 1) {
        throw new SourceError(source, `${source} request failed (${response.status})`, retryable);
      }
    } catch (error) {
      lastError = error;
      if (error instanceof SourceError && !error.retryable) throw error;
      if (attempt === attempts - 1) break;
    } finally {
      clearTimeout(timeout);
    }
    await wait(250 * 2 ** attempt);
  }
  if (lastError instanceof SourceError) throw lastError;
  throw new SourceError(source, `${source} request failed`, true);
};
