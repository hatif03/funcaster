// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import App from "./App";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("App layout", () => {
  it("has an in-flow Arc Studio footer link that opens safely", () => {
    const { container } = render(<App />);
    const link = container.querySelector("footer a");
    expect(link?.getAttribute("href")).toBe("https://studio.arc.io");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("has no fixed or sticky overlays", () => {
    const { container } = render(<App />);
    expect(
      container.querySelectorAll(".fixed, .sticky, .absolute").length,
    ).toBe(0);
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) {
      expect(el.style.position).not.toBe("fixed");
    }
  });

  it("shows the permanent play-money label and Funcaster branding", () => {
    const { getByTestId, getByRole } = render(<App />);
    expect(getByTestId("play-money-label").textContent).toBe(
      "PLAY MONEY · ARC TESTNET",
    );
    expect(getByRole("heading", { name: "Funcaster Pot" })).toBeTruthy();
  });

  it("shows the empty state without touching the network when no pot is selected", () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId("pot-empty")).toBeTruthy();
  });

  it("navigates between Pot, Create and About without leaving the base path", () => {
    const { getByTestId, queryByTestId } = render(<App />);
    fireEvent.click(getByTestId("nav-create"));
    expect(getByTestId("create-page")).toBeTruthy();
    expect(window.location.search).toBe("?view=create");
    fireEvent.click(getByTestId("nav-about"));
    expect(getByTestId("about-page")).toBeTruthy();
    expect(queryByTestId("create-page")).toBeNull();
    fireEvent.click(getByTestId("nav-pot"));
    expect(getByTestId("pot-empty")).toBeTruthy();
    expect(window.location.search).toBe("");
    expect(getByTestId("play-money-label")).toBeTruthy(); // visible on every page
  });

  it("opens the About page from ?view=about and states the trust model in plain language", () => {
    window.history.replaceState({}, "", "/?view=about");
    const { getByTestId } = render(<App />);
    const trust = getByTestId("trust-model").textContent ?? "";
    for (const phrase of [
      "no owner",
      "no pause",
      "no upgrade",
      "no fee",
      "oracle can only propose",
      "Circle controls USDC and EURC",
    ]) {
      expect(trust.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(getByTestId("about-deployment").textContent).toMatch(
      /No contract address is configured/,
    );
  });

  it("never claims verification, a deployment or a transaction it does not have", () => {
    for (const search of ["/", "/?view=create", "/?view=about"]) {
      cleanup();
      window.history.replaceState({}, "", search);
      const { container } = render(<App />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(
        /verified on|verified by|deployed at|0x[0-9a-fA-F]{64}/i,
      );
      expect(container.querySelector('[data-testid="tx-status"]')).toBeNull();
    }
  });
});
