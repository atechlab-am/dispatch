import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import { InvoiceDetailPage, TicketsPage } from "../portal/PortalApp.jsx";

vi.mock("../portal/api.js", () => ({
  getMyInvoice: vi.fn().mockResolvedValue({
    id: "INV-2026-00001", status: "Sent", issue_date: "2026-06-01", due_date: "2026-06-30",
    notes: "", subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100,
    amount_paid: 0, balance: 100, created_at: "2026-06-01T00:00:00Z", lines: [],
  }),
  portalInvoicePdfUrl: vi.fn((id) => `/portal/invoices/${id}/pdf`),
  createCheckoutSession: vi.fn().mockResolvedValue({ checkout_url: "https://checkout.stripe.com/test" }),
  listMyTickets: vi.fn().mockResolvedValue([]),
}));
vi.mock("../portal/client.js", () => ({ openPdfWithAuth: vi.fn() }));

import { createCheckoutSession } from "../portal/api.js";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/p/acme/invoices/INV-2026-00001"]}>
      <Routes>
        <Route path="/p/:slug/invoices/:invoiceId" element={<InvoiceDetailPage slug="acme" showToast={() => {}} />} />
      </Routes>
    </MemoryRouter>
  );
}

test("Pay Now creates a checkout session and redirects to Stripe", async () => {
  delete window.location;
  window.location = { href: "" };

  renderPage();
  const payButtons = await screen.findAllByText(/Pay Now/i);
  fireEvent.click(payButtons[0]);

  await waitFor(() => expect(createCheckoutSession).toHaveBeenCalledWith("INV-2026-00001"));
  await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/test"));
});

test("New Request button uses the configured accent color, not the static default", async () => {
  const customBranding = {
    company_name: "Acme Co", primary_color: "#C0392B", accent_color: "#C0392B",
    text_color: "#0f172a", muted_color: "#64748b", on_color_text: "#FFFFFF", logo_url: "",
  };
  render(
    <MemoryRouter initialEntries={["/p/acme/tickets"]}>
      <Routes>
        <Route path="/p/:slug/tickets" element={<TicketsPage slug="acme" showToast={() => {}} branding={customBranding} />} />
      </Routes>
    </MemoryRouter>
  );

  const button = await screen.findByText("+ New Request");
  expect(button.style.background).toBe("rgb(192, 57, 43)"); // #C0392B
});
