import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import ReportsPage from "../ReportsPage.jsx";

vi.mock("../api/reports.js", () => ({
  getRevenueReport: vi.fn().mockResolvedValue({ by_month: [], by_client: [], grand_total_billed: 0, grand_total_paid: 0 }),
  getTechnicianReport: vi.fn().mockResolvedValue({ rows: [] }),
  getSLAReport: vi.fn().mockResolvedValue({ rows: [], overall_compliance_pct: 0 }),
  getARAgingReport: vi.fn().mockResolvedValue({
    as_of: "2026-07-03",
    buckets: [
      { label: "Current", count: 0, total: 0 },
      { label: "1-30", count: 1, total: 150 },
      { label: "31-60", count: 0, total: 0 },
      { label: "61-90", count: 0, total: 0 },
      { label: "90+", count: 0, total: 0 },
    ],
    invoices: [
      { invoice_id: "INV-2026-00001", client_name: "Acme Corp", due_date: "2026-06-01", days_overdue: 15, balance: 150, bucket: "1-30" },
    ],
    grand_total_outstanding: 150,
  }),
  revenueCsvUrl: vi.fn(() => "/reports/revenue/csv"),
  technicianCsvUrl: vi.fn(() => "/reports/technician/csv"),
  slaCsvUrl: vi.fn(() => "/reports/sla/csv"),
  arAgingCsvUrl: vi.fn(() => "/reports/ar-aging/csv"),
}));
vi.mock("../api/client.js", () => ({ downloadWithAuth: vi.fn() }));

import { getARAgingReport } from "../api/reports.js";

test("AR Aging tab renders bucket and invoice data from the API", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("AR Aging"));

  expect(await screen.findByText("INV-2026-00001")).toBeInTheDocument();
  expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  expect(getARAgingReport).toHaveBeenCalled();
});
