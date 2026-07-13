import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import DocumentBrandingSettingsPanel from "../DocumentBrandingSettingsPanel.jsx";

vi.mock("../api/documentBranding.js", () => ({
  getDocumentBranding: vi.fn(),
  updateDocumentBranding: vi.fn(),
  getTemplatePlaceholders: vi.fn(),
  previewInvoiceTemplate: vi.fn(),
  previewQuoteTemplate: vi.fn(),
}));

import {
  getDocumentBranding, updateDocumentBranding, getTemplatePlaceholders,
  previewInvoiceTemplate, previewQuoteTemplate,
} from "../api/documentBranding.js";

const DEFAULT_FORM = {
  company_name: "ATech Solutions",
  website: "atechsolutions.org",
  primary_color: "#1A5CBA",
  accent_color: "#E8A020",
  logo_url: "",
  footer_text: "Thank you for your business",
  font_size_header: 22,
  font_size_body: 14,
  font_size_table: 13,
  font_size_totals: 15,
  use_custom_invoice_template: false,
  custom_invoice_template: "",
  use_custom_quote_template: false,
  custom_quote_template: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentBranding.mockResolvedValue(DEFAULT_FORM);
  getTemplatePlaceholders.mockResolvedValue({
    invoice_placeholders: ["company_name", "invoice_id", "lines_html"],
    quote_placeholders: ["company_name", "quote_id", "lines_html"],
  });
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

test("shows the specific server error when a custom template save is rejected", async () => {
  const err = new Error("Validation failed");
  err.response = { data: { detail: "Invoice template error: Unknown placeholder(s): bogus" } };
  updateDocumentBranding.mockRejectedValue(err);
  const showToast = vi.fn();

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={showToast} />);
  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Invoice template error: Unknown placeholder(s): bogus", "err"));
});

test("adjusts a font size slider and saves it", async () => {
  updateDocumentBranding.mockResolvedValue({ ...DEFAULT_FORM, font_size_header: 30 });
  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />);

  await screen.findByDisplayValue("ATech Solutions");
  expect(screen.getByText("22px")).toBeInTheDocument();

  const sliders = screen.getAllByRole("slider");
  fireEvent.change(sliders[0], { target: { value: "30" } });
  fireEvent.click(screen.getByText("Save Changes"));

  await waitFor(() => expect(updateDocumentBranding).toHaveBeenCalledWith(expect.objectContaining({ font_size_header: 30 })));
});

test("enabling a custom invoice template reveals the editor, placeholders, and preview button", async () => {
  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />);
  await screen.findByDisplayValue("ATech Solutions");

  expect(screen.queryByText(/Available placeholders/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Use a custom invoice template"));

  expect(await screen.findByText(/Available placeholders \(3\)/)).toBeInTheDocument();
  expect(screen.getByText("👁 Preview")).toBeInTheDocument();
});

test("previewing an invoice template opens the rendered HTML", async () => {
  previewInvoiceTemplate.mockResolvedValue("<html><body>Preview</body></html>");
  const openSpy = vi.spyOn(window, "open").mockReturnValue({
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
  });

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />);
  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Use a custom invoice template"));

  const textarea = await screen.findByPlaceholderText("<html>...</html>");
  fireEvent.change(textarea, { target: { value: "<html>{{invoice_id}}</html>" } });
  fireEvent.click(screen.getByText("👁 Preview"));

  await waitFor(() => expect(previewInvoiceTemplate).toHaveBeenCalledWith("<html>{{invoice_id}}</html>"));
  await waitFor(() => expect(openSpy).toHaveBeenCalled());
  openSpy.mockRestore();
});

test("shows an error toast when previewing a broken template", async () => {
  const err = new Error("bad template");
  err.response = { data: { detail: "Unknown placeholder(s): nope" } };
  previewInvoiceTemplate.mockRejectedValue(err);
  const showToast = vi.fn();

  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={showToast} />);
  await screen.findByDisplayValue("ATech Solutions");
  fireEvent.click(screen.getByText("Use a custom invoice template"));

  const textarea = await screen.findByPlaceholderText("<html>...</html>");
  fireEvent.change(textarea, { target: { value: "<html>{{nope}}</html>" } });
  fireEvent.click(screen.getByText("👁 Preview"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Unknown placeholder(s): nope", "err"));
});

test("enabling a custom quote template shows its own editor independent of the invoice one", async () => {
  render(<DocumentBrandingSettingsPanel onClose={() => {}} showToast={vi.fn()} />);
  await screen.findByDisplayValue("ATech Solutions");

  fireEvent.click(screen.getByText("Use a custom quote template"));
  expect(await screen.findByText(/Available placeholders \(3\)/)).toBeInTheDocument();
  expect(screen.queryByText("Use a custom invoice template").closest("div").textContent).not.toContain("Available placeholders");
});
