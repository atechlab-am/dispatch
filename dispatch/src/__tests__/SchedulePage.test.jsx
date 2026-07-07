import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import SchedulePage from "../SchedulePage.jsx";

vi.mock("../api/appointments.js", () => ({
  listAppointments: vi.fn().mockResolvedValue([]),
  createAppointment: vi.fn().mockResolvedValue({}),
  updateAppointment: vi.fn().mockResolvedValue({}),
  deleteAppointment: vi.fn().mockResolvedValue({}),
}));
vi.mock("../api/tickets.js", () => ({
  listTickets: vi.fn().mockResolvedValue({
    items: [{ id: "TKT-2026-00001", title: "Fix printer" }],
    total: 1,
  }),
}));

import { createAppointment } from "../api/appointments.js";

const users = [{ id: 1, name: "Jane Tech", role: "technician" }];

test("renders unscheduled tickets in the sidebar", async () => {
  render(<SchedulePage users={users} showToast={() => {}} />);
  expect(await screen.findByText("Fix printer")).toBeInTheDocument();
});

test("dropping a ticket onto a time slot creates an appointment", async () => {
  render(<SchedulePage users={users} showToast={() => {}} />);
  const card = await screen.findByText("Fix printer");
  const cardEl = card.closest("[draggable]");

  fireEvent.dragStart(cardEl);

  // Time-slot cells aren't individually labeled, so select by their distinguishing
  // inline style (minHeight: 40) and drop onto the first one.
  const gridCells = Array.from(document.querySelectorAll("div")).filter(
    (el) => el.style.minHeight === "40px"
  );
  expect(gridCells.length).toBeGreaterThan(0);

  fireEvent.dragOver(gridCells[0]);
  fireEvent.drop(gridCells[0]);

  await waitFor(() => expect(createAppointment).toHaveBeenCalled());
  const call = createAppointment.mock.calls[0][0];
  expect(call.ticket_id).toBe("TKT-2026-00001");
  expect(call.technician_id).toBe(1);
});
