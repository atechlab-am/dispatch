import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LeadsPage from "../LeadsPage.jsx";

const LEAD_ONE = {
  id: 1, business_name: "Acme Plumbing", title: "Acme Plumbing", industry: "Plumbing",
  address: "1 Main St", area: "Downtown", phone: "555-0100", website: "acmeplumbing.com",
  contact_name: "Jane Doe", contact_email: "jane@acmeplumbing.com", contact_phone: "555-0101",
  stage: "new", source: "other", priority: "high", outreach_channel: null,
  value_estimate: null, lost_reason: "", date_contacted: null, follow_up_date: null,
  notes: "", owner_id: 1, converted_client_id: null,
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
};

const LEAD_LOST = {
  ...LEAD_ONE, id: 2, business_name: "Lost Co", stage: "lost", lost_reason: "Went with a competitor",
};

vi.mock("../api/leads.js", () => ({
  listLeads: vi.fn().mockResolvedValue([]),
  deleteLead: vi.fn(),
  bulkUpdateLeads: vi.fn(),
  bulkDeleteLeads: vi.fn(),
  importLeadsCsv: vi.fn(),
  downloadLeadsCsv: vi.fn(),
  downloadLeadsSampleCsv: vi.fn(),
  createLead: vi.fn(),
  updateLead: vi.fn(),
  moveLeadStage: vi.fn(),
  convertLeadToClient: vi.fn(),
  checkLeadDuplicates: vi.fn().mockResolvedValue([]),
  listLeadActivities: vi.fn().mockResolvedValue([]),
  addLeadActivity: vi.fn(),
}));

import { listLeads, deleteLead, bulkDeleteLeads } from "../api/leads.js";

test("renders leads in the Active tab by default, excluding Lost", async () => {
  listLeads.mockResolvedValue([LEAD_ONE, LEAD_LOST]);
  render(<LeadsPage showToast={() => {}} />);

  expect(await screen.findByText("Acme Plumbing")).toBeInTheDocument();
  expect(screen.queryByText("Lost Co")).not.toBeInTheDocument();
});

test("switching to the Lost tab shows lost leads", async () => {
  listLeads.mockResolvedValue([LEAD_ONE, LEAD_LOST]);
  render(<LeadsPage showToast={() => {}} />);
  await screen.findByText("Acme Plumbing");

  fireEvent.click(screen.getByText(/Lost \(1\)/));
  expect(await screen.findByText("Lost Co")).toBeInTheDocument();
  expect(screen.queryByText("Acme Plumbing")).not.toBeInTheDocument();
});

test("the All tab shows every lead regardless of stage", async () => {
  listLeads.mockResolvedValue([LEAD_ONE, LEAD_LOST]);
  render(<LeadsPage showToast={() => {}} />);
  await screen.findByText("Acme Plumbing");

  fireEvent.click(screen.getByText(/All \(2\)/));
  expect(await screen.findByText("Acme Plumbing")).toBeInTheDocument();
  expect(await screen.findByText("Lost Co")).toBeInTheDocument();
});

test("deleting a lead calls the API and removes it from the table", async () => {
  listLeads.mockResolvedValue([LEAD_ONE]);
  deleteLead.mockResolvedValue();
  window.confirm = vi.fn(() => true);
  render(<LeadsPage showToast={() => {}} />);

  await screen.findByText("Acme Plumbing");
  fireEvent.click(screen.getByText("Delete"));

  await waitFor(() => expect(deleteLead).toHaveBeenCalledWith(1));
  await waitFor(() => expect(screen.queryByText("Acme Plumbing")).not.toBeInTheDocument());
});

test("bulk selection reveals a bulk-action toolbar and bulk delete works", async () => {
  listLeads.mockResolvedValue([LEAD_ONE]);
  bulkDeleteLeads.mockResolvedValue({ updated: 1 });
  window.confirm = vi.fn(() => true);
  render(<LeadsPage showToast={() => {}} />);

  await screen.findByText("Acme Plumbing");
  const checkboxes = screen.getAllByRole("checkbox");
  fireEvent.click(checkboxes[1]); // [0] is select-all

  expect(await screen.findByText("1 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Delete Selected"));

  await waitFor(() => expect(bulkDeleteLeads).toHaveBeenCalledWith([1]));
});

test("clicking + New Lead opens the create modal", async () => {
  listLeads.mockResolvedValue([]);
  render(<LeadsPage showToast={() => {}} />);
  await waitFor(() => expect(listLeads).toHaveBeenCalled());

  fireEvent.click(screen.getByText("+ New Lead"));
  expect(await screen.findByText("New Lead")).toBeInTheDocument();
});
