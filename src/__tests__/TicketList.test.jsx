import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

// TicketList (exported from App.jsx) is a plain presentational component —
// no data fetching of its own — but importing anything from App.jsx pulls in
// its entire top-level import graph, so all of these mocks exist purely to
// satisfy that graph at module-evaluation time (mirrors TicketEditor.test.jsx).
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
  hasStoredSession: vi.fn(() => false), refreshAccessToken: vi.fn(), downloadWithAuth: vi.fn(),
}));

import { TicketList } from "../App.jsx";

const defaultProps = {
  tickets: [],
  total: 0,
  loading: false,
  onSelect: () => {},
  onNew: () => {},
  search: "",
  onSearch: () => {},
  onStatusFilter: () => {},
  quickFilter: null,
  onClearQuickFilter: () => {},
  onExport: () => {},
  users: [],
  assigneeFilter: null,
  onAssigneeFilter: () => {},
  onStatusChange: () => {},
};

test("Active pill is selected by default, not All", () => {
  render(<TicketList {...defaultProps} statusFilter="Active" />);

  const activeButton = screen.getByText("Active");
  const allButton = screen.getByText("All");
  expect(activeButton.style.background).toBe("var(--dispatch-primary)"); // brand.blue — selected
  expect(allButton.style.background).toBe("rgb(255, 255, 255)"); // not selected
});

test("clicking All calls onStatusFilter with All", () => {
  const onStatusFilter = vi.fn();
  render(<TicketList {...defaultProps} statusFilter="Active" onStatusFilter={onStatusFilter} />);

  fireEvent.click(screen.getByText("All"));
  expect(onStatusFilter).toHaveBeenCalledWith("All");
});

test("shows the backend-computed grand_total even though hour_logs/service_lines/materials_used are never sent by the list endpoint", () => {
  // Mirrors the real TicketListItem shape: no service_lines/hour_logs/materials_used
  // arrays at all (too heavy for a paginated list) — only a precomputed grand_total.
  // Regression test: recomputing the total from those (always-empty-here) arrays
  // used to silently render $0 regardless of what was actually logged on the ticket.
  const ticket = {
    id: "TKT-2026-00001", status: "Open", priority: "Medium", client_type: "business",
    client_name: "Acme Corp", title: "Quick fix", created_at: "2026-07-13T00:00:00Z",
    travel_fee: "travel_none", grand_total: 55,
  };
  render(<TicketList {...defaultProps} tickets={[ticket]} total={1} />);

  // Both the per-row amount and the Total Revenue stat should read $55.00
  // (a single $55 ticket), not $0 — proves grand_total is actually used.
  expect(screen.getAllByText("$55.00").length).toBe(2);
});

test("clicking a specific status calls onStatusFilter with that status", () => {
  const onStatusFilter = vi.fn();
  render(<TicketList {...defaultProps} statusFilter="Active" onStatusFilter={onStatusFilter} />);

  fireEvent.click(screen.getByText("Resolved"));
  expect(onStatusFilter).toHaveBeenCalledWith("Resolved");
});
