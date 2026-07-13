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
  expect(activeButton.style.background).toBe("rgb(26, 92, 186)"); // brand.blue — selected
  expect(allButton.style.background).toBe("rgb(255, 255, 255)"); // not selected
});

test("clicking All calls onStatusFilter with All", () => {
  const onStatusFilter = vi.fn();
  render(<TicketList {...defaultProps} statusFilter="Active" onStatusFilter={onStatusFilter} />);

  fireEvent.click(screen.getByText("All"));
  expect(onStatusFilter).toHaveBeenCalledWith("All");
});

test("clicking a specific status calls onStatusFilter with that status", () => {
  const onStatusFilter = vi.fn();
  render(<TicketList {...defaultProps} statusFilter="Active" onStatusFilter={onStatusFilter} />);

  fireEvent.click(screen.getByText("Resolved"));
  expect(onStatusFilter).toHaveBeenCalledWith("Resolved");
});
