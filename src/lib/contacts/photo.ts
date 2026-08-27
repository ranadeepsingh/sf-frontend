export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PHOTO_ACCEPT = PHOTO_MIME_TYPES.join(",");
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_SIZE_LABEL = "2 MiB";
export const PHOTO_FORMATS_LABEL = "JPEG, PNG, or WebP";

type PhotoFile = {
  size: number;
  type: string;
};

function isAllowedMimeType(type: string): boolean {
  return PHOTO_MIME_TYPES.some((allowed) => allowed === type);
}

export function photoFileError(file: PhotoFile): string | null {
  if (!isAllowedMimeType(file.type)) {
    return `Choose a ${PHOTO_FORMATS_LABEL} image.`;
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return `Photo must be ${PHOTO_MAX_SIZE_LABEL} or smaller.`;
  }
  if (file.size === 0) {
    return "Photo cannot be empty.";
  }
  return null;
}

export function photoDataUrlError(value: string): string | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(
    value,
  );
  if (!match || !match[2]) {
    return `Photo must be a base64 ${PHOTO_FORMATS_LABEL} image.`;
  }

  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = (payload.length / 4) * 3 - padding;
  if (decodedBytes > PHOTO_MAX_BYTES) {
    return `Photo must be ${PHOTO_MAX_SIZE_LABEL} or smaller.`;
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  } catch {
    return `Photo must be a base64 ${PHOTO_FORMATS_LABEL} image.`;
  }

  const signatureMatches =
    match[1] === "image/jpeg"
      ? startsWith(bytes, [0xff, 0xd8, 0xff])
      : match[1] === "image/png"
        ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
          startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]);

  if (!signatureMatches) {
    return "Photo contents do not match its declared image type.";
  }
  return null;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}
