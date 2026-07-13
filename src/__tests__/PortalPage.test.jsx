import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import PortalPage from "../PortalPage.jsx";

const BUSINESS_A = {
  id: 1, name: "Acme Corp", email: "", phone: "", address: "",
  client_type: "business", company: "Acme Corp", slug: null,
};
const BUSINESS_B = {
  id: 2, name: "Beacon Plumbing", email: "", phone: "", address: "",
  client_type: "business", company: "Beacon Plumbing", slug: null,
};

vi.mock("../api/clients.js", () => ({
  listClients: vi.fn(),
  updateClient: vi.fn(),
}));

vi.mock("../api/portal.js", () => ({
  listPortalAccounts: vi.fn().mockResolvedValue([]),
  createPortalAccount: vi.fn(),
  updatePortalAccount: vi.fn(),
  deletePortalAccount: vi.fn(),
}));

import { listClients } from "../api/clients.js";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalPage showToast={() => {}} />
    </MemoryRouter>
  );
}

test("without a deep-link, companies with no portal activity are hidden by default", async () => {
  listClients.mockResolvedValue([BUSINESS_A, BUSINESS_B]);
  renderAt("/portal");

  expect(await screen.findByText(/No portals configured yet/)).toBeInTheDocument();
  expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
});

test("deep-linking with ?search= shows and expands the matching company even with no portal activity yet", async () => {
  listClients.mockResolvedValue([BUSINESS_A, BUSINESS_B]);
  renderAt("/portal?search=Acme%20Corp");

  expect(await screen.findByText("1 entry")).toBeInTheDocument();
  expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
  expect(screen.queryByText("Beacon Plumbing")).not.toBeInTheDocument();
  // Auto-expanded: its "+ Add Portal User" action should already be visible.
  expect(await screen.findByText("+ Add Portal User")).toBeInTheDocument();
});
