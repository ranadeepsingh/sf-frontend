"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { avatarHue, initials } from "@/lib/contacts/format";
import { contactPhotoSrc } from "@/lib/contacts/photo";
import type { Contact } from "@/lib/contacts/types";

const SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-2xl",
} as const;

type AvatarContact = Pick<Contact, "first_name" | "last_name" | "email"> &
  Partial<Pick<Contact, "id" | "photo_url" | "updated_at">>;

function savedSrc(contact: AvatarContact): string | null {
  if (typeof contact.id !== "number" || !contact.photo_url) return null;
  return contactPhotoSrc({
    id: contact.id,
    photo_url: contact.photo_url,
    updated_at: contact.updated_at ?? "",
  });
}

/**
 * Circular contact photo with a deterministic initials fallback.
 *
 * The initials always render underneath, so a photo that 404s, times out, or is
 * still loading never leaves an empty hole — and the fallback needs no extra
 * state to appear. A plain `<img>` is used rather than `next/image`: the source
 * is either a `blob:` preview or a streamed proxy response, neither of which the
 * image optimiser can do anything useful with.
 */
export default function ContactAvatar({
  contact,
  size = "md",
  previewSrc,
}: {
  contact: AvatarContact;
  size?: keyof typeof SIZES;
  /**
   * Display override used by the photo form: a `blob:` preview while a file is
   * staged, or `null` to show no photo at all (a pending removal). Left
   * `undefined` everywhere else, which means "use the contact's saved photo" —
   * so `null` and "not provided" stay distinguishable.
   */
  previewSrc?: string | null;
}) {
  const src = previewSrc !== undefined ? previewSrc : savedSrc(contact);
  // Remember the exact source that failed rather than a boolean, so a new photo
  // (or the same one after a save, which carries a fresh `v`) is retried without
  // any resetting effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const style = {
    "--avatar-hue": avatarHue(contact.email),
  } as CSSProperties;

  return (
    <span
      style={style}
      className={`contact-avatar relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold ${SIZES[size]}`}
    >
      <span aria-hidden="true">{initials(contact)}</span>
      {src && failedSrc !== src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- blob:/proxy sources bypass the optimiser; see the comment above. */
        <img
          src={src}
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      ) : null}
    </span>
  );
}
