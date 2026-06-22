import { renderWithProviders, screen, userEvent } from "./render";
import { Button } from "@/shared/ui";

/**
 * Harness smoke test — proves the store-admin Jest setup (jsdom + RTL + MSW
 * lifecycle + providers) renders a real shared/ui component and handles events.
 */
describe("store-admin test harness", () => {
  it("renders a shared/ui Button and handles a click", async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();

    renderWithProviders(<Button onClick={onClick}>Зберегти</Button>);

    const button = screen.getByRole("button", { name: "Зберегти" });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
