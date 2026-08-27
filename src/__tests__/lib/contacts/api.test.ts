import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import {
  TEST_PNG_BYTES,
  api,
  makeContact,
  makePhotoFile,
} from "../../mocks/handlers";
import { ApiError } from "@/lib/apiClient";
import {
  apiErrorMessage,
  contactPhotoPath,
  createContact,
  deleteContact,
  deleteContactPhoto,
  fetchContactPhoto,
  getContact,
  getHealth,
  listContacts,
  toFieldErrors,
  uploadContactPhoto,
} from "@/lib/contacts/api";
import type { ContactInput } from "@/lib/contacts/types";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const INPUT: ContactInput = {
  first_name: "Grace",
  last_name: "Hopper",
  email: "grace@example.com",
  phone: null,
  company: null,
  job_title: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  notes: null,
};

describe("listContacts", () => {
  it("returns the page envelope", async () => {
    const page = await listContacts();
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(2);
  });

  it("forwards search, paging and sorting as query params", async () => {
    let seen: URLSearchParams | undefined;
    server.use(
      http.get(api("/api/v1/contacts"), ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], total: 0, limit: 10, offset: 20 });
      }),
    );

    await listContacts({
      search: "ada",
      limit: 10,
      offset: 20,
      sortBy: "email",
      order: "desc",
    });

    expect(Object.fromEntries(seen!)).toEqual({
      search: "ada",
      limit: "10",
      offset: "20",
      sort_by: "email",
      order: "desc",
    });
  });
});

describe("getContact", () => {
  it("returns the contact", async () => {
    await expect(getContact(1)).resolves.toMatchObject({ id: 1 });
  });

  it("returns null on 404 rather than throwing", async () => {
    await expect(getContact(4242)).resolves.toBeNull();
  });

  it("still throws on other failures", async () => {
    server.use(
      http.get(api("/api/v1/contacts/:id"), () =>
        HttpResponse.json({ detail: "nope" }, { status: 500 }),
      ),
    );

    await expect(getContact(1)).rejects.toBeInstanceOf(ApiError);
  });
});

describe("createContact", () => {
  it("posts the input and returns the stored contact", async () => {
    await expect(createContact(INPUT)).resolves.toMatchObject({ id: 99 });
  });

  it("surfaces a 409 as an ApiError", async () => {
    server.use(
      http.post(api("/api/v1/contacts"), () =>
        HttpResponse.json(
          { detail: "Email grace@example.com is already in use" },
          { status: 409 },
        ),
      ),
    );

    await expect(createContact(INPUT)).rejects.toMatchObject({ status: 409 });
  });
});

describe("deleteContact", () => {
  it("resolves on 204", async () => {
    await expect(deleteContact(1)).resolves.toBeUndefined();
  });

  it("throws on 404", async () => {
    server.use(
      http.delete(api("/api/v1/contacts/:id"), () =>
        HttpResponse.json({ detail: "Contact 9 not found" }, { status: 404 }),
      ),
    );

    await expect(deleteContact(9)).rejects.toMatchObject({ status: 404 });
  });
});

describe("getHealth", () => {
  it("returns the probe result", async () => {
    await expect(getHealth()).resolves.toMatchObject({ status: "ok" });
  });

  it("returns null instead of throwing when the probe fails", async () => {
    server.use(http.get(api("/health"), () => HttpResponse.error()));
    await expect(getHealth()).resolves.toBeNull();
  });
});

describe("error translation", () => {
  it("reads the API's detail string", () => {
    const error = new ApiError(409, JSON.stringify({ detail: "taken" }));
    expect(apiErrorMessage(error, "fallback")).toBe("taken");
  });

  it("falls back when the body has no usable detail", () => {
    expect(apiErrorMessage(new ApiError(500, "boom"), "fallback")).toBe(
      "fallback",
    );
  });

  it("maps a 422 body onto field names", () => {
    const error = new ApiError(
      422,
      JSON.stringify({
        detail: [
          { loc: ["body", "email"], msg: "value is not a valid email address" },
          { loc: ["body", "first_name"], msg: "String should have at least 1 character" },
        ],
      }),
    );

    expect(toFieldErrors(error)).toEqual({
      email: "value is not a valid email address",
      first_name: "String should have at least 1 character",
    });
  });

  it("returns nothing for a non-validation body", () => {
    expect(toFieldErrors(new ApiError(500, "boom"))).toEqual({});
  });
});

