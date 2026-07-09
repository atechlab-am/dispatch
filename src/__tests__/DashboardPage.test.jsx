import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import DashboardPage from "../DashboardPage.jsx";

vi.mock("../api/dashboard.js", () => ({
  getDashboard: vi.fn(),
}));

import { getDashboard } from "../api/dashboard.js";

const BASE_DATA = {
  stats: [
    { label: "Total Tickets", value: 5, color: "blue" },
    { label: "Active", value: 3, color: "blue" },
    { label: "Resolved / Closed", value: 2, color: "green" },
    { label: "Urgent", value: 0, color: "red" },
    { label: "SLA Breached", value: 0, color: "red" },
    { label: "SLA Warning (< 2h)", value: 0, color: "amber" },
  ],
  funnel: [],
  my_active: [],
  sla_urgent: [],
  recent_open: [],
};

const user = { id: 1, name: "Admin User" };

test("renders the funnel widget when funnel data is present and quotes feature is enabled", async () => {
  getDashboard.mockResolvedValue({
    ...BASE_DATA,
    funnel: [
      { label: "Quotes Approved", count: 4 },
      { label: "Tickets Created", count: 3 },
      { label: "Invoices Converted", count: 1 },
    ],
  });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ quotes: true }} />
    </MemoryRouter>
  );

  expect(await screen.findByText("Quote → Ticket → Invoice")).toBeInTheDocument();
  expect(screen.getByText("Quotes Approved")).toBeInTheDocument();
  expect(screen.getByText("Tickets Created")).toBeInTheDocument();
  expect(screen.getByText("Invoices Converted")).toBeInTheDocument();
});

test("hides the funnel widget when funnel data is empty", async () => {
  getDashboard.mockResolvedValue({ ...BASE_DATA, funnel: [] });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ quotes: true }} />
    </MemoryRouter>
  );

  expect(await screen.findByText("Total Tickets")).toBeInTheDocument();
  expect(screen.queryByText("Quote → Ticket → Invoice")).not.toBeInTheDocument();
});

test("hides the funnel widget when the quotes feature is disabled, even with funnel data", async () => {
  getDashboard.mockResolvedValue({
    ...BASE_DATA,
    funnel: [
      { label: "Quotes Approved", count: 4 },
      { label: "Tickets Created", count: 3 },
      { label: "Invoices Converted", count: 1 },
    ],
  });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ quotes: false }} />
    </MemoryRouter>
  );

  expect(await screen.findByText("Total Tickets")).toBeInTheDocument();
  expect(screen.queryByText("Quote → Ticket → Invoice")).not.toBeInTheDocument();
});

test("clicking + New Project navigates to /projects", async () => {
  getDashboard.mockResolvedValue({
    ...BASE_DATA,
    funnel: [
      { label: "Quotes Approved", count: 4 },
      { label: "Tickets Created", count: 3 },
      { label: "Invoices Converted", count: 1 },
    ],
  });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DashboardPage user={user} showToast={() => {}} features={{ quotes: true }} />} />
        <Route path="/projects" element={<div>Projects Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByText("+ New Project"));
  expect(await screen.findByText("Projects Page")).toBeInTheDocument();
});
