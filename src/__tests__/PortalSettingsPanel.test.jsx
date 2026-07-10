import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import PortalSettingsPanel from "../PortalSettingsPanel.jsx";

vi.mock("../api/portalBranding.js", () => ({
  getPortalBranding: vi.fn(),
  updatePortalBranding: vi.fn(),
}));

import { getPortalBranding, updatePortalBranding } from "../api/portalBranding.js";

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  getPortalBranding.mockResolvedValue(DEFAULT_FORM);
});

test("loads current settings and saves changes", async () => {
  updatePortalBranding.mockResolvedValue({ ...DEFAULT_FORM, company_name: "New Name" });
  const showToast = vi.fn();

  render(<PortalSettingsPanel onClose={() => {}} showToast={showToast} />);

  const nameInput = await screen.findByDisplayValue("ATech Solutions");
  fireEvent.change(nameInput, { target: { value: "New Name" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updatePortalBranding).toHaveBeenCalledWith(expect.objectContaining({ company_name: "New Name" })));
  expect(await screen.findByText("✓ Saved!")).toBeInTheDocument();
  expect(showToast).not.toHaveBeenCalled();
});

test("shows an error toast when saving fails", async () => {
  updatePortalBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(<PortalSettingsPanel onClose={() => {}} showToast={showToast} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save Client Portal settings.", "err"));
  expect(screen.queryByText("✓ Saved!")).not.toBeInTheDocument();
});

test("close button calls onClose without saving", async () => {
  const onClose = vi.fn();
  render(<PortalSettingsPanel onClose={onClose} showToast={vi.fn()} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Close"));

  expect(updatePortalBranding).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
