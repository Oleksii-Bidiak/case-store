jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
// The stylesheet import is for the browser; Jest has no CSS transform.
jest.mock("./globals.css", () => ({}));

import * as Sentry from "@sentry/nextjs";
import { render, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import GlobalError from "./global-error";

const c = dict.common;

/**
 * TASK-880 — the last-resort fallback (root layout failed) renders its own
 * document, outside every provider, with the same dictionary copy as
 * app/error.tsx instead of inline strings.
 */
describe("app/global-error.tsx", () => {
  // It renders <html>/<body>, which React (rightly) warns about when the test
  // mounts it inside a <div>; that nesting is the harness, not the component.
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("uses the dictionary for the heading, body and actions", () => {
    render(<GlobalError error={new Error("boom")} retry={jest.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: c.errorTitle }),
    );
    expect(alert).toHaveTextContent(c.errorBody);
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: c.retry })).toBeInTheDocument();
  });

  it("retries on the button and reloads home through a plain link", async () => {
    const retry = jest.fn();
    render(<GlobalError error={new Error("boom")} retry={retry} />);

    await userEvent.click(screen.getByRole("button", { name: c.retry }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: c.goHome })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the digest and reports to Sentry", () => {
    const error = Object.assign(new Error("boom"), { digest: "4144696081" });
    render(<GlobalError error={error} retry={jest.fn()} />);

    expect(screen.getByText(c.errorCode("4144696081"))).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
