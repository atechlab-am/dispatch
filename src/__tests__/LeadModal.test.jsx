import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LeadModal from "../LeadModal.jsx";

const WON_LEAD = {
  id: 5, business_name: "Won Co", title: "Won Co", industry: "", address: "",
  area: "", phone: "", website: "", contact_name: "", contact_email: "won@co.com",
  contact_phone: "", stage: "won", source: "other", priority: "medium",
  outreach_channel: null, value_estimate: null, lost_reason: "",
  date_contacted: null, follow_up_date: null, notes: "", owner_id: 1,
  converted_client_id: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
};

vi.mock("../api/leads.js", () => ({
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
  moveLeadStage: vi.fn(),
  convertLeadToClient: vi.fn(),
  checkLeadDuplicates: vi.fn().mockResolvedValue([]),
  listLeadActivities: vi.fn().mockResolvedValue([]),
  addLeadActivity: vi.fn(),
}));

import {
  createLead, updateLead, convertLeadToClient, checkLeadDuplicates, listLeadActivities, addLeadActivity,
} from "../api/leads.js";

test("creating a new lead requires a business name and calls createLead on submit", async () => {
  createLead.mockResolvedValue({ ...WON_LEAD, id: 9, business_name: "New Biz Co", stage: "new" });
  const onSaved = vi.fn();
  render(<LeadModal lead={null} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={onSaved} onConverted={() => {}} onDeleted={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("Acme Plumbing"), { target: { value: "New Biz Co" } });
  fireEvent.click(screen.getByText("Save"));

  await waitFor(() => expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ business_name: "New Biz Co" })));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test("shows a duplicate warning while typing a business name that matches an existing lead", async () => {
  checkLeadDuplicates.mockResolvedValue([
    { id: 1, business_name: "Acme Plumbing", website: "", phone: "", stage: "new", matched_on: ["business_name"] },
  ]);
  render(<LeadModal lead={null} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  fireEvent.change(screen.getByPlaceholderText("Acme Plumbing"), { target: { value: "Acme Plumb" } });

  await waitFor(() => expect(checkLeadDuplicates).toHaveBeenCalled(), { timeout: 1000 });
  expect(await screen.findByText(/Possible duplicate/)).toBeInTheDocument();
});

test("moving stage to Lost requires a reason before saving", async () => {
  updateLead.mockResolvedValue({ ...WON_LEAD, stage: "contacted" });
  const showToast = vi.fn();
  render(<LeadModal lead={{ ...WON_LEAD, stage: "contacted" }} existingLeads={[]} showToast={showToast} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  await screen.findByText("Won Co");
  fireEvent.change(screen.getByDisplayValue("Contacted"), { target: { value: "lost" } });
  fireEvent.click(screen.getByText("Save"));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining("reason"), "err"));
});

test("Convert to Client button appears only for Won leads without a converted_client_id, and calls the API", async () => {
  convertLeadToClient.mockResolvedValue({ client_id: 42 });
  const onConverted = vi.fn();
  window.confirm = vi.fn(() => true);
  render(<LeadModal lead={WON_LEAD} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={onConverted} onDeleted={() => {}} />);

  const convertBtn = await screen.findByText("Convert to Client");
  fireEvent.click(convertBtn);

  await waitFor(() => expect(convertLeadToClient).toHaveBeenCalledWith(5));
  await waitFor(() => expect(onConverted).toHaveBeenCalledWith(expect.objectContaining({ converted_client_id: 42 })));
});

test("Convert to Client button is hidden once a lead is already converted", async () => {
  render(<LeadModal lead={{ ...WON_LEAD, converted_client_id: 7 }} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  await screen.findByText("Won Co");
  expect(screen.queryByText("Convert to Client")).not.toBeInTheDocument();
  expect(await screen.findByText(/Converted to Client #7/)).toBeInTheDocument();
});

test("activity timeline loads and a new note can be added", async () => {
  listLeadActivities.mockResolvedValue([
    { id: 1, lead_id: 5, user_id: 1, type: "call", body: "Left a voicemail", occurred_at: "2026-07-01T00:00:00Z" },
  ]);
  addLeadActivity.mockResolvedValue({ id: 2, lead_id: 5, user_id: 1, type: "note", body: "Follow up next week", occurred_at: "2026-07-02T00:00:00Z" });

  render(<LeadModal lead={WON_LEAD} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  expect(await screen.findByText("Left a voicemail")).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("What happened?"), { target: { value: "Follow up next week" } });
  fireEvent.click(screen.getByText("Add"));

  await waitFor(() => expect(addLeadActivity).toHaveBeenCalledWith(5, "call", "Follow up next week"));
});

test("Follow-up scheduled checkbox defaults unchecked and is saved when toggled on", async () => {
  createLead.mockResolvedValue({ ...WON_LEAD, id: 9, business_name: "New Biz Co", stage: "new", follow_up_scheduled: true });
  render(<LeadModal lead={null} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  const checkbox = screen.getByLabelText("Follow-up scheduled");
  expect(checkbox).not.toBeChecked();

  fireEvent.change(screen.getByPlaceholderText("Acme Plumbing"), { target: { value: "New Biz Co" } });
  fireEvent.click(checkbox);
  expect(checkbox).toBeChecked();

  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(createLead).toHaveBeenCalledWith(expect.objectContaining({ follow_up_scheduled: true })));
});

test("Follow-up scheduled checkbox reflects an existing lead's saved value", async () => {
  render(<LeadModal lead={{ ...WON_LEAD, follow_up_date: "2026-08-01", follow_up_scheduled: true }} existingLeads={[]} showToast={() => {}} onClose={() => {}} onSaved={() => {}} onConverted={() => {}} onDeleted={() => {}} />);

  await screen.findByText("Won Co");
  expect(screen.getByLabelText("Follow-up scheduled")).toBeChecked();
});
