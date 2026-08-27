"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ApiUnreachableError } from "@/lib/apiClient";
import {
  apiErrorMessage,
  createContact,
  deleteContact,
  deleteContactPhoto,
  replaceContact,
  toFieldErrors,
  uploadContactPhoto,
} from "@/lib/contacts/api";
import {
  contactInputSchema,
  formDataToValues,
  zodFieldErrors,
} from "@/lib/contacts/schema";
import { photoFileError } from "@/lib/contacts/photo";
import type { Contact, FormState } from "@/lib/contacts/types";

/** Mutations for the contacts UI. Every one of these runs only on the server. */

function invalidate(contactId?: number) {
  revalidatePath("/contacts");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

const UNREACHABLE =
  "Could not reach the Contacts API. Check that the backend is running.";

/** What the form asked to happen to the photo. Anything unknown means "leave it". */
type PhotoIntent = "keep" | "replace" | "remove";

function readPhotoIntent(formData: FormData): PhotoIntent {
  const raw = formData.get("photo_intent");
  return raw === "replace" || raw === "remove" ? raw : "keep";
}

/**
 * The uploaded file, or `null` when there is none.
 *
 * A file input that was never touched still serialises as an empty part with a
 * blank filename, so the byte count — not the presence of the entry — is what
 * distinguishes a real upload.
 */
function readPhotoFile(formData: FormData): File | null {
  const entry = formData.get("photo_file");
  if (typeof entry === "string" || entry === null) return null;
  return entry.size > 0 ? entry : null;
}

/** Turn an API failure from the photo endpoint into something a person can act on. */
function photoFailureMessage(error: unknown): string {
  if (error instanceof ApiUnreachableError) return UNREACHABLE;
  if (error instanceof ApiError) {
    if (error.status === 413) {
      return "The API rejected the photo as too large.";
    }
    return apiErrorMessage(error, "The photo could not be uploaded.");
  }
  throw error;
}

/**
 * Create (when `contactId` is null) or fully replace a contact.
 *
 * Bind the id at the call site — `saveContactAction.bind(null, contact.id)` —
 * so the form itself never carries a mutable record id.
 */
export async function saveContactAction(
  contactId: number | null,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataToValues(formData);
  const photoIntent = readPhotoIntent(formData);
  const photoFile = readPhotoFile(formData);

  // Check the photo before touching the API: a rejected file should never cost
  // the user a saved-but-wrong contact, and it should never cost an upload.
  const photoError = photoFile
    ? photoFileError(photoFile)
    : photoIntent === "replace"
      ? "Choose a photo to upload."
      : null;

  const parsed = contactInputSchema.safeParse(values);
  if (!parsed.success || photoError) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.success ? {} : zodFieldErrors(parsed.error),
      photoError: photoError ?? undefined,
      values,
    };
  }

  let saved: Contact;
  try {
    saved =
      contactId === null
        ? await createContact(parsed.data)
        : await replaceContact(contactId, parsed.data);
  } catch (error) {
    if (error instanceof ApiUnreachableError) {
      return { status: "error", message: UNREACHABLE, values };
    }
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return {
          status: "error",
          message: "That email address is already taken.",
          fieldErrors: {
            email: apiErrorMessage(error, "This email is already in use."),
          },
          values,
        };
      }
      if (error.status === 422) {
        return {
          status: "error",
          message: "The API rejected these values.",
          fieldErrors: toFieldErrors(error),
          values,
        };
      }
      return {
        status: "error",
        message: apiErrorMessage(error, "The contact could not be saved."),
        values,
      };
    }
    throw error;
  }

  // The photo is a separate resource, so it is a separate request — made only
  // after the contact itself exists and only when the form asked for a change.
  let photoFailure: string | null = null;
  if (photoFile) {
    try {
      await uploadContactPhoto(saved.id, photoFile);
    } catch (error) {
      photoFailure = photoFailureMessage(error);
    }
  } else if (photoIntent === "remove") {
    try {
      await deleteContactPhoto(saved.id);
    } catch (error) {
      photoFailure = photoFailureMessage(error);
    }
  }

  invalidate(saved.id);

  if (photoFailure) {
    // Editing an existing contact: PUT and the photo endpoint are both
    // idempotent, so keep the user on the form and let them submit again.
    if (contactId !== null) {
      return {
        status: "error",
        message: `${saved.full_name} was saved, but the photo was not updated.`,
        photoError: photoFailure,
        values,
      };
    }
    // Creating: the contact now exists, so resubmitting this form would only
    // collide on the unique email. Move to its edit form, which can retry the
    // photo on its own.
    redirect(`/contacts/${saved.id}/edit?photo=failed`);
  }

  // Outside the try/catch: redirect() signals by throwing.
  redirect(`/contacts/${saved.id}`);
}

export interface DeleteResult {
  error?: string;
}

/**
 * Delete a contact. Pass `redirectToList` from the detail page, where staying
 * put would leave the user on a 404.
 */
export async function deleteContactAction(
  contactId: number,
  redirectToList = false,
): Promise<DeleteResult> {
  try {
    await deleteContact(contactId);
  } catch (error) {
    if (error instanceof ApiUnreachableError) return { error: UNREACHABLE };
    if (error instanceof ApiError) {
      return {
        error:
          error.status === 404
            ? "That contact has already been deleted."
            : apiErrorMessage(error, "The contact could not be deleted."),
      };
    }
    throw error;
  }

  invalidate(contactId);
  if (redirectToList) redirect("/contacts");
  return {};
}
