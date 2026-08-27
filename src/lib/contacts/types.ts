/**
 * Types mirroring the Contacts API OpenAPI 3.1 document (`GET /openapi.json`).
 * Field names stay snake_case so payloads map 1:1 onto the wire format.
 */

/** `ContactRead` — a stored contact, as returned by every contact endpoint. */
export interface Contact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  notes: string | null;
  /**
   * Where the contact's photo can be read, or `null`/absent when there is none.
   *
   * Read-only and set by the API: a photo is a separate resource
   * (`PUT`/`DELETE /api/v1/contacts/{id}/photo`), never part of the contact JSON
   * document. Optional on the wire so the UI falls back to initials against an
   * API build that predates the photo endpoint.
   */
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
  full_name: string;
}

/**
 * Every editable field, i.e. `ContactCreate` / `ContactReplace`.
 *
 * `photo_url` is excluded deliberately. The API's contact models forbid extra
 * inputs, so putting any image key in this payload makes *every* save fail with
 * `422 extra_forbidden` — photo or no photo.
 */
export type ContactInput = Omit<
  Contact,
  "id" | "created_at" | "updated_at" | "full_name" | "photo_url"
>;

/** `ContactPage` — one page of contacts plus the totals needed to paginate. */
export interface ContactPage {
  items: Contact[];
  total: number;
  limit: number;
  offset: number;
}

/** `HealthResponse` — result of the liveness probe. */
export interface HealthResponse {
  status: string;
  database: string;
  contacts: number;
}

/** Sort fields the API's allow-list accepts. */
export const SORT_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "email",
  "company",
  "created_at",
  "updated_at",
] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

/** Bounds the API enforces on `limit`. */
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 200;
export const DEFAULT_PER_PAGE = 25;
export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;

/**
 * Result of a server action, consumed by `useActionState` in the forms.
 * Lives here (not in the `"use server"` module) so client components can import
 * the type without pulling server code into the browser bundle.
 */
export type FormState = {
  status: "idle" | "error";
  /** Message shown above the form; used for API-level failures. */
  message?: string;
  /** Per-field messages keyed by input name. */
  fieldErrors?: Partial<Record<keyof ContactInput, string>>;
  /**
   * Message for the photo control. Separate from `fieldErrors` because the photo
   * is not a contact field — it is its own resource with its own request.
   */
  photoError?: string;
  /** Echo of the submitted values so the form survives a failed round trip. */
  values?: Partial<Record<keyof ContactInput, string>>;
};

export const EMPTY_FORM_STATE: FormState = { status: "idle" };
