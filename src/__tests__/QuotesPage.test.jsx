import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import QuotesPage, { QuoteEditorRoute, QuoteEditor } from "../QuotesPage.jsx";

vi.mock("../api/quotes.js", () => ({
  listQuotes: vi.fn().mockResolvedValue({
    items: [{ id: "QUO-2026-00001", client_name: "Acme Corp", project_name: "Office Network Upgrade", status: "Draft",
      issue_date: "2026-06-01", expiry_date: null, total: 100 }],
    total: 1,
  }),
  getQuote: vi.fn().mockResolvedValue({
    id: "QUO-2026-00042", client_id: null, client_name: "Acme Corp",
    client_email: "", client_address: "", project_name: "Office Network Upgrade", status: "Draft", issue_date: "2026-06-01",
    expiry_date: "", notes: "", tax_rate: 0, subtotal: 100, tax_amount: 0, total: 100,
    converted_invoice_id: null, lines: [],
  }),
  createQuote: vi.fn(), updateQuote: vi.fn(), deleteQuote: vi.fn(),
  setQuoteStatus: vi.fn(), convertQuoteToInvoice: vi.fn(), sendQuoteEmail: vi.fn(),
  quotePdfUrl: vi.fn((id) => `/quotes/${id}/pdf`),
}));
vi.mock("../api/clients.js", () => ({ listClients: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/materials.js", () => ({ listMaterials: vi.fn().mockResolvedValue([]) }));
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
  expect(screen.getByText("Office Network Upgrade")).toBeInTheDocument();
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

test("/quotes/:id populates the Project Name field from the fetched quote", async () => {
  render(
    <MemoryRouter initialEntries={["/quotes/QUO-2026-00042"]}>
      <Routes>
        <Route path="/quotes/:quoteId" element={<QuoteEditorRoute showToast={noop} />} />
      </Routes>
    </MemoryRouter>
  );
  expect(await screen.findByDisplayValue("Office Network Upgrade")).toBeInTheDocument();
});

describe("Service line type", () => {
  const businessClient = { id: 1, name: "Acme Corp", company: "Acme Corp", client_type: "business", email: "", address: "" };

  test("switching a line to Service shows a type-to-search input", () => {
    render(<QuoteEditor clients={[businessClient]} onSave={noop} onCancel={noop} showToast={noop} />);
    fireEvent.change(screen.getByDisplayValue("Labor"), { target: { value: "Service" } });
    expect(screen.getByPlaceholderText("Search services…")).toBeInTheDocument();
  });

  test("typing shows matching catalogue entries with a preview price", async () => {
    render(<QuoteEditor clients={[businessClient]} onSave={noop} onCancel={noop} showToast={noop} />);
    fireEvent.change(screen.getByDisplayValue("Labor"), { target: { value: "Service" } });

    const descInput = screen.getByPlaceholderText("Search services…");
    fireEvent.change(descInput, { target: { value: "Server Health" } });
    fireEvent.focus(descInput);

    expect(await screen.findByText("Server Health Check")).toBeInTheDocument();
  });

  test("picking a flat-fee service autofills qty/unit_price/amount", async () => {
    render(<QuoteEditor clients={[businessClient]} onSave={noop} onCancel={noop} showToast={noop} />);
    fireEvent.change(screen.getByDisplayValue("Labor"), { target: { value: "Service" } });

    const descInput = screen.getByPlaceholderText("Search services…");
    fireEvent.change(descInput, { target: { value: "IT Health Check" } });
    fireEvent.focus(descInput);

    const match = await screen.findByText("IT Health Check");
    fireEvent.mouseDown(match);

    await waitFor(() => expect(descInput.value).toBe("IT Health Check"));
    expect(screen.getAllByText("250.00", { exact: false }).length).toBeGreaterThan(0);
  });
});
