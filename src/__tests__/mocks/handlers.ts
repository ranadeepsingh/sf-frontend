import { http, HttpResponse } from "msw";
import { File as NativeFile } from "node:buffer";
import { apiBaseUrl } from "@/lib/apiClient";
import type { Contact, ContactPage } from "@/lib/contacts/types";

/** Prefix a path with the configured API base so handlers match apiClient URLs. */
export function api(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  const first_name = overrides.first_name ?? "Ada";
  const last_name = overrides.last_name ?? "Lovelace";

  return {
    id: 1,
    first_name,
    last_name,
    email: "ada@example.com",
    phone: "+1-415-555-0101",
    company: "Analytical Engines",
    job_title: "Mathematician",
    address: null,
    city: "San Francisco",
    state: "CA",
    postal_code: null,
    country: "USA",
    notes: null,
    photo_url: null,
    created_at: "2026-08-19T17:04:53.743932Z",
    updated_at: "2026-08-19T17:04:53.743936Z",
    full_name: `${first_name} ${last_name}`,
    ...overrides,
  };
}

export function makePage(items: Contact[], total = items.length): ContactPage {
  return { items, total, limit: 25, offset: 0 };
}

export const CONTACTS: Contact[] = [
  makeContact(),
  makeContact({
    id: 2,
    first_name: "Grace",
    last_name: "Hopper",
    email: "grace@example.com",
    company: "US Navy",
    job_title: "Rear Admiral",
    full_name: "Grace Hopper",
  }),
];

/** One-pixel PNG, used wherever a test needs real image bytes. */
export const TEST_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (character) => character.charCodeAt(0),
);

export function makePhotoFile(
  name = "avatar.png",
  type = "image/png",
  bytes: Uint8Array = TEST_PNG_BYTES,
): File {
  return new NativeFile([bytes], name, { type }) as unknown as File;
}

/**
 * The contact JSON models forbid extra inputs, exactly like the API's Pydantic
 * models. Any image-shaped key in a contact body is the bug that broke the first
 * attempt at this feature, so the mock fails the same way the real API does.
 */
const CONTACT_KEYS = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "company",
  "job_title",
  "address",
  "city",
  "state",
  "postal_code",
  "country",
  "notes",
]);

export function extraForbidden(body: Record<string, unknown>) {
  const extra = Object.keys(body).filter((key) => !CONTACT_KEYS.has(key));
  if (!extra.length) return null;
  return HttpResponse.json(
    {
      detail: extra.map((key) => ({
        type: "extra_forbidden",
        loc: ["body", key],
        msg: "Extra inputs are not permitted",
        input: body[key],
      })),
    },
    { status: 422 },
  );
}

export const handlers = [
  http.get(api("/health"), () =>
    HttpResponse.json({ status: "ok", database: "sqlite", contacts: 2 }),
  ),

  http.get(api("/api/v1/contacts"), ({ request }) => {
    const search = new URL(request.url).searchParams.get("search")?.toLowerCase();
    const items = search
      ? CONTACTS.filter((contact) =>
          `${contact.full_name} ${contact.email} ${contact.company ?? ""}`
            .toLowerCase()
            .includes(search),
        )
      : CONTACTS;

    return HttpResponse.json(makePage(items));
  }),

  http.get(api("/api/v1/contacts/:id"), ({ params }) => {
    const contact = CONTACTS.find((c) => c.id === Number(params.id));
    return contact
      ? HttpResponse.json(contact)
      : HttpResponse.json(
          { detail: `Contact ${params.id} not found` },
          { status: 404 },
        );
  }),

  http.post(api("/api/v1/contacts"), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return (
      extraForbidden(body) ??
      HttpResponse.json(makeContact({ ...body, id: 99 }), { status: 201 })
    );
  }),

  http.put(api("/api/v1/contacts/:id"), async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return (
      extraForbidden(body) ??
      HttpResponse.json(makeContact({ ...body, id: Number(params.id) }))
    );
  }),

  http.delete(api("/api/v1/contacts/:id"), () => new HttpResponse(null, { status: 204 })),

  http.put(api("/api/v1/contacts/:id/photo"), async ({ params }) =>
    HttpResponse.json(
      makeContact({
        id: Number(params.id),
        photo_url: `/api/v1/contacts/${params.id}/photo`,
      }),
    ),
  ),

  http.delete(api("/api/v1/contacts/:id/photo"), async ({ params }) =>
    HttpResponse.json(makeContact({ id: Number(params.id), photo_url: null })),
  ),

  http.get(api("/api/v1/contacts/:id/photo"), () =>
    HttpResponse.arrayBuffer(TEST_PNG_BYTES.slice().buffer as ArrayBuffer, {
      headers: { "Content-Type": "image/png", ETag: '"abc123"' },
    }),
  ),
];
