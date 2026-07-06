import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import QuotesPage, { QuoteEditorRoute } from "../QuotesPage.jsx";

vi.mock("../api/quotes.js", () => ({
  listQuotes: vi.fn().mockResolvedValue({
    items: [{ id: "QUO-2026-00001", client_name: "Acme Corp", status: "Draft",
      issue_date: "2026-06-01", expiry_date: null, total: 100 }],
    total: 1,
  }),
  getQuote: vi.fn().mockResolvedValue({
    id: "QUO-2026-00042", client_id: null, client_name: "Acme Corp",
    client_email: "", client_address: "", status: "Draft", issue_date: "2026-06-01",
    expiry_date: "", notes: "", tax_rate: 0, subtotal: 100, tax_amount: 0, total: 100,
    converted_invoice_id: null, lines: [],
  }),
  createQuote: vi.fn(), updateQuote: vi.fn(), deleteQuote: vi.fn(),
  setQuoteStatus: vi.fn(), convertQuoteToInvoice: vi.fn(), sendQuoteEmail: vi.fn(),
  quotePdfUrl: vi.fn((id) => `/quotes/${id}/pdf`),
}));
vi.mock("../api/clients.js", () => ({ listClients: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/client.js", () => ({ openPdfWithAuth: vi.fn() }));

import { getQuote } from "../api/quotes.js";

const noop = () => {};

test("quote list renders rows from the API", async () => {
  render(
    <MemoryRouter initialEntries={["/quotes"]}>
      <QuotesPage showToast={noop} />
    </MemoryRouter>
  );
  expect(await screen.findByText("QUO-2026-00001")).toBeInTheDocument();
  expect(screen.getByText("Acme Corp")).toBeInTheDocument();
});

test("/quotes/new renders the create form (no fetch)", async () => {
  render(
    <MemoryRouter initialEntries={["/quotes/new"]}>
      <Routes>
        <Route path="/quotes/new" element={<QuoteEditorRoute showToast={noop} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText("New Quote")).toBeInTheDocument();
  expect(screen.getByText("Create Quote")).toBeInTheDocument();
  expect(getQuote).not.toHaveBeenCalled();
});

test("/quotes/:id fetches and renders the quote", async () => {
  render(
    <MemoryRouter initialEntries={["/quotes/QUO-2026-00042"]}>
      <Routes>
        <Route path="/quotes/:quoteId" element={<QuoteEditorRoute showToast={noop} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByText("Quote QUO-2026-00042")).toBeInTheDocument();
  expect(getQuote).toHaveBeenCalledWith("QUO-2026-00042");
});
