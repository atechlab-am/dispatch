import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LoginPageSettingsPanel from "../LoginPageSettingsPanel.jsx";

vi.mock("../api/loginBranding.js", () => ({
  getLoginBranding: vi.fn(),
  updateLoginBranding: vi.fn(),
}));

import { getLoginBranding, updateLoginBranding } from "../api/loginBranding.js";

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  subtitle: "internal use only",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  getLoginBranding.mockResolvedValue(DEFAULT_FORM);
});

test("loads current settings and saves changes", async () => {
  updateLoginBranding.mockResolvedValue({ ...DEFAULT_FORM, company_name: "New Name" });
  const showToast = vi.fn();

  render(<LoginPageSettingsPanel onClose={() => {}} showToast={showToast} />);

  const nameInput = await screen.findByDisplayValue("ATech Solutions");
  fireEvent.change(nameInput, { target: { value: "New Name" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateLoginBranding).toHaveBeenCalledWith(expect.objectContaining({ company_name: "New Name" })));
  expect(await screen.findByText("✓ Saved!")).toBeInTheDocument();
  expect(showToast).not.toHaveBeenCalled();
});

test("shows an error toast when saving fails", async () => {
  updateLoginBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(<LoginPageSettingsPanel onClose={() => {}} showToast={showToast} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save Login Page settings.", "err"));
  expect(screen.queryByText("✓ Saved!")).not.toBeInTheDocument();
});

test("shows an error toast when the initial load fails", async () => {
  getLoginBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(<LoginPageSettingsPanel onClose={() => {}} showToast={showToast} />);

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to load Login Page settings.", "err"));
});

test("close button calls onClose without saving", async () => {
  const onClose = vi.fn();
  render(<LoginPageSettingsPanel onClose={onClose} showToast={vi.fn()} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Close"));

  expect(updateLoginBranding).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
