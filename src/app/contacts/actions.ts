"use server";

import { Buffer } from "node:buffer";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, ApiUnreachableError } from "@/lib/apiClient";
import {
  apiErrorMessage,
  createContact,
  deleteContact,
  getContact,
  replaceContact,
  toFieldErrors,
} from "@/lib/contacts/api";
import {
  contactInputSchema,
  formDataToValues,
  zodFieldErrors,
} from "@/lib/contacts/schema";
import { photoFileError } from "@/lib/contacts/photo";
import type {
  Contact,
  ContactTextField,
  FormState,
} from "@/lib/contacts/types";

/** Mutations for the contacts UI. Every one of these runs only on the server. */

function invalidate(contactId?: number) {
  revalidatePath("/contacts");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

const UNREACHABLE =
  "Could not reach the Contacts API. Check that the backend is running.";

type FormValues = Record<ContactTextField, string>;

/** Map an API failure onto form state; anything else is a real bug and rethrows. */
function apiFailureState(
  error: unknown,
  values: FormValues,
  fallback: string,
): FormState {
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
      message: apiErrorMessage(error, fallback),
      values,
    };
  }
  throw error;
}

/**
 * Create (when `contactId` is null) or fully replace a contact.
 *
 * Bind the id at the call site so the form never carries a mutable record id.
 * An unchanged photo is read back from the API here rather than bound to the
 * action: a bound data URL would be echoed into the page HTML and posted back
 * on every submit.
 */
export async function saveContactAction(
  contactId: number | null,
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formDataToValues(formData);
  const photoEntry = formData.get("photo_file");
  const photoFile = typeof photoEntry === "string" ? null : photoEntry;
  // An untouched file input can arrive as an empty Blob that still has a name,
  // so only the byte count tells a real upload from no upload at all.
  const hasPhotoFile = photoFile !== null && photoFile.size > 0;

  let photo: string | null;
  if (hasPhotoFile) {
    const error = photoFileError(photoFile);
    if (error) {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { photo: error },
        values,
      };
    }
    const bytes = Buffer.from(await photoFile.arrayBuffer());
    photo = `data:${photoFile.type};base64,${bytes.toString("base64")}`;
  } else {
    const intent = formData.get("photo_intent");
    if (intent === "replace") {
      return {
        status: "error",
        message: "Please fix the highlighted fields.",
        fieldErrors: { photo: "Choose a photo to upload." },
        values,
      };
    }
    if (intent === "remove" || contactId === null) {
      photo = null;
    } else {
      let existing: Contact | null;
      try {
        existing = await getContact(contactId);
      } catch (error) {
        return apiFailureState(error, values, "The contact could not be saved.");
      }
      if (!existing) {
        return {
          status: "error",
          message: "That contact no longer exists.",
          values,
        };
      }
      photo = existing.photo;
    }
  }

  const parsed = contactInputSchema.safeParse({ ...values, photo });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: zodFieldErrors(parsed.error),
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
    return apiFailureState(error, values, "The contact could not be saved.");
  }

  invalidate(saved.id);
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
