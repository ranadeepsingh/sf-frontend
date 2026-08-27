import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import ContactForm from "@/components/contacts/ContactForm";
import { saveContactAction } from "@/app/contacts/actions";

export const metadata: Metadata = {
  title: "New contact",
  description: "Add a contact to the address book.",
};

export default function NewContactPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link
          href="/contacts"
          className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          All contacts
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
          New contact
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Emails are unique across the address book.
        </p>
      </div>

      <ContactForm
        action={saveContactAction.bind(null, null)}
        submitLabel="Create contact"
        cancelHref="/contacts"
      />
    </div>
  );
}
