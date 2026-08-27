import React from "react";
import { Buffer } from "node:buffer";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactForm from "@/components/contacts/ContactForm";
import { makeContact, TEST_PNG_DATA_URL } from "../mocks/handlers";
import type { FormState } from "@/lib/contacts/types";

function renderForm(action: jest.Mock, contact?: ReturnType<typeof makeContact>) {
  return render(
    <ContactForm
      action={action as never}
      contact={contact}
      submitLabel="Create contact"
      cancelHref="/contacts"
    />,
  );
}

describe("ContactForm", () => {
  it("renders every editable field", () => {
    renderForm(jest.fn());

    expect(screen.getByLabelText(/first name/i)).toBeRequired();
    expect(screen.getByLabelText(/last name/i)).toBeRequired();
    expect(screen.getByLabelText(/^email/i)).toBeRequired();
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired();
    expect(screen.getByLabelText(/notes/i).tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText(/contact photo/i)).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(screen.getByText(/maximum 2 MiB/i)).toBeInTheDocument();
  });

  it("prefills from an existing contact", () => {
    const photo = TEST_PNG_DATA_URL;
    const { container } = renderForm(jest.fn(), makeContact({ photo }));

    expect(screen.getByLabelText(/first name/i)).toHaveValue("Ada");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("ada@example.com");
    // Nulls become empty inputs rather than the string "null".
    expect(screen.getByLabelText(/street address/i)).toHaveValue("");
    expect(container.querySelector("img")).toHaveAttribute("src", photo);
    expect(screen.getByRole("button", { name: /remove photo/i })).toBeVisible();
  });

  it("validates photo type before submission", async () => {
    const action = jest.fn(async (): Promise<FormState> => ({ status: "idle" }));
    renderForm(action);
    const user = userEvent.setup({ applyAccept: false });
    const file = new File(["not an image"], "avatar.svg", {
      type: "image/svg+xml",
    });

    await user.upload(screen.getByLabelText(/contact photo/i), file);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, or WebP image.",
    );

    await user.click(screen.getByRole("button", { name: /create contact/i }));
    expect(action).not.toHaveBeenCalled();
  });

  it("validates photo size before submission", async () => {
    renderForm(jest.fn());
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    });

    await userEvent.upload(screen.getByLabelText(/contact photo/i), file);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Photo must be 2 MiB or smaller.",
    );
  });

  it("previews a valid upload as a data URL without object URLs", async () => {
    const { container } = renderForm(jest.fn());
    const payload = TEST_PNG_DATA_URL.split(",")[1];
    const file = new File([Buffer.from(payload, "base64")], "avatar.png", {
      type: "image/png",
    });

    await userEvent.upload(screen.getByLabelText(/contact photo/i), file);

    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toMatch(
        /^data:image\/png;base64,/,
      ),
    );
  });

  it("preserves an untouched photo and explicitly marks removal", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    const contact = makeContact({ photo: TEST_PNG_DATA_URL });
    const { unmount } = renderForm(action, contact);

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get("photo_intent")).toBe("preserve");

    unmount();
    action.mockClear();
    renderForm(action, contact);
    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }));
    expect(screen.queryByRole("button", { name: /remove photo/i })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get("photo_intent")).toBe("remove");
  });

  it("shows a typed photo error returned by the API", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "The API rejected these values.",
        fieldErrors: { photo: "Photo content is invalid." },
      }),
    );
    renderForm(action);

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    expect(await screen.findByText("Photo content is invalid.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByLabelText(/contact photo/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("submits the entered values to the action", async () => {
    const action = jest.fn<Promise<FormState>, [FormState, FormData]>(
      async () => ({ status: "idle" }),
    );
    renderForm(action);

    await userEvent.type(screen.getByLabelText(/first name/i), "Grace");
    await userEvent.type(screen.getByLabelText(/last name/i), "Hopper");
    await userEvent.type(screen.getByLabelText(/^email/i), "grace@example.com");
    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1];
    expect(formData.get("first_name")).toBe("Grace");
    expect(formData.get("email")).toBe("grace@example.com");
  });

  it("shows the summary and the per-field errors the action returns", async () => {
    const action = jest.fn(
      async (): Promise<FormState> => ({
        status: "error",
        message: "That email address is already taken.",
        fieldErrors: { email: "This email is already in use." },
        values: { first_name: "Grace" },
      }),
    );
    renderForm(action);

    await userEvent.click(screen.getByRole("button", { name: /create contact/i }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((node) => node.textContent)).toEqual(
      expect.arrayContaining([
        "That email address is already taken.",
        "This email is already in use.",
      ]),
    );
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("links back out without submitting", () => {
    renderForm(jest.fn());
    expect(screen.getByRole("link", { name: /cancel/i })).toHaveAttribute(
      "href",
      "/contacts",
    );
  });
});
