import { render, waitFor } from "@testing-library/react";
import {
  StaleCanonicalGuard,
  pruneStaleCanonicals,
} from "./stale-canonical-guard";

const OLD = "https://shop.test/catalog/chohly/iphone-15";
const NEW = "https://shop.test/categories/chohly";

function addCanonical(href: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "canonical";
  link.href = href;
  document.head.appendChild(link);
  return link;
}

function canonicals(): (string | null)[] {
  return Array.from(
    document.head.querySelectorAll('link[rel="canonical"]'),
  ).map((link) => link.getAttribute("href"));
}

afterEach(() => {
  document.head
    .querySelectorAll('link[rel="canonical"]')
    .forEach((link) => link.remove());
});

describe("pruneStaleCanonicals (TASK-835)", () => {
  it("does nothing until the expected canonical is in the head", () => {
    addCanonical(OLD);

    expect(pruneStaleCanonicals(document.head, NEW)).toBe(false);
    expect(canonicals()).toEqual([OLD]);
  });

  it("drops every other canonical once the expected one is present", () => {
    addCanonical(OLD);
    addCanonical(NEW);

    expect(pruneStaleCanonicals(document.head, NEW)).toBe(true);
    expect(canonicals()).toEqual([NEW]);
  });
});

describe("StaleCanonicalGuard (TASK-835)", () => {
  it("removes the orphaned canonical when the new one streams in later", async () => {
    // The server-rendered tag React never hydrated.
    addCanonical(OLD);
    render(<StaleCanonicalGuard href={NEW} />);
    // Nothing to compare against yet — the orphan must stay for now.
    expect(canonicals()).toEqual([OLD]);

    // The navigation's metadata commit inserts the new canonical.
    addCanonical(NEW);

    await waitFor(() => expect(canonicals()).toEqual([NEW]));
  });

  it("leaves a lone, correct canonical alone", async () => {
    addCanonical(NEW);
    render(<StaleCanonicalGuard href={NEW} />);

    await waitFor(() => expect(canonicals()).toEqual([NEW]));
  });
});
