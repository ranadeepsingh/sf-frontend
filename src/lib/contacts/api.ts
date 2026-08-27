import "server-only";

import { ApiError, apiFetch, apiJson } from "@/lib/apiClient";
import type {
  Contact,
  ContactInput,
  ContactPage,
  HealthResponse,
  SortField,
  SortOrder,
} from "./types";

/**
 * Server-side data access for the Contacts API.
 *
 * Everything here runs on the Next server (RSC render or server action), so the
 * backend URL stays private and the browser never makes a cross-origin request.
 */

const CONTACTS_PATH = "/api/v1/contacts";

export interface ListContactsParams {
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: SortField;
  order?: SortOrder;
}

export async function listContacts(
  params: ListContactsParams = {},
): Promise<ContactPage> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  if (params.sortBy) query.set("sort_by", params.sortBy);
  if (params.order) query.set("order", params.order);

  return apiJson<ContactPage>(`${CONTACTS_PATH}?${query}`, {
    cache: "no-store",
  });
}

/** Fetch one contact, or `null` when the API reports 404. */
export async function getContact(id: number): Promise<Contact | null> {
  try {
    return await apiJson<Contact>(`${CONTACTS_PATH}/${id}`, {
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createContact(input: ContactInput): Promise<Contact> {
  return apiJson<Contact>(CONTACTS_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Full replacement (`PUT`). The edit form submits every field, so omitted values
 * really should be cleared — which is exactly `PUT`'s contract here.
 */
export async function replaceContact(
  id: number,
  input: ContactInput,
): Promise<Contact> {
  return apiJson<Contact>(`${CONTACTS_PATH}/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** Partial update (`PATCH`) — only the keys present are written. */
export async function updateContact(
  id: number,
  patch: Partial<ContactInput>,
): Promise<Contact> {
  return apiJson<Contact>(`${CONTACTS_PATH}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteContact(id: number): Promise<void> {
  const res = await apiFetch(`${CONTACTS_PATH}/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => ""));
  }
}

/* ------------------------------------------------------------------ */
/* Photos — a sub-resource, not a contact field                        */
/* ------------------------------------------------------------------ */

/**
 * The photo endpoint, derived from the contacts path so it stays consistent with
 * the rest of the API surface. Override the last segment with
 * `CONTACT_PHOTO_SEGMENT`, and the multipart part name with
 * `CONTACT_PHOTO_FIELD`, if the API ever names them differently.
 *
 * Contract (see AGENTS.md):
 *   PUT    /api/v1/contacts/{id}/photo   multipart/form-data, part `file`
 *                                        -> 200 ContactRead (with `photo_url`)
 *   GET    /api/v1/contacts/{id}/photo   -> image bytes
 *   DELETE /api/v1/contacts/{id}/photo   -> 200/204, idempotent
 */
const PHOTO_SEGMENT = process.env.CONTACT_PHOTO_SEGMENT || "photo";
export const PHOTO_FIELD_NAME = process.env.CONTACT_PHOTO_FIELD || "file";

/** Uploads move real bytes; the read timeout is far too tight for them. */
export const PHOTO_UPLOAD_TIMEOUT_MS = Number(
  process.env.PHOTO_UPLOAD_TIMEOUT_MS ?? 30_000,
);

export function contactPhotoPath(id: number): string {
  return `${CONTACTS_PATH}/${id}/${PHOTO_SEGMENT}`;
}

/**
 * Create or replace a contact's photo.
 *
 * The `File` is streamed straight through as multipart — it is never read into a
 * string, base64-encoded, or copied into the contact JSON document.
 */
export async function uploadContactPhoto(
  id: number,
  file: File,
): Promise<Contact> {
  const body = new FormData();
  body.append(PHOTO_FIELD_NAME, file, file.name || "photo");

  return apiJson<Contact>(contactPhotoPath(id), {
    method: "PUT",
    body,
    signal: AbortSignal.timeout(PHOTO_UPLOAD_TIMEOUT_MS),
  });
}

/** Remove a contact's photo. Idempotent: a contact without one is not an error. */
export async function deleteContactPhoto(id: number): Promise<void> {
  const res = await apiFetch(contactPhotoPath(id), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new ApiError(res.status, await res.text().catch(() => ""));
  }
}

/**
 * Fetch the raw photo bytes for the same-origin proxy route. Returns the
 * upstream `Response` untouched so the route can stream it to the browser.
 */
export async function fetchContactPhoto(id: number): Promise<Response> {
  return apiFetch(contactPhotoPath(id), {
    cache: "no-store",
    headers: { Accept: "image/*" },
  });
}

export async function getHealth(): Promise<HealthResponse | null> {
  try {
    // The badge is decoration; never let it hold the page open for long.
    return await apiJson<HealthResponse>("/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Error translation                                                   */
/* ------------------------------------------------------------------ */

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

/** `{"detail": "..."}` from the API, or a sensible fallback. */
export function apiErrorMessage(error: ApiError, fallback: string): string {
  const detail = error.json<{ detail?: unknown }>()?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

/**
 * Turn a 422 `HTTPValidationError` into per-field messages. FastAPI reports the
 * location as `["body", "<field>"]`, so the second element is the input name.
 */
export function toFieldErrors(
  error: ApiError,
): Partial<Record<keyof ContactInput, string>> {
  const detail = error.json<{ detail?: ValidationIssue[] }>()?.detail;
  if (!Array.isArray(detail)) return {};

  const fieldErrors: Partial<Record<keyof ContactInput, string>> = {};
  for (const issue of detail) {
    const field = issue.loc?.[issue.loc.length - 1];
    if (typeof field === "string" && field !== "body") {
      fieldErrors[field as keyof ContactInput] ??= issue.msg;
    }
  }
  return fieldErrors;
}
