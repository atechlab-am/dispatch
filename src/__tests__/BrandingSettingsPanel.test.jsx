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
  company_name: "Your Company",
  tagline: "IT Support & Managed Services",
  primary_color: "#2563EB",
  accent_color: "#F59E0B",
  text_color: "#0D1B2A",
  muted_color: "#5B6D82",
  on_color_text: "#FFFFFF",
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

  const nameInput = await screen.findByDisplayValue("Your Company");
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

  await screen.findByDisplayValue("Your Company");
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

  const nameInput = await screen.findByDisplayValue("Your Company");
  fireEvent.change(nameInput, { target: { value: "Changed But Not Saved" } });
  fireEvent.click(screen.getByText("Cancel (revert)"));

  expect(updateBranding).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("renders a Font Colors section with the fetched values and saves them", async () => {
  updateBranding.mockResolvedValue({ ...DEFAULT_API_BRANDING, text_color: "#123456" });
  render(
    <BrandingProvider>
      <BrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />
    </BrandingProvider>
  );

  expect(await screen.findByText("Font Colors")).toBeInTheDocument();
  const textColorInput = screen.getByDisplayValue("#0D1B2A");
  fireEvent.change(textColorInput, { target: { value: "#123456" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateBranding).toHaveBeenCalledWith(expect.objectContaining({ text_color: "#123456" })));
});
