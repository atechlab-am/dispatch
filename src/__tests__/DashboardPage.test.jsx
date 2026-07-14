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
  lead_stats: [],
  lead_pipeline: [],
  leads_follow_up: [],
};

const LEAD_STATS = [
  { label: "Total Leads", value: 6, color: "blue" },
  { label: "Active Leads", value: 3, color: "blue" },
  { label: "Won", value: 2, color: "green" },
  { label: "Lost", value: 1, color: "red" },
];
const LEAD_PIPELINE = [
  { label: "New", stage: "new", count: 2 },
  { label: "Contacted", stage: "contacted", count: 1 },
  { label: "Qualified", stage: "qualified", count: 0 },
  { label: "Proposal", stage: "proposal", count: 0 },
  { label: "Won", stage: "won", count: 2 },
  { label: "Lost", stage: "lost", count: 1 },
];

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

test("renders lead stats, pipeline, and follow-up section when leads feature is enabled", async () => {
  getDashboard.mockResolvedValue({
    ...BASE_DATA,
    lead_stats: LEAD_STATS,
    lead_pipeline: LEAD_PIPELINE,
    leads_follow_up: [
      { id: 1, business_name: "Overdue Co", contact_name: "Jane Doe", stage: "contacted", follow_up_date: "2020-01-01", follow_up_scheduled: true },
    ],
  });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ leads: true }} />
    </MemoryRouter>
  );

  expect(await screen.findByText("Leads")).toBeInTheDocument();
  expect(screen.getByText("Total Leads")).toBeInTheDocument();
  expect(screen.getByText("6")).toBeInTheDocument();
  expect(screen.getByText("Pipeline by Stage")).toBeInTheDocument();
  expect(screen.getByText("Overdue Co")).toBeInTheDocument();
});

test("hides the Leads section when there is no lead data", async () => {
  getDashboard.mockResolvedValue({ ...BASE_DATA, lead_stats: [] });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ leads: true }} />
    </MemoryRouter>
  );

  await screen.findByText("Total Tickets");
  expect(screen.queryByText("Pipeline by Stage")).not.toBeInTheDocument();
});

test("hides the Leads section when the leads feature is disabled, even with lead data", async () => {
  getDashboard.mockResolvedValue({ ...BASE_DATA, lead_stats: LEAD_STATS, lead_pipeline: LEAD_PIPELINE });
  render(
    <MemoryRouter>
      <DashboardPage user={user} showToast={() => {}} features={{ leads: false }} />
    </MemoryRouter>
  );

  await screen.findByText("Total Tickets");
  expect(screen.queryByText("Pipeline by Stage")).not.toBeInTheDocument();
});

test("clicking a lead stat card navigates to /leads", async () => {
  getDashboard.mockResolvedValue({ ...BASE_DATA, lead_stats: LEAD_STATS, lead_pipeline: LEAD_PIPELINE });
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DashboardPage user={user} showToast={() => {}} features={{ leads: true }} />} />
        <Route path="/leads" element={<div>Leads Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText("Leads");
  fireEvent.click(screen.getByText("Total Leads"));
  expect(await screen.findByText("Leads Page")).toBeInTheDocument();
});
