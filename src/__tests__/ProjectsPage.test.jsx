import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { vi } from "vitest";
import ProjectsPage from "../ProjectsPage.jsx";

vi.mock("../api/projects.js", () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
}));

import { listProjects, createProject } from "../api/projects.js";

const noop = () => {};

beforeEach(() => vi.clearAllMocks());

test("renders project rows with derived quote/ticket/invoice status", async () => {
  listProjects.mockResolvedValue({
    items: [
      { id: "PRJ-2026-00001", name: "Office Network Upgrade", created_at: "2026-07-09T00:00:00Z",
        quote_id: "QUO-2026-00001", quote_status: "Approved",
        ticket_id: "TKT-2026-00001", ticket_status: "Open",
        invoice_id: null, invoice_status: null,
        stage: "Ticket" },
    ],
    total: 1, page: 1, page_size: 25,
  });

  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <ProjectsPage showToast={noop} />
    </MemoryRouter>
  );

  expect(await screen.findByText("Office Network Upgrade")).toBeInTheDocument();
  expect(screen.getByText("Approved")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/tickets/TKT-2026-00001");
  expect(screen.getAllByText("Ticket").length).toBeGreaterThan(0);
});

test("shows an empty state when there are no projects", async () => {
  listProjects.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <ProjectsPage showToast={noop} />
    </MemoryRouter>
  );
  expect(await screen.findByText(/No projects yet/i)).toBeInTheDocument();
});

test("+ New Project modal creates a project and navigates to its quote", async () => {
  listProjects.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  createProject.mockResolvedValue({ id: "PRJ-2026-00002", name: "New Roof", quote_id: "QUO-2026-00099" });

  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage showToast={noop} />} />
        <Route path="/quotes/:quoteId" element={<div>Quote Editor Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByText("+ New Project"));
  fireEvent.change(screen.getByPlaceholderText(/Office Network Upgrade/i), { target: { value: "New Roof" } });
  fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));

  await waitFor(() => expect(createProject).toHaveBeenCalledWith("New Roof"));
  expect(await screen.findByText("Quote Editor Page")).toBeInTheDocument();
});

test("shows a toast and does not navigate when creation fails", async () => {
  listProjects.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
  createProject.mockRejectedValue(new Error("fail"));
  const showToast = vi.fn();

  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <ProjectsPage showToast={showToast} />
    </MemoryRouter>
  );

  fireEvent.click(await screen.findByText("+ New Project"));
  fireEvent.change(screen.getByPlaceholderText(/Office Network Upgrade/i), { target: { value: "Doomed" } });
  fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));

  await waitFor(() => expect(showToast).toHaveBeenCalledWith("Failed to create project.", "err"));
});
