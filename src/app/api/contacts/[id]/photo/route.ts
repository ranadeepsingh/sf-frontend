import { ApiError, ApiUnreachableError } from "@/lib/apiClient";
import { fetchContactPhoto } from "@/lib/contacts/api";

/**
 * Same-origin photo reader: `GET /api/contacts/{id}/photo`.
 *
 * Every other read in this app happens on the server so the API's location stays
 * private and CORS never applies — an `<img>` cannot do that on its own, so it
 * points here and this route does the server-side fetch. It also means the
 * browser only ever sees relative image URLs, which keeps the markup identical
 * across environments.
 *
 * The bytes are streamed, never buffered, so a 2 MiB photo costs no heap.
 */

export const dynamic = "force-dynamic";

const NOT_FOUND = new Response("Not found", {
  status: 404,
  headers: { "Cache-Control": "no-store" },
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = Number.parseInt((await params).id, 10);
  if (!Number.isInteger(id) || id < 1) return NOT_FOUND.clone();

  let upstream: Response;
  try {
    upstream = await fetchContactPhoto(id);
  } catch (error) {
    if (error instanceof ApiUnreachableError || error instanceof ApiError) {
      return new Response("Photo unavailable", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    throw error;
  }

  if (!upstream.ok || !upstream.body) return NOT_FOUND.clone();

  const contentType = upstream.headers.get("Content-Type") ?? "";
  // Never let the API talk this origin into serving HTML or a script from an
  // <img> URL; only real images may come back through here.
  if (!contentType.startsWith("image/")) return NOT_FOUND.clone();

  const headers = new Headers({
    "Content-Type": contentType,
    // Photos belong to one contact, so they are never shared-cacheable. The
    // browser may reuse the bytes but must revalidate, which is what makes a
    // replaced photo show up immediately.
    "Cache-Control": "private, no-cache, must-revalidate",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
  const etag = upstream.headers.get("ETag");
  if (etag) headers.set("ETag", etag);
  const length = upstream.headers.get("Content-Length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { status: 200, headers });
}
