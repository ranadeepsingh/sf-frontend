import React from "react";
import { Buffer } from "node:buffer";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactPhotoField from "@/components/contacts/ContactPhotoField";
import { makeContact, TEST_PNG_DATA_URL } from "../mocks/handlers";
import { EMPTY_FORM_STATE } from "@/lib/contacts/types";

/** A FileReader whose `load`/`error` events fire only when the test says so. */
class ControlledFileReader {
  static pending: ControlledFileReader[] = [];
  result: string | ArrayBuffer | null = null;
  private listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  readAsDataURL() {
    ControlledFileReader.pending.push(this);
  }

  emit(type: "load" | "error", result: string | null = null) {
    this.result = result;
    act(() => {
      for (const listener of this.listeners.get(type) ?? []) listener();
    });
  }
}

const PNG_BYTES = Buffer.from(TEST_PNG_DATA_URL.split(",")[1], "base64");

/** A distinct but still valid PNG data URL, so previews can be told apart. */
function pngDataUrl(marker: number): string {
  const bytes = Buffer.concat([PNG_BYTES, Buffer.from([marker])]);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function pngFile(name: string): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

function intentOf(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLInputElement>('input[name="photo_intent"]')
    ?.value;
}

describe("ContactPhotoField reads that finish late", () => {
  const RealFileReader = globalThis.FileReader;
  let onClientErrorChange: jest.Mock;

  beforeEach(() => {
    ControlledFileReader.pending = [];
    onClientErrorChange = jest.fn();
    globalThis.FileReader = ControlledFileReader as unknown as typeof FileReader;
  });

  afterEach(() => {
    globalThis.FileReader = RealFileReader;
  });

  function renderField(photo: string | null) {
    return render(
      <ContactPhotoField
        contact={photo === null ? undefined : makeContact({ photo })}
        submitResult={EMPTY_FORM_STATE}
        onClientErrorChange={onClientErrorChange}
      />,
    );
  }

  it("keeps a removal when the read it replaced finishes late", async () => {
    const { container } = renderField(TEST_PNG_DATA_URL);

    await userEvent.upload(
      screen.getByLabelText(/contact photo/i),
      pngFile("late.png"),
    );
    expect(ControlledFileReader.pending).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }));
    ControlledFileReader.pending[0].emit("load", pngDataUrl(1));

    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText(/^Ready:/)).toBeNull();
    expect(intentOf(container)).toBe("remove");
  });

  it("keeps the newest selection when an older read finishes late", async () => {
    const { container } = renderField(null);
    const input = screen.getByLabelText(/contact photo/i);

    await userEvent.upload(input, pngFile("first.png"));
    await userEvent.upload(input, pngFile("second.png"));
    expect(ControlledFileReader.pending).toHaveLength(2);

    const newest = pngDataUrl(2);
    ControlledFileReader.pending[1].emit("load", newest);
    ControlledFileReader.pending[0].emit("load", pngDataUrl(1));

    expect(container.querySelector("img")).toHaveAttribute("src", newest);
    expect(screen.getByText("Ready: second.png")).toBeInTheDocument();
    expect(intentOf(container)).toBe("replace");
  });

  it("ignores a failure reported by a superseded read", async () => {
    const { container } = renderField(null);
    const input = screen.getByLabelText(/contact photo/i);

    await userEvent.upload(input, pngFile("first.png"));
    await userEvent.upload(input, pngFile("second.png"));

    const newest = pngDataUrl(2);
    ControlledFileReader.pending[1].emit("load", newest);
    onClientErrorChange.mockClear();
    ControlledFileReader.pending[0].emit("error");

    expect(onClientErrorChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", newest);
  });

  it("drops a read that finishes after the field unmounts", async () => {
    const { unmount } = renderField(null);

    await userEvent.upload(
      screen.getByLabelText(/contact photo/i),
      pngFile("orphan.png"),
    );
    const pending = ControlledFileReader.pending[0];
    unmount();
    onClientErrorChange.mockClear();

    pending.emit("load", pngDataUrl(3));
    pending.emit("error");

    expect(onClientErrorChange).not.toHaveBeenCalled();
  });
});

