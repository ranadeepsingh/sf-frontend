/**
 * Thin fetch wrapper around the Contacts API.
 *
 * The base URL is resolved once, in this order:
 *   1. `API_BASE_URL`            — server-only, never shipped to the browser.
 *   2. `NEXT_PUBLIC_API_BASE_URL` — for the rare call made from a client component.
 *   3. `""`                       — relative, i.e. same-origin behind a proxy/CDN.
 *
 * Data access happens on the server (see `src/lib/contacts/api.ts`), so the
 * browser never needs to know where the backend lives and CORS never applies.
 */

export const apiBaseUrl =
  process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Give up on a request rather than holding a render open forever. A backend that
 * accepts the connection and then stalls is indistinguishable from one that is
 * down, so both end up as `ApiUnreachableError`.
 */
export const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 8000);

/** A non-2xx response. `body` is the raw text so callers can parse it themselves. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** The parsed JSON body, or `undefined` if it was not JSON. */
  json<T = unknown>(): T | undefined {
    try {
      return JSON.parse(this.body) as T;
    } catch {
      return undefined;
    }
  }
}

/**
 * Did the request abort on our timeout? Runtimes disagree on how they surface it
 * — a `TimeoutError`, or an `AbortError` wrapping one — and we only ever abort
 * for the timeout, so either shape counts. Duck-typed rather than `instanceof`,
 * because a `DOMException` raised in another realm fails that check.
 */
function isTimeout(cause: unknown): boolean {
  const error = cause as { name?: unknown; cause?: { name?: unknown } } | null;
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    error?.cause?.name === "TimeoutError"
  );
}

/** The backend could not be reached at all (down, wrong port, DNS, TLS…). */
export class ApiUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, cause: unknown) {
    super(
      isTimeout(cause)
        ? `The API at ${url} did not respond within ${API_TIMEOUT_MS}ms`
        : `Could not reach the API at ${url}`,
    );
    this.name = "ApiUnreachableError";
    this.url = url;
    this.cause = cause;
  }
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Bodies that carry their own `Content-Type`. `fetch` derives it from the body
 * itself — and for `FormData` that header also carries the multipart boundary,
 * so setting `application/json` here would corrupt every upload.
 */
function bodySetsOwnContentType(body: BodyInit): boolean {
  return (
    (typeof FormData !== "undefined" && body instanceof FormData) ||
    (typeof Blob !== "undefined" && body instanceof Blob) ||
    (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) ||
    (typeof ReadableStream !== "undefined" && body instanceof ReadableStream)
  );
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !headers.has("Content-Type") &&
    !bodySetsOwnContentType(init.body)
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const url = apiUrl(path);
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      ...init,
      headers,
    });
  } catch (cause) {
    throw new ApiUnreachableError(url, cause);
  }
}

/** Request helper that throws `ApiError` on a non-2xx and parses JSON on success. */
export async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => ""));
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
