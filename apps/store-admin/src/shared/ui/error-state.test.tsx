import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { ErrorState } from "./error-state";

/** Dashboard П4 / registry error: every load failure offers «Повторити». */
describe("ErrorState", () => {
  it("inline: shows the message and retries", async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(
      <ErrorState
        message="Не вдалося завантажити показники."
        onRetry={onRetry}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("data-variant", "inline");
    expect(alert).toHaveTextContent("Не вдалося завантажити показники.");
    await user.click(screen.getByRole("button", { name: dict.canon.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("card: a title, a description and a primary «Повторити»", async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(
      <ErrorState
        variant="card"
        message="Сервер не відповів. Спробуйте ще раз."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(dict.canon.errorTitle)).toBeInTheDocument();
    expect(
      screen.getByText("Сервер не відповів. Спробуйте ще раз."),
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: dict.canon.retry });
    expect(retry).toHaveAttribute("data-variant", "default");
    await user.click(retry);
    expect(onRetry).toHaveBeenCalled();
  });

  it("disables the button while a retry is in flight", () => {
    render(<ErrorState variant="card" onRetry={() => {}} isRetrying />);
    expect(
      screen.getByRole("button", { name: dict.canon.retry }),
    ).toBeDisabled();
  });

  it("offers no button when the caller cannot retry", () => {
    render(<ErrorState message="Немає доступу." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
