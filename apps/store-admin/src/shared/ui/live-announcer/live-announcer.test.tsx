import { act, render, screen } from "@testing-library/react";
import { LiveAnnouncer, useAnnouncer } from "./live-announcer";

function Harness() {
  const { announcePolite, announceAssertive } = useAnnouncer();
  return (
    <>
      <button type="button" onClick={() => announcePolite("крок 1")}>
        polite
      </button>
      <button
        type="button"
        onClick={() => announcePolite("проміжний", { repeat: true })}
      >
        polite-repeat
      </button>
      <button
        type="button"
        onClick={() => announcePolite("осіла позиція", { repeat: true })}
      >
        polite-repeat-settled
      </button>
      <button type="button" onClick={() => announceAssertive("відхилено")}>
        assertive
      </button>
    </>
  );
}

const setup = () =>
  render(
    <LiveAnnouncer>
      <Harness />
    </LiveAnnouncer>,
  );

describe("shared/ui/live-announcer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("mounts two empty, clip-hidden regions that are never display:none", () => {
    setup();
    const polite = screen.getByTestId("tree-live-polite");
    const assertive = screen.getByTestId("tree-live-assertive");

    expect(polite).toHaveAttribute("role", "status");
    expect(polite).toHaveAttribute("aria-live", "polite");
    expect(polite).toHaveAttribute("aria-atomic", "true");
    expect(polite).toHaveClass("sr-only");
    expect(polite).toBeEmptyDOMElement();

    expect(assertive).toHaveAttribute("role", "alert");
    expect(assertive).toHaveAttribute("aria-live", "assertive");
    expect(assertive).toHaveAttribute("aria-atomic", "true");
    expect(assertive).toHaveClass("sr-only");
    expect(assertive).toBeEmptyDOMElement();

    expect(document.querySelectorAll("[aria-live]")).toHaveLength(2);
  });

  it("emits IMMEDIATELY on a non-repeat keypress (no 150ms delay)", () => {
    setup();
    act(() => {
      screen.getByRole("button", { name: "polite" }).click();
    });
    expect(screen.getByTestId("tree-live-polite")).toHaveTextContent("крок 1");
  });

  it("suppresses intermediates on a held key and emits only the settled position", () => {
    setup();
    const polite = screen.getByTestId("tree-live-polite");

    act(() => {
      screen.getByRole("button", { name: "polite-repeat" }).click();
    });
    // Nothing yet — the key is still repeating.
    expect(polite).toBeEmptyDOMElement();

    act(() => {
      jest.advanceTimersByTime(100);
      screen.getByRole("button", { name: "polite-repeat-settled" }).click();
    });
    expect(polite).toBeEmptyDOMElement();

    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(polite).toHaveTextContent("осіла позиція");
    expect(polite).not.toHaveTextContent("проміжний");
  });

  it("a deliberate keypress cancels a pending settled announcement", () => {
    setup();
    const polite = screen.getByTestId("tree-live-polite");

    act(() => {
      screen.getByRole("button", { name: "polite-repeat" }).click();
      screen.getByRole("button", { name: "polite" }).click();
    });
    expect(polite).toHaveTextContent("крок 1");

    act(() => {
      jest.advanceTimersByTime(500);
    });
    // The stale settled message must NOT overwrite the newer immediate one.
    expect(polite).toHaveTextContent("крок 1");
  });

  it("routes rejections to the assertive region only", () => {
    setup();
    act(() => {
      screen.getByRole("button", { name: "assertive" }).click();
    });
    expect(screen.getByTestId("tree-live-assertive")).toHaveTextContent(
      "відхилено",
    );
    expect(screen.getByTestId("tree-live-polite")).toBeEmptyDOMElement();
  });
});
