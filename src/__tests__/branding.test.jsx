import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../api/branding.js", () => ({
  getBranding: vi.fn().mockRejectedValue(new Error("not configured")),
  updateBranding: vi.fn(),
}));

import { BrandingProvider, useBranding, getStoredThemeMode, setStoredThemeMode } from "../branding.jsx";

// jsdom in this test environment doesn't provide a real localStorage (confirmed:
// `localStorage` is `undefined`, not just empty) — polyfill a minimal in-memory
// version so persistence can actually be tested. The production code already
// handles a missing localStorage gracefully via try/catch (see branding.jsx);
// this polyfill lets us verify the *happy* path too, not just the fallback.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

function ThemeProbe() {
  const { themeMode, toggleThemeMode } = useBranding();
  return (
    <div>
      <div data-testid="mode">{themeMode}</div>
      <button onClick={toggleThemeMode}>Toggle theme</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.cssText = "";
});

test("defaults to Modern UI when nothing is stored", async () => {
  render(<BrandingProvider><ThemeProbe /></BrandingProvider>);
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("modern"));
});

test("toggling switches to Office UI and applies the Office CSS vars", async () => {
  render(<BrandingProvider><ThemeProbe /></BrandingProvider>);
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("modern"));

  fireEvent.click(screen.getByText("Toggle theme"));

  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("office"));
  expect(document.documentElement.style.getPropertyValue("--dispatch-bg")).toBe("#F3F2F1");
  expect(document.documentElement.style.getPropertyValue("--dispatch-font")).toContain("Segoe UI");
});

test("toggling twice returns to Modern UI's colors", async () => {
  render(<BrandingProvider><ThemeProbe /></BrandingProvider>);
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("modern"));

  fireEvent.click(screen.getByText("Toggle theme"));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("office"));

  fireEvent.click(screen.getByText("Toggle theme"));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("modern"));
  expect(document.documentElement.style.getPropertyValue("--dispatch-bg")).toBe("#F4F7FC");
});

test("theme choice persists to localStorage and survives a remount", async () => {
  const { unmount } = render(<BrandingProvider><ThemeProbe /></BrandingProvider>);
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("modern"));

  fireEvent.click(screen.getByText("Toggle theme"));
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("office"));
  expect(localStorage.getItem("dispatch-theme-mode")).toBe("office");

  unmount();
  render(<BrandingProvider><ThemeProbe /></BrandingProvider>);
  await waitFor(() => expect(screen.getByTestId("mode")).toHaveTextContent("office"));
});

test("getStoredThemeMode falls back to modern for any unrecognized stored value", () => {
  setStoredThemeMode("something-invalid");
  expect(getStoredThemeMode()).toBe("modern");
});
