import { toast as sonnerToast } from "sonner";
import { toast } from "./toast";

/**
 * TASK-422 — the per-type duration policy.
 *
 * This is asserted here, at the wrapper, rather than by timing a real toast in
 * jsdom: proving "6000 ms" end-to-end needs fake timers driving sonner's
 * internal dismiss timer plus its 400 ms exit animation, and a test like that
 * fails for reasons that have nothing to do with the policy. What actually
 * matters is what this module hands sonner, and that is directly observable.
 *
 * The rendered half (a dismiss button exists, clicking it removes the toast)
 * lives in `app/providers.test.tsx`.
 */
jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(() => 1),
    error: jest.fn(() => 2),
    dismiss: jest.fn(() => undefined),
  },
}));

const mocked = sonnerToast as unknown as {
  success: jest.Mock;
  error: jest.Mock;
  dismiss: jest.Mock;
};

describe("toast wrapper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps an error on screen until it is dismissed", () => {
    toast.error("Не вдалося зберегти товар");

    expect(mocked.error).toHaveBeenCalledWith(
      "Не вдалося зберегти товар",
      expect.objectContaining({ duration: Number.POSITIVE_INFINITY }),
    );
  });

  it("lets a success inherit the Toaster's 6 s default", () => {
    toast.success("Товар збережено");

    // No duration of its own — whatever `app/providers.tsx` sets applies. A
    // duration hard-coded here would silently detach the two.
    const [, data] = mocked.success.mock.calls[0] as [unknown, unknown];
    expect(data).toBeUndefined();
  });

  it("still lets a caller opt out of the sticky default", () => {
    toast.error("Тимчасова помилка", { duration: 3000 });

    expect(mocked.error).toHaveBeenCalledWith(
      "Тимчасова помилка",
      expect.objectContaining({ duration: 3000 }),
    );
  });

  it("passes a dismiss through, with and without an id", () => {
    toast.dismiss("abc");
    toast.dismiss();

    expect(mocked.dismiss).toHaveBeenNthCalledWith(1, "abc");
    expect(mocked.dismiss).toHaveBeenNthCalledWith(2, undefined);
  });
});
