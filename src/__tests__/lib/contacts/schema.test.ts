import {
  CONTACT_FIELDS,
  contactInputSchema,
  formDataToValues,
  zodFieldErrors,
} from "@/lib/contacts/schema";
import { TEST_PNG_DATA_URL } from "../../mocks/handlers";

function values(overrides: Record<string, string> = {}) {
  return {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "Ada@Example.com",
    phone: "",
    company: "",
    job_title: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "",
    notes: "",
    photo: null,
    ...overrides,
  };
}

describe("contactInputSchema", () => {
  it("lowercases the email and nulls out the blanks", () => {
    const parsed = contactInputSchema.parse(values());

    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("trims what the user typed", () => {
    expect(contactInputSchema.parse(values({ company: "  Acme  " })).company).toBe(
      "Acme",
    );
  });

  it("requires the three fields the API requires", () => {
    const result = contactInputSchema.safeParse(
      values({ first_name: " ", last_name: "", email: "" }),
    );

    expect(result.success).toBe(false);
    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name is required",
      last_name: "Last name is required",
      email: "Email is required",
    });
  });

  it("rejects a malformed email", () => {
    const result = contactInputSchema.safeParse(values({ email: "not-an-email" }));
    expect(zodFieldErrors(result.error!).email).toBe("Enter a valid email address");
  });

  it("enforces the API's length limits", () => {
    const result = contactInputSchema.safeParse(
      values({ first_name: "a".repeat(101), postal_code: "9".repeat(21) }),
    );

    expect(zodFieldErrors(result.error!)).toEqual({
      first_name: "First name must be 100 characters or fewer",
      postal_code: "Postal code must be 20 characters or fewer",
    });
  });

  it("accepts a supported photo data URL and rejects other image formats", () => {
    expect(
      contactInputSchema.parse(
        values({ photo: TEST_PNG_DATA_URL }),
      ).photo,
    ).toBe(TEST_PNG_DATA_URL);

    const result = contactInputSchema.safeParse(
      values({ photo: "data:image/svg+xml;base64,PHN2Zz4=" }),
    );
    expect(zodFieldErrors(result.error!).photo).toMatch(/JPEG, PNG, or WebP/);
  });

  it("rejects empty or mislabeled image content", () => {
    const empty = contactInputSchema.safeParse(
      values({ photo: "data:image/png;base64," }),
    );
    expect(zodFieldErrors(empty.error!).photo).toMatch(/base64 JPEG, PNG, or WebP/);

    const mislabeled = contactInputSchema.safeParse(
      values({ photo: "data:image/png;base64,AQID" }),
    );
    expect(zodFieldErrors(mislabeled.error!).photo).toMatch(/declared image type/);
  });
});

describe("formDataToValues", () => {
  it("pulls every known field out, defaulting to an empty string", () => {
    const formData = new FormData();
    formData.set("first_name", "Grace");
    formData.set("email", "grace@example.com");
    formData.set("ignored", "nope");

    const extracted = formDataToValues(formData);

    expect(extracted.first_name).toBe("Grace");
    expect(extracted.last_name).toBe("");
    expect(Object.keys(extracted).sort()).toEqual(
      CONTACT_FIELDS.map((field) => field.name).sort(),
    );
  });
});
