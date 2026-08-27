import React from "react";
import { fireEvent, render } from "@testing-library/react";
import ContactAvatar from "@/components/contacts/ContactAvatar";
import { makeContact, TEST_PNG_DATA_URL } from "../mocks/handlers";

describe("ContactAvatar", () => {
  it("renders a circular, cropped photo when one is available", () => {
    const photo = TEST_PNG_DATA_URL;
    const { container } = render(
      <ContactAvatar contact={makeContact({ photo })} />,
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", photo);
    expect(image).toHaveClass("aspect-square", "rounded-full", "object-cover");
  });

  it("falls back to initials when there is no photo or loading fails", () => {
    const { container, rerender } = render(
      <ContactAvatar contact={makeContact({ photo: null })} />,
    );
    expect(container).toHaveTextContent("AL");
    expect(container.querySelector("img")).toBeNull();

    rerender(
      <ContactAvatar
        contact={makeContact({ photo: "data:image/png;base64,broken" })}
      />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("AL");
  });
});
