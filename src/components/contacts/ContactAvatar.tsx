"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { avatarHue, initials } from "@/lib/contacts/format";
import type { Contact } from "@/lib/contacts/types";

const SIZES = {
  sm: "h-10 w-10 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

/** Contact photo with a deterministic initials fallback. */
export default function ContactAvatar({
  contact,
  size = "md",
}: {
  contact: Pick<Contact, "first_name" | "last_name" | "email" | "photo">;
  size?: keyof typeof SIZES;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = contact.photo ?? null;
  const showPhoto = photo !== null && failedPhoto !== photo;
  const style = {
    "--avatar-hue": avatarHue(contact.email),
  } as CSSProperties;

  return (
    <span
      style={style}
      className={`contact-avatar relative inline-flex aspect-square shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-display font-semibold ${SIZES[size]}`}
    >
      <span aria-hidden="true">{initials(contact)}</span>
      {showPhoto ? (
        <Image
          src={photo}
          alt=""
          width={80}
          height={80}
          unoptimized
          className="absolute inset-0 aspect-square h-full w-full rounded-full object-cover"
          onError={() => setFailedPhoto(photo)}
        />
      ) : null}
    </span>
  );
}
