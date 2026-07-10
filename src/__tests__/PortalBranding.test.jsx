import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import PortalApp from "../portal/PortalApp.jsx";

vi.mock("../portal/api.js", () => ({
  getClientBySlug: vi.fn().mockResolvedValue({ id: 1, name: "Acme Corp", member_ids: [1] }),
  portalMe: vi.fn(),
  portalLogin: vi.fn(),
  portalLogout: vi.fn(),
  portalChangePassword: vi.fn(),
  listMyTickets: vi.fn(), getMyTicket: vi.fn(), submitTicket: vi.fn(),
  listMyInvoices: vi.fn(), getMyInvoice: vi.fn(), portalInvoicePdfUrl: vi.fn(), createCheckoutSession: vi.fn(),
  getPortalBrandingPublic: vi.fn().mockResolvedValue({
    company_name: "Acme IT", primary_color: "#123456", accent_color: "#abcdef", logo_url: "",
  }),
}));
vi.mock("../portal/client.js", () => ({
  setTokens: vi.fn(), clearTokens: vi.fn(),
  hasStoredSession: vi.fn(() => false),
  registerLogoutHandler: vi.fn(),
  openPdfWithAuth: vi.fn(),
}));

import { getPortalBrandingPublic } from "../portal/api.js";

test("portal login screen renders the fetched company name instead of the hardcoded default", async () => {
  render(
    <MemoryRouter initialEntries={["/p/acme"]}>
      <PortalApp />
    </MemoryRouter>
  );

  expect(await screen.findByText("Acme")).toBeInTheDocument();
  expect(getPortalBrandingPublic).toHaveBeenCalled();
});
