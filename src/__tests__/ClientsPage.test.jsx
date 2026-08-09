import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import ClientsPage, { ClientDetailPage } from "../ClientsPage.jsx";

const BUSINESS_PRIMARY = {
  id: 1, name: "Acme Corp", email: "info@acme.example.com", phone: "555-0100",
  address: "1 Main St", client_type: "business", company: "Acme Corp",
  notes: "", slug: "acme-corp", sla_tier: "gold",
};

// A business whose `company` field is blank (e.g. legacy data, or created via
// a path that didn't set it explicitly) — the header still displays its name
// via a fallback, so Edit Business should pre-fill the same way.
const BUSINESS_NO_COMPANY_FIELD = {
  id: 2, name: "Beacon Plumbing Co", email: "", phone: "",
  address: "", client_type: "business", company: "",
  notes: "", slug: null, sla_tier: null,
};

const RESIDENTIAL = {
  id: 3, name: "Jane Doe", email: "jane@example.com", phone: "555-0200",
  address: "42 Oak St", client_type: "residential", company: "",
  notes: "Prefers email contact", slug: null, sla_tier: null,
};

vi.mock("../api/clients.js", () => ({
  listClients: vi.fn().mockResolvedValue([]),
  getClient: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
  getCompanySummary: vi.fn().mockResolvedValue({
    ticket_count: 0, open_ticket_count: 0, invoice_count: 0, total_billed: 0, total_paid: 0, outstanding: 0,
  }),
}));

vi.mock("../api/invoices.js", () => ({
  clientStatement: vi.fn().mockResolvedValue({ invoices: [], total_billed: 0, total_paid: 0, outstanding: 0 }),
}));

import { listClients, getClient, updateClient, deleteClient, getCompanySummary } from "../api/clients.js";

function renderClientsPage(props) {
  return render(<MemoryRouter><ClientsPage {...props} /></MemoryRouter>);
}

function renderWithDetailRoute({ initialPath, listProps, detailProps }) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/clients" element={<ClientsPage {...listProps} />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage {...detailProps} />} />
        <Route path="/portal" element={<div>Portal Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ─── List page: rows are clickable links, not inline-expanding ────────────────

test("clicking a business row navigates to its detail page", async () => {
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  renderWithDetailRoute({ initialPath: "/clients", listProps: { showToast: () => {}, features: { sla_tiers: true } } });

  const row = await screen.findByText("Acme Corp");
  fireEvent.click(row);

  expect(await screen.findByDisplayValue("Gold (faster SLA)")).toBeInTheDocument(); // detail page rendered
  expect(getClient).toHaveBeenCalledWith("1");
});

test("clicking a residential row navigates to its detail page", async () => {
  listClients.mockResolvedValue([RESIDENTIAL]);
  getClient.mockResolvedValue(RESIDENTIAL);
  renderWithDetailRoute({ initialPath: "/clients", listProps: { showToast: () => {} } });

  const row = await screen.findByText("Jane Doe");
  fireEvent.click(row);

  expect(await screen.findByDisplayValue("42 Oak St")).toBeInTheDocument();
});

test("list page no longer expands inline — no Edit Business button visible before navigating", async () => {
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  renderClientsPage({ showToast: () => {}, features: { sla_tiers: true } });

  await screen.findByText("Acme Corp");
  expect(screen.queryByText("Edit Business")).not.toBeInTheDocument();
});

// ─── Detail page: business ──────────────────────────────────────────────────

test("shows the SLA tier for a business when the feature is enabled", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true } } });

  expect(await screen.findByDisplayValue("Gold (faster SLA)")).toBeInTheDocument();
});

test("hides the SLA tier field entirely when the feature is disabled", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: false } } });

  await waitFor(() => expect(screen.getByDisplayValue("1 Main St")).toBeInTheDocument());
  expect(screen.queryByText("SLA Tier")).not.toBeInTheDocument();
});

