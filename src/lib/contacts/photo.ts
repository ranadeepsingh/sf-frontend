import type { Contact } from "./types";

/**
 * Contact photo rules, shared by the browser and the server.
 *
 * Images are *not* part of the contact JSON document. They live behind their own
 * endpoint (see `uploadContactPhoto` / `deleteContactPhoto` in `./api.ts`) and
 * travel as `multipart/form-data`, so nothing here ever parses or produces
 * base64: the browser hands over a `File` and the server streams it onward.
 */

export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** `accept` for the file input. Extensions help browsers that filter by suffix. */
export const PHOTO_ACCEPT = [
  ...PHOTO_MIME_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
].join(",");

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_SIZE_LABEL = "2 MiB";
export const PHOTO_FORMATS_LABEL = "JPEG, PNG, or WebP";

/** The part of `File`/`Blob` this module needs — keeps it testable and runtime-agnostic. */
export interface PhotoFileLike {
  size: number;
  type: string;
  name?: string;
}

function isAllowedMimeType(type: string): boolean {
  return PHOTO_MIME_TYPES.some((allowed) => allowed === type.toLowerCase());
}

/**
 * The one photo validator. The API validates again and stays the authority; this
 * only spares the user a round trip (and spares the network 2 MiB of pointless
 * upload). Deliberately no magic-byte sniffing: it cannot be trusted from the
 * browser anyway, and duplicating it here only invites the two sides to disagree.
 */
export function photoFileError(file: PhotoFileLike): string | null {
  if (!isAllowedMimeType(file.type)) {
    return `Choose a ${PHOTO_FORMATS_LABEL} image.`;
  }
  if (file.size === 0) {
    return "That file is empty. Choose another image.";
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return `Photo must be ${PHOTO_MAX_SIZE_LABEL} or smaller.`;
  }
  return null;
}

/** Human-readable size for the "Selected: …" line. */
export function formatPhotoSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Same-origin URL the browser loads a saved photo from.
 *
 * The backend base URL is server-only (see `apiClient`), so the image is served
 * through this app's `/api/contacts/{id}/photo` route rather than fetched from
 * the API directly — same reason every other read goes through the server: no
 * CORS, and the API's location never reaches the browser.
 *
 * `trailingSlash: true` is on, so the slash is included to avoid a 308 per image.
 * `v` busts the browser's in-memory cache when a photo is replaced; the route
 * also revalidates on every load, so a stale `updated_at` cannot pin an old image.
 */
export function contactPhotoSrc(
  contact: Pick<Contact, "id" | "photo_url" | "updated_at">,
): string | null {
  if (!contact.photo_url) return null;
  return `/api/contacts/${contact.id}/photo/?v=${encodeURIComponent(contact.updated_at)}`;
}
