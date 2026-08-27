import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { TEST_PNG_BYTES, api } from "../../mocks/handlers";
import { GET } from "@/app/api/contacts/[id]/photo/route";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function call(id: string) {
  return GET(new Request(`http://localhost/api/contacts/${id}/photo`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/contacts/[id]/photo", () => {
  it("streams the image back to the browser", async () => {
    const res = await call("1");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect((await res.arrayBuffer()).byteLength).toBe(TEST_PNG_BYTES.length);
  });

  it("passes the upstream ETag through so the browser can revalidate cheaply", async () => {
    const res = await call("1");

    expect(res.headers.get("ETag")).toBe('"abc123"');
    expect(res.headers.get("Cache-Control")).toBe(
      "private, no-cache, must-revalidate",
    );
  });

  it("never lets a photo URL be cached by a shared cache", async () => {
    const res = await call("1");

    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each(["0", "-1", "abc", "1.5", "01", "1e3", " 1", "999999999999999999999"])(
    "404s on the invalid id %s",
    async (id) => {
      expect((await call(id)).status).toBe(404);
    },
  );

  it("404s when the contact has no photo", async () => {
    server.use(
      http.get(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.json({ detail: "No photo" }, { status: 404 }),
      ),
    );

    expect((await call("1")).status).toBe(404);
  });

  it("refuses to serve anything that is not an image", async () => {
    // An <img> URL that can return HTML is a content-injection vector.
    server.use(
      http.get(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.html("<script>alert(1)</script>"),
      ),
    );

    expect((await call("1")).status).toBe(404);
  });

  it("reports a 502 when the API cannot be reached", async () => {
    server.use(
      http.get(api("/api/v1/contacts/:id/photo"), () => HttpResponse.error()),
    );

    const res = await call("1");

    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports a 502 when the API returns an HTTP error", async () => {
    server.use(
      http.get(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.json({ detail: "Unavailable" }, { status: 503 }),
      ),
    );

    const res = await call("1");

    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
