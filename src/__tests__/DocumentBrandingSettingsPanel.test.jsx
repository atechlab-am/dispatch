import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import DocumentBrandingSettingsPanel from "../DocumentBrandingSettingsPanel.jsx";

vi.mock("../api/documentBranding.js", () => ({
  getDocumentBranding: vi.fn(),
  updateDocumentBranding: vi.fn(),
}));

import { getDocumentBranding, updateDocumentBranding } from "../api/documentBranding.js";

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  website: "atechsolutions.org",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
  footer_text: "Thank you for your business",
};

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentBranding.mockResolvedValue(DEFAULT_FORM);
});

test("loads current settings and saves changes", async () => {
  updateDocumentBranding.mockResolvedValue({ ...DEFAULT_FORM, company_name: "New Name" });
  const showToast = vi.fn();

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={showToast} />);

  const nameInput = await screen.findByDisplayValue("ATech Solutions");
  fireEvent.change(nameInput, { target: { value: "New Name" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateDocumentBranding).toHaveBeenCalledWith(expect.objectContaining({ company_name: "New Name" })));
  expect(await screen.findByText("✓ Saved!")).toBeInTheDocument();
  expect(showToast).not.toHaveBeenCalled();
});

test("shows an error toast when saving fails", async () => {
  updateDocumentBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={showToast} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to save Quote/Invoice PDF settings.", "err"));
  expect(screen.queryByText("✓ Saved!")).not.toBeInTheDocument();
});

test("shows an error toast when the initial load fails", async () => {
  getDocumentBranding.mockRejectedValue(new Error("network error"));
  const showToast = vi.fn();

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={showToast} />);

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to load Quote/Invoice PDF settings.", "err"));
});

test("close button calls onClose without saving", async () => {
  const onClose = vi.fn();
  render(<DocumentBrandingSettingsPanel onClose={onClose} showToast={vi.fn()} />);

  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Close"));

  expect(updateDocumentBranding).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("saves the footer text field", async () => {
  updateDocumentBranding.mockResolvedValue({ ...DEFAULT_FORM, footer_text: "Custom footer" });
  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />);

  const footerInput = await screen.findByDisplayValue("Thank you for your business");
  fireEvent.change(footerInput, { target: { value: "Custom footer" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateDocumentBranding).toHaveBeenCalledWith(expect.objectContaining({ footer_text: "Custom footer" })));
});