describe("ContactPhotoField rejected selections", () => {
  let onClientErrorChange: jest.Mock;

  beforeEach(() => {
    onClientErrorChange = jest.fn();
  });

  function renderField(photo: string | null) {
    return render(
      <ContactPhotoField
        contact={photo === null ? undefined : makeContact({ photo })}
        submitResult={EMPTY_FORM_STATE}
        onClientErrorChange={onClientErrorChange}
      />,
    );
  }

  const badFile = () =>
    new File(["not an image"], "avatar.svg", { type: "image/svg+xml" });

  it("offers a way out when there is no photo to remove", async () => {
    const { container } = renderField(null);
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText<HTMLInputElement>(/contact photo/i);

    await user.upload(input, badFile());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a JPEG, PNG, or WebP image.",
    );
    expect(screen.queryByRole("button", { name: /remove photo/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /discard selection/i }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(onClientErrorChange).toHaveBeenLastCalledWith(null);
    expect(input.files).toHaveLength(0);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(intentOf(container)).toBe("remove");
  });

  it("leaves an existing photo in place when the selection is discarded", async () => {
    const { container } = renderField(TEST_PNG_DATA_URL);
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText(/contact photo/i), badFile());
    await user.click(screen.getByRole("button", { name: /discard selection/i }));

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      TEST_PNG_DATA_URL,
    );
    expect(intentOf(container)).toBe("preserve");
    expect(screen.queryByRole("button", { name: /discard selection/i })).toBeNull();
  });

  it("drops an earlier staged replacement, since the input no longer holds it", async () => {
    const { container } = renderField(TEST_PNG_DATA_URL);
    const user = userEvent.setup({ applyAccept: false });
    const input = screen.getByLabelText<HTMLInputElement>(/contact photo/i);
    await user.upload(input, pngFile("good.png"));
    await screen.findByText("Ready: good.png");
    expect(intentOf(container)).toBe("replace");

    // Choosing a rejected file evicted `good.png` from the input.
    await user.upload(input, badFile());
    await user.click(screen.getByRole("button", { name: /discard selection/i }));

    expect(screen.queryByText(/^Ready:/)).toBeNull();
    expect(intentOf(container)).toBe("preserve");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      TEST_PNG_DATA_URL,
    );
  });
});

describe("ContactPhotoField after a failed submit", () => {
  function renderField(photo: string | null) {
    const contact = photo === null ? undefined : makeContact({ photo });
    const utils = render(
      <ContactPhotoField
        contact={contact}
        submitResult={EMPTY_FORM_STATE}
        onClientErrorChange={jest.fn()}
      />,
    );
    return {
      ...utils,
      failSubmit: () =>
        utils.rerender(
          <ContactPhotoField
            contact={contact}
            submitResult={{ status: "error", message: "Email is taken." }}
            onClientErrorChange={jest.fn()}
          />,
        ),
    };
  }

  it("returns a new contact to having no photo", async () => {
    const { container, failSubmit } = renderField(null);
    const input = screen.getByLabelText<HTMLInputElement>(/contact photo/i);

    await userEvent.upload(input, pngFile("avatar.png"));
    await screen.findByText("Ready: avatar.png");

    failSubmit();

    expect(intentOf(container)).toBe("remove");
    expect(container.querySelector("img")).toBeNull();
    expect(input.files).toHaveLength(0);
    expect(screen.getByText(/choose it again/i)).toBeInTheDocument();
  });

  it("leaves an untouched photo alone", async () => {
    const { container, failSubmit } = renderField(TEST_PNG_DATA_URL);

    failSubmit();

    expect(intentOf(container)).toBe("preserve");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      TEST_PNG_DATA_URL,
    );
    expect(screen.queryByText(/choose it again/i)).toBeNull();
  });

  it("leaves an explicit removal alone", async () => {
    const { container, failSubmit } = renderField(TEST_PNG_DATA_URL);

    await userEvent.click(screen.getByRole("button", { name: /remove photo/i }));
    failSubmit();

    expect(intentOf(container)).toBe("remove");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByText(/choose it again/i)).toBeNull();
  });
});
