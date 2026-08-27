"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useFormStatus } from "react-dom";
import { ImagePlus, Trash2, Undo2 } from "lucide-react";
import Button, { buttonClasses } from "@/components/ui/Button";
import {
  PHOTO_ACCEPT,
  PHOTO_FORMATS_LABEL,
  PHOTO_MAX_SIZE_LABEL,
  contactPhotoSrc,
  formatPhotoSize,
  photoFileError,
} from "@/lib/contacts/photo";
import type { Contact, FormState } from "@/lib/contacts/types";
import ContactAvatar from "./ContactAvatar";

/**
 * What should happen to the photo when the form is submitted.
 *  - `keep`    — leave whatever the API already stores (the default).
 *  - `replace` — upload the staged file.
 *  - `remove`  — delete the stored photo.
 */
export type PhotoIntent = "keep" | "replace" | "remove";

/**
 * Put a `File` back into a native file input.
 *
 * React resets uncontrolled form controls once a form action settles, including
 * when the action reports a validation error — which would silently drop the
 * photo the user picked and make the retry submit nothing. The `File` therefore
 * lives in React state, and the input is re-synced from it.
 *
 * Returns false when the platform has no `DataTransfer` (very old Safari, and
 * jsdom without the test shim), which lets the caller tell the user plainly
 * instead of promising an upload it cannot make.
 */
function syncInputFile(input: HTMLInputElement | null, file: File | null): boolean {
  if (!input) return false;
  if (!file) {
    input.value = "";
    return true;
  }
  if (input.files?.[0] === file) return true;
  if (typeof DataTransfer === "undefined") return false;

  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    return input.files?.[0] === file;
  } catch {
    return false;
  }
}

/**
 * Photo picker for the contact form.
 *
 * The file is submitted as-is and uploaded by the server action to the API's
 * multipart photo endpoint — no base64, no data URLs, and nothing image-shaped
 * in the contact JSON document. The preview is a local `blob:` URL, so choosing
 * a 2 MiB photo costs one object URL rather than a 2.7 MiB string.
 */
export default function ContactPhotoField({
  contact,
  serverError,
  submitResult,
  onErrorChange,
}: {
  contact?: Contact;
  /** Photo-specific message returned by the last submit. */
  serverError?: string;
  /** The last action result; a new one means the form was just reset. */
  submitResult: FormState;
  onErrorChange: (error: string | null) => void;
}) {
  const { pending } = useFormStatus();
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const statusId = `${inputId}-status`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);

  const savedSrc = contact ? contactPhotoSrc(contact) : null;

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [intent, setIntent] = useState<PhotoIntent>("keep");
  const [clientError, setClientError] = useState<string | null>(null);

  const shownError = clientError ?? serverError ?? null;
  const shownSrc = previewUrl ?? (intent === "remove" ? null : savedSrc);

  // Revoke the previous preview as soon as it stops being shown, and the last
  // one on unmount — object URLs are held until the document goes away otherwise.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Keep the native input in step with React state. Re-runs after every settled
  // submit (`submitResult` changes identity) because that is when React empties it.
  useEffect(() => {
    if (syncInputFile(inputRef.current, file) || !file) return;
    // The platform will not let us restore the selection; say so rather than
    // leaving a preview that promises an upload which cannot happen.
    setFile(null);
    setPreviewUrl(null);
    setIntent("keep");
    setClientError("Choose the photo again to upload it.");
  }, [file, submitResult]);

  const report = useCallback(
    (error: string | null) => {
      setClientError(error);
      onErrorChange(error);
    },
    [onErrorChange],
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    if (!chosen) return;

    const error = photoFileError(chosen);
    if (error) {
      // Drop the rejected file so the input never carries something the API
      // would refuse, and so re-picking the same file fires `change` again.
      event.target.value = "";
      report(error);
      return;
    }

    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
    setIntent("replace");
    report(null);
  }

  function removePhoto() {
    setFile(null);
    setPreviewUrl(null);
    setIntent("remove");
    if (inputRef.current) inputRef.current.value = "";
    report(null);
  }

  function undo() {
    setFile(null);
    setPreviewUrl(null);
    setIntent("keep");
    if (inputRef.current) inputRef.current.value = "";
    report(null);
  }

  const previewContact = contact ?? {
    first_name: "New",
    last_name: "Contact",
    email: "new@contact",
  };

  const changed = intent !== "keep";
  const statusText = file
    ? `Selected ${file.name} (${formatPhotoSize(file.size)}). It uploads when you save.`
    : intent === "remove"
      ? "The photo will be removed when you save."
      : savedSrc
        ? "Current photo."
        : "No photo yet.";

  return (
    <div className="space-y-4">
      <fieldset className="space-y-4" disabled={pending}>
        <legend className="sr-only">Photo</legend>
        <div className="border-b border-hairline pb-2">
          <h2 className="font-display text-sm font-semibold text-foreground">
            Photo
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Optional profile photo, shown in the contact list and on the contact
            page.
          </p>
        </div>

        <div className="flex items-center gap-5 rounded-lg border border-border bg-card/50 p-4">
          <ContactAvatar
            contact={previewContact}
            size="xl"
            previewSrc={shownSrc}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                Visually hidden but still focusable and still in the tab order, so
                the control is reachable by keyboard and announced by screen
                readers. The label beside it is both its accessible name and its
                visible trigger, so no synthetic click is needed — and it is the
                input's next sibling so the focus ring can follow it.
              */}
              <input
                ref={inputRef}
                id={inputId}
                name="photo_file"
                type="file"
                accept={PHOTO_ACCEPT}
                onChange={handleChange}
                aria-invalid={shownError ? true : undefined}
                aria-describedby={`${helpId} ${statusId}${shownError ? ` ${errorId}` : ""}`}
                className="peer sr-only"
              />
              <label
                htmlFor={inputId}
                className={buttonClasses(
                  "secondary",
                  "md",
                  "min-h-11 cursor-pointer sm:min-h-9 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:pointer-events-none peer-disabled:opacity-50",
                )}
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                {shownSrc ? "Change photo" : "Choose photo"}
              </label>

              {shownSrc ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={removePhoto}
                  className="min-h-11 text-destructive hover:text-destructive sm:min-h-9"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove photo
                </Button>
              ) : null}

              {changed ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={undo}
                  className="min-h-11 sm:min-h-9"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  Undo
                </Button>
              ) : null}
            </div>

            <p id={helpId} className="mt-2 text-[12px] text-muted-foreground">
              {PHOTO_FORMATS_LABEL}. Maximum {PHOTO_MAX_SIZE_LABEL}.
            </p>

            <p
              id={statusId}
              aria-live="polite"
              className="mt-1 truncate text-[12px] text-foreground"
            >
              {statusText}
            </p>

            {shownError ? (
              <p
                id={errorId}
                role="alert"
                className="mt-1.5 text-[13px] text-destructive"
              >
                {shownError}
              </p>
            ) : null}
          </div>
        </div>

      </fieldset>

      {/*
        Controlled, so it survives the reset React performs after a submit, and
        outside the fieldset so a pending submit can never disable it away.
      */}
      <input type="hidden" name="photo_intent" value={intent} readOnly />
    </div>
  );
}
