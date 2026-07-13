import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import ClientsPage from "../ClientsPage.jsx";

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

vi.mock("../api/clients.js", () => ({
  listClients: vi.fn().mockResolvedValue([]),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
}));

vi.mock("../api/invoices.js", () => ({
  clientStatement: vi.fn().mockResolvedValue({ invoices: [], total_billed: 0, total_paid: 0, outstanding: 0 }),
}));

import { listClients, updateClient } from "../api/clients.js";

test("shows the SLA tier for a business when the feature is enabled", async () => {
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  render(<ClientsPage showToast={() => {}} features={{ sla_tiers: true }} />);

  const header = await screen.findByText("Acme Corp");
  fireEvent.click(header);
  expect(await screen.findByText("gold")).toBeInTheDocument();
});

test("hides the SLA tier field entirely when the feature is disabled", async () => {
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  render(<ClientsPage showToast={() => {}} features={{ sla_tiers: false }} />);

  const header = await screen.findByText("Acme Corp");
  fireEvent.click(header);
  await waitFor(() => expect(screen.getByText("1 Main St")).toBeInTheDocument());
  expect(screen.queryByText("gold")).not.toBeInTheDocument();
});

test("editing a business shows the SLA Tier select and saves the chosen value", async () => {
  listClients.mockResolvedValue([BUSINESS_PRIMARY]);
  updateClient.mockResolvedValue({ ...BUSINESS_PRIMARY, sla_tier: "bronze" });
  render(<ClientsPage showToast={() => {}} features={{ sla_tiers: true }} />);

  const header = await screen.findByText("Acme Corp");
  fireEvent.click(header);
  fireEvent.click(await screen.findByText("Edit Business"));

  const select = await screen.findByDisplayValue("Gold (faster SLA)");
  fireEvent.change(select, { target: { value: "bronze" } });
  fireEvent.click(screen.getByText("Save Business"));

  await waitFor(() => expect(updateClient).toHaveBeenCalledWith(1, expect.objectContaining({ sla_tier: "bronze" })));
});

test("Edit Business pre-fills Company Name from the client's name when the company field is blank", async () => {
  listClients.mockResolvedValue([BUSINESS_NO_COMPANY_FIELD]);
  render(<ClientsPage showToast={() => {}} features={{ sla_tiers: true }} />);

  const header = await screen.findByText("Beacon Plumbing Co");
  fireEvent.click(header);
  fireEvent.click(await screen.findByText("Edit Business"));

  // The Company Name field should show the client's name, not render blank —
  // confirmed via its current value rather than assuming a specific input.
  expect(await screen.findByDisplayValue("Beacon Plumbing Co")).toBeInTheDocument();
});
