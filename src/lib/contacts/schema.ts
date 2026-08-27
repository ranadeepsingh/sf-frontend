import { z } from "zod";
import type { ContactInput } from "./types";

/**
 * Client/server-shared validation for the contact form.
 *
 * The rules mirror the API's Pydantic models (`ContactCreate` / `ContactReplace`)
 * so the user sees a mistake before a round trip — the API stays the authority,
 * and anything it rejects anyway is surfaced by `toFieldErrors` in `./api.ts`.
 */

/** Optional text: trimmed, and blank becomes `null` (the API clears the field). */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((value) => value || null)
    .nullable()
    .default(null);
}

function requiredText(max: number, label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

export const contactInputSchema = z.object({
  first_name: requiredText(100, "First name"),
  last_name: requiredText(100, "Last name"),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .max(320, "Email must be 320 characters or fewer")
    .pipe(z.email("Enter a valid email address"))
    .transform((value) => value.toLowerCase()),
  phone: optionalText(40, "Phone"),
  company: optionalText(200, "Company"),
  job_title: optionalText(200, "Job title"),
  address: optionalText(300, "Address"),
  city: optionalText(120, "City"),
  state: optionalText(120, "State"),
  postal_code: optionalText(20, "Postal code"),
  country: optionalText(120, "Country"),
  notes: z
    .string()
    .trim()
    .transform((value) => value || null)
    .nullable()
    .default(null),
}) satisfies z.ZodType<ContactInput, unknown>;

export type ContactFormValues = z.input<typeof contactInputSchema>;

/** Collapse a ZodError into one message per field, keyed by input name. */
export function zodFieldErrors(
  error: z.ZodError,
): Partial<Record<keyof ContactInput, string>> {
  const fieldErrors: Partial<Record<keyof ContactInput, string>> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as keyof ContactInput] = issue.message;
    }
  }
  return fieldErrors;
}

/* ------------------------------------------------------------------ */
/* Form metadata — one source of truth for the fields and their limits */
/* ------------------------------------------------------------------ */

export interface ContactFieldSpec {
  name: keyof ContactInput;
  label: string;
  type?: "text" | "email" | "tel" | "textarea";
  required?: boolean;
  maxLength: number;
  placeholder?: string;
  autoComplete?: string;
  /** Column span inside the section grid. */
  wide?: boolean;
}

export interface ContactFieldGroup {
  title: string;
  description: string;
  fields: ContactFieldSpec[];
}

export const CONTACT_FIELD_GROUPS: ContactFieldGroup[] = [
  {
    title: "Identity",
    description: "First name, last name, and email are required.",
    fields: [
      {
        name: "first_name",
        label: "First name",
        required: true,
        maxLength: 100,
        placeholder: "Ada",
        autoComplete: "given-name",
      },
      {
        name: "last_name",
        label: "Last name",
        required: true,
        maxLength: 100,
        placeholder: "Lovelace",
        autoComplete: "family-name",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        required: true,
        maxLength: 320,
        placeholder: "ada@example.com",
        autoComplete: "email",
      },
      {
        name: "phone",
        label: "Phone",
        type: "tel",
        maxLength: 40,
        placeholder: "+1-415-555-0101",
        autoComplete: "tel",
      },
    ],
  },
  {
    title: "Work",
    description: "Where they work and what they do.",
    fields: [
      {
        name: "company",
        label: "Company",
        maxLength: 200,
        placeholder: "Analytical Engines",
        autoComplete: "organization",
      },
      {
        name: "job_title",
        label: "Job title",
        maxLength: 200,
        placeholder: "Mathematician",
        autoComplete: "organization-title",
      },
    ],
  },
  {
    title: "Address",
    description: "Optional postal details.",
    fields: [
      {
        name: "address",
        label: "Street address",
        maxLength: 300,
        placeholder: "1 Market St, Suite 400",
        autoComplete: "street-address",
        wide: true,
      },
      {
        name: "city",
        label: "City",
        maxLength: 120,
        placeholder: "San Francisco",
        autoComplete: "address-level2",
      },
      {
        name: "state",
        label: "State / region",
        maxLength: 120,
        placeholder: "CA",
        autoComplete: "address-level1",
      },
      {
        name: "postal_code",
        label: "Postal code",
        maxLength: 20,
        placeholder: "94105",
        autoComplete: "postal-code",
      },
      {
        name: "country",
        label: "Country",
        maxLength: 120,
        placeholder: "USA",
        autoComplete: "country-name",
      },
    ],
  },
  {
    title: "Notes",
    description: "Anything worth remembering. No length limit.",
    fields: [
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
        maxLength: 10_000,
        placeholder: "Met at the SF hackathon.",
        wide: true,
      },
    ],
  },
];

export const CONTACT_FIELDS: ContactFieldSpec[] = CONTACT_FIELD_GROUPS.flatMap(
  (group) => group.fields,
);

/** Pull the contact fields out of a submitted form, as raw strings. */
export function formDataToValues(
  formData: FormData,
): Record<keyof ContactInput, string> {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [
      field.name,
      String(formData.get(field.name) ?? ""),
    ]),
  ) as Record<keyof ContactInput, string>;
}
