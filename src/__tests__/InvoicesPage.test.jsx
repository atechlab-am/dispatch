import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import InvoicesPage, { InvoiceEditorRoute } from "../InvoicesPage.jsx";

vi.mock("../api/invoices.js", () => ({
  listInvoices: vi.fn().mockResolvedValue({
    items: [{ id: "INV-2026-00001", client_name: "Acme Corp", status: "Draft",
      issue_date: "2026-06-01", due_date: null, total: 100 }],
    total: 1,
  }),
  getInvoice: vi.fn().mockResolvedValue({
    id: "INV-2026-00042", ticket_id: null, client_id: null, client_name: "Acme Corp",
    client_email: "", client_address: "", status: "Draft", issue_date: "2026-06-01",
    due_date: "", notes: "", tax_rate: 0, subtotal: 100, tax_amount: 0, total: 100,
    amount_paid: 0, balance: 100, lines: [], linked_tickets: [],
  }),
  createInvoice: vi.fn(), updateInvoice: vi.fn(), deleteInvoice: vi.fn(),
  listPayments: vi.fn().mockResolvedValue([]),
  recordPayment: vi.fn(), deletePayment: vi.fn(), sendInvoiceEmail: vi.fn(),
  invoicePdfUrl: vi.fn((id) => `/invoices/${id}/pdf`),
  listUnbilledTickets: vi.fn().mockResolvedValue([]),
  listUnbilledTicketsForClient: vi.fn().mockResolvedValue([]),
  attachTickets: vi.fn(), detachTicket: vi.fn(), markTicketsPaid: vi.fn(),
}));
vi.mock("../api/clients.js", () => ({ listClients: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/client.js", () => ({ openPdfWithAuth: vi.fn() }));

import { getInvoice } from "../api/invoices.js";

const noop = () => {};

test("invoice list renders rows from the API", async () => {
  render(
    <MemoryRouter initialEntries={["/invoices"]}>
      <InvoicesPage showToast={noop} />
    </MemoryRouter>
  );
  expect(await screen.findByText("INV-2026-00001")).toBeInTheDocument();
  expect(screen.getByText("Acme Corp")).toBeInTheDocument();
});

test("/invoices/new renders the create form (no fetch)", async () => {
  render(
    <MemoryRouter initialEntries={["/invoices/new"]}>
      <Routes>
        <Route path="/invoices/new" element={<InvoiceEditorRoute showToast={noop} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText("New Invoice")).toBeInTheDocument();
  expect(screen.getByText("Create Invoice")).toBeInTheDocument();
  expect(getInvoice).not.toHaveBeenCalled();
});

test("/invoices/:id fetches and renders the invoice", async () => {
  render(
    <MemoryRouter initialEntries={["/invoices/INV-2026-00042"]}>
      <Routes>
        <Route path="/invoices/:invoiceId" element={<InvoiceEditorRoute showToast={noop} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText("Invoice INV-2026-00042")).toBeInTheDocument();
  expect(getInvoice).toHaveBeenCalledWith("INV-2026-00042");
});
