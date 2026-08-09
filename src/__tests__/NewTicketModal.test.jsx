import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../api/client.js", () => ({
  setTokens: vi.fn(), clearTokens: vi.fn(), registerLogoutHandler: vi.fn(),
  hasStoredSession: vi.fn(() => false), downloadWithAuth: vi.fn(),
}));

import { NewTicketModal } from "../App.jsx";

const clients = [
  { id: 1, client_type: "business", company: "Acme Corp", name: "Acme Corp", email: "acme@corp.com", phone: "555-0100", address: "1 Main St" },
];
const users = [
  { id: 1, name: "Jane Tech", role: "technician" },
  { id: 2, name: "Bob Admin", role: "admin" },
];

test("creating a ticket sends description, assigned technician, and scheduling fields", async () => {
  const onCreate = vi.fn().mockResolvedValue();
  render(<NewTicketModal onCreate={onCreate} onCancel={() => {}} clients={clients} templates={[]} users={users} />);

  fireEvent.change(screen.getByPlaceholderText("Brief description of the issue…"), { target: { value: "Printer jam" } });
  fireEvent.change(screen.getByPlaceholderText("Optional — more detail than the title allows…"), { target: { value: "Jammed on tray 2" } });
  fireEvent.change(screen.getByDisplayValue("— Select a client —"), { target: { value: "1" } });
  fireEvent.change(screen.getByDisplayValue("— Unassigned —"), { target: { value: "1" } });

  fireEvent.click(screen.getByText("Create Ticket"));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: "Printer jam",
    description: "Jammed on tray 2",
    assignedTo: 1,
    workLocation: "on_site",
    needsScheduling: true,
  })));
});

test("picking Remote auto-unchecks Needs Scheduling", async () => {
  const onCreate = vi.fn().mockResolvedValue();
  render(<NewTicketModal onCreate={onCreate} onCancel={() => {}} clients={clients} templates={[]} users={users} />);

  fireEvent.change(screen.getByPlaceholderText("Brief description of the issue…"), { target: { value: "Remote setup" } });
  fireEvent.click(screen.getByText("Remote"));
  expect(screen.getByLabelText("Needs scheduling")).not.toBeChecked();

  fireEvent.click(screen.getByText("Create Ticket"));

  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    workLocation: "remote",
    needsScheduling: false,
  })));
});

test("manually re-checking Needs Scheduling after picking Remote works normally", () => {
  render(<NewTicketModal onCreate={vi.fn()} onCancel={() => {}} clients={clients} templates={[]} users={users} />);

  fireEvent.click(screen.getByText("Remote"));
  expect(screen.getByLabelText("Needs scheduling")).not.toBeChecked();

  fireEvent.click(screen.getByLabelText("Needs scheduling"));
  expect(screen.getByLabelText("Needs scheduling")).toBeChecked();
});

test("Create Ticket is disabled until a title is entered", () => {
  render(<NewTicketModal onCreate={vi.fn()} onCancel={() => {}} clients={clients} templates={[]} users={users} />);
  expect(screen.getByText("Create Ticket")).toBeDisabled();

  fireEvent.change(screen.getByPlaceholderText("Brief description of the issue…"), { target: { value: "Something broke" } });
  expect(screen.getByText("Create Ticket")).not.toBeDisabled();
});
