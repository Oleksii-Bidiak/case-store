jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));

import * as Sentry from "@sentry/nextjs";
import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import SegmentError from "./error";

const c = dict.common;

function boom(digest?: string) {
  return Object.assign(new Error("boom"), digest ? { digest } : {});
}

/**
 * TASK-880 — the segment error boundary renders inside the root layout's
 * `<main>` (Header and Footer stay), with dictionary copy, one primary retry
 * and a way home.
 */
describe("app/error.tsx", () => {
  beforeEach(() => jest.clearAllMocks());

  it("announces the dictionary heading and body, never the raw error message", () => {
    render(<SegmentError error={boom()} retry={jest.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: c.errorTitle }),
    );
    expect(alert).toHaveTextContent(c.errorBody);
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    // It sits inside the layout's <main>, so it must not open another one.
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("retries the segment on «Спробувати ще раз» — the only filled action", async () => {
    const retry = jest.fn();
    const { container } = render(<SegmentError error={boom()} retry={retry} />);

    const button = screen.getByRole("button", { name: c.retry });
    await userEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);

    const filled = container.querySelectorAll(".bg-primary");
    expect(filled).toHaveLength(1);
    expect(filled[0]).toBe(button);
  });

  it("links home as an outline action", () => {
    render(<SegmentError error={boom()} retry={jest.fn()} />);

    const home = screen.getByRole("link", { name: c.goHome });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveAttribute("data-variant", "outline");
  });

  it("shows the server digest for support, and nothing without one", () => {
    const { rerender } = render(
      <SegmentError error={boom("1647901055")} retry={jest.fn()} />,
    );
    expect(screen.getByText(c.errorCode("1647901055"))).toBeInTheDocument();

    rerender(<SegmentError error={boom()} retry={jest.fn()} />);
    expect(screen.queryByText(/Код помилки/)).not.toBeInTheDocument();
  });

  it("reports the error to Sentry once", () => {
    const error = boom();
    render(<SegmentError error={error} retry={jest.fn()} />);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
