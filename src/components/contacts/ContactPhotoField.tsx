"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  PHOTO_ACCEPT,
  PHOTO_FORMATS_LABEL,
  PHOTO_MAX_SIZE_LABEL,
  photoDataUrlError,
  photoFileError,
} from "@/lib/contacts/photo";
import type { Contact, FormState } from "@/lib/contacts/types";
import ContactAvatar from "./ContactAvatar";

type PhotoIntent = "preserve" | "replace" | "remove";

/** The state that survives without a File in the input: the saved photo, or its removal. */
type Committed = { photo: string | null; intent: PhotoIntent };

function committedFrom(contact?: Contact): Committed {
  return contact?.photo
    ? { photo: contact.photo, intent: "preserve" }
    : { photo: null, intent: "remove" };
}

/**
 * File picker with an immediate, fixed-size preview. The raw File is submitted
 * to the server action; the data URL produced here exists only for the preview.
 */
export default function ContactPhotoField({
  contact,
  serverError,
  submitResult,
  onClientErrorChange,
}: {
  contact?: Contact;
  serverError?: string;
  submitResult: FormState;
  onClientErrorChange: (error: string | null) => void;
}) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped whenever a read stops being the current one, so a slow FileReader
  // cannot restore a superseded preview or intent.
  const readRef = useRef(0);
  // What the field falls back to without a File in the input.
  const savedState = committedFrom(contact);
  const committedRef = useRef<Committed>(savedState);
  // True while the preview and intent depend on a File that only the input holds.
  const stagedRef = useRef(false);
  const [preview, setPreview] = useState<string | null>(savedState.photo);
  const [fileName, setFileName] = useState<string | null>(null);
  const [intent, setIntent] = useState<PhotoIntent>(savedState.intent);
  const [clientError, setClientError] = useState<string | null>(null);
  const [needsReselect, setNeedsReselect] = useState(false);

  const displayedError = clientError ?? serverError;
  const previewContact = contact ?? {
    first_name: "New",
    last_name: "Contact",
    email: "contact@example.com",
    photo: preview,
  };

  useEffect(() => {
    return () => {
      readRef.current += 1;
    };
  }, []);

  /** Drop whatever depended on the File in the input and go back to the saved state. */
  const revertToCommitted = useCallback((announce: boolean) => {
    if (inputRef.current) inputRef.current.value = "";
    readRef.current += 1;
    stagedRef.current = false;
    setPreview(committedRef.current.photo);
    setFileName(null);
    setIntent(committedRef.current.intent);
    setNeedsReselect(announce);
  }, []);

  // React resets the form once the action returns, which empties the file input.
  // Keeping the preview and the replace intent would promise a file that can no
  // longer be sent, so a failed submit gives the staged replacement back.
  useEffect(() => {
    if (submitResult.status !== "error" || !stagedRef.current) return;
    revertToCommitted(true);
  }, [submitResult, revertToCommitted]);

  function reportClientError(error: string | null) {
    setClientError(error);
    onClientErrorChange(error);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const read = ++readRef.current;
    setNeedsReselect(false);

    const fileError = photoFileError(file);
    if (fileError) {
      reportClientError(fileError);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (read !== readRef.current) return;

      if (typeof reader.result !== "string") {
        reportClientError("The photo could not be read. Choose another image.");
        return;
      }

      const contentError = photoDataUrlError(reader.result);
      if (contentError) {
        reportClientError(contentError);
        return;
      }

      setPreview(reader.result);
      setFileName(file.name);
      setIntent("replace");
      stagedRef.current = true;
      reportClientError(null);
    });
    reader.addEventListener("error", () => {
      if (read !== readRef.current) return;
      reportClientError("The photo could not be read. Choose another image.");
    });
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    committedRef.current = { photo: null, intent: "remove" };
    revertToCommitted(false);
    reportClientError(null);
  }

  // A rejected file replaced whatever the input held, so the last saved state is
  // the only thing left to go back to.
  function dismissRejectedFile() {
    revertToCommitted(false);
    reportClientError(null);
  }

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Photo</legend>
      <div className="border-b border-hairline pb-2">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Photo
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Optional profile photo for lists and contact details.
        </p>
      </div>

      <div className="flex items-center gap-5 rounded-lg border border-border bg-card/50 p-4">
        <div className="relative shrink-0">
          <ContactAvatar
            contact={{ ...previewContact, photo: preview }}
            size="lg"
          />
          {!preview ? (
            <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm">
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={inputId}
            name="photo_file"
            type="file"
            accept={PHOTO_ACCEPT}
            onChange={handleChange}
            aria-label="Contact photo"
            aria-invalid={displayedError ? true : undefined}
            aria-describedby={displayedError ? `${helpId} ${errorId}` : helpId}
            className="sr-only"
            tabIndex={-1}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 sm:min-h-9"
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {preview ? "Change photo" : "Choose photo"}
            </Button>
            {preview ? (
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
            {clientError ? (
              <Button
                type="button"
                variant="ghost"
                onClick={dismissRejectedFile}
                className="min-h-11 sm:min-h-9"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Discard selection
              </Button>
            ) : null}
          </div>

          <p id={helpId} className="mt-2 text-[12px] text-muted-foreground">
            {PHOTO_FORMATS_LABEL}. Maximum {PHOTO_MAX_SIZE_LABEL}.
          </p>
          {fileName ? (
            <p
              aria-live="polite"
              className="mt-1 truncate text-[12px] text-foreground"
            >
              Ready: {fileName}
            </p>
          ) : needsReselect ? (
            <p
              aria-live="polite"
              className="mt-1 text-[12px] text-muted-foreground"
            >
              The photo you chose was cleared when the form came back. Choose it
              again to use it.
            </p>
          ) : null}
          {displayedError ? (
            <p
              id={errorId}
              role="alert"
              className="mt-1.5 text-[13px] text-destructive"
            >
              {displayedError}
            </p>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="photo_intent" value={intent} />
    </fieldset>
  );
}
