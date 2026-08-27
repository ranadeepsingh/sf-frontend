import React from "react";
import { render, screen } from "@testing-library/react";
import ContactAvatar from "@/components/contacts/ContactAvatar";
import { makeContact } from "../mocks/handlers";

function photo() {
  return document.querySelector(".contact-avatar img") as HTMLImageElement | null;
}

describe("ContactAvatar", () => {
  it("falls back to initials when there is no photo", () => {
    render(<ContactAvatar contact={makeContact()} />);

    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(photo()).toBeNull();
  });

  it("renders the photo through this app, never the API URL", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
      />,
    );

    expect(photo()?.getAttribute("src")).toMatch(
      /^\/api\/contacts\/1\/photo\/\?v=/,
    );
  });

  it("keeps the initials underneath, so a slow or broken photo leaves no hole", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
      />,
    );

    expect(screen.getByText("AL")).toBeInTheDocument();
    expect(photo()).toBeInTheDocument();
  });

  it("drops a photo that fails to load", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
      />,
    );

    const img = photo();
    expect(img).not.toBeNull();
    img?.dispatchEvent(new Event("error"));

    expect(photo()).toBeNull();
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("retries after a failure once the photo changes", () => {
    const { rerender } = render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
      />,
    );
    photo()?.dispatchEvent(new Event("error"));
    expect(photo()).toBeNull();

    rerender(
      <ContactAvatar
        contact={makeContact({
          photo_url: "/api/v1/contacts/1/photo",
          updated_at: "2026-09-01T00:00:00Z",
        })}
      />,
    );

    expect(photo()).not.toBeNull();
  });

  it("prefers an explicit preview over the saved photo", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
        previewSrc="blob:preview"
      />,
    );

    expect(photo()?.getAttribute("src")).toBe("blob:preview");
  });

  it("shows no photo when the preview is explicitly null (a pending removal)", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
        previewSrc={null}
      />,
    );

    expect(photo()).toBeNull();
  });

  it("decorates only: the photo carries no alt text to announce", () => {
    render(
      <ContactAvatar
        contact={makeContact({ photo_url: "/api/v1/contacts/1/photo" })}
      />,
    );

    expect(photo()).toHaveAttribute("alt", "");
  });
});
