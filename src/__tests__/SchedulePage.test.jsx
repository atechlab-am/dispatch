import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import SchedulePage from "../SchedulePage.jsx";

// The grid filters appointments by exact calendar-day match against "today"
// (SchedulePage's `anchor = new Date()`), so the fixture's date must track
// the real current day rather than being hardcoded — a fixed past/future
// date will fall outside the rendered range and silently stop matching as
// soon as the wall-clock date moves on (this bit us: it passed locally but
// failed in CI once the date rolled over in a different timezone).
function todayAt(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

const OUT_OF_HOURS_APPOINTMENT = {
  id: 99, ticket_id: "TKT-2026-00099", ticket_title: "After-hours emergency call",
  technician_id: 1, start_at: todayAt(22), end_at: todayAt(23), notes: "",
};

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

test("an appointment scheduled outside 7am-6pm still renders in the grid", async () => {
  const { listAppointments } = await import("../api/appointments.js");
  listAppointments.mockResolvedValueOnce([OUT_OF_HOURS_APPOINTMENT]);
  render(<SchedulePage users={users} showToast={() => {}} />);
  // Previously the grid only rendered 7am-6pm, so a 10pm appointment would
  // never appear at all — this is the regression test for that bug.
  expect(await screen.findByText("After-hours emergency call")).toBeInTheDocument();
});
