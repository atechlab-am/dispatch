import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import NotificationBell from "../NotificationBell.jsx";

vi.mock("../api/notifications.js", () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ count: 2 }),
  listNotifications: vi.fn().mockResolvedValue([
    { id: 1, ticket_id: "TKT-2026-00001", kind: "assigned", message: "You were assigned ticket TKT-2026-00001", read: false, created_at: "2026-07-03T12:00:00Z" },
    { id: 2, ticket_id: "TKT-2026-00002", kind: "status_changed", message: "Status changed", read: true, created_at: "2026-07-03T11:00:00Z" },
  ]),
  markRead: vi.fn().mockResolvedValue({}),
  markAllRead: vi.fn().mockResolvedValue({}),
}));

import { markRead } from "../api/notifications.js";

const user = { id: 1, name: "Tech", role: "technician" };

test("shows unread count badge and opens dropdown with notifications", async () => {
  const navigate = vi.fn();
  render(<NotificationBell user={user} navigate={navigate} />);

  expect(await screen.findByText("2")).toBeInTheDocument();

  fireEvent.click(screen.getByTitle("Notifications"));
  expect(await screen.findByText("You were assigned ticket TKT-2026-00001")).toBeInTheDocument();
});

test("clicking a notification marks it read and navigates to its ticket", async () => {
  const navigate = vi.fn();
  render(<NotificationBell user={user} navigate={navigate} />);

  fireEvent.click(screen.getByTitle("Notifications"));
  const row = await screen.findByText("You were assigned ticket TKT-2026-00001");
  fireEvent.click(row);

  await waitFor(() => expect(markRead).toHaveBeenCalledWith(1));
  expect(navigate).toHaveBeenCalledWith("/tickets/TKT-2026-00001");
});
