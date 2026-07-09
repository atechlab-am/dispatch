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
  getQuoteConversionReport: vi.fn().mockResolvedValue({
    by_status: [{ status: "Approved", count: 2, total_value: 500 }],
    approved_count: 2,
    ticket_created_count: 1,
    invoice_converted_count: 1,
    approval_to_ticket_rate: 50,
    approval_to_invoice_rate: 50,
    avg_approval_to_ticket_hours: 3.5,
    avg_ticket_to_invoice_hours: 12,
    approved_value: 500,
    invoiced_value: 250,
  }),
  revenueCsvUrl: vi.fn(() => "/reports/revenue/csv"),
  technicianCsvUrl: vi.fn(() => "/reports/technician/csv"),
  slaCsvUrl: vi.fn(() => "/reports/sla/csv"),
  arAgingCsvUrl: vi.fn(() => "/reports/ar-aging/csv"),
  quoteConversionCsvUrl: vi.fn(() => "/reports/quote-conversion/csv"),
}));
vi.mock("../api/client.js", () => ({ downloadWithAuth: vi.fn() }));

import { getARAgingReport, getQuoteConversionReport } from "../api/reports.js";

test("AR Aging tab renders bucket and invoice data from the API", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("AR Aging"));

  expect(await screen.findByText("INV-2026-00001")).toBeInTheDocument();
  expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  expect(getARAgingReport).toHaveBeenCalled();
});

test("AR Aging tab is hidden when the ar_aging feature is disabled", async () => {
  render(<ReportsPage features={{ ar_aging: false }} />);
  expect(await screen.findByText("Revenue")).toBeInTheDocument();
  expect(screen.queryByText("AR Aging")).not.toBeInTheDocument();
});

test("Quote Conversion tab renders funnel counts and by-status table from the API", async () => {
  render(<ReportsPage />);
  fireEvent.click(screen.getByText("Quote Conversion"));

  expect(await screen.findByText("Approved", { selector: "td" })).toBeInTheDocument();
  expect(getQuoteConversionReport).toHaveBeenCalled();
  expect(screen.getByText("↓ Export CSV")).toBeInTheDocument();
});

test("Quote Conversion tab is hidden when the quotes feature is disabled", async () => {
  render(<ReportsPage features={{ quotes: false }} />);
  expect(await screen.findByText("Revenue")).toBeInTheDocument();
  expect(screen.queryByText("Quote Conversion")).not.toBeInTheDocument();
});
