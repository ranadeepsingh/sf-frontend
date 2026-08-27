import { ApiError } from "@/lib/apiClient";
import { makeContact, TEST_PNG_DATA_URL } from "../../mocks/handlers";
import type { FormState } from "@/lib/contacts/types";

const mockReplaceContact = jest.fn();
const mockCreateContact = jest.fn();

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
jest.mock("@/lib/contacts/api", () => {
  const actual = jest.requireActual("@/lib/contacts/api");
  return {
    ...actual,
    createContact: (...args: unknown[]) => mockCreateContact(...args),
    replaceContact: (...args: unknown[]) => mockReplaceContact(...args),
  };
});

import { saveContactAction } from "@/app/contacts/actions";

const IDLE: FormState = { status: "idle" };
const EXISTING_PHOTO = TEST_PNG_DATA_URL;

function validForm(): FormData {
  const form = new FormData();
  form.set("first_name", "Ada");
  form.set("last_name", "Lovelace");
  form.set("email", "ada@example.com");
  return form;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReplaceContact.mockResolvedValue(makeContact());
  mockCreateContact.mockResolvedValue(makeContact({ id: 99 }));
});

describe("saveContactAction photo mapping", () => {
  it("explicitly preserves the existing photo in a full PUT", async () => {
    const form = validForm();
    form.set("photo_intent", "preserve");

    await expect(
      saveContactAction(1, EXISTING_PHOTO, IDLE, form),
    ).rejects.toThrow("redirect:/contacts/1");

    const payload = mockReplaceContact.mock.calls[0][1];
    expect(payload.photo).toBe(EXISTING_PHOTO);
    expect(payload).toMatchObject({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: null,
    });
  });

  it("converts a validated replacement File to a data URL", async () => {
    const form = validForm();
    form.set(
      "photo_file",
      new Blob(
        [
          new Uint8Array([
            0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
          ]),
        ],
        { type: "image/webp" },
      ),
      "avatar.webp",
    );

    await expect(
      saveContactAction(1, EXISTING_PHOTO, IDLE, form),
    ).rejects.toThrow("redirect:/contacts/1");

    expect(mockReplaceContact.mock.calls[0][1]).toMatchObject({
      photo: "data:image/webp;base64,UklGRgAAAABXRUJQ",
    });
  });

  it("maps explicit removal to null rather than preserving", async () => {
    const form = validForm();
    form.set("photo_intent", "remove");

    await expect(
      saveContactAction(1, EXISTING_PHOTO, IDLE, form),
    ).rejects.toThrow("redirect:/contacts/1");

    expect(mockReplaceContact.mock.calls[0][1]).toMatchObject({ photo: null });
  });

  it("rejects an invalid File before calling the API", async () => {
    const form = validForm();
    form.set(
      "photo_file",
      new Blob(["svg"], { type: "image/svg+xml" }),
      "avatar.svg",
    );

    await expect(
      saveContactAction(null, null, IDLE, form),
    ).resolves.toMatchObject({
      status: "error",
      fieldErrors: { photo: "Choose a JPEG, PNG, or WebP image." },
    });
    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it("preserves a backend 422 photo field error", async () => {
    mockReplaceContact.mockRejectedValue(
      new ApiError(
        422,
        JSON.stringify({
          detail: [{ loc: ["body", "photo"], msg: "Photo content is invalid." }],
        }),
      ),
    );
    const form = validForm();

    await expect(
      saveContactAction(1, EXISTING_PHOTO, IDLE, form),
    ).resolves.toMatchObject({
      message: "The API rejected these values.",
      fieldErrors: { photo: "Photo content is invalid." },
    });
  });
});