describe("contact photos", () => {
  it("never puts an image key in the contact JSON body", async () => {
    // The mock rejects extra inputs the way the API's Pydantic models do, so a
    // regression here fails loudly instead of silently dropping the photo.
    let body: unknown;
    server.use(
      http.post(api("/api/v1/contacts"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeContact(), { status: 201 });
      }),
    );

    await createContact(INPUT);

    expect(Object.keys(body as object)).not.toContain("photo");
    expect(Object.keys(body as object)).not.toContain("photo_url");
  });

  it("uploads a file as multipart, under the agreed part name", async () => {
    let contentType: string | null = null;
    let part: { name: string; type: string; size: number } | null = null;
    let method: string | undefined;
    server.use(
      http.put(api("/api/v1/contacts/:id/photo"), async ({ request }) => {
        method = request.method;
        contentType = request.headers.get("Content-Type");
        const value = (await request.formData()).get("file");
        if (value === null || typeof value === "string") {
          throw new Error("Expected a multipart file");
        }
        part = { name: value.name, type: value.type, size: value.size };
        return HttpResponse.json(
          makeContact({ photo_url: "/api/v1/contacts/1/photo" }),
        );
      }),
    );

    const saved = await uploadContactPhoto(1, makePhotoFile("rana.png"));

    expect(method).toBe("PUT");
    // The boundary must survive: forcing application/json here corrupts uploads.
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(part).toEqual({
      name: "rana.png",
      type: "image/png",
      size: TEST_PNG_BYTES.length,
    });
    expect(saved.photo_url).toBe("/api/v1/contacts/1/photo");
  });

  it("gives an unnamed blob a filename so the API always gets one", async () => {
    let name: string | undefined;
    server.use(
      http.put(api("/api/v1/contacts/:id/photo"), async ({ request }) => {
        name = ((await request.formData()).get("file") as File).name;
        return HttpResponse.json(makeContact());
      }),
    );

    await uploadContactPhoto(1, makePhotoFile("", "image/png"));

    expect(name).toBe("photo");
  });

  it("surfaces a rejected upload as an ApiError", async () => {
    server.use(
      http.put(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.json({ detail: "Photo must be smaller." }, { status: 422 }),
      ),
    );

    await expect(uploadContactPhoto(1, makePhotoFile())).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("deletes a photo", async () => {
    let method: string | undefined;
    server.use(
      http.delete(api("/api/v1/contacts/:id/photo"), ({ request }) => {
        method = request.method;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(deleteContactPhoto(1)).resolves.toBeUndefined();
    expect(method).toBe("DELETE");
  });

  it("treats deleting a photo that is not there as success", async () => {
    server.use(
      http.delete(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.json({ detail: "No photo" }, { status: 404 }),
      ),
    );

    await expect(deleteContactPhoto(1)).resolves.toBeUndefined();
  });

  it("still throws when the API fails for a real reason", async () => {
    server.use(
      http.delete(api("/api/v1/contacts/:id/photo"), () =>
        HttpResponse.json({ detail: "boom" }, { status: 500 }),
      ),
    );

    await expect(deleteContactPhoto(1)).rejects.toBeInstanceOf(ApiError);
  });

  it("returns the upstream response untouched for the proxy route", async () => {
    const res = await fetchContactPhoto(1);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect((await res.arrayBuffer()).byteLength).toBe(TEST_PNG_BYTES.length);
  });

  it("builds the photo path from the contacts path", () => {
    expect(contactPhotoPath(42)).toBe("/api/v1/contacts/42/photo");
  });
});
