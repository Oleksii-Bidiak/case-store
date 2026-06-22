import { useState } from "react";
import { renderWithProviders, screen } from "./render";

function Counter() {
  const [n] = useState(7);
  return <span>count {n}</span>;
}

/**
 * Harness smoke test — proves the `component` Jest project (jsdom + RTL +
 * providers) renders and queries correctly. Not tied to any app component.
 */
describe("component test harness", () => {
  it("renders a node and exposes jest-dom matchers", () => {
    renderWithProviders(<p>harness ok</p>);
    expect(screen.getByText("harness ok")).toBeInTheDocument();
  });

  it("supports useState in a rendered component", () => {
    renderWithProviders(<Counter />);
    expect(screen.getByText("count 7")).toBeInTheDocument();
  });
});
