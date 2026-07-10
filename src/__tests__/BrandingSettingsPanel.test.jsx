import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { BrandingProvider } from "../branding.jsx";
import BrandingSettingsPanel from "../BrandingSettingsPanel.jsx";

vi.mock("../api/branding.js", () => ({
  getBranding: vi.fn(),
  updateBranding: vi.fn(),
}));

import { getBranding, updateBranding } from "../api/branding.js";

const DEFAULT_API_BRANDING = {
  company_name: "ATech Solutions",
  tagline: "IT Support & Managed Services",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
  favicon_url: "",
  sidebar_dark: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getBranding.mockResolvedValue(DEFAULT_API_BRANDING);
});

test("saving calls updateBranding with the form data and shows a saved confirmation", async () => {
  updateBranding.mockResolvedValue({ ...DEFAULT_API_BRANDING, company_name: "New Name" });
  const showToast = vi.fn();

  render(
    <BrandingProvider>
      <BrandingSettingsPanel onClose={() => {}} showToast={showToast} />
    </BrandingProvider>
  );

  const nameInput = await screen.findByDisplayValue("ATech Solutions");
  fireEvent.change(nameInput, { target: { value: "New Name" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateBranding).toHaveBeenCalledWith(expect.objectContaining({ company_name: "New Name" })));
  expect(await screen.findByText("✓ Saved!")).toBeInTheDocument();
  expect(showToast).not.toHaveBeenCalled();
});

test("shows an error toast and no saved confirmation when the save request fails", async () => {
  updateBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(
    <BrandingProvider>
      <BrandingSettingsPanel onClose={() => {}} showToast={showToast} />
    </BrandingProvider>
  );

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save appearance settings.", "err"));
  expect(screen.queryByText("✓ Saved!")).not.toBeInTheDocument();
});

test("cancel reverts live-preview changes without calling updateBranding", async () => {
  const onClose = vi.fn();
  render(
    <BrandingProvider>
      <BrandingSettingsPanel onClose={onClose} showToast={vi.fn()} />
    </BrandingProvider>
  );

  const nameInput = await screen.findByDisplayValue("ATech Solutions");
  fireEvent.change(nameInput, { target: { value: "Changed But Not Saved" } });
  fireEvent.click(screen.getByText("Cancel (revert)"));

  expect(updateBranding).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
