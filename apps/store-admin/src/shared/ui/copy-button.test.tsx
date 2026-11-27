import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "./copy-button";

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
  });
}

afterEach(() => {
  if (original) {
    Object.defineProperty(navigator, "clipboard", original);
  } else {
    delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

function renderButton() {
  return render(
    <CopyButton
      value="https://example.test/p/1"
      label="Копіювати"
      copiedLabel="Скопійовано"
      failedLabel="Не вдалося скопіювати"
    />,
  );
}

describe("CopyButton", () => {
  it("keeps a 44 px touch height below md (TASK-2555)", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Копіювати" })).toHaveClass(
      "max-md:min-h-11",
    );
  });

  it("shows the copied label once the clipboard accepts the value", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    // After setup(): user-event installs its own clipboard stub on navigator.
    const user = userEvent.setup();
    setClipboard({ writeText });
    renderButton();

    await user.click(screen.getByRole("button", { name: "Копіювати" }));

    expect(writeText).toHaveBeenCalledWith("https://example.test/p/1");
    expect(
      await screen.findByRole("button", { name: "Скопійовано" }),
    ).toBeInTheDocument();
  });

  it("shows the failed label when the clipboard API is unavailable", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    renderButton();

    await user.click(screen.getByRole("button", { name: "Копіювати" }));

    expect(
      await screen.findByRole("button", { name: "Не вдалося скопіювати" }),
    ).toBeInTheDocument();
  });
});
