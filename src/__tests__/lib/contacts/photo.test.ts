import {
  PHOTO_ACCEPT,
  PHOTO_MAX_BYTES,
  PHOTO_MIME_TYPES,
  contactPhotoSrc,
  formatPhotoSize,
  photoFileError,
} from "@/lib/contacts/photo";

describe("photoFileError", () => {
  it.each(PHOTO_MIME_TYPES)("accepts %s", (type) => {
    expect(photoFileError({ size: 1024, type })).toBeNull();
  });

  it("accepts a type the browser reported in mixed case", () => {
    expect(photoFileError({ size: 1024, type: "Image/PNG" })).toBeNull();
  });

  it("rejects a type outside the allow-list", () => {
    expect(photoFileError({ size: 1024, type: "image/gif" })).toMatch(
      /JPEG, PNG, or WebP/,
    );
  });

  it("rejects a file that is not an image at all", () => {
    expect(photoFileError({ size: 1024, type: "application/pdf" })).toMatch(
      /JPEG, PNG, or WebP/,
    );
  });

  it("rejects an empty file before it rejects its size", () => {
    expect(photoFileError({ size: 0, type: "image/png" })).toMatch(/empty/i);
  });

  it("accepts a file exactly on the limit", () => {
    expect(
      photoFileError({ size: PHOTO_MAX_BYTES, type: "image/png" }),
    ).toBeNull();
  });

  it("rejects one byte over the limit", () => {
    expect(
      photoFileError({ size: PHOTO_MAX_BYTES + 1, type: "image/png" }),
    ).toMatch(/2 MiB or smaller/);
  });
});

describe("PHOTO_ACCEPT", () => {
  it("lists both MIME types and extensions", () => {
    expect(PHOTO_ACCEPT).toContain("image/jpeg");
    expect(PHOTO_ACCEPT).toContain(".webp");
  });
});

describe("formatPhotoSize", () => {
  it.each([
    [512, "512 B"],
    [2048, "2 KB"],
    [916101, "895 KB"],
    [2 * 1024 * 1024, "2.0 MB"],
  ])("formats %i as %s", (bytes, expected) => {
    expect(formatPhotoSize(bytes)).toBe(expected);
  });
});

describe("contactPhotoSrc", () => {
  it("is null when the contact has no photo", () => {
    expect(
      contactPhotoSrc({ id: 7, photo_url: null, updated_at: "2026-01-01" }),
    ).toBeNull();
  });

  it("is null when the API predates the photo endpoint", () => {
    expect(
      contactPhotoSrc({ id: 7, photo_url: undefined, updated_at: "2026-01-01" }),
    ).toBeNull();
  });

  it("points at this app, not the API, so the browser stays same-origin", () => {
    const src = contactPhotoSrc({
      id: 7,
      photo_url: "/api/v1/contacts/7/photo",
      updated_at: "2026-08-27T03:22:05.219Z",
    });

    expect(src).toBe(
      "/api/contacts/7/photo/?v=2026-08-27T03%3A22%3A05.219Z",
    );
  });

  it("keeps the trailing slash so `trailingSlash: true` cannot 308 every image", () => {
    const src = contactPhotoSrc({
      id: 7,
      photo_url: "/api/v1/contacts/7/photo",
      updated_at: "x",
    });

    expect(src).toContain("/photo/?");
  });

  it("changes when the contact is updated, so a replaced photo is not cached", () => {
    const before = contactPhotoSrc({
      id: 7,
      photo_url: "/api/v1/contacts/7/photo",
      updated_at: "2026-08-27T03:22:05.219Z",
    });
    const after = contactPhotoSrc({
      id: 7,
      photo_url: "/api/v1/contacts/7/photo",
      updated_at: "2026-08-27T04:00:00.000Z",
    });

    expect(before).not.toBe(after);
  });
});
