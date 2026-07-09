import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("../api/tickets.js", () => ({
  listTickets: vi.fn(), getTicket: vi.fn(), createTicket: vi.fn(),
  updateTicket: vi.fn(), deleteTicket: vi.fn(),
}));
vi.mock("../api/quotes.js", () => ({
  listQuotes: vi.fn(),
  convertQuoteToInvoice: vi.fn(),
}));
vi.mock("../api/comments.js", () => ({
  listComments: vi.fn().mockResolvedValue([]),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock("../api/cannedResponses.js", () => ({ listCannedResponses: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/audit.js", () => ({ listTicketAudit: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/config.js", () => ({ getFeatureConfig: vi.fn().mockResolvedValue({}) }));
vi.mock("../api/timer.js", () => ({
  startTimer: vi.fn(), stopTimer: vi.fn(), getActiveTimer: vi.fn().mockResolvedValue(null),
}));
vi.mock("../api/templates.js", () => ({
  listTemplates: vi.fn().mockResolvedValue([]), createTemplate: vi.fn(), deleteTemplate: vi.fn(),
}));
vi.mock("../api/attachments.js", () => ({
  listAttachments: vi.fn().mockResolvedValue([]), uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(), downloadUrl: vi.fn(),
}));
vi.mock("../api/recurring.js", () => ({
  listRecurring: vi.fn().mockResolvedValue([]), createRecurring: vi.fn(),
  updateRecurring: vi.fn(), deleteRecurring: vi.fn(),
}));
vi.mock("../api/users.js", () => ({ listUsers: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/clients.js", () => ({
  listClients: vi.fn().mockResolvedValue([]), createClient: vi.fn(),
  updateClient: vi.fn(), deleteClient: vi.fn(),
}));
vi.mock("../api/documents.js", () => ({ listDocuments: vi.fn().mockResolvedValue([]), downloadUrl: vi.fn() }));
vi.mock("../api/ticketDocuments.js", () => ({
  listTicketDocuments: vi.fn().mockResolvedValue([]), attachDocument: vi.fn(),
  updateTicketDocument: vi.fn(), detachDocument: vi.fn(),
}));
vi.mock("../api/formTemplates.js", () => ({
  listFormTemplates: vi.fn().mockResolvedValue([]),
  listFormInstances: vi.fn().mockResolvedValue([]),
  createFormInstance: vi.fn(), updateFormInstance: vi.fn(), deleteFormInstance: vi.fn(),
}));
vi.mock("../api/setup.js", () => ({ getSetupStatus: vi.fn().mockResolvedValue({ needs_setup: false }) }));
vi.mock("../api/auth.js", () => ({ me: vi.fn(), logout: vi.fn() }));
vi.mock("../api/client.js", () => ({
  setTokens: vi.fn(), clearTokens: vi.fn(), registerLogoutHandler: vi.fn(),
  hasStoredSession: vi.fn(() => false), downloadWithAuth: vi.fn(),
}));

import { TicketEditor } from "../App.jsx";
import { listQuotes, convertQuoteToInvoice } from "../api/quotes.js";

const baseTicket = () => ({
  id: "TKT-2026-00001",
  createdAt: "2026-07-01",
  createdAtIso: "2026-07-01T00:00:00Z",
  slaResponseDue: null, slaResolutionDue: null, slaPausedAt: null,
  clientId: null, assignedTo: null,
  ticketType: "Request", clientType: "business",
  status: "Open", priority: "Medium",
  clientName: "Acme Corp", clientEmail: "acme@example.com", clientPhone: "", clientAddress: "",
  title: "Quote QUO-2026-00001 approved — work order",
  description: "", internalNotes: "", travelFee: "travel_none",
  billingStatus: "unbilled",
  services: [], hourLogs: [], materialsUsed: [],
});

const APPROVED_QUOTE = {
  id: "QUO-2026-00001", status: "Approved", total: 220, converted_invoice_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  listQuotes.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
});

test("does not prompt to convert when saving without a status change into Resolved/Closed", async () => {
  const onSave = vi.fn().mockResolvedValue();
  render(<TicketEditor ticket={baseTicket()} onSave={onSave} showToast={() => {}} />);

  fireEvent.click(screen.getByText("✓ Save Ticket"));

  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(listQuotes).not.toHaveBeenCalled();
  expect(screen.queryByText("Convert Quote to Invoice?")).not.toBeInTheDocument();
});

test("does not prompt when transitioning to Resolved with no linked quote", async () => {
  listQuotes.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  const onSave = vi.fn().mockResolvedValue();
  const ticket = baseTicket();
  render(<TicketEditor ticket={ticket} onSave={onSave} showToast={() => {}} />);

  fireEvent.change(screen.getByDisplayValue("Open"), { target: { value: "Resolved" } });
  fireEvent.click(screen.getByText("✓ Save Ticket"));

  await waitFor(() => expect(listQuotes).toHaveBeenCalledWith({ ticket_id: ticket.id }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(screen.queryByText("Convert Quote to Invoice?")).not.toBeInTheDocument();
});

test("prompts to convert when transitioning to Resolved with a linked Approved unconverted quote, and defers the save", async () => {
  listQuotes.mockResolvedValue({ items: [APPROVED_QUOTE], total: 1, page: 1, page_size: 25 });
  const onSave = vi.fn().mockResolvedValue();
  const ticket = baseTicket();
  render(<TicketEditor ticket={ticket} onSave={onSave} showToast={() => {}} />);

  fireEvent.change(screen.getByDisplayValue("Open"), { target: { value: "Resolved" } });
  fireEvent.click(screen.getByText("✓ Save Ticket"));

  expect(await screen.findByText("Convert Quote to Invoice?")).toBeInTheDocument();
  expect(screen.getByText("QUO-2026-00001", { exact: false })).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

test("clicking Convert to Invoice calls convertQuoteToInvoice, then proceeds with the save", async () => {
  listQuotes.mockResolvedValue({ items: [APPROVED_QUOTE], total: 1, page: 1, page_size: 25 });
  convertQuoteToInvoice.mockResolvedValue({ invoice_id: "INV-2026-00001" });
  const onSave = vi.fn().mockResolvedValue();
  const showToast = vi.fn();
  const ticket = baseTicket();
  render(<TicketEditor ticket={ticket} onSave={onSave} showToast={showToast} />);

  fireEvent.change(screen.getByDisplayValue("Open"), { target: { value: "Resolved" } });
  fireEvent.click(screen.getByText("✓ Save Ticket"));
  await screen.findByText("Convert Quote to Invoice?");

  fireEvent.click(screen.getByText("Convert to Invoice"));

  await waitFor(() => expect(convertQuoteToInvoice).toHaveBeenCalledWith("QUO-2026-00001"));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(showToast).toHaveBeenCalledWith("Converted to invoice INV-2026-00001.", "ok");
  expect(screen.queryByText("Convert Quote to Invoice?")).not.toBeInTheDocument();
});

test("clicking Not now dismisses the prompt and still proceeds with the save", async () => {
  listQuotes.mockResolvedValue({ items: [APPROVED_QUOTE], total: 1, page: 1, page_size: 25 });
  const onSave = vi.fn().mockResolvedValue();
  const ticket = baseTicket();
  render(<TicketEditor ticket={ticket} onSave={onSave} showToast={() => {}} />);

  fireEvent.change(screen.getByDisplayValue("Open"), { target: { value: "Resolved" } });
  fireEvent.click(screen.getByText("✓ Save Ticket"));
  await screen.findByText("Convert Quote to Invoice?");

  fireEvent.click(screen.getByText("Not now"));

  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(convertQuoteToInvoice).not.toHaveBeenCalled();
  expect(screen.queryByText("Convert Quote to Invoice?")).not.toBeInTheDocument();
});

describe("Materials Used section", () => {
  const CATALOG = [
    { id: 1, name: "Cat6 Cable", category: "Networking", description: "", unit_price: 25 },
  ];

  test("renders the section and adds a row via + Add Material", async () => {
    render(<TicketEditor ticket={baseTicket()} onSave={vi.fn()} showToast={() => {}} materials={CATALOG} />);
    expect(screen.getByText("Materials Used")).toBeInTheDocument();

    fireEvent.click(screen.getByText("+ Add Material"));
    expect(screen.getByPlaceholderText(/Search materials or type a name/i)).toBeInTheDocument();
  });

  test("picking a catalog match autofills name and unit price, and rolls into the total", async () => {
    render(<TicketEditor ticket={baseTicket()} onSave={vi.fn()} showToast={() => {}} materials={CATALOG} />);
    fireEvent.click(screen.getByText("+ Add Material"));

    const nameInput = screen.getByPlaceholderText(/Search materials or type a name/i);
    fireEvent.change(nameInput, { target: { value: "Cat6" } });
    fireEvent.focus(nameInput);

    const match = await screen.findByText("Cat6 Cable");
    fireEvent.mouseDown(match);

    await waitFor(() => expect(nameInput.value).toBe("Cat6 Cable"));
    expect(screen.getAllByText("$25.00", { exact: false }).length).toBeGreaterThan(0);
  });

  test("removing a material row drops it from the section", async () => {
    const ticket = { ...baseTicket(), materialsUsed: [{ _id: 1, materialId: 1, name: "Cat6 Cable", unitPrice: 25, qty: 2 }] };
    render(<TicketEditor ticket={ticket} onSave={vi.fn()} showToast={() => {}} materials={CATALOG} />);
    expect(screen.getByDisplayValue("Cat6 Cable")).toBeInTheDocument();

    const removeButtons = screen.getAllByText("×");
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    expect(screen.queryByDisplayValue("Cat6 Cable")).not.toBeInTheDocument();
  });

  test("hides the section when the materials feature is disabled", () => {
    render(<TicketEditor ticket={baseTicket()} onSave={vi.fn()} showToast={() => {}} features={{ materials: false }} />);
    expect(screen.queryByText("Materials Used")).not.toBeInTheDocument();
  });

  test("includes materials subtotal in the Invoice Summary total", async () => {
    const ticket = { ...baseTicket(), materialsUsed: [{ _id: 1, materialId: null, name: "Cat6 Cable", unitPrice: 25, qty: 2 }] };
    render(<TicketEditor ticket={ticket} onSave={vi.fn()} showToast={() => {}} materials={CATALOG} />);
    expect(screen.getByText("Materials")).toBeInTheDocument();
    expect(screen.getAllByText("$50.00").length).toBeGreaterThan(0);
  });
});
