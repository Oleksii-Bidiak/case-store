jest.mock("./monitoring", () => ({ captureException: jest.fn() }));

import { act, render, screen } from "@testing-library/react";
import { captureException } from "./monitoring";
import { lazyComponent } from "./lazy-component";

function Panel({ label }: { label: string }) {
  return <p>{label}</p>;
}

beforeEach(() => {
  jest.mocked(captureException).mockClear();
});

describe("lazyComponent (TASK-2524)", () => {
  it("renders nothing until the code arrives, then the component with its props", async () => {
    const lazy = lazyComponent(() => Promise.resolve(Panel));

    const { container } = render(<lazy.Component label="Кошик" />);

    expect(await screen.findByText("Кошик")).toBeInTheDocument();
    expect(container.childNodes).toHaveLength(1);
  });

  it("joins one load in flight instead of starting another", async () => {
    const loader = jest.fn(() => Promise.resolve(Panel));
    const lazy = lazyComponent(loader);

    await Promise.all([lazy.load(), lazy.load()]);
    await lazy.load();

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and reports when the import fails, and the next load retries", async () => {
    const failure = new Error("ChunkLoadError");
    const loader = jest
      .fn<Promise<typeof Panel>, []>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(Panel);
    const lazy = lazyComponent(loader);

    const { container } = render(<lazy.Component label="Кошик" />);
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
    expect(captureException).toHaveBeenCalledWith(failure);

    // The failure is forgotten: the next open loads again, and the mounted
    // host shows the component once it arrives.
    await act(() => lazy.load());

    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Кошик")).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("never rejects to its caller, so a preload handler needs no catch", async () => {
    const lazy = lazyComponent(() => Promise.reject(new Error("offline")));

    await expect(lazy.load()).resolves.toBe(false);
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("tells the caller whether the code arrived, so a host can undo its open", async () => {
    const loader = jest
      .fn<Promise<typeof Panel>, []>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Panel);
    const lazy = lazyComponent(loader);

    await expect(lazy.load()).resolves.toBe(false);
    await expect(lazy.load()).resolves.toBe(true);
    await expect(lazy.load()).resolves.toBe(true);
  });

  it("reports a failing chunk once, however often the trigger retries it", async () => {
    const loader = jest.fn(() => Promise.reject(new Error("offline")));
    const lazy = lazyComponent(loader);

    await lazy.load();
    await lazy.load();
    await lazy.load();

    expect(loader).toHaveBeenCalledTimes(3);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
