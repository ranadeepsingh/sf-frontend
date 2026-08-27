import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, ChevronLeft } from "lucide-react";
import ContactForm from "@/components/contacts/ContactForm";
import { saveContactAction } from "@/app/contacts/actions";
import { getContact } from "@/lib/contacts/api";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseId(raw: string): number {
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) notFound();
  return id;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const contact = await getContact(parseId((await params).id));
  return { title: contact ? `Edit ${contact.full_name}` : "Contact not found" };
}

export default async function EditContactPage({
  params,
  searchParams,
}: PageProps) {
  const id = parseId((await params).id);
  const contact = await getContact(id);
  if (!contact) notFound();

  // Set by the create flow when the contact saved but its photo upload did not.
  const photoFailed = (await searchParams)?.photo === "failed";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link
          href={`/contacts/${contact.id}`}
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {contact.full_name}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          Edit contact
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saving replaces every field, so a box you empty is cleared.
        </p>
      </div>

      {photoFailed ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-foreground"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span>
            {contact.full_name} was created, but the photo could not be
            uploaded. Choose it again and save to retry.
          </span>
        </div>
      ) : null}

      <ContactForm
        action={saveContactAction.bind(null, contact.id)}
        contact={contact}
        submitLabel="Save changes"
        cancelHref={`/contacts/${contact.id}`}
      />
    </div>
  );
}
