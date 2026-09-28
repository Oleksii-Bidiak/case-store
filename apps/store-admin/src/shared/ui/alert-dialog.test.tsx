import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dict } from "@/shared/config";
import { useConfirmDialog } from "./alert-dialog";

/** A button that asks, then records the answer on screen. */
function Harness() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            description: "Сховати 3 товари?",
            confirmLabel: "Сховати",
            destructive: true,
          });
          setAnswer(ok ? "yes" : "no");
        }}
      >
        ask
      </button>
      <output>{answer}</output>
      {confirmDialog}
    </>
  );
}

describe("useConfirmDialog (TASK-812)", () => {
  it("renders an alertdialog with title, description and the action's own verb", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "ask" }));

    const dialog = await screen.findByRole("alertdialog", {
      name: dict.common.confirmTitle,
    });
    expect(dialog).toHaveAccessibleDescription("Сховати 3 товари?");
    expect(screen.getByRole("button", { name: "Сховати" })).toBeInTheDocument();
    // Initial focus on the safe answer.
    expect(
      screen.getByRole("button", { name: dict.common.cancel }),
    ).toHaveFocus();
  });

  it("resolves true on confirm", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "ask" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Сховати" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("yes"),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("resolves false on cancel and on Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "ask" }));
    await userEvent.click(
      await screen.findByRole("button", { name: dict.common.cancel }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("no"),
    );

    await userEvent.click(screen.getByRole("button", { name: "ask" }));
    await screen.findByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("no");
  });
});