test("editing a business on its detail page saves the chosen SLA tier", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  updateClient.mockResolvedValue({ ...BUSINESS_PRIMARY, sla_tier: "bronze" });
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true } } });

  const select = await screen.findByDisplayValue("Gold (faster SLA)");
  fireEvent.change(select, { target: { value: "bronze" } });
  fireEvent.click(screen.getByText("Save Business"));

  await waitFor(() => expect(updateClient).toHaveBeenCalledWith(1, expect.objectContaining({ sla_tier: "bronze" })));
});

test("detail page pre-fills Company Name from the client's name when the company field is blank", async () => {
  getClient.mockResolvedValue(BUSINESS_NO_COMPANY_FIELD);
  listClients.mockResolvedValue([BUSINESS_NO_COMPANY_FIELD]);
  renderWithDetailRoute({ initialPath: "/clients/2", detailProps: { showToast: () => {}, features: { sla_tiers: true } } });

  // The Company Name field should show the client's name, not render blank —
  // confirmed via its current value rather than assuming a specific input.
  expect(await screen.findByDisplayValue("Beacon Plumbing Co")).toBeInTheDocument();
});

test("business detail page shows its ticket/invoice summary across all contacts", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  getCompanySummary.mockResolvedValue({
    ticket_count: 5, open_ticket_count: 2, invoice_count: 3, total_billed: 900, total_paid: 500, outstanding: 400,
  });
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true } } });

  expect(getCompanySummary).toHaveBeenCalledWith("Acme Corp");
  expect(await screen.findByText("5 total, 2 open")).toBeInTheDocument();
  expect(await screen.findByText(/3 total — \$900\.00 billed/)).toBeInTheDocument();
  expect(await screen.findByText(/\$400\.00 outstanding/)).toBeInTheDocument();
});

test("shows a Portal Access link for admins that deep-links to the Portal page", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true }, isAdmin: true } });

  expect(await screen.findByText("Portal Access")).toBeInTheDocument();
});

test("hides the Portal Access link for non-admins", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true }, isAdmin: false } });

  await waitFor(() => expect(screen.getByText("Save Business")).toBeInTheDocument());
  expect(screen.queryByText("Portal Access")).not.toBeInTheDocument();
});

test("deleting a business from its detail page navigates back to the list", async () => {
  getClient.mockResolvedValue(BUSINESS_PRIMARY);
  listClients.mockResolvedValue([]);
  deleteClient.mockResolvedValue();
  window.confirm = vi.fn(() => true);
  renderWithDetailRoute({ initialPath: "/clients/1", detailProps: { showToast: () => {}, features: { sla_tiers: true } } });

  await screen.findByText("Save Business");
  fireEvent.click(screen.getByText("Delete"));

  await waitFor(() => expect(deleteClient).toHaveBeenCalledWith(1));
  expect(await screen.findByText("No clients yet — use the buttons above to add a business or contact.")).toBeInTheDocument();
});

// ─── Detail page: residential ────────────────────────────────────────────────

test("residential detail page shows and saves the full record", async () => {
  getClient.mockResolvedValue(RESIDENTIAL);
  listClients.mockResolvedValue([RESIDENTIAL]);
  updateClient.mockResolvedValue({ ...RESIDENTIAL, notes: "Updated notes" });
  renderWithDetailRoute({ initialPath: "/clients/3", detailProps: { showToast: () => {} } });

  expect(await screen.findByDisplayValue("Jane Doe")).toBeInTheDocument();
  expect(screen.getByDisplayValue("42 Oak St")).toBeInTheDocument();

  const notes = screen.getByDisplayValue("Prefers email contact");
  fireEvent.change(notes, { target: { value: "Updated notes" } });
  fireEvent.click(screen.getByText("Save"));

  await waitFor(() => expect(updateClient).toHaveBeenCalledWith(3, expect.objectContaining({ notes: "Updated notes" })));
});
